/**
 * prediccion.js
 * ==============
 * Predicción de ocupación de aparcamientos con modelo de IA (Random Forest).
 *
 * Arquitectura de dos capas:
 * ──────────────────────────
 *   CAPA 1 — Predicciones ML (fuente principal)
 *     El modelo Random Forest, entrenado en Python (train.py), se ejecuta
 *     cada 5 minutos en el servidor mediante un GitHub Action. Los resultados
 *     se almacenan en la tabla 'parking_predicciones' de Supabase.
 *     Este módulo los descarga al iniciar la app y los renueva periódicamente.
 *
 *   CAPA 2 — Patrones históricos (fallback)
 *     Si Supabase no está disponible o las predicciones son muy antiguas (>15 min),
 *     se usa el modelo de blending de patrones de catalogo.js como respaldo.
 *     Este fallback siempre funciona, incluso sin conexión a Internet.
 *
 * Funciones exportadas al resto de la app:
 *   textoPrediccion(id, pctActual)   → string para tarjetas y popups
 *   predecirHora(id, pctActual, N)   → número (% previsto en N horas)
 *   colorEstado(pct) / estado(pct)   → visual helpers
 *
 * Depende de: catalogo.js (TIPO, PATRONES), datos.js (SUPABASE_URL, SUPABASE_KEY)
 */

// ── FUNCIONES DE ESTADO VISUAL ────────────────────────────────────────────────
// Convierten un porcentaje de ocupación (0–1) en texto, color o clase CSS.
// Usadas en mapa.js, datos.js y chatbot.js.

/**
 * Devuelve el texto del estado según el % de ocupación.
 * Umbrales: ≥90% → LLENO | ≥50% → DISPONIBLE | <50% → LIBRE
 * (Deben coincidir con calcular_estado() en predict.py)
 * @param {number} pct - Ocupación entre 0 y 1
 * @returns {string}
 */
function estado(pct) {
  if (pct >= 0.90) return 'LLENO';
  if (pct >= 0.50) return 'DISPONIBLE';
  return 'LIBRE';
}

/**
 * Devuelve el color hexadecimal del estado.
 * Rojo = lleno | Amarillo = disponible | Verde = libre
 * @param {number} pct
 * @returns {string} Color en hex
 */
function colorEstado(pct) {
  if (pct >= 0.90) return '#ef4444';  // rojo
  if (pct >= 0.50) return '#eab308';  // amarillo
  return '#22c55e';                    // verde
}

/**
 * Clase CSS para el badge (pastilla de texto) de una tarjeta.
 * Definidas en styles.css: .badge-libre / .badge-disponible / .badge-lleno
 */
function badgeClass(pct) {
  return pct >= .85 ? 'lleno' : pct >= .50 ? 'disponible' : 'libre';
}

/**
 * Clase CSS para la barra de progreso de una tarjeta.
 * Definidas en styles.css: .bar-libre / .bar-disponible / .bar-lleno
 */
function barClass(pct) {
  return pct >= .85 ? 'bar-lleno' : pct >= .50 ? 'bar-disponible' : 'bar-libre';
}


// ── CACHÉ DE PREDICCIONES ML ──────────────────────────────────────────────────
// Guardamos las predicciones descargadas de Supabase para no hacer una petición
// de red en cada render de tarjeta. Se actualizan cada vez que cargar() llama
// a cargarPredicciones().
//
// Estructura: { 'CE_1': { pct_prevista, libres_previstas, estado_previsto,
//                          confianza, ts }, 'CE_2': {...}, ... }
// La clave es `${parking_id}_${horizonte_horas}`.
let _prediccionesML = {};
let _tsUltimaDescarga = null;

// Tiempo máximo que consideramos válida una predicción descargada (15 minutos)
const MAX_EDAD_PRED_MS = 15 * 60 * 1000;

/**
 * Descarga las predicciones más recientes desde Supabase y las guarda en caché.
 * Llamada desde datos.js / app.js al iniciar y periódicamente.
 *
 * Usa la vista 'parking_prediccion_ultima' que ya filtra la fila más reciente
 * por (parking_id, horizonte_horas), así la respuesta tiene solo 30 filas
 * (10 parkings × 3 horizontes), muy ligera.
 */
