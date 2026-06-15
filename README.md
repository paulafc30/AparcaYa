# AparcaYa 🅿️

**Asistente inteligente de aparcamiento para Málaga**  
Proyecto final · Curso IA & Big Data · Presentación 25 jun 2026

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
├── index.html                  ← App principal
├── css/
│   └── styles.css
├── js/
│   ├── catalogo.js             ← Datos estáticos + patrones de predicción
│   ├── prediccion.js           ← Modelo de predicción por patrones
│   ├── mapa.js                 ← Leaflet: mapa e iconos
│   ├── chatbot.js              ← Asistente conversacional (+100 destinos)
│   ├── datos.js                ← Carga CSV / Supabase / fallback
│   └── app.js                  ← Init y loop de actualización
├── python/
│   ├── main.py                 ← Orquestador (--once para el Action)
│   ├── requirements.txt
│   └── ingesta/
│       ├── downloader.py       ← Descarga CSV del Ayuntamiento
│       └── processor.py        ← Enriquecimiento y cálculo de estado
├── data/
│   ├── catalogo.csv            ← Catálogo de parkings (id, coords, capacidad)
│   └── dataset_historico_aparcaya.csv ← 14 880 registros sintéticos
├── supabase/
│   └── schema.sql              ← DDL: tablas, vistas, RLS
└── .github/
    └── workflows/
        └── fetch_data.yml      ← Cron cada 5 min → Python → Supabase
```

---

## Despliegue paso a paso

### 1 · Supabase

1. Crear proyecto en [app.supabase.com](https://app.supabase.com) (región Europe West).
2. Abrir **SQL Editor** y ejecutar `supabase/schema.sql`.
3. Anotar:
   - `Project URL` → `SUPABASE_URL`
   - `anon public key` → para el frontend en `js/datos.js`
   - `service_role key` → solo en GitHub Secrets, **nunca en el repo**

### 2 · GitHub Secrets

En **Settings → Secrets → Actions** añadir:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

### 3 · Vercel

1. [vercel.com](https://vercel.com) → New Project → importar `paulafc30/AparcaYa`.
2. Framework: **Other**. Root directory: `/`.
3. Deploy → URL pública tipo `aparcaya.vercel.app`.

### 4 · Conectar frontend con Supabase

En `js/datos.js` sustituir los placeholders:
```js
const SUPABASE_URL = 'https://TU_PROYECTO.supabase.co';
const SUPABASE_KEY = 'TU_ANON_KEY';
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
