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


def cargar_dataset() -> pd.DataFrame:
    """
    Carga y valida el dataset histórico.
    Convierte la columna timestamp a datetime para poder ordenar por tiempo.
    """
    log.info(f"Cargando dataset: {DATASET_PATH}")
    df = pd.read_csv(DATASET_PATH, parse_dates=["timestamp"])
    log.info(f"  → {len(df):,} filas · {df['parking_id'].nunique()} parkings · "
             f"columnas: {list(df.columns)}")
    return df


def construir_pares(df: pd.DataFrame, horizonte_horas: int) -> pd.DataFrame:
    """
    Transforma el dataset en pares supervisados para el horizonte indicado.

    Para cada snapshot (T) de un parking, buscamos el snapshot de ese mismo
    parking en T + horizonte_horas. Así el modelo aprende:
      "Si ahora hay un 70% de ocupación a las 10h del lunes, ¿cuántas
       plazas habrá libres a las 12h?"

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

    registros = []
    for parking_id, grupo in df.groupby("parking_id"):
        grupo = grupo.sort_values("timestamp").reset_index(drop=True)

        # Para cada fila, buscamos el estado N horas más tarde
        # El dataset tiene intervalos de 30 min → N horas = N*2 filas
        paso = horizonte_horas * 2  # cada fila = 30 min

        for i in range(len(grupo) - paso):
            t_actual  = grupo.iloc[i]
            t_futuro  = grupo.iloc[i + paso]

            # Verificamos que la diferencia de tiempo sea la esperada (tolerancia 5 min)
            diff_min = (t_futuro["timestamp"] - t_actual["timestamp"]).total_seconds() / 60
            if abs(diff_min - horizonte_horas * 60) > 5:
                continue  # Saltamos si hay un hueco en los datos

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
