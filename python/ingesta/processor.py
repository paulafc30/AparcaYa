"""
processor.py
============
Procesa los datos de ocupación descargados con pandas y numpy:
  1. Une ocupación actual con catálogo (nombre, coordenadas, capacidad)
  2. Calcula métricas derivadas (% ocupación, tendencia)
  3. Genera features para el modelo de clasificación
  4. Aplica la etiqueta de estado: LIBRE / DISPONIBLE / LLENO
  5. Guarda en data/processed/ y acumula en data/historico/

Clases de ocupación:
    LIBRE       →  ocupación < 50%
    DISPONIBLE  →  50% ≤ ocupación < 90%
    LLENO       →  ocupación ≥ 90%
"""

import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime
import logging

# ── Rutas ─────────────────────────────────────────────────────────────────────

PROJECT_ROOT   = Path(__file__).resolve().parents[2]
PROCESSED_DIR  = PROJECT_ROOT / "data" / "processed"
HISTORICO_DIR  = PROJECT_ROOT / "data" / "historico"
CATALOGO_PATH  = PROJECT_ROOT / "data" / "catalogo.csv"
HISTORICO_FILE = HISTORICO_DIR / "historico_ocupacion.csv"

PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
HISTORICO_DIR.mkdir(parents=True, exist_ok=True)

logger = logging.getLogger(__name__)

# ── Umbrales de clasificación ──────────────────────────────────────────────────

UMBRAL_LLENO      = 0.90   # ≥ 90% ocupado → LLENO
UMBRAL_DISPONIBLE = 0.50   # ≥ 50% ocupado → DISPONIBLE  (por debajo → LIBRE)

# ── Funciones ─────────────────────────────────────────────────────────────────

def cargar_catalogo() -> pd.DataFrame:
    """Lee el catálogo local de aparcamientos."""
    if not CATALOGO_PATH.exists():
        raise FileNotFoundError(
            f"Catálogo no encontrado en {CATALOGO_PATH}. "
            "Ejecuta primero downloader.py"
        )
    return pd.read_csv(CATALOGO_PATH)


def enriquecer(df_ocup: pd.DataFrame, df_cat: pd.DataFrame) -> pd.DataFrame:
    """
    Une ocupación con catálogo y añade columnas derivadas:
        - ocupados        : plazas ocupadas (capacidad - libres)
        - pct_ocupacion   : porcentaje de ocupación [0–1]
        - hora            : hora del día (0–23)
        - minuto          : minuto (0–59)
        - dia_semana      : día de la semana (0=lunes … 6=domingo)
        - es_fin_semana   : bool
        - franja_horaria  : MADRUGADA / MAÑANA / TARDE / NOCHE
        - estado          : LIBRE / DISPONIBLE / LLENO
    """
    df = df_ocup.merge(df_cat, on="id", how="left")

    # ── Métricas base ────────────────────────────────────────────────────────
    df["libres"]       = pd.to_numeric(df["libres"], errors="coerce")
    df["capacidad_total"] = pd.to_numeric(df["capacidad_total"], errors="coerce")

    df["libres"] = df["libres"].clip(lower=0)
    df["libres"] = np.minimum(df["libres"], df["capacidad_total"])

    df["ocupados"]     = (df["capacidad_total"] - df["libres"]).clip(lower=0)
    df["pct_ocupacion"] = df["ocupados"] / df["capacidad_total"]
    df["pct_ocupacion"] = df["pct_ocupacion"].clip(0, 1).round(4)

    # ── Features temporales ──────────────────────────────────────────────────
    ts = pd.to_datetime(df["timestamp"])
    df["hora"]        = ts.dt.hour
    df["minuto"]      = ts.dt.minute
    df["dia_semana"]  = ts.dt.dayofweek          # 0=lunes, 6=domingo
    df["es_fin_semana"] = (df["dia_semana"] >= 5).astype(int)

    df["franja_horaria"] = pd.cut(
        df["hora"],
        bins=[-1, 6, 12, 20, 23],
        labels=["MADRUGADA", "MAÑANA", "TARDE", "NOCHE"],
    )

    # ── Etiqueta de estado ───────────────────────────────────────────────────
    def clasificar(pct):
        if pct >= UMBRAL_LLENO:
            return "LLENO"
        elif pct >= UMBRAL_DISPONIBLE:
            return "DISPONIBLE"
        else:
            return "LIBRE"

    df["estado"] = df["pct_ocupacion"].apply(clasificar)

    return df


