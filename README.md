# AparcaYa 🅿️

**Asistente inteligente de aparcamiento para Málaga**  
Proyecto final · Curso IA & Big Data · Presentación 17 y 25 jun 2026

Documentación provisional del proyecto [aqui](https://docs.google.com/document/d/1oTKzJ1QB5Z49ohARry1LA3h_CczxObJdatO2CFtWSoU/edit?usp=sharing)

---

## 🌿 Sobre las ramas del proyecto (para Luisa)

Este repositorio tiene dos ramas principales. Piensa en ellas como dos versiones del proyecto:

```
main     →  Lo que está "en producción" (lo que ve el mundo)
develop  →  Donde trabajamos nosotras (código en desarrollo)
```

### ¿Qué hago en `develop`? (aquí estás ahora)

Todo. Aquí se añade código nuevo, se prueban cosas y se rompen cosas sin miedo.

- Añadir una función nueva en Python → `develop`
- Cambiar el chatbot → `develop`
- Subir el dataset histórico → `develop`
- Probar algo que igual no funciona → `develop`

```bash
# Asegúrate de estar en develop antes de trabajar
git checkout develop

# Guarda tus cambios
git add .
git commit -m "feat: descripción breve de lo que hiciste"
git push
```

### ¿Cuándo se toca `main`?

Solo cuando algo está terminado, probado y queremos que sea la versión oficial. En la práctica, para este proyecto, eso significa:

- ✅ La demo está lista para entregar al profesor
- ✅ La app está desplegada en Vercel y funciona
- ✅ Hemos probado que no hay errores evidentes

Nunca trabajamos directamente en `main`. Se actualiza haciendo un **Pull Request** de `develop → main` (desde la web de GitHub).

---

## Stack tecnológico

| Capa | Tecnología | Plan |
|---|---|---|
| Frontend | HTML + CSS + JS vanilla | — |
| Mapa | Leaflet.js (OSM) | Gratis |
| Base de datos | Supabase (PostgreSQL) | Free tier |
| Hosting | Vercel | Hobby (gratis) |
| CI/CD | GitHub Actions | Gratis (público) |
| Datos | Ayuntamiento de Málaga Open Data | Abiertos |

---

## Estructura del proyecto


```
AparcaYa/
├── .github/                ← Configuración CI/CD
│   └── workflows/
|           └── fetch_data.yml      ← Cron cada 5 min → Python → Supabase
├── css/                    ← Estilos
│   └── styles.css
├── data/                   ← Almacenamiento de datos
│   ├── historico/          ← Registros históricos (historico_ocupacion.csv)
│   ├── processed/          ← Datos procesados (estado_actual.json, ocupacion_actual.csv)
│   ├── raw/                ← Datos brutos (ej. catálogos descargados)
│   ├── catalogo.csv        ← Catálogo de parkings (id, coords, capacidad)
│   └── dataset_historico_aparcaya.csv  ← 14 880 registros sintéticos
├── js/                     ← Lógica Frontend
│   ├── app.js              ← Init y loop de actualización
│   ├── catalogo.js         ← Datos estáticos + patrones de predicción
│   ├── chatbot.js          ← Asistente conversacional
│   ├── datos.js            ← Carga CSV / Supabase / fallback
│   ├── mapa.js             ← Leaflet: mapa e iconos
│   └── prediccion.js       ← Modelo de predicción por patrones
├── logs/                   ← Logs de ejecución
│   └── parkmalaga.log
├── python/                 ← Backend / Data Pipeline
│   ├── api_bridge/         ← Interfaz con APIs externas
│   ├── ingesta/            ← Proceso ETL
│   │   ├── downloader.py   ← Descarga CSV del Ayuntamiento
│   │   └── processor.py    ← Enriquecimiento y cálculo de estado
│   ├── modelo/             ← Machine Learning
│   │   ├── model.pkl       ← Modelo entrenado
│   │   ├── predict.py      ← Lógica de inferencia
│   │   └── train.py        ← Script de entrenamiento
│   ├── main.py             ← Orquestador del pipeline
│   └── requirements.txt    ← Dependencias de Python
├── supabase/               ← Backend Database
│   └── schema.sql          ← DDL: tablas, vistas, RLS
├── index.html              ← App principal
└── .gitignore              ← Archivos excluidos del control de versiones
```
---

## Flujo de trabajo con Git (resumen rápido)

```bash
# Ver en qué rama estás
git branch

# Cambiar a develop (para trabajar)
git checkout develop

# Subir cambios
git add .
git commit -m "feat: lo que hice"
git push

# Pasar algo a main (cuando esté listo para producción)
# → Hacerlo desde GitHub: Pull Request develop → main
```

---

## Equipo

- **Paula** — Frontend & despliegue web
- **Luisa** — Python, IA & análisis de datos
