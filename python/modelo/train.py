"""
train.py
=========
Entrena un modelo de Random Forest para predecir el número de plazas libres
de cada aparcamiento en un horizonte de N horas.

¿Qué hace?
----------
1. Carga el dataset histórico (dataset_historico_aparcaya.csv)
2. Construye pares supervisados: (estado en momento T) → (plazas libres en T + N horas)
   → Esto es el corazón del modelo: aprendemos de cómo evoluciona la ocupación
3. Codifica variables categóricas (tipo_parking → número)
4. Divide en 80% entrenamiento / 20% test (sin mezclar el tiempo → split temporal)
5. Entrena un RandomForestRegressor
6. Evalúa con MAE, RMSE y R²
7. Guarda el modelo en modelo/model.pkl para que predict.py lo use

Features usadas:
  - hora            : hora del día actual (0-23)
  - dia_semana      : 0=domingo … 6=sábado
  - es_fin_semana   : 0/1
  - tipo_cod        : tipo de parking codificado (0=centro, 1=comercial, 2=hospital, 3=playa)
  - pct_actual      : % de ocupación en el momento actual (0-1) ← muy predictivo
  - capacidad       : capacidad total del parking
  - hora_futura     : hora del día en la que queremos predecir ((hora + N) % 24)
  - mes             : mes del año (1-12) para capturar estacionalidad verano/invierno
  - horizonte_horas : cuántas horas hacia el futuro (1, 2, 3, 6, 12...)

Target:
  - libres_futuras  : número de plazas libres en el momento T + N horas

Uso:
  python python/modelo/train.py                    # horizonte 1h por defecto
  python python/modelo/train.py --horizonte 2      # predice 2 horas adelante
  python python/modelo/train.py --todos-horizontes # entrena para 1,2,3,6,12h
"""

import argparse
import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

# ── Rutas ─────────────────────────────────────────────────────────────────────
ROOT         = Path(__file__).resolve().parent.parent.parent   # raíz del proyecto
DATASET_PATH = ROOT / "data" / "dataset_historico_aparcaya.csv"
MODEL_DIR    = ROOT / "python" / "modelo"
MODEL_PATH   = MODEL_DIR / "model.pkl"

# ── Tipo de parking por ID (igual que predict.py y catalogo.js) ───────────────
TIPO_PARKING = {
    "CE": "centro",    "MA": "centro",    "AL": "centro",  "TE": "centro",
    "CY": "hospital",
    "PA": "playa",     "PB": "playa",
    "AN": "comercial", "SJ": "comercial", "CA": "comercial",
}

# Mínimo de filas reales para preferir Supabase sobre el CSV simulado
MIN_FILAS_REALES = 500

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("train")

# ── Codificación de tipos de parking ─────────────────────────────────────────
# Convertimos el texto a número porque RandomForest no entiende strings
TIPO_COD = {"centro": 0, "comercial": 1, "hospital": 2, "playa": 3}


