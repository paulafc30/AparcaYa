"""
train_vision.py
================
Entrena un modelo MobileNetV2 (Transfer Learning) para clasificar
imágenes de plazas de aparcamiento como LIBRE u OCUPADO.

Estructura esperada del dataset:
    data/vision_dataset/train/
        libre/       ← imágenes de plazas libres
        ocupado/     ← imágenes de plazas ocupadas

El modelo entrenado se guarda en python/vision/vision_model.h5.

Uso:
    python python/vision/train_vision.py [--epochs 10]
"""

import argparse
from pathlib import Path

# ── Rutas relativas al proyecto ───────────────────────────────────────────────
ROOT       = Path(__file__).resolve().parents[2]
DATA_DIR   = ROOT / "data" / "vision_dataset" / "train"
MODEL_PATH = Path(__file__).parent / "vision_model.h5"

IMG_SIZE   = (160, 160)
BATCH_SIZE = 32

# ── CLI ───────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--epochs", type=int, default=10,
                    help="Número de epochs de entrenamiento (default: 10)")
args, _ = parser.parse_known_args()

# Importar TensorFlow (costoso, solo cuando realmente se ejecuta)
import tensorflow as tf
from tensorflow.keras import layers, models

# ── Datos ─────────────────────────────────────────────────────────────────────
if not DATA_DIR.exists():
    raise FileNotFoundError(
        f"No se encontró el dataset en {DATA_DIR}\n"
        "Ejecuta primero extractor_plazas.py y organiza las imágenes en libre/ y ocupado/"
    )

train_ds = tf.keras.utils.image_dataset_from_directory(
    str(DATA_DIR), validation_split=0.2, subset="training",
    seed=123, image_size=IMG_SIZE, batch_size=BATCH_SIZE,
)
val_ds = tf.keras.utils.image_dataset_from_directory(
    str(DATA_DIR), validation_split=0.2, subset="validation",
    seed=123, image_size=IMG_SIZE, batch_size=BATCH_SIZE,
)

# Prefetch para acelerar entrenamiento
AUTOTUNE = tf.data.AUTOTUNE
train_ds = train_ds.cache().prefetch(buffer_size=AUTOTUNE)
val_ds   = val_ds.cache().prefetch(buffer_size=AUTOTUNE)

# ── Modelo: MobileNetV2 + cabeza de clasificación binaria ────────────────────
base_model = tf.keras.applications.MobileNetV2(
    input_shape=(160, 160, 3), include_top=False, weights='imagenet'
)
base_model.trainable = False  # Congelamos los pesos preentrenados

model = models.Sequential([
    base_model,
    layers.GlobalAveragePooling2D(),
    layers.Dropout(0.2),
    layers.Dense(1, activation='sigmoid'),  # 0 = libre, 1 = ocupado
])

model.compile(
    optimizer='adam',
    loss='binary_crossentropy',
    metrics=['accuracy'],
)

print(f"\nEntrenando {args.epochs} epochs con imágenes de {DATA_DIR} ...")
model.fit(train_ds, validation_data=val_ds, epochs=args.epochs)

# ── Guardar ───────────────────────────────────────────────────────────────────
model.save(str(MODEL_PATH))
print(f"\n✅ Modelo guardado en {MODEL_PATH}")
