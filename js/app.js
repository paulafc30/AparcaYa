/**
 * app.js
 * =======
 * Punto de entrada y orquestador principal de AparcaYa.
 *
 * Orden de arranque:
 *   1. El navegador carga index.html y ejecuta los <script> en orden:
 *      catalogo.js → prediccion.js → mapa.js → chatbot.js → datos.js → historial.js → auth.js → app.js
 *   2. El evento 'load' llama a initAuth() (auth.js), que comprueba si hay sesión
 *      activa en Supabase y muestra el login overlay o el dashboard directamente.
 *   3. Una vez el usuario entra (login, registro o invitado), initDashboard() arranca
 *      el mapa, carga los datos y programa el refresco automático cada 30 segundos.
 */

const INTERVALO_MS = 30 * 1000;

/**
 * Inicializa el dashboard. Llamada desde auth.js tras autenticación exitosa.
 * No se llama en el evento 'load' directamente para que el mapa solo se cree
 * cuando el div #map ya es visible (evita bugs de Leaflet con display:none).
 */
async function initDashboard() {
  // Mapa interactivo
  initMapa();

  // Contador dinámico de parkings en el header
  const countEl = document.getElementById('parking-count');
  if (countEl) countEl.textContent = Object.keys(CAT).length;

  // Predicciones ML antes del primer render para que las cards ya las muestren
  await cargarPredicciones().catch(() => {});

  // Primera carga de datos reales
  await cargar();

  // Refresco automático cada 30 segundos
  setInterval(async () => {
    cargarPredicciones().catch(() => {});
    await cargar();
  }, INTERVALO_MS);
}

/**
 * Botón de recarga manual (↻ en el header).
 */
async function recargar() {
  const btn = document.getElementById('btn-reload');
  if (btn) { btn.classList.add('girando'); btn.disabled = true; }
  await cargarPredicciones().catch(() => {});
  await cargar();
  if (btn) { btn.classList.remove('girando'); btn.disabled = false; }
}

/**
 * Arranque: esperar a que todos los recursos estén listos y delegar en auth.js.
 * auth.js decide si mostrar el login o ir directo al dashboard (sesión guardada).
 */
window.addEventListener('load', () => {
  initAuth();
});
