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
import math
import os
import sys
import time
import json
import requests
from pathlib import Path
from datetime import datetime

# ── Rutas ─────────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from ingesta.downloader import descargar_ocupacion, descargar_catalogo, ejecutar_vision
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
    """
    Inserta el estado actual en parking_estado de Supabase.

    Calcula tendencia comparando con la última lectura en la vista parking_ultimo,
    en vez de un archivo local que no persiste entre ejecuciones de GitHub Actions.
      +1 = SUBIENDO (pct sube > 2 pp) · 0 = ESTABLE · -1 = BAJANDO
    """

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise EnvironmentError("Variables SUPABASE_URL / SUPABASE_KEY no definidas")

    sb_headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    # IDs válidos del catálogo — el CSV del Ayuntamiento puede traer filas extra
    IDS_VALIDOS = {"CE", "MA", "CA", "PA", "AN", "TE", "AL", "SJ", "CY", "PB", "SA"}

    def safe_int(val, default=0):
        try:
            f = float(val)
            return default if math.isnan(f) else int(f)
        except (TypeError, ValueError):
            return default

    def safe_float(val, default=0.0):
        try:
            f = float(val)
            return default if math.isnan(f) else round(f, 4)
        except (TypeError, ValueError):
            return default

    # ── Leer estado previo desde parking_ultimo para calcular tendencia ────────
    pct_anterior: dict[str, float] = {}
    try:
        r = requests.get(
            f"{url}/rest/v1/parking_ultimo?select=parking_id,pct_ocupacion",
            headers=sb_headers, timeout=8,
        )
        if r.ok:
            for row in r.json():
                pct_anterior[row["parking_id"]] = float(row["pct_ocupacion"])
            logger.info(f"Tendencia: leídos {len(pct_anterior)} valores previos de Supabase.")
    except Exception as e:
        logger.warning(f"No se pudo leer estado previo para tendencia: {e}")

    def calcular_tendencia(pid: str, pct_actual: float) -> int:
        prev = pct_anterior.get(pid)
        if prev is None:
            return 0
        delta = pct_actual - prev
        if delta > 0.02:
            return 1    # SUBIENDO
        if delta < -0.02:
            return -1   # BAJANDO
        return 0        # ESTABLE

    # ── Construir registros ────────────────────────────────────────────────────
    registros = []
    for _, row in df.iterrows():
        pid = str(row.get("id", "")).strip().upper()
        if pid not in IDS_VALIDOS:
            continue  # ignorar filas sin match en el catálogo
        pct = safe_float(row.get("pct_ocupacion"))
        registros.append({
            "parking_id":     pid,
            "parking_nombre": str(row.get("nombre", pid)),
            "libres":         safe_int(row.get("libres")),
            "ocupados":       safe_int(row.get("ocupados")),
            "capacidad":      safe_int(row.get("capacidad_total")),
            "pct_ocupacion":  pct,
            "estado":         str(row.get("estado", "LIBRE")),
            "tendencia":      calcular_tendencia(pid, pct),
        })

    if not registros:
        logger.warning("Supabase: ningún registro válido para insertar.")
        return

    endpoint = f"{url}/rest/v1/parking_estado"
    resp = requests.post(endpoint, headers=sb_headers, json=registros, timeout=10)
    resp.raise_for_status()
    logger.info(f"Supabase: {len(registros)} filas insertadas.")


def subir_vision_supabase(vision_data: dict) -> None:
    """
    Inserta en parking_estado el resultado de la cámara de visión artificial
    para un parking que NO está en el CSV del Ayuntamiento (p.ej. SC = SACABA).

    Calcula la tendencia igual que subir_supabase(): consultando parking_ultimo
    para obtener el pct anterior y comparando con el valor nuevo.
    """

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise EnvironmentError("Variables SUPABASE_URL / SUPABASE_KEY no definidas")

    sb_headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    pid = vision_data["parking_id"]
    pct = round(float(vision_data["pct_ocupacion"]), 4)

    # Leer pct anterior desde parking_ultimo para calcular tendencia
    tendencia = 0
    try:
        r = requests.get(
            f"{url}/rest/v1/parking_ultimo?select=pct_ocupacion&parking_id=eq.{pid}",
            headers=sb_headers, timeout=8,
        )
        if r.ok and r.json():
            pct_prev = float(r.json()[0]["pct_ocupacion"])
            delta = pct - pct_prev
            tendencia = 1 if delta > 0.02 else (-1 if delta < -0.02 else 0)
    except Exception as e:
        logger.warning(f"No se pudo leer tendencia previa para {pid}: {e}")

    if pct >= 0.90:
        estado = "LLENO"
    elif pct >= 0.50:
        estado = "DISPONIBLE"
    else:
        estado = "LIBRE"

    registro = {
        "parking_id":     pid,
        "parking_nombre": vision_data.get("parking_id", pid),   # sin nombre en dict
        "libres":         int(vision_data["libres"]),
        "ocupados":       int(vision_data["ocupadas"]),
        "capacidad":      int(vision_data["total"]),
        "pct_ocupacion":  pct,
        "estado":         estado,
        "tendencia":      tendencia,
    }

    resp = requests.post(
        f"{url}/rest/v1/parking_estado",
        headers=sb_headers, json=[registro], timeout=10,
    )
    resp.raise_for_status()
    logger.info(f"Supabase [{pid}]: visión insertada — {registro['libres']} libres, {pct*100:.0f}% ocup.")


def ciclo() -> None:
    """Un ciclo completo de ingesta → procesado → (predicción) → exportación."""
    logger.info("── Inicio de ciclo ──────────────────────────────────────")
    try:
        # 1. Descarga
        df_raw = descargar_ocupacion()

        # 2. Visión artificial para SA (Salitre) — enriquece los datos del CSV
        vision_sa = ejecutar_vision(parking_id="SA")

        # 3. Procesado (visión sobreescribe datos de SA si está disponible)
        df = procesar(df_raw, vision_data=vision_sa)

        # 2b. Visión para SC (SACABA) — parking solo en cámara, no en CSV del Ayuntamiento
        #     Se sube directamente a Supabase sin pasar por el pipeline de CSV
        vision_sc = ejecutar_vision(parking_id="SC")
        if vision_sc:
            try:
                subir_vision_supabase(vision_sc)
            except Exception as e:
                logger.warning(f"Supabase SC (visión) omitido: {e}")

        # 4. Exportar JSON con estado actual
        exportar_json(df)

        # 5. Push estado actual a Supabase
        try:
            subir_supabase(df)
        except Exception as e:
            logger.warning(f"Supabase estado omitido: {e}")

        # 6. Predicciones ML (solo si el modelo está entrenado)
        modelo_path = PROJECT_ROOT / "python" / "modelo" / "model.pkl"
        if modelo_path.exists():
            try:
                from modelo.predict import predecir_todos, subir_predicciones_supabase

                # Construimos el dict de estado actual para el predictor
                IDS_VALIDOS = {"CE", "MA", "CA", "PA", "AN", "TE", "AL", "SJ", "CY", "PB", "SA"}
                datos_actuales = {}
                for _, row in df.iterrows():
                    pid = str(row.get("id", "")).strip().upper()
                    if pid not in IDS_VALIDOS:
                        continue
                    try:
                        datos_actuales[pid] = {
                            "pct":    float(row.get("pct_ocupacion") or 0.5),
                            "libres": int(float(row.get("libres") or 0)),
                        }
                    except (ValueError, TypeError):
                        continue

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