def cargar_desde_supabase() -> pd.DataFrame | None:
    """
    Descarga el histórico real de parking_estado en Supabase y lo convierte
    al mismo formato que el CSV simulado para que construir_pares pueda usarlo.

    Requiere las variables de entorno SUPABASE_URL y SUPABASE_KEY.
    Devuelve None si no hay suficientes datos o si Supabase no está disponible.
    """
    import os, requests as req, math

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        log.info("  SUPABASE_URL/SUPABASE_KEY no definidas — usando CSV simulado")
        return None

    endpoint = (
        f"{url}/rest/v1/parking_estado"
        f"?select=ts,parking_id,parking_nombre,libres,ocupados,capacidad,pct_ocupacion,estado"
        f"&order=ts.asc&limit=100000"
    )
    try:
        resp = req.get(endpoint, headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
        }, timeout=30)
        resp.raise_for_status()
        rows = resp.json()
    except Exception as e:
        log.warning(f"  Supabase no disponible: {e} — usando CSV simulado")
        return None

    if len(rows) < MIN_FILAS_REALES:
        log.info(f"  Solo {len(rows)} filas en Supabase (mín {MIN_FILAS_REALES}) — "
                 "usando CSV simulado para mejor cobertura")
        return None

    log.info(f"  → {len(rows):,} filas descargadas de Supabase (datos reales)")

    df = pd.DataFrame(rows)
    df["timestamp"]     = pd.to_datetime(df["ts"], utc=True).dt.tz_localize(None)
    df["hora"]          = df["timestamp"].dt.hour
    df["minuto"]        = df["timestamp"].dt.minute
    df["dia_semana"]    = df["timestamp"].dt.dayofweek   # 0=lunes
    df["es_fin_semana"] = (df["dia_semana"] >= 5).astype(int)
    df["tipo"]          = df["parking_id"].map(TIPO_PARKING).fillna("centro")
    df["capacidad"]     = pd.to_numeric(df["capacidad"], errors="coerce").fillna(400)
    df["libres"]        = pd.to_numeric(df["libres"],    errors="coerce").fillna(0)
    df["ocupados"]      = pd.to_numeric(df["ocupados"],  errors="coerce").fillna(0)
    df["pct_ocupacion"] = pd.to_numeric(df["pct_ocupacion"], errors="coerce").fillna(0)

    # Eliminar filas con NaN en columnas críticas
    df = df.dropna(subset=["timestamp", "parking_id", "pct_ocupacion", "libres"])
    log.info(f"  → {len(df):,} filas válidas tras limpieza")
    return df


def cargar_dataset() -> pd.DataFrame:
    """
    Carga el histórico para entrenamiento.
    Prioridad: datos reales de Supabase → CSV simulado como fallback.
    """
    df_real = cargar_desde_supabase()
    if df_real is not None:
        log.info("✅ Entrenando con datos REALES del Ayuntamiento (vía Supabase)")
        return df_real

    log.info(f"Cargando dataset simulado: {DATASET_PATH}")
    df = pd.read_csv(DATASET_PATH, parse_dates=["timestamp"])
    log.info(f"  → {len(df):,} filas · {df['parking_id'].nunique()} parkings")
    return df


def _detectar_intervalo_min(df: pd.DataFrame) -> int:
    """
    Detecta automáticamente el intervalo entre snapshots en minutos.
    CSV simulado: 30 min · Datos reales del Ayuntamiento: ~5 min.
    Usa la mediana de diferencias para ser robusto ante huecos puntuales.
    """
    muestras = (
        df.sort_values("timestamp")
          .groupby("parking_id")["timestamp"]
          .diff()
          .dropna()
    )
    if muestras.empty:
        return 30  # default seguro
    mediana_min = muestras.dt.total_seconds().median() / 60
    intervalo = max(1, round(mediana_min))
    log.info(f"  Intervalo entre snapshots detectado: ~{intervalo} min")
    return intervalo


