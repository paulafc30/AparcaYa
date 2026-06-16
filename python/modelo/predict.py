"""
predict.py
===========
Genera predicciones de ocupación para todos los parkings usando el modelo
entrenado en train.py.

¿Cómo funciona?
---------------
1. Carga el model.pkl generado por train.py
2. Recibe el estado actual de cada parking (pct_ocupacion, libres, etc.)
3. Para cada horizonte (1h, 2h, 3h) genera las features necesarias
4. Llama al modelo y obtiene "libres_previstas"
5. Calcula el estado (LIBRE / DISPONIBLE / LLENO)
6. Opcionalmente sube las predicciones a Supabase

Integración con main.py:
  main.py llama a predecir_todos() después de descargar el estado actual.
  Las predicciones se guardan en Supabase tabla 'parking_predicciones'.
  prediccion.js las lee desde ahí para mostrarlas en el frontend.

Uso directo (testing):
  python python/modelo/predict.py
  python python/modelo/predict.py --parking CE --pct 0.75 --horizonte 2
"""

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

# ── Rutas ─────────────────────────────────────────────────────────────────────
ROOT       = Path(__file__).resolve().parent.parent.parent
MODEL_DIR  = ROOT / "python" / "modelo"
MODEL_PATH = MODEL_DIR / "model.pkl"

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("predict")

# ── Codificación de tipos (debe coincidir exactamente con train.py) ───────────
TIPO_COD = {"centro": 0, "comercial": 1, "hospital": 2, "playa": 3}

# Tipos de cada parking (mismo que catalogo.js)
TIPO_PARKING = {
    "CE": "centro", "MA": "centro", "AL": "centro", "TE": "centro",
    "CY": "hospital",
    "PA": "playa",  "PB": "playa",
    "AN": "comercial", "SJ": "comercial", "CA": "comercial",
}

# Capacidades reales de SMASSA (verificadas en smassa.eu, junio 2026)
CAPACIDADES = {
    "CE": 409, "MA": 435, "CA": 350, "PA": 127,
    "AN": 613, "TE": 187, "AL": 378, "SJ": 624,
    "CY": 439, "PB": 261,
}

# Umbrales de estado (deben coincidir con prediccion.js)
def calcular_estado(pct: float) -> str:
    """Convierte un % de ocupación en texto de estado."""
    if pct >= 0.85: return "LLENO"
    if pct >= 0.50: return "DISPONIBLE"
    return "LIBRE"


# ── Carga del modelo ──────────────────────────────────────────────────────────
_modelo_cache = None  # Caché para no recargar el pkl en cada llamada

def cargar_modelo() -> dict:
    """
    Carga el modelo desde model.pkl (solo una vez, lo guarda en caché).
    Lanza FileNotFoundError si el modelo no existe todavía
    (hay que ejecutar train.py primero).
    """
    global _modelo_cache
    if _modelo_cache is not None:
        return _modelo_cache

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Modelo no encontrado en {MODEL_PATH}. "
            "Ejecuta primero: python python/modelo/train.py"
        )

    log.info(f"Cargando modelo desde {MODEL_PATH.name} ...")
    _modelo_cache = joblib.load(MODEL_PATH)
    log.info(f"  Horizonte: {_modelo_cache['horizonte_horas']}h | "
             f"R²={_modelo_cache['r2']} | MAE={_modelo_cache['mae']} plazas")
    return _modelo_cache


# ── Función de predicción individual ─────────────────────────────────────────
def predecir_parking(parking_id: str, pct_actual: float,
                     horizonte_horas: int = 1,
                     modelo_dict: dict = None) -> dict:
    """
    Predice el estado de UN parking en horizonte_horas horas desde ahora.

    Parámetros:
        parking_id      : ID del parking ('CE', 'MA', etc.)
        pct_actual      : % de ocupación actual (0.0 - 1.0)
        horizonte_horas : cuántas horas hacia el futuro predecir (1, 2 o 3)
        modelo_dict     : resultado de cargar_modelo() (para no recargar)

    Retorna:
        dict con:
          - libres_previstas : int (número de plazas libres predichas)
          - pct_prevista     : float (% de ocupación predicho)
          - estado           : str ('LIBRE' | 'DISPONIBLE' | 'LLENO')
          - horizonte_horas  : int
          - hora_prediccion  : int (hora del día en que se aplica la predicción)
          - confianza        : str ('alta' | 'media' | 'baja') según R² del modelo
    """
    if modelo_dict is None:
        modelo_dict = cargar_modelo()

    modelo    = modelo_dict["modelo"]
    capacidad = CAPACIDADES.get(parking_id, 300)
    tipo      = TIPO_PARKING.get(parking_id, "centro")
    tipo_cod  = TIPO_COD[tipo]

    ahora       = datetime.now()
    hora_actual = ahora.hour
    dia_semana  = ahora.weekday()           # 0=lunes … 6=domingo (Python)
    # Convertimos al formato del dataset: 0=domingo … 6=sábado
    dia_semana_ds = (dia_semana + 1) % 7
    es_fin_semana = 1 if dia_semana_ds in (0, 6) else 0
    mes           = ahora.month
    hora_futura   = (hora_actual + horizonte_horas) % 24

    # ── Vector de features (mismo orden que en train.py FEATURES) ────────────
    X = pd.DataFrame([{
        "hora":          hora_actual,
        "dia_semana":    dia_semana_ds,
        "es_fin_semana": es_fin_semana,
        "tipo_cod":      tipo_cod,
        "pct_actual":    pct_actual,
        "capacidad":     capacidad,
        "hora_futura":   hora_futura,
        "mes":           mes,
        "horizonte_h":   horizonte_horas,
    }])

    # ── Predicción ────────────────────────────────────────────────────────────
    libres_pred = float(modelo.predict(X)[0])
    # Clamp: las plazas libres no pueden ser negativas ni superar la capacidad
    libres_pred = max(0.0, min(float(capacidad), libres_pred))
    libres_int  = round(libres_pred)

    pct_pred  = 1.0 - (libres_int / capacidad) if capacidad > 0 else 0.0
    estado    = calcular_estado(pct_pred)

    # Nivel de confianza basado en el R² del modelo
    r2 = modelo_dict.get("r2", 0)
    if r2 >= 0.85:
        confianza = "alta"
    elif r2 >= 0.65:
        confianza = "media"
    else:
        confianza = "baja"

    return {
        "parking_id":      parking_id,
        "libres_previstas": libres_int,
        "pct_prevista":    round(pct_pred, 4),
        "estado":          estado,
        "horizonte_horas": horizonte_horas,
        "hora_prediccion": hora_futura,
        "confianza":       confianza,
        "modelo_r2":       r2,
    }


