/**
 * mapa.js
 * ========
 * Todo lo relacionado con el mapa interactivo de Leaflet.
 *
 * Funciones que exporta (usadas desde otros módulos):
 *   - initMapa()             → crea el mapa en el div #map
 *   - actualizarMarcas(datos)→ añade o refresca los iconos de colores
 *   - focusPark(id)          → centra el mapa en un parking y resalta su tarjeta
 *   - destacarMarcador(id)   → hace parpadear el icono brevemente (llamado desde chatbot)
 *
 * Librería: Leaflet.js (cargada en index.html desde CDN, sin API key)
 * Tiles: OpenStreetMap (gratuito, sin límite de peticiones razonable)
 *
 * Depende de: catalogo.js (CAT), prediccion.js (colorEstado, estado, textoPrediccion)
 */

// Variable global del mapa (instancia de Leaflet)
let mapa;

// Diccionario de marcadores: { 'CE': marcador, 'MA': marcador, ... }
// Lo usamos para actualizar los iconos sin borrar y volver a crear
const marcas = {};

/**
 * Crea el mapa Leaflet y lo monta en el div con id="map".
 * Centra la vista en el centro de Málaga, zoom 14.
 * Debe llamarse una sola vez al arrancar la app (desde app.js).
 */
function initMapa() {
  mapa = L.map('map', { zoomControl: true }).setView([36.7213, -4.4217], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(mapa);
}

/**
 * Crea un icono de marcador con forma de gota (pin) de color dinámico.
 * El color varía según el % de ocupación: verde / amarillo / rojo.
 * Usamos L.divIcon (HTML puro) para no depender de imágenes externas.
 * @param {number} pct - Ocupación entre 0 y 1
 * @returns {L.DivIcon}
 */
function crearIcono(pct) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:26px;height:26px;
      background:${colorEstado(pct)};
      border:3px solid white;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 2px 6px rgba(0,0,0,.35);
    "></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -28],
  });
}

/**
 * Genera el contenido HTML del popup que aparece al hacer clic en un marcador.
 * Muestra: nombre, estado, plazas libres, % ocupado y predicción a 1h.
 * @param {string} id - ID del parking
 * @param {object} d  - Datos actuales { pct, libres }
 * @returns {string} HTML
 */
function popupHTML(id, d) {
  const c   = CAT[id];
  const pct = d.pct;
  const imgHtml = c.camara
    ? `<img src="${c.camara}" style="width:220px;height:130px;object-fit:cover;border-radius:6px;margin-bottom:6px;display:block" onerror="this.style.display='none'">`
    : '';
  return `
    <div style="min-width:${c.camara ? '224px' : 'auto'}">
      ${imgHtml}
      <b>${c.n}</b><br>
      <span style="color:${colorEstado(pct)};font-weight:700">${estado(pct)}</span>
      · ${d.libres} plazas libres<br>
      <span style="font-size:11px;color:#64748b">${Math.round(pct * 100)}% ocupado</span><br>
      <span style="font-size:11px;color:#64748b">${textoPrediccion(id, pct)}</span>
    </div>
  `;
}

/**
 * Añade o actualiza los marcadores del mapa con los datos más recientes.
 * Si el marcador ya existe, solo cambia el icono y el popup (más eficiente
 * que borrarlo y crearlo de nuevo, evita parpadeos).
 * Si es la primera vez, crea el marcador y lo añade al mapa.
 *
 * @param {object} datos - { CE: {pct, libres}, MA: {pct, libres}, ... }
 */
function actualizarMarcas(datos) {
  Object.entries(datos).forEach(([id, d]) => {
    const c = CAT[id];
    if (!c) return;
    const html = popupHTML(id, d);
    if (marcas[id]) {
      marcas[id].setIcon(crearIcono(d.pct));
      marcas[id].getPopup().setContent(html);
    } else {
      marcas[id] = L.marker([c.lat, c.lng], { icon: crearIcono(d.pct) })
        .bindPopup(html)
        .addTo(mapa);
    }
  });
}

/**
 * Centra el mapa en el parking indicado, abre su popup y resalta
 * su tarjeta en el sidebar. También hace parpadear el marcador.
 * Se llama cuando el usuario hace clic en una tarjeta o el chatbot recomienda un parking.
 * @param {string} id - ID del parking (ej: 'CE')
 */
function focusPark(id) {
  const c = CAT[id];
  if (!c || !marcas[id]) return;
  mapa.setView([c.lat, c.lng], 16);
  marcas[id].openPopup();
  document.querySelectorAll('.card').forEach(el => el.classList.remove('highlight'));
  const card = document.getElementById('card-' + id);
  if (card) { card.classList.add('highlight'); card.scrollIntoView({ block: 'nearest' }); }
  destacarMarcador(id);
}

/**
 * Efecto visual: hace pulsar el marcador durante ~3 segundos.
 * Aumenta el tamaño del icono y añade un halo de color para que sea
 * imposible no verlo cuando el chatbot lo recomienda.
 * Después de 3.2s restaura el icono normal automáticamente.
 * @param {string} id - ID del parking
 */
function destacarMarcador(id) {
  const d   = (window._datosActuales || {})[id];
  const pct = d ? d.pct : 0.5;

  // @keyframes parpadeo está definido en styles.css — no inyectamos <style> aquí
  // para evitar acumular reglas duplicadas en el DOM con cada llamada.
  const iconoDestacado = L.divIcon({
    className: '',
    html: `<div style="
      width:36px;height:36px;
      background:${colorEstado(pct)};
      border:4px solid white;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 0 0 6px ${colorEstado(pct)}55, 0 3px 10px rgba(0,0,0,.4);
      animation: parpadeo 0.6s ease-in-out 5;
    "></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -38],
  });

  if (marcas[id]) {
    marcas[id].setIcon(iconoDestacado);
    setTimeout(() => {
      if (marcas[id]) marcas[id].setIcon(crearIcono(pct));
    }, 3200);
  }
}
