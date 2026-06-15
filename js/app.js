/**
 * app.js
 * Orquestador principal de AparcaYa.
 * Inicializa el mapa, carga datos y programa la actualización periódica.
 */

const INTERVALO_MS = 60 * 1000; // Actualizar cada 60 segundos

window.addEventListener('load', async () => {
  // 1. Inicializar mapa Leaflet
  initMapa();

  // 2. Primera carga de datos (incluye render de tarjetas y marcadores)
  await cargar();

  // 3. Actualización periódica
  setInterval(cargar, INTERVALO_MS);
});
