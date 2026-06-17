"""
predict_vision.py
==================
Clasifica las imágenes de plazas en data/vision_dataset/ usando el
modelo entrenado (vision_model.h5) y escribe el resultado en
data/estado_vision.json.

Puede llamarse directamente o importarse desde downloader.py:

    from vision.predict_vision import predecir_plazas
    estado = predecir_plazas()   # dict { "plaza_1": "LIBRE", ... }

Uso directo:
    python python/vision/predict_vision.py [--parking SA]
"""

import json
import argparse
import logging
from pathlib import Path

# ── Rutas relativas al proyecto ───────────────────────────────────────────────
ROOT        = Path(__file__).resolve().parents[2]
DATASET_DIR = ROOT / "data" / "vision_dataset"
OUTPUT_JSON = ROOT / "data" / "estado_vision.json"
MODEL_PATH  = Path(__file__).parent / "vision_model.h5"

log = logging.getLogger("predict_vision")


def predecir_plazas(parking_id: str = "SA") -> dict | None:
    """
    Clasifica todas las imágenes de plazas en DATASET_DIR.

    Parámetros:
        parking_id : ID del parking al que pertenecen las imágenes (default 'SA').
                     Se usa para etiquetar el resultado en el JSON de salida.

    Retorna:
        dict con estructura:
        {
          "parking_id": "SA",
          "plazas":     { "plaza_1": "LIBRE", "plaza_2": "OCUPADO", ... },
          "libres":     4,
          "ocupadas":   5,
          "total":      9,
          "pct_ocupacion": 0.5556
        }
        o None si el modelo no existe o no hay imágenes.
    """
    if not MODEL_PATH.exists():
        log.warning(f"Modelo de visión no encontrado en {MODEL_PATH}. "
                    "Ejecuta train_vision.py primero.")
        return None

    # Importamos TF solo si el modelo existe (evita carga innecesaria)
    import tensorflow as tf
    import cv2
    import numpy as np

    model = tf.keras.models.load_model(str(MODEL_PATH))

    imagenes = sorted(DATASET_DIR.glob("plaza_*.jpg"))
    if not imagenes:
        log.warning(f"No se encontraron imágenes plaza_*.jpg en {DATASET_DIR}")
        return None

    resultados = {}
    for img_path in imagenes:
        img = cv2.imread(str(img_path))
        if img is None:
            continue
        img_resized  = cv2.resize(img, (160, 160))
        img_batch    = np.expand_dims(img_resized, axis=0)
        prediccion   = model.predict(img_batch, verbose=0)
        estado       = "OCUPADO" if prediccion[0][0] > 0.5 else "LIBRE"
        resultados[img_path.stem] = estado

    libres   = sum(1 for v in resultados.values() if v == "LIBRE")
    ocupadas = sum(1 for v in resultados.values() if v == "OCUPADO")
    total    = len(resultados)

    salida = {
        "parking_id":    parking_id,
        "plazas":        resultados,
        "libres":        libres,
        "ocupadas":      ocupadas,
        "total":         total,
        "pct_ocupacion": round(ocupadas / total, 4) if total > 0 else 0.0,
    }

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, 'w') as f:
        json.dump(salida, f, indent=4, ensure_ascii=False)

    log.info(f"Visión [{parking_id}]: {libres} libres / {ocupadas} ocupadas / {total} total "
             f"→ {salida['pct_ocupacion']*100:.0f}% ocupación")
    return salida


# ── CLI para testing manual ───────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    parser = argparse.ArgumentParser()
    parser.add_argument("--parking", default="SA",
                        help="ID del parking que monitoriza esta cámara (default: SA)")
    args = parser.parse_args()

    resultado = predecir_plazas(parking_id=args.parking)
    if resultado:
        print(f"\n── Resultado visión ({resultado['parking_id']}) ──")
        for plaza, estado in resultado["plazas"].items():
            icono = "🟢" if estado == "LIBRE" else "🔴"
            print(f"  {icono} {plaza}: {estado}")
        print(f"\n  Libres: {resultado['libres']} / {resultado['total']}")
        print(f"  Ocupación: {resultado['pct_ocupacion']*100:.0f}%")
        print(f"\n✅ Guardado en {OUTPUT_JSON}")
