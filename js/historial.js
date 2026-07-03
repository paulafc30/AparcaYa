/**
 * historial.js
 * =============
 * Guarda en Supabase cada parking que el usuario consulta (clic en tarjeta
 * o recomendación del chatbot). Solo actúa si hay sesión activa; los
 * invitados no generan historial.
 *
 * Uso desde otros módulos:
 *   guardarConsulta(parkingId)  — llamar cuando el usuario interactúa con un parking
 *
 * Depende de: auth.js (window._authUser, window._esInvitado), datos.js (window._datosActuales), catalogo.js (CAT)
 */

// Evitar guardar el mismo parking más de una vez por minuto (debounce por ID)
const _ultimasConsultas = {};

/**
 * Guarda una consulta de parking en user_historial.
 * Si el usuario es invitado o no está autenticado, no hace nada.
 *
 * @param {string} parkingId  — ID del parking (CE, MA, SC…)
 */
async function guardarConsulta(parkingId) {
  // Solo usuarios autenticados
  if (!window._authUser || window._esInvitado) return;

  // Debounce: no guardar el mismo parking dos veces en menos de 60 segundos
  const ahora = Date.now();
  if (_ultimasConsultas[parkingId] && ahora - _ultimasConsultas[parkingId] < 60_000) return;
  _ultimasConsultas[parkingId] = ahora;

  const info   = CAT[parkingId];
  const datos  = window._datosActuales?.[parkingId];

  if (!info) return;

  // Calcular estado a partir del pct actual
  const pct    = datos?.pct ?? null;
  const estado = pct == null ? null
    : pct >= 0.9 ? 'LLENO'
    : pct >= 0.6 ? 'DISPONIBLE'
    : 'LIBRE';

  // Usar el cliente de auth.js (window._sbAuth no está expuesto,
  // hacemos la petición directamente con fetch + anon key igual que datos.js)
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/user_historial`, {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${await _getAccessToken()}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        user_id:        window._authUser.id,
        parking_id:     parkingId,
        parking_nombre: info.n,
        estado,
        pct_ocupacion:  datos?.pct  ?? null,
        libres:         datos?.libres ?? null,
      }),
    });
  } catch (e) {
    // El historial es secundario — no bloquear la UI si falla
    console.warn('[historial] No se pudo guardar consulta:', e.message);
  }
}

/**
 * Obtiene el access token de la sesión actual de Supabase Auth.
 * Necesario para las peticiones REST autenticadas.
 */
async function _getAccessToken() {
  // _sbAuth está definido en auth.js y es accesible en el mismo scope global
  const { data: { session } } = await _sbAuth.auth.getSession();
  return session?.access_token ?? SUPABASE_KEY;
}
