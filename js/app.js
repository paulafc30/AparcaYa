/**
 * app.js
 * =======
 * Punto de entrada y orquestador principal de AparcaYa.
 *
 * Este archivo es el "director de orquesta": arranca todo en el orden correcto
 * y mantiene el bucle de actualización. Es intencionalmente corto —
 * la lógica real está en los otros módulos.
 *
 * Orden de arranque:
 *   1. El navegador carga index.html y ejecuta los <script> en orden:
 *      catalogo.js → prediccion.js → mapa.js → chatbot.js → datos.js → app.js
 *   2. Cuando todo está cargado, el evento 'load' dispara este código.
 *   3. Se inicializa el mapa, se cargan los primeros datos y se programa
 *      la actualización automática cada 60 segundos.
 *
 * ¿Por qué 60 segundos y no menos?
 *   El CSV del Ayuntamiento se actualiza cada ~1 minuto. Pedir más rápido
 *   no daría datos más frescos pero sí haría más peticiones innecesarias.
 */

// Intervalo de refresco: 30 segundos
const INTERVALO_MS = 30 * 1000;

/**
 * Función principal de arranque.
 * Se ejecuta automáticamente cuando el navegador ha terminado de cargar
 * todos los recursos (HTML, CSS, scripts externos como Leaflet).
 * Usar 'load' en vez de 'DOMContentLoaded' garantiza que Leaflet ya existe.
 */
async function recargar() {
  const btn = document.getElementById('btn-reload');
  btn.classList.add('girando');
  btn.disabled = true;
  await cargarPredicciones().catch(() => {});
  await cargar();
  btn.classList.remove('girando');
  btn.disabled = false;
}

window.addEventListener('load', async () => {
  // 1. Crear el mapa interactivo en el div #map del HTML
  initMapa();

  // Contador dinámico en el header — se lee de CAT para actualizarse solo
  // si se añaden o eliminan parkings del catálogo.
  const countEl = document.getElementById('parking-count');
  if (countEl) countEl.textContent = Object.keys(CAT).length;

  // 2. Descarga predicciones ML de Supabase ANTES de renderizar las tarjetas.
  //    Así las cards muestran [IA·alta] desde el primer render, no 60s después.
  await cargarPredicciones().catch(() => {});

  // 3. Primera carga de datos: rellena tarjetas del sidebar y marcadores del mapa
  await cargar();

  // 4. Programa las actualizaciones automáticas cada minuto
  //    Cada ciclo también renueva las predicciones ML para que no queden obsoletas.
  setInterval(async () => {
    cargarPredicciones().catch(() => {});
    await cargar();
  }, INTERVALO_MS);
});