def calcular_tendencia(df_enriquecido: pd.DataFrame) -> pd.DataFrame:
    """
    Compara el estado actual con la lectura anterior en el histórico y añade:
        - pct_anterior    : % ocupación en la lectura previa
        - delta_ocupacion : variación (positivo = más ocupado)
        - tendencia       : SUBIENDO / BAJANDO / ESTABLE
    """
    if not HISTORICO_FILE.exists():
        df_enriquecido["pct_anterior"]    = np.nan
        df_enriquecido["delta_ocupacion"] = np.nan
        df_enriquecido["tendencia"]       = "ESTABLE"
        return df_enriquecido

    # Cargar última lectura del histórico por aparcamiento
    hist = pd.read_csv(HISTORICO_FILE, parse_dates=["timestamp"])
    ultima = (
        hist.sort_values("timestamp")
            .groupby("id")
            .last()
            .reset_index()[["id", "pct_ocupacion"]]
            .rename(columns={"pct_ocupacion": "pct_anterior"})
    )

    df = df_enriquecido.merge(ultima, on="id", how="left")
    df["delta_ocupacion"] = (df["pct_ocupacion"] - df["pct_anterior"]).round(4)

    def tendencia(delta):
        if pd.isna(delta):
            return "ESTABLE"
        elif delta > 0.02:
            return "SUBIENDO"
        elif delta < -0.02:
            return "BAJANDO"
        else:
            return "ESTABLE"

    df["tendencia"] = df["delta_ocupacion"].apply(tendencia)
    return df


def guardar_procesado(df: pd.DataFrame) -> Path:
    """Guarda el snapshot procesado más reciente (sobrescribe)."""
    ruta = PROCESSED_DIR / "ocupacion_actual.csv"
    df.to_csv(ruta, index=False)
    logger.info(f"Datos procesados guardados → {ruta.name}")
    return ruta


def acumular_historico(df: pd.DataFrame) -> None:
    """Añade el snapshot actual al histórico de entrenamiento."""
    cols_hist = [
        "timestamp", "id", "nombre", "libres", "ocupados",
        "capacidad_total", "pct_ocupacion", "hora", "minuto",
        "dia_semana", "es_fin_semana", "franja_horaria",
        "estado", "tendencia",
    ]
    cols_disponibles = [c for c in cols_hist if c in df.columns]
    df_hist = df[cols_disponibles]

    if HISTORICO_FILE.exists():
        df_hist.to_csv(HISTORICO_FILE, mode="a", header=False, index=False)
    else:
        df_hist.to_csv(HISTORICO_FILE, index=False)

    logger.info(f"Histórico actualizado → {HISTORICO_FILE.name}")


def procesar(df_ocup: pd.DataFrame) -> pd.DataFrame:
    """
    Pipeline completo:
        ocupación cruda → enriquecer → tendencia → guardar → acumular
    Devuelve el DataFrame procesado listo para el modelo.
    """
    df_cat = cargar_catalogo()
    df = enriquecer(df_ocup, df_cat)
    df = calcular_tendencia(df)
    guardar_procesado(df)
    acumular_historico(df)
    return df


# ── Ejecución directa (prueba) ────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(PROJECT_ROOT / "python"))
    from ingesta.downloader import descargar_ocupacion

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    df_raw = descargar_ocupacion()
    df_proc = procesar(df_raw)

    cols_mostrar = [
        "id", "nombre", "libres", "capacidad_total",
        "pct_ocupacion", "estado", "tendencia", "hora", "franja_horaria",
    ]
    print("\n── Datos procesados ──")
    print(df_proc[cols_mostrar].to_string(index=False))