# ── Función para todos los parkings y todos los horizontes ───────────────────
def predecir_todos(datos_actuales: dict,
                   horizontes: list = [1, 2, 3]) -> list:
    """
    Genera predicciones para todos los parkings y todos los horizontes.
    Llamada desde main.py tras descargar el estado actual.

    Parámetros:
        datos_actuales : dict { 'CE': {'pct': 0.7, 'libres': 120}, ... }
        horizontes     : list de horizontes en horas [1, 2, 3]

    Retorna:
        list de dicts, uno por cada (parking × horizonte), listo para
        insertar en Supabase tabla 'parking_predicciones'
    """
    try:
        modelo_dict = cargar_modelo()
    except FileNotFoundError as e:
        log.warning(f"Sin modelo disponible: {e}")
        return []

    predicciones = []
    ts_now = datetime.utcnow().isoformat()

    for parking_id, estado_actual in datos_actuales.items():
        pct_actual = estado_actual.get("pct", 0.5)

        for h in horizontes:
            # Intentamos cargar el modelo específico para este horizonte si existe
            path_h = MODEL_DIR / f"model_{h}h.pkl"
            m_dict = joblib.load(path_h) if path_h.exists() else modelo_dict

            pred = predecir_parking(parking_id, pct_actual, h, m_dict)

            predicciones.append({
                "ts":              ts_now,
                "parking_id":      parking_id,
                "horizonte_horas": h,
                "libres_previstas": pred["libres_previstas"],
                "pct_prevista":    pred["pct_prevista"],
                "estado_previsto": pred["estado"],
                "hora_prediccion": pred["hora_prediccion"],
                "confianza":       pred["confianza"],
                "modelo_r2":       pred["modelo_r2"],
            })

    log.info(f"Generadas {len(predicciones)} predicciones "
             f"({len(datos_actuales)} parkings × {len(horizontes)} horizontes)")
    return predicciones


def subir_predicciones_supabase(predicciones: list) -> None:
    """
    Inserta las predicciones en la tabla parking_predicciones de Supabase.
    Requiere las variables de entorno SUPABASE_URL y SUPABASE_KEY.
    """
    import requests

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        log.warning("Variables SUPABASE_URL/SUPABASE_KEY no definidas. "
                    "Predicciones no subidas a Supabase.")
        return

    endpoint = f"{url}/rest/v1/parking_predicciones"
    headers  = {
        "apikey":        key,
        "Authorization": f"Bearer {key}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
    }
    resp = requests.post(endpoint, headers=headers, json=predicciones, timeout=10)
    if resp.ok:
        log.info(f"Supabase: {len(predicciones)} predicciones insertadas.")
    else:
        log.warning(f"Supabase error {resp.status_code}: {resp.text[:200]}")


# ── CLI para testing manual ───────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Genera predicciones con el modelo RF")
    parser.add_argument("--parking",   default=None,
                        help="ID de un parking concreto (ej: CE). Default: todos")
    parser.add_argument("--pct",       type=float, default=0.6,
                        help="% ocupación actual (0-1). Default: 0.6")
    parser.add_argument("--horizonte", type=int, default=1,
                        help="Horas hacia el futuro (1, 2 o 3). Default: 1")
    args = parser.parse_args()

    parkings = [args.parking] if args.parking else list(CAPACIDADES.keys())

    print(f"\n{'─'*60}")
    print(f"  PREDICCIONES AparcaYa — horizonte {args.horizonte}h")
    print(f"  Ocupación actual simulada: {args.pct*100:.0f}%")
    print(f"{'─'*60}")

    modelo_dict = cargar_modelo()

    for pid in parkings:
        pred = predecir_parking(pid, args.pct, args.horizonte, modelo_dict)
        cap  = CAPACIDADES.get(pid, "?")
        print(f"  {pid} | libres: {pred['libres_previstas']:>3}/{cap:<3} | "
              f"pct: {pred['pct_prevista']*100:>5.1f}% | "
              f"estado: {pred['estado']:<11} | "
              f"confianza: {pred['confianza']}")

    print(f"{'─'*60}\n")


if __name__ == "__main__":
    main()