def construir_pares(df: pd.DataFrame, horizonte_horas: int) -> pd.DataFrame:
    """
    Transforma el dataset en pares supervisados para el horizonte indicado.

    Para cada snapshot (T) de un parking, buscamos el snapshot de ese mismo
    parking en T + horizonte_horas. Así el modelo aprende:
      "Si ahora hay un 70% de ocupación a las 10h del lunes, ¿cuántas
       plazas habrá libres a las 12h?"

    Detecta automáticamente la frecuencia de los datos:
      - CSV simulado   (~30 min): paso = horizonte_horas × 2 filas
      - Datos reales   (~5 min) : paso = horizonte_horas × 12 filas
    Y verifica la diferencia temporal real (tolerancia ±15 min) para saltar
    huecos sin descartar pares válidos de frecuencia variable.

    Parámetros:
        df              : DataFrame con el dataset histórico completo
        horizonte_horas : cuántas horas hacia el futuro predecir (1, 2, 3, 6, 12...)

    Retorna:
        DataFrame con features y target listas para entrenar
    """
    log.info(f"Construyendo pares para horizonte = {horizonte_horas}h ...")

    # Ordenamos por parking y por tiempo para poder hacer el shift
    df = df.sort_values(["parking_id", "timestamp"]).reset_index(drop=True)

    # Añadimos el mes como feature de estacionalidad
    df["mes"] = df["timestamp"].dt.month

    # Codificamos el tipo de parking como número
    df["tipo_cod"] = df["tipo"].map(TIPO_COD).fillna(0).astype(int)

    # Detectar intervalo para calcular el paso de índice aproximado
    intervalo_min = _detectar_intervalo_min(df)
    filas_por_hora = max(1, round(60 / intervalo_min))
    paso_inicial = horizonte_horas * filas_por_hora
    # Tolerancia: ±20% del horizonte objetivo en minutos
    tolerancia_min = max(15, horizonte_horas * 60 * 0.20)
    objetivo_min = horizonte_horas * 60

    registros = []
    for parking_id, grupo in df.groupby("parking_id"):
        grupo = grupo.sort_values("timestamp").reset_index(drop=True)
        ts_array = grupo["timestamp"].values  # numpy para búsqueda rápida

        for i in range(len(grupo)):
            t_actual = grupo.iloc[i]
            ts_objetivo = t_actual["timestamp"] + pd.Timedelta(hours=horizonte_horas)

            # Buscamos el índice más cercano al objetivo temporal
            j_hint = min(i + paso_inicial, len(grupo) - 1)
            # Búsqueda binaria simplificada: explorar ±5 filas alrededor del hint
            mejor_j    = None
            mejor_diff = float("inf")
            inicio_busq = max(i + 1, j_hint - 5)
            fin_busq    = min(len(grupo), j_hint + 6)
            for j in range(inicio_busq, fin_busq):
                diff = abs(
                    (grupo.iloc[j]["timestamp"] - ts_objetivo).total_seconds() / 60
                )
                if diff < mejor_diff:
                    mejor_diff = diff
                    mejor_j = j

            if mejor_j is None or mejor_diff > tolerancia_min:
                continue  # Hueco demasiado grande en los datos

            t_futuro = grupo.iloc[mejor_j]
            hora_futura = (t_actual["hora"] + horizonte_horas) % 24

            registros.append({
                # ── Features ──────────────────────────────────────────────────
                "hora":           t_actual["hora"],
                "dia_semana":     t_actual["dia_semana"],
                "es_fin_semana":  int(t_actual["es_fin_semana"]),
                "tipo_cod":       t_actual["tipo_cod"],
                "pct_actual":     t_actual["pct_ocupacion"],    # estado ahora (clave)
                "capacidad":      t_actual["capacidad"],
                "hora_futura":    hora_futura,
                "mes":            t_actual["mes"],
                "horizonte_h":    horizonte_horas,
                # ── Target ────────────────────────────────────────────────────
                "libres_futuras": t_futuro["libres"],           # lo que queremos predecir
                # ── Metadata (no va al modelo, solo para análisis) ────────────
                "parking_id":     parking_id,
            })

    pares = pd.DataFrame(registros)
    log.info(f"  → {len(pares):,} pares generados para horizonte {horizonte_horas}h")
    return pares


# Features que usa el modelo (en el mismo orden siempre)
FEATURES = ["hora", "dia_semana", "es_fin_semana", "tipo_cod",
            "pct_actual", "capacidad", "hora_futura", "mes", "horizonte_h"]


