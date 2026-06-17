import cv2
import json
import os

# Configuración
IMAGE_DIR = r"B:\Data_Science\IA Y BIG DATA ENTORNOS 5G\AparcaYa\data\imagen"
IMAGE_FILE = "TV-16_13.jpg"
IMAGE_PATH = os.path.join(IMAGE_DIR, IMAGE_FILE)
CONFIG_FILE = os.path.join(r"B:\Data_Science\IA Y BIG DATA ENTORNOS 5G\AparcaYa\python\vision", "plazas_config.json")

# Verificar si existe la imagen antes de abrirla
if not os.path.exists(IMAGE_PATH):
    print(f"ERROR: No encuentro la imagen en: {IMAGE_PATH}")
    # Por si acaso, listamos los archivos en la carpeta
    print("Contenido de la carpeta:", os.listdir(IMAGE_DIR))
    exit()

img = cv2.imread(IMAGE_PATH)
plazas = {}
rect = []

def click_y_arrastrar(event, x, y, flags, param):
    global rect, drawing, plazas
    if event == cv2.EVENT_LBUTTONDOWN:
        drawing = True
        rect = [(x, y)]
    elif event == cv2.EVENT_LBUTTONUP:
        drawing = False
        rect.append((x, y))
        # Guardar plaza
        idx = len(plazas) + 1
        plazas[f"plaza_{idx}"] = {"x1": rect[0][0], "y1": rect[0][1], "x2": rect[1][0], "y2": rect[1][1]}
        print(f"Plaza {idx} guardada: {plazas[f'plaza_{idx}']}")
        cv2.rectangle(img, rect[0], rect[1], (0, 255, 0), 2)
        cv2.imshow("Marca las plazas", img)

img = cv2.imread(IMAGE_PATH)
cv2.namedWindow("Marca las plazas")
cv2.setMouseCallback("Marca las plazas", click_y_arrastrar)

print("Instrucciones: Haz clic y arrastra para dibujar un rectángulo sobre cada plaza.")
print("Presiona 'q' para guardar y salir.")

while True:
    cv2.imshow("Marca las plazas", img)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

with open(CONFIG_FILE, 'w') as f:
    json.dump(plazas, f, indent=4)

cv2.destroyAllWindows()
print(f"Configuración guardada en {CONFIG_FILE}")