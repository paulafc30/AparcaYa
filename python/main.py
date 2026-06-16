"""
main.py
=======
Orquestador principal de AparcaYa.

Ejecuta cada minuto el pipeline completo:
  1. Descarga CSV de ocupación del Ayuntamiento de Málaga
  2. Procesa y enriquece los datos (pandas + numpy)
  3. Lanza predicción del modelo de IA
  4. Escribe los resultados en JSON para el backend Java

Uso:
    python main.py                  # Bucle infinito (producción)
    python main.py --once           # Una sola ejecución (debug/test)
    python main.py --intervalo 30   # Intervalo personalizado en segundos
"""

import argparse
import logging
import os
import sys
import time
import json
from pathlib import Path
from datetime import datetime

# ── Rutas ─────────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from ingesta.downloader import descargar_ocupacion, descargar_catalogo
from ingesta.processor  import procesar

# ── Logging ───────────────────────────────────────────────────────────────────
LOG_DIR = PROJECT_ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_DIR / "parkmalaga.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("main")

# ── Salida JSON para el backend Java ─────────────────────────────────────────
OUTPUT_JSON = PROJECT_ROOT / "data" / "processed" / "estado_actual.json"


def exportar_json(df) -> None:
    """
    Serializa el DataFrame procesado a JSON para consumo del backend Java.
    Formato:
    {
      "ultima_actualizacion": "2025-06-15T14:30:00",
      "aparcamientos": [
        {
          "id": "CE", "nombre": "Cervantes", "libres": 12,
          "capacidad_total": 400, "pct_ocupacion": 0.97,
          "estado": "LLENO", "tendencia": "SUBIENDO",
          "prediccion": "LLENO",
          "latitude": 36.72, "longitude": -4.41
        }, ...
      ]
    }
    """
    cols = [
        "id", "nombre", "libres", "capacidad_total", "pct_ocupacion",
        "estado", "tendencia", "latitude", "longitude",
        "hora", "franja_horaria",
    ]
    # Incluir prediccion si el modelo la ha añadido
    if "prediccion" in df.columns:
        cols.append("prediccion")

    cols_disponibles = [c for c in cols if c in df.columns]
    registros = df[cols_disponibles].to_dict(orient="records")

    # Convertir franja_horaria (Categorical) a str
    for r in registros:
        if "franja_horaria" in r:
            r["franja_horaria"] = str(r["franja_horaria"])

    payload = {
        "ultima_actualizacion": datetime.now().isoformat(timespec="seconds"),
        "aparcamientos": registros,
    }

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    logger.info(f"JSON exportado → {OUTPUT_JSON.name}")


def subir_supabase(df) -> None:
    """Inserta el estado actual en la tabla parking_estado de Supabase."""
    import requests  # ya en requirements.txt

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise EnvironmentError("Variables SUPABASE_URL / SUPABASE_KEY no definidas")

    endpoint = f"{url}/rest/v1/parking_estado"
    headers  = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    registros = []
    for _, row in df.iterrows():
        registros.append({
            "parking_id":    row.get("id", ""),
            "parking_nombre": row.get("nombre", ""),
            "libres":        int(row.get("libres", 0)),
            "ocupados":      int(row.get("ocupados", 0)),
            "capacidad":     int(row.get("capacidad_total", 0)),
            "pct_ocupacion": float(row.get("pct_ocupacion", 0)),
            "estado":        str(row.get("estado", "LIBRE")),
            "tendencia":     int(row.get("tendencia_num", 0)),
        })

    resp = requests.post(endpoint, headers=headers, json=registros, timeout=10)
    resp.raise_for_status()
    logger.info(f"Supabase: {len(registros)} filas insertadas.")


def ciclo() -> None:
    """Un ciclo completo de ingesta → procesado → (predicción) → exportación."""
    logger.info("── Inicio de ciclo ──────────────────────────────────────")
    try:
        # 1. Descarga
        df_raw = descargar_ocupacion()

        # 2. Procesado
        df = procesar(df_raw)

        # 3. Exportar JSON con estado actual
        exportar_json(df)

        # 4. Push estado actual a Supabase
        try:
            subir_supabase(df)
        except Exception as e:
            logger.warning(f"Supabase estado omitido: {e}")

        # 5. Predicciones ML (solo si el modelo está entrenado)
        modelo_path = PROJECT_ROOT / "python" / "modelo" / "model.pkl"
        if modelo_path.exists():
            try:
                from modelo.predict import predecir_todos, subir_predicciones_supabase

                # Construimos el dict de estado actual para el predictor
                datos_actuales = {
                    row["id"]: {
                        "pct":    float(row.get("pct_ocupacion", 0.5)),
                        "libres": int(row.get("libres", 0)),
                    }
                    for _, row in df.iterrows() if row.get("id")
                }

                predicciones = predecir_todos(datos_actuales, horizontes=[1, 2, 3])

                try:
                    subir_predicciones_supabase(predicciones)
                except Exception as e:
                    logger.warning(f"Supabase predicciones omitidas: {e}")

                logger.info(f"Predicciones ML generadas: {len(predicciones)}")
            except Exception as e:
                logger.warning(f"Módulo de predicción falló: {e}")
        else:
            logger.info("Modelo no entrenado — ejecuta train.py primero.")

        logger.info("── Ciclo completado ────────────────────────────────────")

    except Exception as e:
        logger.error(f"Error en ciclo: {e}", exc_info=True)


# ── Punto de entrada ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="ParkMálaga – Orquestador de ingesta de datos"
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Ejecutar un solo ciclo y salir (modo debug)",
    )
    parser.add_argument(
        "--intervalo",
        type=int,
        default=60,
        help="Intervalo entre ciclos en segundos (default: 60)",
    )
    args = parser.parse_args()

    # Asegurarse de que el catálogo existe antes de empezar
    try:
        descargar_catalogo()
    except Exception as e:
        logger.error(f"No se pudo obtener el catálogo: {e}")
        sys.exit(1)

    if args.once:
        ciclo()
        return

    logger.info(
        f"ParkMálaga iniciado. Ciclo cada {args.intervalo}s. "
        "Pulsa Ctrl+C para detener."
    )
    try:
        while True:
            inicio = time.time()
            ciclo()
            transcurrido = time.time() - inicio
            espera = max(0, args.intervalo - transcurrido)
            logger.info(f"Próximo ciclo en {espera:.1f}s")
            time.sleep(espera)
    except KeyboardInterrupt:
        logger.info("ParkMálaga detenido por el usuario.")


if __name__ == "__main__":
    main()
