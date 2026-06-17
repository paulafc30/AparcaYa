"""
marcador_plazas.py
==================
Herramienta interactiva para marcar las plazas de aparcamiento
en una imagen de cámara. Se ejecuta una sola vez para crear la
configuración plazas_config.json que usa extractor_plazas.py.

Uso:
    python python/vision/marcador_plazas.py [--imagen TV-16_13.jpg]

Controles:
    - Clic + arrastrar : dibuja un rectángulo sobre una plaza
    - q                : guarda la configuración y sale
"""

import cv2
import json
import argparse
from pathlib import Path

# ── Rutas relativas al proyecto ───────────────────────────────────────────────
ROOT        = Path(__file__).resolve().parents[2]   # raíz de AparcaYa
IMAGE_DIR   = ROOT / "data" / "imagen"
CONFIG_FILE = Path(__file__).parent / "plazas_config.json"

# ── CLI ───────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--imagen", default="TV-16_13.jpg",
                    help="Nombre del archivo de imagen en data/imagen/")
args, _ = parser.parse_known_args()

IMAGE_PATH = IMAGE_DIR / args.imagen

if not IMAGE_PATH.exists():
    print(f"ERROR: No encuentro la imagen en: {IMAGE_PATH}")
    print("Archivos disponibles:", list(IMAGE_DIR.iterdir()) if IMAGE_DIR.exists() else "carpeta no existe")
    exit(1)

img     = cv2.imread(str(IMAGE_PATH))
plazas  = {}
rect    = []
drawing = False


def click_y_arrastrar(event, x, y, flags, param):
    global rect, drawing, plazas, img
    if event == cv2.EVENT_LBUTTONDOWN:
        drawing = True
        rect = [(x, y)]
    elif event == cv2.EVENT_LBUTTONUP and drawing:
        drawing = False
        rect.append((x, y))
        idx = len(plazas) + 1
        plazas[f"plaza_{idx}"] = {
            "x1": rect[0][0], "y1": rect[0][1],
            "x2": rect[1][0], "y2": rect[1][1],
        }
        print(f"Plaza {idx} guardada: {plazas[f'plaza_{idx}']}")
        cv2.rectangle(img, rect[0], rect[1], (0, 255, 0), 2)
        cv2.imshow("Marca las plazas — presiona Q para guardar", img)


cv2.namedWindow("Marca las plazas — presiona Q para guardar")
cv2.setMouseCallback("Marca las plazas — presiona Q para guardar", click_y_arrastrar)

print("Instrucciones: Clic + arrastra para marcar cada plaza. Presiona 'q' para guardar y salir.")

while True:
    cv2.imshow("Marca las plazas — presiona Q para guardar", img)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

with open(CONFIG_FILE, 'w') as f:
    json.dump(plazas, f, indent=4)

cv2.destroyAllWindows()
print(f"✅ {len(plazas)} plazas guardadas en {CONFIG_FILE}")
