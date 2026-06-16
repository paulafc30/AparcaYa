/**
 * chatbot.js — Asistente conversacional de AparcaYa
 *
 * Mejoras:
 *   - Recomendación por proximidad real: dado un destino con coordenadas,
 *     calcula cuál de los 10 parkings está más cerca y tiene plazas.
 *   - Contexto conversacional: recuerda el último parking para preguntas
 *     de seguimiento ("¿cuántas plazas tiene?", "¿y en 2 horas?", etc.)
 *   - Normalización de texto: elimina acentos y puntuación para tolerar errores.
 *   - Panel flotante: toggleChat() abre/cierra el panel.
 */

// ── Contexto de conversación ──────────────────────────────────────────────────
const _ctx = { ultimoPark: null, ultimoLabel: null, ultimoMinutos: null };

// ── Toggle panel ──────────────────────────────────────────────────────────────
function toggleChat() {
  const panel = document.getElementById('chat-panel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open'))
    setTimeout(() => document.getElementById('chat-in')?.focus(), 200);
}

// ── Normalización ─────────────────────────────────────────────────────────────
function normalizar(texto) {
  return texto.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[¿¡?!.,;:]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// ── Parking más cercano disponible ───────────────────────────────────────────
/**
 * Dado un punto de destino (lat, lng), devuelve el ID del parking más cercano
 * que no esté lleno. Si todos están llenos devuelve igualmente el más cercano.
 */
function parkingOptimo(lat, lng) {
  const d = window._datosActuales || {};
  return Object.keys(CAT)
    .map(id => ({
      id,
      dist: Math.hypot(CAT[id].lat - lat, CAT[id].lng - lng),
      pct:  d[id]?.pct ?? 0.5,
    }))
    .sort((a, b) => {
      const aLleno = a.pct >= 0.90, bLleno = b.pct >= 0.90;
      if (aLleno !== bLleno) return aLleno ? 1 : -1;
      return a.dist - b.dist;
    })[0]?.id ?? 'CE';
}

// ── Diccionario de destinos con coordenadas reales ───────────────────────────
// Formato: { label, lat, lng }
// El parking se calcula dinámicamente según distancia y disponibilidad.
const DESTINOS = {
  // ── Centro histórico ──────────────────────────────────────────────────────
  'catedral':                  { label:'Catedral de Málaga',          lat:36.7213, lng:-4.4174 },
  'catedral malaga':           { label:'Catedral de Málaga',          lat:36.7213, lng:-4.4174 },
  'alcazaba':                  { label:'Alcazaba',                    lat:36.7219, lng:-4.4163 },
  'teatro romano':             { label:'Teatro Romano',               lat:36.7216, lng:-4.4159 },
  'gibralfaro':                { label:'Castillo de Gibralfaro',      lat:36.7245, lng:-4.4113 },
  'castillo':                  { label:'Castillo de Gibralfaro',      lat:36.7245, lng:-4.4113 },
  'picasso':                   { label:'Museo Picasso',               lat:36.7221, lng:-4.4175 },
  'museo picasso':             { label:'Museo Picasso',               lat:36.7221, lng:-4.4175 },
  'fundacion picasso':         { label:'Fundación Picasso',           lat:36.7223, lng:-4.4188 },
  'casa natal':                { label:'Casa Natal de Picasso',       lat:36.7223, lng:-4.4188 },
  'larios':                    { label:'Calle Larios',                lat:36.7199, lng:-4.4202 },
  'calle larios':              { label:'Calle Larios',                lat:36.7199, lng:-4.4202 },
  'marques de larios':         { label:'Marqués de Larios',           lat:36.7199, lng:-4.4202 },
  'atarazanas':                { label:'Mercado de Atarazanas',       lat:36.7193, lng:-4.4228 },
  'mercado central':           { label:'Mercado Central',             lat:36.7193, lng:-4.4228 },
  'ayuntamiento':              { label:'Ayuntamiento de Málaga',      lat:36.7192, lng:-4.4220 },
  'plaza constitucion':        { label:'Plaza de la Constitución',    lat:36.7196, lng:-4.4211 },
  'plaza de la constitucion':  { label:'Plaza de la Constitución',    lat:36.7196, lng:-4.4211 },
  'centro':                    { label:'Centro de Málaga',            lat:36.7199, lng:-4.4202 },
  'centro historico':          { label:'Centro histórico',            lat:36.7205, lng:-4.4185 },
  'casco historico':           { label:'Casco histórico',             lat:36.7205, lng:-4.4185 },
  'soho':                      { label:'Barrio SoHo',                 lat:36.7168, lng:-4.4276 },
  'barrio soho':               { label:'Barrio SoHo',                 lat:36.7168, lng:-4.4276 },
  'cac':                       { label:'CAC Málaga',                  lat:36.7162, lng:-4.4271 },
  'museo arte contemporaneo':  { label:'CAC Málaga',                  lat:36.7162, lng:-4.4271 },
  'muelle heredia':            { label:'Muelle Heredia',              lat:36.7155, lng:-4.4118 },
  'muelle uno':                { label:'Muelle Uno',                  lat:36.7155, lng:-4.4118 },
  'muelle':                    { label:'Muelle de Málaga',            lat:36.7155, lng:-4.4118 },
  'puerto':                    { label:'Puerto de Málaga',            lat:36.7152, lng:-4.4108 },
  'palmeral del puerto':       { label:'Palmeral del Puerto',         lat:36.7153, lng:-4.4112 },
  'pompidou':                  { label:'Centre Pompidou Málaga',      lat:36.7147, lng:-4.4112 },
  'centre pompidou':           { label:'Centre Pompidou Málaga',      lat:36.7147, lng:-4.4112 },
  'museo carmen thyssen':      { label:'Museo Carmen Thyssen',        lat:36.7207, lng:-4.4216 },
  'thyssen':                   { label:'Museo Carmen Thyssen',        lat:36.7207, lng:-4.4216 },
  'museo automovilistico':     { label:'Museo Automovilístico',       lat:36.7131, lng:-4.4398 },
  'museo vidrio':              { label:'Museo Vidrio y Cristal',      lat:36.7211, lng:-4.4175 },
  'palacio episcopal':         { label:'Palacio Episcopal',           lat:36.7210, lng:-4.4180 },
  'mim':                       { label:'Museo Interactivo de la Música', lat:36.7208, lng:-4.4175 },
  'museo interactivo musica':  { label:'Museo Interactivo de la Música', lat:36.7208, lng:-4.4175 },
  'museo ruso':                { label:'Museo Ruso de Málaga',        lat:36.7214, lng:-4.4180 },
  'el pimpi':                  { label:'El Pimpi',                   lat:36.7215, lng:-4.4167 },
  'bodega el pimpi':           { label:'El Pimpi',                   lat:36.7215, lng:-4.4167 },
  'calle granada':             { label:'Calle Granada',               lat:36.7218, lng:-4.4188 },
  'teatro cervantes':          { label:'Teatro Cervantes',            lat:36.7200, lng:-4.4194 },
  'teatro echegaray':          { label:'Teatro Echegaray',            lat:36.7200, lng:-4.4216 },
  'auditorio':                 { label:'Auditorio Municipal',         lat:36.7158, lng:-4.4102 },
  'parque de malaga':          { label:'Parque de Málaga',            lat:36.7186, lng:-4.4140 },
  'parque':                    { label:'Parque de Málaga',            lat:36.7186, lng:-4.4140 },

  // ── Playas ───────────────────────────────────────────────────────────────
  'malagueta':                 { label:'Playa La Malagueta',          lat:36.7184, lng:-4.4090 },
  'playa la malagueta':        { label:'Playa La Malagueta',          lat:36.7184, lng:-4.4090 },
  'paseo maritimo':            { label:'Paseo Marítimo',              lat:36.7177, lng:-4.4130 },
  'el palo':                   { label:'El Palo',                    lat:36.7213, lng:-4.3622 },
  'playa el palo':             { label:'Playa El Palo',               lat:36.7213, lng:-4.3622 },
  'palo':                      { label:'El Palo',                    lat:36.7213, lng:-4.3622 },
  'pedregalejo':               { label:'Pedregalejo',                 lat:36.7192, lng:-4.3672 },
  'banos del carmen':          { label:'Baños del Carmen',            lat:36.7201, lng:-4.3648 },
  'misericordia':              { label:'Playa de la Misericordia',    lat:36.7120, lng:-4.4472 },
  'playa misericordia':        { label:'Playa de la Misericordia',    lat:36.7120, lng:-4.4472 },
  'guadalmar':                 { label:'Playa de Guadalmar',          lat:36.7062, lng:-4.4768 },
  'playa':                     { label:'la playa más cercana',        lat:36.7184, lng:-4.4090 },

  // ── Hospitales ───────────────────────────────────────────────────────────
  'carlos haya':               { label:'Hospital Carlos Haya',        lat:36.7130, lng:-4.4582 },
  'hospital carlos haya':      { label:'Hospital Carlos Haya',        lat:36.7130, lng:-4.4582 },
  'virgen victoria':           { label:'Hospital Virgen de la Victoria', lat:36.7130, lng:-4.4582 },
  'hospital regional':         { label:'Hospital Regional',           lat:36.7136, lng:-4.4560 },
  'hospital civil':            { label:'Hospital Civil',              lat:36.7136, lng:-4.4560 },
  'materno':                   { label:'Hospital Materno Infantil',   lat:36.7130, lng:-4.4582 },
  'hospital materno':          { label:'Hospital Materno Infantil',   lat:36.7130, lng:-4.4582 },
  'hospital':                  { label:'zona hospitalaria',           lat:36.7130, lng:-4.4582 },
  'urgencias':                 { label:'Urgencias',                   lat:36.7130, lng:-4.4582 },

  // ── Universidad ──────────────────────────────────────────────────────────
  'uma':                       { label:'Universidad de Málaga',       lat:36.7133, lng:-4.4785 },
  'universidad malaga':        { label:'Universidad de Málaga',       lat:36.7133, lng:-4.4785 },
  'universidad':               { label:'Universidad de Málaga',       lat:36.7133, lng:-4.4785 },
  'teatinos':                  { label:'Campus de Teatinos',          lat:36.7133, lng:-4.4785 },
  'campus teatinos':           { label:'Campus de Teatinos',          lat:36.7133, lng:-4.4785 },
  'etsii':                     { label:'ETSII – UMA',                 lat:36.7133, lng:-4.4785 },
  'politecnica':               { label:'Escuela Politécnica Superior', lat:36.7133, lng:-4.4785 },
  'facultad derecho':          { label:'Facultad de Derecho',         lat:36.7133, lng:-4.4785 },

  // ── Centros comerciales ───────────────────────────────────────────────────
  'el corte ingles':           { label:'El Corte Inglés',             lat:36.7150, lng:-4.4373 },
  'corte ingles':              { label:'El Corte Inglés',             lat:36.7150, lng:-4.4373 },
  'vialia':                    { label:'Centro Comercial Vialia',     lat:36.7124, lng:-4.4316 },
  'la rosaleda':               { label:'C.C. La Rosaleda',           lat:36.7127, lng:-4.4320 },
  'rosaleda':                  { label:'C.C. La Rosaleda',           lat:36.7127, lng:-4.4320 },
  'plaza mayor':               { label:'C.C. Plaza Mayor',           lat:36.7050, lng:-4.4448 },
  'carrefour':                 { label:'Carrefour',                   lat:36.7050, lng:-4.4448 },
  'ikea':                      { label:'IKEA',                        lat:36.7050, lng:-4.4448 },
  'lidl':                      { label:'Lidl',                        lat:36.7150, lng:-4.4280 },

  // ── Transporte ────────────────────────────────────────────────────────────
  'estacion tren':             { label:'Estación María Zambrano',     lat:36.7124, lng:-4.4316 },
  'maria zambrano':            { label:'Estación María Zambrano',     lat:36.7124, lng:-4.4316 },
  'renfe':                     { label:'Estación Renfe',              lat:36.7124, lng:-4.4316 },
  'estacion autobuses':        { label:'Estación de Autobuses',       lat:36.7118, lng:-4.4320 },
  'estacion':                  { label:'Estación María Zambrano',     lat:36.7124, lng:-4.4316 },
  'aeropuerto':                { label:'Aeropuerto de Málaga',        lat:36.6748, lng:-4.4995 },
  'metro':                     { label:'Metro de Málaga',             lat:36.7124, lng:-4.4316 },
  'alameda':                   { label:'Alameda Principal',           lat:36.7191, lng:-4.4261 },
  'alameda principal':         { label:'Alameda Principal',           lat:36.7191, lng:-4.4261 },

  // ── Ocio, deporte y eventos ───────────────────────────────────────────────
  'cine':                      { label:'Cines',                       lat:36.7199, lng:-4.4202 },
  'cines':                     { label:'Cines',                       lat:36.7199, lng:-4.4202 },
  'feria malaga':              { label:'Recinto Ferial',              lat:36.7108, lng:-4.4395 },
  'recinto ferial':            { label:'Recinto Ferial',              lat:36.7108, lng:-4.4395 },
  'fycma':                     { label:'FYCMA – Palacio de Ferias',   lat:36.7108, lng:-4.4395 },
  'palacio congresos':         { label:'Palacio de Congresos',        lat:36.7108, lng:-4.4395 },
  'carpena':                   { label:'Palacio de los Deportes Martín Carpena', lat:36.7113, lng:-4.4481 },
  'estadio la rosaleda':       { label:'Estadio La Rosaleda',         lat:36.7293, lng:-4.4388 },
  'malaga cf':                 { label:'Estadio La Rosaleda',         lat:36.7293, lng:-4.4388 },

  // ── Barrios ───────────────────────────────────────────────────────────────
  'molinillo':                 { label:'El Molinillo',                lat:36.7260, lng:-4.4254 },
  'el molinillo':              { label:'El Molinillo',                lat:36.7260, lng:-4.4254 },
  'victoria':                  { label:'La Victoria',                 lat:36.7260, lng:-4.4255 },
  'lagunillas':                { label:'Lagunillas',                  lat:36.7252, lng:-4.4200 },
  'capuchinos':                { label:'Capuchinos',                  lat:36.7270, lng:-4.4217 },
  'la caleta':                 { label:'La Caleta',                   lat:36.7265, lng:-4.4150 },
  'caleta':                    { label:'La Caleta',                   lat:36.7265, lng:-4.4150 },
  'perchel':                   { label:'El Perchel',                  lat:36.7149, lng:-4.4322 },
  'trinidad':                  { label:'La Trinidad',                 lat:36.7155, lng:-4.4295 },
  'churriana':                 { label:'Churriana',                   lat:36.6840, lng:-4.5100 },
  'campanillas':               { label:'Campanillas',                 lat:36.7155, lng:-4.5239 },
  'palmilla':                  { label:'Palma-Palmilla',              lat:36.7240, lng:-4.4440 },
  'carretera de cadiz':        { label:'Carretera de Cádiz',          lat:36.7100, lng:-4.4500 },
  'este malaga':               { label:'Zona Este de Málaga',         lat:36.7204, lng:-4.3644 },
  'zona este':                 { label:'Zona Este de Málaga',         lat:36.7204, lng:-4.3644 },

  // ── Servicios públicos ────────────────────────────────────────────────────
  'correos':                   { label:'Correos',                     lat:36.7199, lng:-4.4219 },
  'juzgados':                  { label:'Juzgados de Málaga',          lat:36.7195, lng:-4.4187 },
  'diputacion':                { label:'Diputación Provincial',       lat:36.7192, lng:-4.4205 },
  'biblioteca':                { label:'Biblioteca',                  lat:36.7194, lng:-4.4210 },
  'conservatorio':             { label:'Conservatorio de Málaga',     lat:36.7214, lng:-4.4214 },
  'registro civil':            { label:'Registro Civil',              lat:36.7192, lng:-4.4205 },

  // ── Hoteles ───────────────────────────────────────────────────────────────
  'hotel molina lario':        { label:'Hotel Molina Lario',          lat:36.7208, lng:-4.4190 },
  'hotel':                     { label:'hotel en Málaga',             lat:36.7192, lng:-4.4140 },
};

// ── Orígenes (tiempo de viaje estimado en minutos) ───────────────────────────
const ORIGENES = {
  'benalmadena':20, 'torremolinos':18, 'fuengirola':35, 'mijas':40,
  'marbella':55,   'estepona':80,      'nerja':60,      'frigiliana':65,
  'torre del mar':45, 'rincon victoria':25, 'antequera':50, 'ronda':90,
  'granada':110,   'sevilla':210,      'cordoba':160,   'almeria':175,
  'cartama':20,    'alora':35,         'alhaurin':30,   'alhaurin de la torre':20,
  'coin':30,       'olias':15,         'velez malaga':40, 'torrox':50,
  'puerto banus':65, 'san pedro':60,   'algeciras':95,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function addMsg(texto, tipo) {
  const el = document.createElement('div');
  el.className = 'msg ' + tipo;
  el.innerHTML = texto;
  const msgs = document.getElementById('msgs');
  msgs.appendChild(el);
  msgs.scrollTop = 99999;
}

function rankParks() {
  return Object.keys(CAT).sort((a, b) =>
    (window._datosActuales?.[a]?.pct ?? 0.5) - (window._datosActuales?.[b]?.pct ?? 0.5)
  );
}

// ── Respuesta recomendando un parking ─────────────────────────────────────────
function respuestaParking(parkId, label, minutosViaje) {
  const d   = window._datosActuales?.[parkId];
  const c   = CAT[parkId];
  const pctShow    = d ? Math.round(d.pct * 100) : '?';
  const libresShow = d ? d.libres : '?';
  const estadoStr  = d ? estado(d.pct) : '–';
  const color      = d ? colorEstado(d.pct) : '#94a3b8';

  _ctx.ultimoPark    = parkId;
  _ctx.ultimoLabel   = label;
  _ctx.ultimoMinutos = minutosViaje;

  let html = `🅿️ Te recomiendo <b>${c.n}</b> para ir a <b>${label}</b>.<br>`;
  html += `Estado: <span style="color:${color};font-weight:700">${estadoStr}</span> · `;
  html += `${libresShow} plazas libres (${pctShow}% ocupado).<br>`;
  html += `📍 ${c.dir} `;
  html += `<a href="#" onclick="focusPark('${parkId}');return false;" style="color:#3b82f6;font-size:11px">📍 Ver en mapa</a>`;

  if (minutosViaje && d) {
    const pctLleg = predecirHora(parkId, d.pct, minutosViaje / 60);
    const eL = estado(pctLleg), cL = colorEstado(pctLleg);
    html += `<br>🕐 En ${minutosViaje} min, se prevé <span style="color:${cL};font-weight:700">${eL}</span> (${Math.round(pctLleg * 100)}%).`;
    if (pctLleg >= 0.90) {
      const altId = rankParks().find(id => id !== parkId);
      if (altId) {
        const ca = CAT[altId], da = window._datosActuales?.[altId];
        html += `<br>⚠️ Alternativa: <b>${ca.n}</b> · ${da?.libres ?? '?'} libres `;
        html += `<a href="#" onclick="focusPark('${altId}');return false;" style="color:#3b82f6;font-size:11px">📍 Ver</a>`;
        setTimeout(() => focusPark?.(altId), 1800);
      }
    }
  }
  setTimeout(() => focusPark?.(parkId), 200);
  return html;
}

// ── Respuestas de seguimiento ─────────────────────────────────────────────────
function respuestaContextual(t) {
  if (!_ctx.ultimoPark) return null;
  const id = _ctx.ultimoPark, d = window._datosActuales?.[id], c = CAT[id];

  if (/cuantas|cuántas|capacidad|total|huecos|sitios/.test(t))
    return `<b>${c.n}</b> tiene <b>${c.cap} plazas</b> en total.${d ? ` Ahora hay ${d.libres} libres.` : ''}`;

  if (/como esta|cómo está|esta lleno|sigue|ahora|estado/.test(t)) {
    if (!d) return `No tengo datos actuales de <b>${c.n}</b>.`;
    return `<b>${c.n}</b> ahora: <span style="color:${colorEstado(d.pct)};font-weight:700">${estado(d.pct)}</span> · ${d.libres} libres (${Math.round(d.pct * 100)}%).`;
  }

  const hMatch = t.match(/en (\d+) hora|(\d+)\s*h\b|a las (\d+)/);
  if (hMatch && d) {
    const h = parseInt(hMatch[1] || hMatch[2] || hMatch[3]) || 1;
    const horas = hMatch[3] ? Math.max(0, parseInt(hMatch[3]) - new Date().getHours()) : h;
    if (horas >= 0 && horas <= 12) {
      const p = predecirHora(id, d.pct, horas);
      return `En ${horas}h, <b>${c.n}</b> se prevé <span style="color:${colorEstado(p)};font-weight:700">${estado(p)}</span> (${Math.round(p * 100)}%).`;
    }
  }

  if (/alternativa|otro|mas libre|más libre|diferente|cerca/.test(t)) {
    const alts = rankParks().filter(p => p !== id).slice(0, 2);
    let html = '🅿️ Otras opciones:<br>';
    alts.forEach(pid => {
      const dc = window._datosActuales?.[pid], cc = CAT[pid];
      html += `• <b>${cc.n}</b>: <span style="color:${dc ? colorEstado(dc.pct) : '#94a3b8'};font-weight:700">${dc ? estado(dc.pct) : '–'}</span> · ${dc?.libres ?? '?'} libres `;
      html += `<a href="#" onclick="focusPark('${pid}');return false;" style="color:#3b82f6;font-size:11px">📍 Ver</a><br>`;
    });
    return html;
  }

  if (/donde|dónde|direccion|llego|como llego/.test(t))
    return `<b>${c.n}</b> está en ${c.dir}. <a href="#" onclick="focusPark('${id}');return false;" style="color:#3b82f6">📍 Ver en mapa</a>`;

  if (/precio|tarifa|cuesta|coste|euro/.test(t))
    return `Las tarifas SMASSA están en <a href="https://smassa.eu" target="_blank" style="color:#3b82f6">smassa.eu</a>. Suelen ser 1–2 €/hora.`;

  return null;
}

// ── Motor principal ───────────────────────────────────────────────────────────
function buscarEnTexto(texto) {
  const t = normalizar(texto);

  if (/^(hola|buenas|ey|hey|buenos dias|buenas tardes)/.test(t))
    return '¡Hola! Cuéntame a dónde vas en Málaga 🚗';
  if (/^(gracias|perfecto|genial|ok|bien|vale|guay)/.test(t))
    return '¡De nada! ¡Buen aparcamiento! 🅿️😊';

  const ctxResp = respuestaContextual(t);
  if (ctxResp) return ctxResp;

  if (/cual.*libre|mas libre|mejor parking|donde aparco|donde hay|hay plazas/.test(t)) {
    const mejor = rankParks()[0];
    const d = window._datosActuales?.[mejor], c = CAT[mejor];
    _ctx.ultimoPark = mejor;
    return `El más libre ahora es <b>${c.n}</b>: <span style="color:${d ? colorEstado(d.pct) : '#94a3b8'};font-weight:700">${d ? estado(d.pct) : '–'}</span> · ${d?.libres ?? '?'} libres. <a href="#" onclick="focusPark('${mejor}');return false;" style="color:#3b82f6;font-size:11px">📍 Ver</a>`;
  }

  // Detectar origen (tiempo de viaje)
  let minutosViaje = null;
  for (const [origen, mins] of Object.entries(ORIGENES)) {
    if (t.includes(origen)) { minutosViaje = mins; break; }
  }

  // Buscar destino por coincidencia más larga
  const palabras = t.split(/\s+/);
  for (let len = palabras.length; len >= 1; len--) {
    for (let start = 0; start <= palabras.length - len; start++) {
      const clave = palabras.slice(start, start + len).join(' ');
      if (DESTINOS[clave]) {
        const { label, lat, lng } = DESTINOS[clave];
        // Parking más cercano a las coordenadas del destino
        const parkId = parkingOptimo(lat, lng);
        return respuestaParking(parkId, label, minutosViaje);
      }
    }
  }

  // Detectar nombre directo de parking
  for (const [id, c] of Object.entries(CAT)) {
    if (t.includes(normalizar(c.n))) return respuestaParking(id, c.n, minutosViaje);
  }

  if (_ctx.ultimoPark) {
    const c = CAT[_ctx.ultimoPark];
    return `No entendí bien. ¿Quieres saber algo más sobre <b>${c.n}</b>? Prueba: "¿cuántas plazas tiene?", "¿cómo está ahora?", "¿y en 2 horas?", "¿hay alternativas?"`;
  }
  return `No he encontrado ese destino. Prueba con: <em>Catedral, Molinillo, El Palo, Carlos Haya, Estación de tren, Alcazaba…</em>`;
}

function enviar() {
  const inp = document.getElementById('chat-in');
  const txt = inp.value.trim();
  if (!txt) return;
  inp.value = '';
  addMsg(txt, 'user');
  setTimeout(() => addMsg(buscarEnTexto(txt), 'bot'), 220);
}