def entrenar(pares: pd.DataFrame, horizonte_horas: int) -> dict:
    """
    Entrena el Random Forest y evalúa con las métricas estándar de regresión.

    Split estratégico: usamos el 20% FINAL del tiempo como test, no aleatorio.
    Esto simula mejor el uso real (predicir el futuro, no el pasado).

    Métricas que calculamos:
      MAE  (Mean Absolute Error)   → error medio en plazas, mismo orden de magnitud
      RMSE (Root Mean Squared Err) → penaliza más los errores grandes
      R²   (coeficiente determinac) → 1.0 = perfecto, 0.0 = tan malo como la media

    Retorna:
        dict con modelo entrenado y métricas
    """
    X = pares[FEATURES]
    y = pares["libres_futuras"]

    # ── Split 80/20 temporal (no aleatorio) ──────────────────────────────────
    # Tomamos el 80% de las filas como train y el 20% final como test
    # Usamos shuffle=False para respetar el orden temporal
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, shuffle=False
    )
    log.info(f"  Train: {len(X_train):,} muestras | Test: {len(X_test):,} muestras")

    # ── Entrenamiento ─────────────────────────────────────────────────────────
    log.info("  Entrenando RandomForestRegressor (n_estimators=200) ...")
    modelo = RandomForestRegressor(
        n_estimators=200,      # 200 árboles: buen equilibrio velocidad/precisión
        max_depth=12,          # limita profundidad para evitar overfitting
        min_samples_leaf=5,    # al menos 5 muestras en cada hoja
        n_jobs=-1,             # usa todos los núcleos del CPU
        random_state=42,       # reproducibilidad
    )
    modelo.fit(X_train, y_train)

    # ── Evaluación ────────────────────────────────────────────────────────────
    y_pred = modelo.predict(X_test)

    mae  = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2   = r2_score(y_test, y_pred)

    log.info(f"\n{'─'*50}")
    log.info(f"  RESULTADOS — horizonte {horizonte_horas}h")
    log.info(f"  MAE  : {mae:.1f} plazas   (error medio absoluto)")
    log.info(f"  RMSE : {rmse:.1f} plazas   (raíz error cuadrático medio)")
    log.info(f"  R²   : {r2:.4f}           (1.0 = predicción perfecta)")
    log.info(f"{'─'*50}\n")

    # ── Importancia de features ───────────────────────────────────────────────
    importancias = sorted(
        zip(FEATURES, modelo.feature_importances_),
        key=lambda x: x[1], reverse=True
    )
    log.info("  Importancia de features (mayor = más influyente):")
    for feat, imp in importancias:
        barra = "█" * int(imp * 40)
        log.info(f"    {feat:<18} {imp:.4f}  {barra}")
    log.info("")

    return {
        "modelo":          modelo,
        "horizonte_horas": horizonte_horas,
        "mae":             round(mae, 2),
        "rmse":            round(rmse, 2),
        "r2":              round(r2, 4),
        "n_train":         len(X_train),
        "n_test":          len(X_test),
        "features":        FEATURES,
    }


def guardar_modelo(resultado: dict) -> None:
    """
    Guarda el modelo entrenado y sus metadatos en model.pkl.
    joblib es más eficiente que pickle para objetos numpy/sklearn.
    """
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(resultado, MODEL_PATH)
    log.info(f"Modelo guardado en: {MODEL_PATH}")
    log.info(f"  Tamaño: {MODEL_PATH.stat().st_size / 1024:.0f} KB")


def main():
    parser = argparse.ArgumentParser(description="Entrena el modelo RF de AparcaYa")
    parser.add_argument("--horizonte", type=int, default=1,
                        help="Horas hacia el futuro a predecir (default: 1)")
    parser.add_argument("--todos-horizontes", action="store_true",
                        help="Entrena para horizontes 1, 2, 3, 6 y 12 horas")
    args = parser.parse_args()

    df = cargar_dataset()

    if args.todos_horizontes:
        # Entrenamos para múltiples horizontes y guardamos el de 1h como principal
        # Los demás se guardan como model_Nh.pkl
        for h in [1, 2, 3, 6, 12]:
            log.info(f"\n{'='*50}")
            log.info(f"  HORIZONTE: {h} horas")
            log.info(f"{'='*50}")
            pares    = construir_pares(df, h)
            resultado = entrenar(pares, h)
            path = MODEL_DIR / f"model_{h}h.pkl"
            joblib.dump(resultado, path)
            log.info(f"Guardado: {path.name}")
            if h == 1:
                # El modelo de 1h es el principal
                guardar_modelo(resultado)
    else:
        pares    = construir_pares(df, args.horizonte)
        resultado = entrenar(pares, args.horizonte)
        guardar_modelo(resultado)

    log.info("✅ Entrenamiento completado.")


if __name__ == "__main__":
    main()
