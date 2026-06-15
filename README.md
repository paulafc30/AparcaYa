# AparcaYa 🅿️

**Asistente inteligente de aparcamiento para Málaga**  
Proyecto final · Curso IA & Big Data · Presentación 17 y 25 jun 2026

---

## ¿Qué hace?

- Muestra la **ocupación en tiempo real** de los 10 aparcamientos municipales de Málaga.
- **Predice la disponibilidad** para cuando llegues (ideal si vienes desde fuera de Málaga).
- Un **chatbot** te recomienda el parking más cercano a tu destino.
- Se actualiza automáticamente cada minuto.

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
│   ├── chatbot.js              ← Asistente conversacional
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
   - `anon public key` → `SUPABASE_KEY` (para el frontend en `datos.js`)
   - `service_role key` → `SUPABASE_SERVICE_KEY` (solo en GitHub Secrets, nunca en el repo)

### 2 · GitHub

```bash
git clone https://github.com/paulafc30/AparcaYa.git
# (o git remote add origin si ya existe)
git add .
git commit -m "feat: proyecto estructurado AparcaYa"
git push -u origin main
```

Añadir Secrets en **Settings → Secrets → Actions**:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

### 3 · Vercel

1. Entrar a [vercel.com](https://vercel.com) → New Project → importar `paulafc30/AparcaYa`.
2. Framework: **Other** (HTML estático).
3. Root directory: `/` (o `AparcaYa/` si está en subdirectorio).
4. Deploy. La URL pública será algo como `aparcaya.vercel.app`.

### 4 · Conectar frontend con Supabase

En `js/datos.js` sustituir los placeholders:
```js
const SUPABASE_URL = 'https://TU_PROYECTO.supabase.co';
const SUPABASE_KEY = 'TU_ANON_KEY';
```

---

## Archivo HTML de presentación

`aparcaya.html` (en la raíz de `Proyecto Curso/`) es la **versión todo-en-uno** que se entrega al profesor. Funciona sin servidor: abre directamente en el navegador.

---

## Equipo

- **Paula** — Frontend & despliegue web
- **Luisa** — Python, IA & análisis de datos
