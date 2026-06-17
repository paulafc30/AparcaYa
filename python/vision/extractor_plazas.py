import cv2
import json
import os

# Rutas
BASE_DIR = r"B:\Data_Science\IA Y BIG DATA ENTORNOS 5G\AparcaYa"
CONFIG_FILE = os.path.join(BASE_DIR, "python", "vision", "plazas_config.json")
INPUT_IMAGE = os.path.join(BASE_DIR, "data", "imagen", "TV-16_13.jpg")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "vision_dataset")

# Crear carpeta de salida si no existe
os.makedirs(OUTPUT_DIR, exist_ok=True)

def extraer_plazas():
    # Cargar configuración
    with open(CONFIG_FILE, 'r') as f:
        config = json.load(f)
    
    # Cargar imagen
    img = cv2.imread(INPUT_IMAGE)
    if img is None:
        print("Error: No se pudo leer la imagen.")
        return

    # Extraer y guardar cada plaza
    for nombre_plaza, coords in config.items():
        # Recorte (ROI - Region of Interest)
        # Nota: Ajusta si necesitas invertir x e y dependiendo de cómo marcaste
        recorte = img[coords['y1']:coords['y2'], coords['x1']:coords['x2']]
        
        # Guardar archivo
        output_path = os.path.join(OUTPUT_DIR, f"{nombre_plaza}.jpg")
        cv2.imwrite(output_path, recorte)
        print(f"Guardado: {output_path}")

if __name__ == "__main__":
    extraer_plazas()
    print("Extracción completada con éxito.")