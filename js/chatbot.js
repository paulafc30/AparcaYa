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
const _ctx = {
  ultimoPark:        null,
  ultimoLabel:       null,
  ultimoMinutos:     null,
  esperandoOrigen:   false,
  esperandoUbicacion: false,
  ultimoDestLat:     null,
  ultimoDestLng:     null,
  ultimoDestLabel:   null,
};

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
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // elimina diacríticos (rango Unicode explícito)
    .replace(/[¿¡?!.,;:]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// ── Ranking por distancia al destino ─────────────────────────────────────────
/**
 * Devuelve todos los IDs de parking ordenados por distancia real (km) al punto dado.
 * Coordenadas estáticas de catalogo.js — no cambian con el CSV del Ayuntamiento.
 * 1°lat ≈ 111 km · 1°lng ≈ 88.8 km a lat 36.7° N.
 */
function rankByDistance(lat, lng) {
  return Object.keys(CAT)
    .map(id => ({
      id,
      dist: Math.hypot((CAT[id].lat - lat) * 111, (CAT[id].lng - lng) * 88.8),
    }))
    .sort((a, b) => a.dist - b.dist)
    .map(x => x.id);
}

/**
 * Devuelve el parking MÁS CERCANO al destino — pura distancia, sin filtro de ocupación.
 * La comprobación de disponibilidad se hace después en respuestaParking().
 */
function parkingOptimo(lat, lng) {
  return rankByDistance(lat, lng)[0] ?? 'CE';
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

  // ── Parkings por nombre (acceso directo) ─────────────────────────────────
  'salitre':                   { label:'Parking Salitre',             lat:36.7137, lng:-4.4263 },
  'parking salitre':           { label:'Parking Salitre',             lat:36.7137, lng:-4.4263 },
  'plaza de la marina':        { label:'Plaza de la Marina',          lat:36.7176, lng:-4.4200 },
  'plaza marina':              { label:'Plaza de la Marina',          lat:36.7176, lng:-4.4200 },
  'marina':                    { label:'Plaza de la Marina',          lat:36.7176, lng:-4.4200 },

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
  const d = window._datosActuales?.[parkId];
  const c = CAT[parkId];

  _ctx.ultimoPark    = parkId;
  _ctx.ultimoLabel   = label;
  _ctx.ultimoMinutos = minutosViaje;

  // Estado actual
  const pctNow     = d?.pct ?? null;
  const libresNow  = d?.libres ?? null;
  const colorNow   = pctNow != null ? colorEstado(pctNow) : '#94a3b8';
  const estadoNow  = pctNow != null ? estado(pctNow) : '–';

  let html = `🅿️ El más cercano a <b>${label}</b>: <b>${c.n}</b>.<br>`;
  html += `Ahora: <span style="color:${colorNow};font-weight:700">${estadoNow}</span>`;
  if (pctNow != null) html += ` · ${libresNow} libres (${Math.round(pctNow * 100)}%)`;
  html += `.<br>📍 ${c.dir} `;
  html += `<a href="#" onclick="focusPark('${parkId}');return false;" style="color:#3b82f6;font-size:11px">Ver en mapa</a>`;

  // Predicción a la llegada — solo del modelo ML (Random Forest vía Supabase)
  let pctLlegada = pctNow;   // base para decidir si sugerir alternativa
  if (minutosViaje && d) {
    const mlPred = predecirHora(parkId, d.pct, minutosViaje / 60);
    if (mlPred !== null) {
      pctLlegada = mlPred;
      const eL = estado(mlPred), cL = colorEstado(mlPred);
      html += `<br>🤖 A la llegada (~${minutosViaje} min): <span style="color:${cL};font-weight:700">${eL}</span> (${Math.round(mlPred * 100)}%).`;
    } else {
      html += `<br><span style="color:#94a3b8;font-size:11px">Predicción de llegada no disponible — modelo ML actualizando</span>`;
    }
  }

  // Si va a estar lleno (o está lleno ahora), buscar el siguiente más cercano disponible
  if (pctLlegada != null && pctLlegada >= 0.90) {
    // Usamos las coordenadas del destino guardadas en _ctx para buscar el 2.º más cercano
    const destLat = _ctx.ultimoDestLat, destLng = _ctx.ultimoDestLng;
    const byDist  = destLat != null ? rankByDistance(destLat, destLng) : rankParks();
    const altId   = byDist.find(id => {
      if (id === parkId) return false;
      const da = window._datosActuales?.[id];
      if (!da) return true;  // sin datos → podría tener plazas
      const pctAlt = minutosViaje ? predecirHora(id, da.pct, minutosViaje / 60) : da.pct;
      return pctAlt < 0.90;
    });
    if (altId) {
      const ca = CAT[altId], da = window._datosActuales?.[altId];
      html += `<br>⚠️ Se prevé lleno. Siguiente más cercano con plaza: <b>${ca.n}</b> · ${da?.libres ?? '?'} libres `;
      html += `<a href="#" onclick="focusPark('${altId}');return false;" style="color:#3b82f6;font-size:11px">Ver</a>`;
      setTimeout(() => focusPark?.(altId), 1800);
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
      // predecirHora devuelve null si el modelo ML no tiene datos aún
      if (p === null) {
        return `No tengo predicción disponible para <b>${c.n}</b> en ${horas}h — modelo ML actualizando. 🤖`;
      }
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

  // ¿El usuario responde con su ubicación actual tras pedírsela?
  if (_ctx.esperandoUbicacion) {
    _ctx.esperandoUbicacion = false;
    const palabrasU = t.split(/\s+/);
    for (let len = palabrasU.length; len >= 1; len--) {
      for (let start = 0; start <= palabrasU.length - len; start++) {
        const clave = palabrasU.slice(start, start + len).join(' ');
        if (DESTINOS[clave]) {
          const { label, lat, lng } = DESTINOS[clave];
          _ctx.ultimoDestLat = lat; _ctx.ultimoDestLng = lng; _ctx.ultimoDestLabel = label;
          return respuestaParking(parkingOptimo(lat, lng), label, null);
        }
      }
    }
    return `No reconozco esa ubicación. Prueba con: <em>Centro, Catedral, El Palo, FYCMA, Estación de tren…</em>`;
  }

  // "¿cuál es el más cercano?" sin destino → pedir ubicación
  if (/mas cercano|parking cercano|cual.*cerca|cerca de mi|donde aparco|aparcar cerca/.test(t)) {
    _ctx.esperandoUbicacion = true;
    return '¿Dónde estás ahora? Dime tu ubicación y te digo el parking más cercano con plazas disponibles. 📍';
  }

  if (/cual.*libre|mas libre|mejor parking|donde hay|hay plazas/.test(t)) {
    const mejor = rankParks()[0];
    const d = window._datosActuales?.[mejor], c = CAT[mejor];
    _ctx.ultimoPark = mejor;
    return `El más libre ahora es <b>${c.n}</b>: <span style="color:${d ? colorEstado(d.pct) : '#94a3b8'};font-weight:700">${d ? estado(d.pct) : '–'}</span> · ${d?.libres ?? '?'} libres. <a href="#" onclick="focusPark('${mejor}');return false;" style="color:#3b82f6;font-size:11px">📍 Ver</a>`;
  }

  // Detectar origen (tiempo de viaje desde otra ciudad)
  let minutosViaje = null;
  for (const [origen, mins] of Object.entries(ORIGENES)) {
    if (t.includes(origen)) { minutosViaje = mins; break; }
  }

  // ¿El usuario está respondiendo a nuestra pregunta de origen?
  if (_ctx.esperandoOrigen && _ctx.ultimoDestLat != null) {
    _ctx.esperandoOrigen = false;
    // Ver si da un origen reconocido
    for (const [origen, mins] of Object.entries(ORIGENES)) {
      if (t.includes(origen)) {
        minutosViaje = mins;
        const parkId = parkingOptimo(_ctx.ultimoDestLat, _ctx.ultimoDestLng);
        return respuestaParking(parkId, _ctx.ultimoDestLabel, minutosViaje);
      }
    }
    // No reconocemos el origen — responde sin tiempo de viaje
    const parkId = parkingOptimo(_ctx.ultimoDestLat, _ctx.ultimoDestLng);
    return respuestaParking(parkId, _ctx.ultimoDestLabel, null);
  }

  // Buscar destino por coincidencia más larga
  const palabras = t.split(/\s+/);
  for (let len = palabras.length; len >= 1; len--) {
    for (let start = 0; start <= palabras.length - len; start++) {
      const clave = palabras.slice(start, start + len).join(' ');
      if (DESTINOS[clave]) {
        const { label, lat, lng } = DESTINOS[clave];
        const parkId = parkingOptimo(lat, lng);

        if (minutosViaje !== null) {
          // Ya tiene origen → respuesta completa
          return respuestaParking(parkId, label, minutosViaje);
        } else {
          // Sin origen → recomienda el más cercano Y pregunta de dónde viene
          _ctx.esperandoOrigen = true;
          _ctx.ultimoDestLat   = lat;
          _ctx.ultimoDestLng   = lng;
          _ctx.ultimoDestLabel = label;
          const resp = respuestaParking(parkId, label, null);
          return resp + `<br><span style="color:#64748b;font-size:11px">¿Desde dónde vienes? Puedo ajustar la recomendación según tu tiempo de llegada.</span>`;
        }
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
  return `No he encontrado ese destino. Prueba con: <em>Catedral, FYCMA, Carlos Haya, Estación de tren, Alcazaba, Molinillo…</em>`;
}

function enviar() {
  const inp = document.getElementById('chat-in');
  const txt = inp.value.trim();
  if (!txt) return;
  inp.value = '';
  addMsg(txt, 'user');
  setTimeout(() => addMsg(buscarEnTexto(txt), 'bot'), 220);
}
