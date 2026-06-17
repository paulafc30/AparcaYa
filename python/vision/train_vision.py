import tensorflow as tf
from tensorflow.keras import layers, models
import os

# Configuración
DATA_DIR = r"B:\Data_Science\IA Y BIG DATA ENTORNOS 5G\AparcaYa\data\vision_dataset\train"
IMG_SIZE = (160, 160)
BATCH_SIZE = 32

# 1. Cargar datos
train_ds = tf.keras.utils.image_dataset_from_directory(
    DATA_DIR, validation_split=0.2, subset="training", seed=123, image_size=IMG_SIZE, batch_size=BATCH_SIZE)
val_ds = tf.keras.utils.image_dataset_from_directory(
    DATA_DIR, validation_split=0.2, subset="validation", seed=123, image_size=IMG_SIZE, batch_size=BATCH_SIZE)

# 2. Modelo MobileNetV2 (Transfer Learning)
base_model = tf.keras.applications.MobileNetV2(input_shape=(160, 160, 3), include_top=False, weights='imagenet')
base_model.trainable = False  # Congelamos los pesos originales

model = models.Sequential([
    base_model,
    layers.GlobalAveragePooling2D(),
    layers.Dense(1, activation='sigmoid') # Clasificación binaria
])

# 3. Compilación y entrenamiento
model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
model.fit(train_ds, validation_data=val_ds, epochs=10)

# 4. Guardar
model.save("python/vision/vision_model.h5")
print("Modelo guardado como vision_model.h5")