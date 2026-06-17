"""
downloader.py
=============
Descarga el CSV de ocupación de aparcamientos del Ayuntamiento de Málaga
y lo guarda en data/raw/ con timestamp.

URL fuente: https://datosabiertos.malaga.eu/recursos/aparcamientos/ocupappublicosmun/ocupappublicosmun.csv
Frecuencia de actualización: 1 minuto
"""

import requests
import pandas as pd
from pathlib import Path
from datetime import datetime
import logging

# ── Configuración ────────────────────────────────────────────────────────────

URL_OCUPACION = (
    "https://datosabiertos.malaga.eu/recursos/aparcamientos/"
    "ocupappublicosmun/ocupappublicosmun.csv"
)
URL_CATALOGO = (
    "https://datosabiertos.malaga.eu/recursos/aparcamientos/"
    "ocupappublicosmun/catalogo.csv"
)

# Raíz del proyecto (dos niveles arriba de este archivo)
PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR      = PROJECT_ROOT / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

TIMEOUT = 10  # segundos

# Cabeceras comunes — a nivel de módulo para que las usen ambas funciones.
# El servidor del Ayuntamiento bloquea peticiones sin cabeceras de navegador.
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9",
    "Referer": "https://datosabiertos.malaga.eu/",
}

# Capacidades de rotación verificadas en smassa.eu (junio 2026).
# Deben coincidir con CAPACIDADES en predict.py y cap en catalogo.js.
CAPACIDADES = {
    "CE": 409,  # Cervantes
    "MA": 450,  # Plaza de la Marina
    "CA": 350,  # Camas
    "PA": 127,  # El Palo
    "AN": 613,  # Av. de Andalucía
    "TE": 187,  # Tejón y Rodríguez
    "AL": 378,  # Alcazaba
    "SJ": 624,  # San Juan de la Cruz
    "CY": 439,  # Carlos Haya
    "PB": 261,  # Pío Baroja
    "SA": 435,  # Salitre    
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Funciones públicas ────────────────────────────────────────────────────────

def descargar_ocupacion() -> pd.DataFrame:
    """
    Descarga el CSV de ocupación actual y devuelve un DataFrame con:
        dato | id | libres | timestamp

    Guarda también una copia en data/raw/ocupacion_<YYYYMMDD_HHMMSS>.csv
    para construir el histórico de entrenamiento.
    """
    try:
        response = requests.get(URL_OCUPACION, headers=HEADERS, timeout=TIMEOUT)
        response.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"Error descargando ocupación: {e}")
        raise

    # Parsear CSV en memoria
    from io import StringIO
    df = pd.read_csv(StringIO(response.text))

    # Validación mínima de columnas esperadas
    columnas_esperadas = {"dato", "id", "libres"}
    if not columnas_esperadas.issubset(df.columns):
        raise ValueError(
            f"CSV inesperado. Columnas recibidas: {list(df.columns)}"
        )

    # Añadir timestamp de descarga
    ts = datetime.now()
    df["timestamp"] = ts

    # Guardar copia raw con timestamp en el nombre
    nombre_archivo = f"ocupacion_{ts.strftime('%Y%m%d_%H%M%S')}.csv"
    ruta = RAW_DIR / nombre_archivo
    df.to_csv(ruta, index=False)
    logger.info(f"Descarga OK → {ruta.name}  ({len(df)} aparcamientos)")

    return df


def descargar_catalogo() -> pd.DataFrame:
    """
    Descarga (o lee desde disco) el catálogo estático de aparcamientos con
    nombre, dirección y coordenadas.
    Incluye la capacidad total estimada de cada aparcamiento.
    """
    # Si ya existe en disco usamos la versión local (se descarga una sola vez)
    ruta_local = PROJECT_ROOT / "data" / "catalogo.csv"
    if ruta_local.exists():
        logger.info("Catálogo leído desde disco local.")
        return pd.read_csv(ruta_local)

    try:
        response = requests.get(URL_CATALOGO, headers=HEADERS, timeout=TIMEOUT)
        response.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"Error descargando catálogo: {e}")
        raise

    from io import StringIO
    df = pd.read_csv(StringIO(response.text))

    # Capacidades de rotación verificadas (smassa.eu, junio 2026).
    # Fuente única: constante CAPACIDADES definida en este módulo,
    # sincronizada con predict.py y catalogo.js.
    df["capacidad_total"] = df["id"].map(CAPACIDADES)

    df.to_csv(ruta_local, index=False)
    logger.info(f"Catálogo guardado en {ruta_local}")
    return df


# ── Ejecución directa (prueba) ────────────────────────────────────────────────

if __name__ == "__main__":
    df_ocup = descargar_ocupacion()
    df_cat  = descargar_catalogo()
    print("\n── Ocupación actual ──")
    print(df_ocup.to_string(index=False))
    print("\n── Catálogo ──")
    print(df_cat[["id", "nombre", "capacidad_total"]].to_string(index=False))
