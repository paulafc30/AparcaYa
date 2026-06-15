/**
 * mapa.js
 * Inicialización del mapa Leaflet y gestión de marcadores.
 */

let mapa;
const marcas = {};

function initMapa() {
  mapa = L.map('map', { zoomControl: true }).setView([36.7213, -4.4217], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(mapa);
}

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

function popupHTML(id, d) {
  const c   = CAT[id];
  const pct = d.pct;
  return `
    <b>${c.n}</b><br>
    <span style="color:${colorEstado(pct)};font-weight:700">${estado(pct)}</span>
    · ${d.libres} plazas libres<br>
    <span style="font-size:11px;color:#64748b">${Math.round(pct * 100)}% ocupado</span><br>
    <span style="font-size:11px;color:#64748b">${textoPrediccion(id, pct)}</span>
  `;
}

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
 * Hace pulsar el marcador visualmente durante ~3 segundos.
 * Cambia el icono a uno más grande y vuelve al normal.
 */
function destacarMarcador(id) {
  const d   = (window._datosActuales || {})[id];
  const pct = d ? d.pct : 0.5;

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
    "></div>
    <style>
      @keyframes parpadeo {
        0%,100%{opacity:1;transform:rotate(-45deg) scale(1)}
        50%{opacity:.6;transform:rotate(-45deg) scale(1.2)}
      }
    </style>`,
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