async function cargarPredicciones() {
  // Leemos las variables de Supabase que ya están definidas en datos.js
  const url = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : null;
  const key = typeof SUPABASE_KEY !== 'undefined' ? SUPABASE_KEY : null;

  if (!url || !key) {
    console.warn('[prediccion] Supabase no configurado — usando patrones de fallback');
    return;
  }

  try {
    const endpoint =
      `${url}/rest/v1/parking_prediccion_ultima` +
      `?select=parking_id,horizonte_horas,pct_prevista,libres_previstas,estado_previsto,confianza,ts`;

    const resp = await fetch(endpoint, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });

    if (!resp.ok) throw new Error('Supabase error ' + resp.status);

    const rows = await resp.json();
    const nuevas = {};

    rows.forEach((r) => {
      const clave = `${r.parking_id}_${r.horizonte_horas}`;
      nuevas[clave] = {
        pct_prevista:     parseFloat(r.pct_prevista),
        libres_previstas: parseInt(r.libres_previstas),
        estado_previsto:  r.estado_previsto,
        confianza:        r.confianza || 'media',
        ts:               new Date(r.ts),
      };
    });

    _prediccionesML    = nuevas;
    _tsUltimaDescarga  = Date.now();
    console.info(`[prediccion] ${rows.length} predicciones ML cargadas desde Supabase`);

  } catch (err) {
    console.warn('[prediccion] No se pudieron cargar predicciones ML:', err.message);
    // No lanzamos el error → fallback a patrones
  }
}

/**
 * Devuelve la predicción ML para un parking y horizonte si está disponible
 * y no ha caducado. Si no, devuelve null (para activar el fallback).
 *
 * @param {string} id       - ID del parking
 * @param {number} horizonte - 1, 2 ó 3 horas
 * @returns {object|null}   - { pct_prevista, libres_previstas, estado_previsto, confianza } | null
 */
function _predML(id, horizonte) {
  // Sin descarga o datos demasiado viejos
  if (!_tsUltimaDescarga) return null;
  if (Date.now() - _tsUltimaDescarga > MAX_EDAD_PRED_MS) return null;

  const clave = `${id}_${horizonte}`;
  return _prediccionesML[clave] || null;
}


// ── API PÚBLICA ───────────────────────────────────────────────────────────────

/**
 * Predice el % de ocupación de un parking en N horas desde ahora.
 * SOLO usa el modelo Random Forest (predicciones almacenadas en Supabase).
 * Si el modelo no está disponible devuelve null — no hay fallback inventado.
 *
 * @param {string} id           - ID del parking
 * @param {number} pctActual    - Ocupación actual (no usado si hay ML, se mantiene por firma)
 * @param {number} horasDelante - Horas hacia el futuro (1, 2 ó 3)
 * @returns {number|null} Ocupación prevista [0–1] o null si el modelo no está listo
 */
function predecirHora(id, pctActual, horasDelante) {
  // Redondear al horizonte más cercano disponible (1, 2 ó 3 h)
  const horizonte = Math.min(3, Math.max(1, Math.round(horasDelante)));
  const ml = _predML(id, horizonte);
  return ml ? ml.pct_prevista : null;
}

/**
 * Genera el texto de predicción a 1h para las tarjetas del sidebar.
 * Fuente: SOLO predicciones ML del modelo Random Forest (Supabase).
 * Cuando el modelo no tiene datos recientes, indica que está actualizando.
 *
 * @param {string} id        - ID del parking
 * @param {number} pctActual - Ocupación actual entre 0 y 1
 * @returns {string}
 */
function textoPrediccion(id, pctActual) {
  const ml = _predML(id, 1);

  if (!ml) {
    // Sin predicción ML disponible: mostrar tendencia real del Ayuntamiento si la hay
    const tendencia = window._datosActuales?.[id]?.tendencia;
    if (tendencia === 'SUBIENDO') return '📈 Subiendo · modelo actualizando';
    if (tendencia === 'BAJANDO')  return '📉 Bajando · modelo actualizando';
    return '🤖 Modelo ML actualizando...';
  }

  const e0  = estado(pctActual);
  const e1  = ml.estado_previsto;
  const tag = `[IA·${ml.confianza}] `;

  if (e0 === 'LIBRE') {
    if (e1 === 'LIBRE')       return `${tag}Seguirá libre en 1h 👍`;
    if (e1 === 'DISPONIBLE')  return `${tag}En 1h habrá algo más de demanda`;
    return                           `${tag}⚠️ Puede llenarse en 1h`;
  }
  if (e0 === 'DISPONIBLE') {
    if (e1 === 'DISPONIBLE')  return `${tag}Seguirá habiendo plazas en 1h`;
    if (e1 === 'LIBRE')       return `${tag}✅ En 1h estará más tranquilo`;
    return                           `${tag}⚠️ Puede llenarse en 1h`;
  }
  // e0 === LLENO
  if (e1 === 'LLENO')         return `${tag}⚠️ Seguirá lleno en 1h`;
  if (e1 === 'DISPONIBLE')    return `${tag}✅ En 1h habrá plazas`;
  return                             `${tag}✅ En 1h estará muy tranquilo`;
}
