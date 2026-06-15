/**
 * prediccion.js
 * Modelo de predicción de ocupación basado en patrones históricos.
 * Combina el patrón temporal (del dataset histórico) con la ocupación actual.
 */

function estado(pct) {
  if (pct >= 0.85) return 'LLENO';
  if (pct >= 0.50) return 'DISPONIBLE';
  return 'LIBRE';
}

function colorEstado(pct) {
  if (pct >= 0.85) return '#ef4444';
  if (pct >= 0.50) return '#eab308';
  return '#22c55e';
}

function badgeClass(pct) { return pct >= .85 ? 'lleno' : pct >= .50 ? 'disponible' : 'libre'; }
function barClass(pct)   { return pct >= .85 ? 'bar-lleno' : pct >= .50 ? 'bar-disponible' : 'bar-libre'; }

/**
 * Predice el % de ocupación de un parking en N horas.
 * Algoritmo: blending 60% patrón histórico + 40% extrapolación desde valor actual.
 *
 * @param {string} id          - ID del parking
 * @param {number} pctActual   - Ocupación actual [0-1]
 * @param {number} horasDelante - Horizonte de predicción en horas
 * @returns {number} pct previsto [0-1]
 */
function predecirHora(id, pctActual, horasDelante) {
  const tipo   = TIPO[id] || 'centro';
  const futuro = new Date(Date.now() + horasDelante * 3600000);
  const hora   = futuro.getHours();
  const dia    = futuro.getDay();  // 0 = domingo

  const patron   = PATRONES[tipo][hora][dia];
  const pctBase  = PATRONES[tipo][new Date().getHours()][new Date().getDay()];
  const ratio    = pctBase > 0.01 ? pctActual / pctBase : 1;
  const pctFuturo = 0.60 * patron + 0.40 * (patron * ratio);

  return Math.min(1, Math.max(0, pctFuturo));
}

/**
 * Genera el texto de predicción para una tarjeta o popup.
 */
function textoPrediccion(id, pctActual) {
  const p1  = predecirHora(id, pctActual, 1);
  const e1  = estado(p1);
  const e0  = estado(pctActual);
  const p1p = Math.round(p1 * 100);

  if (e1 === e0) return `Se mantendrá ${e1.toLowerCase()} en 1h (${p1p}% previsto)`;
  if (p1 > pctActual) return `⚠️ Podría estar ${e1.toLowerCase()} en 1h (${p1p}% previsto)`;
  return `✅ Mejorará a ${e1.toLowerCase()} en 1h (${p1p}% previsto)`;
}
