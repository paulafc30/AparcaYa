/**
 * prediccion.js
 * ==============
 * Modelo de predicción de ocupación de aparcamientos.
 *
 * ¿Cómo funciona?
 *   No usa ninguna IA externa ni API de pago. En su lugar aplica un modelo
 *   de "blending" (mezcla) entre dos fuentes de información:
 *     - 60% → el patrón histórico de esa hora y día de la semana (de catalogo.js)
 *     - 40% → la ocupación actual ajustada proporcionalmente
 *
 *   Esto permite que la predicción sea realista aunque el día de hoy sea
 *   atípico (un evento, lluvia, feria...), porque parte siempre del dato real.
 *
 * También contiene las funciones de estado visual (colores, badges),
 * usadas en mapa.js, datos.js y chatbot.js.
 *
 * Depende de: catalogo.js (TIPO, PATRONES)
 */

// ── FUNCIONES DE ESTADO VISUAL ────────────────────────────────────────────────
// Convierten un porcentaje de ocupación (0–1) en texto, color o clase CSS.

/**
 * Devuelve el texto del estado según el % de ocupación.
 * Umbrales: ≥85% → LLENO | ≥50% → DISPONIBLE | <50% → LIBRE
 * @param {number} pct - Ocupación entre 0 y 1
 * @returns {string}
 */
function estado(pct) {
  if (pct >= 0.85) return 'LLENO';
  if (pct >= 0.50) return 'DISPONIBLE';
  return 'LIBRE';
}

/**
 * Devuelve el color hexadecimal del estado (para CSS inline o marcadores del mapa).
 * Rojo = lleno | Amarillo = disponible | Verde = libre
 * @param {number} pct
 * @returns {string} Color en hex
 */
function colorEstado(pct) {
  if (pct >= 0.85) return '#ef4444';  // rojo
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

// ── MODELO DE PREDICCIÓN ──────────────────────────────────────────────────────

/**
 * Predice el % de ocupación de un parking en N horas desde ahora.
 *
 * Algoritmo de blending:
 *   1. Tomamos el patrón histórico para la HORA FUTURA (60% del peso)
 *   2. Calculamos un "ratio" entre la ocupación actual y lo que el patrón
 *      esperaría para AHORA (para detectar si hoy es un día atípico)
 *   3. Aplicamos ese ratio al patrón futuro con un 40% de peso
 *
 * Ejemplo práctico:
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
function predecirHora(id, pctActual, horasDelante) {
  const tipo = TIPO[id] || 'centro';

  // Hora y día en el momento futuro (cuando llegará el usuario)
  const futuro     = new Date(Date.now() + horasDelante * 3600000);
  const horaFutura = futuro.getHours();
  const diaFuturo  = futuro.getDay();  // 0=domingo … 6=sábado

  // Patrón esperado para esa hora futura según el histórico
  const patronFuturo = PATRONES[tipo][horaFutura][diaFuturo];

  // Patrón esperado para ahora mismo (para comparar con la realidad)
  const horaActual   = new Date().getHours();
  const diaActual    = new Date().getDay();
  const patronActual = PATRONES[tipo][horaActual][diaActual];

  // Ratio: cuánto se desvía la realidad de hoy respecto al histórico
  const ratio = patronActual > 0.01 ? pctActual / patronActual : 1;

  // Mezcla: 60% patrón puro + 40% patrón ajustado por el comportamiento de hoy
  const pctPrevisto = 0.60 * patronFuturo + 0.40 * (patronFuturo * ratio);

  return Math.min(1, Math.max(0, pctPrevisto));
}

/**
 * Genera el texto de predicción a 1 hora vista, para tarjetas y popups.
 *
 * Posibles salidas:
 *   "Se mantendrá libre en 1h (32% previsto)"
 *   "⚠️ Podría estar lleno en 1h (87% previsto)"
 *   "✅ Mejorará a libre en 1h (41% previsto)"
 *
 * @param {string} id        - ID del parking
 * @param {number} pctActual - Ocupación actual entre 0 y 1
 * @returns {string}
 */
function textoPrediccion(id, pctActual) {
  const p1   = predecirHora(id, pctActual, 1);
  const e1   = estado(p1);
  const e0   = estado(pctActual);
  const p1p  = Math.round(p1 * 100);

  if (e1 === e0)        return `Se mantendrá ${e1.toLowerCase()} en 1h (${p1p}% previsto)`;
  if (p1 > pctActual)   return `⚠️ Podría estar ${e1.toLowerCase()} en 1h (${p1p}% previsto)`;
  return `✅ Mejorará a ${e1.toLowerCase()} en 1h (${p1p}% previsto)`;
}
