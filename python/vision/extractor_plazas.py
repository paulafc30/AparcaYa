"""
extractor_plazas.py
====================
Lee plazas_config.json (generado por marcador_plazas.py) y recorta
cada plaza de la imagen de cámara, guardando las imágenes en
data/vision_dataset/ para que predict_vision.py las clasifique.

Uso:
    python python/vision/extractor_plazas.py [--imagen TV-16_13.jpg]
"""

import cv2
import json
import argparse
from pathlib import Path

# ── Rutas relativas al proyecto ───────────────────────────────────────────────
ROOT        = Path(__file__).resolve().parents[2]
IMAGE_DIR   = ROOT / "data" / "imagen"
OUTPUT_DIR  = ROOT / "data" / "vision_dataset"
CONFIG_FILE = Path(__file__).parent / "plazas_config.json"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── CLI ───────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--imagen", default="TV-16_13.jpg",
                    help="Nombre del archivo de imagen en data/imagen/")
args, _ = parser.parse_known_args()

IMAGE_PATH = IMAGE_DIR / args.imagen


def extraer_plazas(imagen: str | None = None) -> int:
    """
    Recorta las plazas de la imagen de cámara usando plazas_config.json.

    Parámetros:
        imagen : ruta absoluta o nombre de archivo en data/imagen/.
                 Si es None, usa el valor de --imagen del CLI (default TV-16.jpg).

    Retorna el número de recortes guardados.
    Lanza FileNotFoundError si falta config o imagen.
    """
    # Resolver la ruta de la imagen
    if imagen is not None:
        img_path = Path(imagen) if Path(imagen).is_absolute() else IMAGE_DIR / imagen
    else:
        img_path = IMAGE_PATH   # valor del argparse CLI

    if not CONFIG_FILE.exists():
        raise FileNotFoundError(
            f"Falta {CONFIG_FILE}. Ejecuta primero marcador_plazas.py"
        )

    with open(CONFIG_FILE, 'r') as f:
        config = json.load(f)

    img = cv2.imread(str(img_path))
    if img is None:
        raise FileNotFoundError(f"No se pudo leer la imagen: {img_path}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    guardadas = 0
    for nombre_plaza, coords in config.items():
        recorte = img[coords['y1']:coords['y2'], coords['x1']:coords['x2']]
        if recorte.size == 0:
            print(f"  ⚠️ {nombre_plaza}: recorte vacío, revisa las coordenadas")
            continue
        output_path = OUTPUT_DIR / f"{nombre_plaza}.jpg"
        cv2.imwrite(str(output_path), recorte)
        guardadas += 1

    print(f"✅ {guardadas} recortes guardados en {OUTPUT_DIR}")
    return guardadas


if __name__ == "__main__":
    extraer_plazas()
