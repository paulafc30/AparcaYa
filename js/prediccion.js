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
 * Umbrales: ≥85% → LLENO | ≥50% → DISPONIBLE | <50% → LIBRE
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


// ── FALLBACK: MODELO DE PATRONES HISTÓRICOS ──────────────────────────────────

/**
 * Predice el % de ocupación de un parking en N horas usando los patrones
 * históricos de catalogo.js. Se activa solo cuando las predicciones ML no
 * están disponibles.
 *
 * Algoritmo de blending:
 *   1. Patrón histórico para la HORA FUTURA (60% del peso)
 *   2. Ratio actual vs. patrón de ahora para detectar días atípicos (40%)
 *
 * Ejemplo:
 *   Son las 10h. El parking está al 95% pero el patrón esperaba 88%.
 *   Ratio = 0.95 / 0.88 ≈ 1.08  (hoy va un 8% más lleno de lo normal)
 *   A las 12h el patrón espera 90%
 *   → Predicción = 0.6 × 0.90 + 0.4 × (0.90 × 1.08) = 93%
 *
 * @param {string} id           - ID del parking (ej: 'CE', 'CY')
 * @param {number} pctActual    - Ocupación actual entre 0 y 1
 * @param {number} horasDelante - Horas hacia el futuro
 * @returns {number} Ocupación prevista entre 0 y 1
 */
function _predPatrones(id, pctActual, horasDelante) {
  const tipo = TIPO[id] || 'centro';

  const futuro     = new Date(Date.now() + horasDelante * 3600000);
  const horaFutura = futuro.getHours();
  const diaFuturo  = futuro.getDay();

  const patronFuturo  = PATRONES[tipo][horaFutura][diaFuturo];
  const horaActual    = new Date().getHours();
  const diaActual     = new Date().getDay();
  const patronActual  = PATRONES[tipo][horaActual][diaActual];
  const ratio         = patronActual > 0.01 ? pctActual / patronActual : 1;

  const pctPrevisto = 0.60 * patronFuturo + 0.40 * (patronFuturo * ratio);
  return Math.min(1, Math.max(0, pctPrevisto));
}


// ── API PÚBLICA ───────────────────────────────────────────────────────────────

/**
 * Predice el % de ocupación de un parking en N horas desde ahora.
 * Usa predicciones ML si están disponibles, patrones si no.
 *
 * @param {string} id           - ID del parking
 * @param {number} pctActual    - Ocupación actual entre 0 y 1
 * @param {number} horasDelante - Horas hacia el futuro (1, 2 ó 3)
 * @returns {number} Ocupación prevista entre 0 y 1
 */
function predecirHora(id, pctActual, horasDelante) {
  const ml = _predML(id, horasDelante);
  if (ml) return ml.pct_prevista;
  return _predPatrones(id, pctActual, horasDelante);
}

/**
 * Genera el texto de predicción a 1 hora vista para tarjetas y popups.
 * Si hay predicciones ML añade el nivel de confianza del modelo.
 *
 * Ejemplos de salida:
 *   "[IA] Se mantendrá libre en 1h (32% previsto, confianza alta)"
 *   "[IA] ⚠️ Podría estar lleno en 1h (87% previsto, confianza media)"
 *   "✅ Mejorará a libre en 1h (41% previsto)"   ← fallback sin IA
 *
 * @param {string} id        - ID del parking
 * @param {number} pctActual - Ocupación actual entre 0 y 1
 * @returns {string}
 */
function textoPrediccion(id, pctActual) {
  const ml = _predML(id, 1);  // predicción ML a 1 hora

  if (ml) {
    // ── Predicción ML disponible ──────────────────────────────────────────
    const p1p  = Math.round(ml.pct_prevista * 100);
    const e1   = ml.estado_previsto;
    const e0   = estado(pctActual);
    const conf = ml.confianza;
    const tag  = `[IA·${conf}]`;

    if (e1 === e0)
      return `${tag} Se mantendrá ${e1.toLowerCase()} en 1h (${p1p}% previsto)`;
    if (ml.pct_prevista > pctActual)
      return `${tag} ⚠️ Podría estar ${e1.toLowerCase()} en 1h (${p1p}% previsto)`;
    return `${tag} ✅ Mejorará a ${e1.toLowerCase()} en 1h (${p1p}% previsto)`;

  } else {
    // ── Fallback: patrones históricos ─────────────────────────────────────
    const p1  = _predPatrones(id, pctActual, 1);
    const e1  = estado(p1);
    const e0  = estado(pctActual);
    const p1p = Math.round(p1 * 100);

    if (e1 === e0)      return `Se mantendrá ${e1.toLowerCase()} en 1h (${p1p}% previsto)`;
    if (p1 > pctActual) return `⚠️ Podría estar ${e1.toLowerCase()} en 1h (${p1p}% previsto)`;
    return `✅ Mejorará a ${e1.toLowerCase()} en 1h (${p1p}% previsto)`;
  }
}
