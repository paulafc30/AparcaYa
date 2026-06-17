import tensorflow as tf
import cv2
import numpy as np
import json
import os

# Configuración
MODEL_PATH = r"B:\Data_Science\IA Y BIG DATA ENTORNOS 5G\AparcaYa\python\vision\vision_model.h5"
DATASET_DIR = r"B:\Data_Science\IA Y BIG DATA ENTORNOS 5G\AparcaYa\data\vision_dataset"
OUTPUT_JSON = r"B:\Data_Science\IA Y BIG DATA ENTORNOS 5G\AparcaYa\data\estado_vision.json"

# Cargar el modelo
model = tf.keras.models.load_model(MODEL_PATH)

def predecir_plazas():
    resultados = {}
    
    # Iterar sobre las imágenes guardadas en la carpeta de dataset
    for img_file in os.listdir(DATASET_DIR):
        if img_file.endswith(".jpg"):
            img_path = os.path.join(DATASET_DIR, img_file)
            
            # Preparar imagen para el modelo
            img = cv2.imread(img_path)
            img = cv2.resize(img, (160, 160)) # El tamaño con el que entrenamos
            img = np.expand_dims(img, axis=0) # Convertir a batch de 1 imagen
            
            # Predicción
            prediccion = model.predict(img, verbose=0)
            estado = "OCUPADO" if prediccion[0][0] > 0.5 else "LIBRE"
            resultados[img_file.replace(".jpg", "")] = estado
            
    # Guardar resultados
    with open(OUTPUT_JSON, 'w') as f:
        json.dump(resultados, f, indent=4)
    print(f"Predicciones guardadas en {OUTPUT_JSON}")

if __name__ == "__main__":
    predecir_plazas()