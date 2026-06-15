/**
 * chatbot.js
 * Asistente conversacional de AparcaYa.
 * Sistema basado en reglas: keywords → parking más cercano o más adecuado.
 */

// ── Destinos de Málaga → parking recomendado ─────────────────────────────────
// Formato: 'keyword lowercase': { park: 'ID', label: 'Nombre visible', minutos?: N }
const DESTINOS = {
  // ── Centro histórico ──────────────────────────────────────────────────────
  'catedral':           { park:'AL', label:'Catedral de Málaga' },
  'catedral málaga':    { park:'AL', label:'Catedral de Málaga' },
  'alcazaba':           { park:'AL', label:'Alcazaba' },
  'teatro romano':      { park:'AL', label:'Teatro Romano' },
  'gibralfaro':         { park:'AL', label:'Castillo de Gibralfaro' },
  'castillo':           { park:'AL', label:'Castillo de Gibralfaro' },
  'picasso':            { park:'AL', label:'Museo Picasso' },
  'museo picasso':      { park:'AL', label:'Museo Picasso' },
  'fundacion picasso':  { park:'AL', label:'Fundación Picasso – Casa Natal' },
  'casa natal':         { park:'AL', label:'Casa Natal de Picasso' },
  'calle larios':       { park:'CE', label:'Calle Larios' },
  'larios':             { park:'CE', label:'Calle Larios' },
  'mercado central':    { park:'CE', label:'Mercado Central de Atarazanas' },
  'atarazanas':         { park:'CE', label:'Mercado de Atarazanas' },
  'ayuntamiento':       { park:'MA', label:'Ayuntamiento de Málaga' },
  'plaza de la constitución': { park:'CE', label:'Plaza de la Constitución' },
  'plaza constitución': { park:'CE', label:'Plaza de la Constitución' },
  'plaza mayor':        { park:'CE', label:'Centro histórico' },
  'centro':             { park:'CE', label:'Centro de Málaga' },
  'centro histórico':   { park:'CE', label:'Centro histórico' },
  'soho':               { park:'CA', label:'Barrio SoHo' },
  'barrio soho':        { park:'CA', label:'Barrio SoHo' },
  'cac':                { park:'CA', label:'CAC Málaga' },
  'museo arte contemporáneo': { park:'CA', label:'CAC Málaga' },
  'cac málaga':         { park:'CA', label:'CAC Málaga' },
  'muelle heredia':     { park:'MA', label:'Muelle Heredia' },
  'muelle uno':         { park:'MA', label:'Muelle Uno' },
  'puerto':             { park:'MA', label:'Puerto de Málaga' },
  'palmeral del puerto':{ park:'MA', label:'Palmeral del Puerto' },
  'pompidou':           { park:'MA', label:'Centre Pompidou Málaga' },
  'centre pompidou':    { park:'MA', label:'Centre Pompidou Málaga' },
  'museo automovilístico': { park:'SJ', label:'Museo Automovilístico' },
  'museo automovilismo': { park:'SJ', label:'Museo Automovilístico' },
  'museo colecciones reales': { park:'AL', label:'Museo de Colecciones Reales' },
  'museo carmen thyssen': { park:'TE', label:'Museo Carmen Thyssen' },
  'thyssen':            { park:'TE', label:'Museo Carmen Thyssen' },
  'museo vidrio':       { park:'AL', label:'Museo Vidrio y Cristal' },
  'casa del consulado': { park:'AL', label:'Casa del Consulado' },
  'palacio episcopal':  { park:'AL', label:'Palacio Episcopal' },

  // ── Playas y paseo marítimo ───────────────────────────────────────────────
  'playa la malagueta': { park:'MA', label:'Playa La Malagueta' },
  'malagueta':          { park:'MA', label:'Playa La Malagueta' },
  'paseo marítimo':     { park:'MA', label:'Paseo Marítimo' },
  'playa el palo':      { park:'PB', label:'Playa El Palo' },
  'el palo':            { park:'PB', label:'El Palo' },
  'palo':               { park:'PB', label:'El Palo' },
  'pedregalejo':        { park:'PB', label:'Pedregalejo' },
  'playa pedregalejo':  { park:'PB', label:'Playa de Pedregalejo' },
  'baños del carmen':   { park:'PB', label:'Baños del Carmen' },
  'playa misericordia': { park:'AN', label:'Playa de la Misericordia' },
  'misericordia':       { park:'AN', label:'Playa de la Misericordia' },
  'playa guadalmar':    { park:'AN', label:'Playa de Guadalmar' },
  'guadalmar':          { park:'AN', label:'Guadalmar' },

  // ── Hospitales y salud ────────────────────────────────────────────────────
  'hospital carlos haya':  { park:'CY', label:'Hospital Universitario Virgen de la Victoria (Carlos Haya)' },
  'carlos haya':           { park:'CY', label:'Hospital Carlos Haya' },
  'hospital virgen victoria': { park:'CY', label:'Hospital Virgen de la Victoria' },
  'virgen victoria':       { park:'CY', label:'Hospital Virgen de la Victoria' },
  'hospital regional':     { park:'CY', label:'Hospital Regional de Málaga' },
  'hospital civil':        { park:'CY', label:'Hospital Civil' },
  'hospital materno':      { park:'CY', label:'Hospital Materno Infantil' },
  'materno':               { park:'CY', label:'Hospital Materno Infantil' },
  'clínica santa elena':   { park:'CE', label:'Clínica Santa Elena' },
  'clinica santa elena':   { park:'CE', label:'Clínica Santa Elena' },
  'clínica':               { park:'CY', label:'Zona hospitalaria' },
  'hospital':              { park:'CY', label:'Zona hospitalaria' },
  'urgencias':             { park:'CY', label:'Zona hospitalaria – Urgencias' },

  // ── Universidad y educación ───────────────────────────────────────────────
  'universidad málaga':    { park:'SJ', label:'Universidad de Málaga' },
  'uma':                   { park:'SJ', label:'Universidad de Málaga' },
  'universidad':           { park:'SJ', label:'Universidad de Málaga' },
  'campus teatinos':       { park:'SJ', label:'Campus de Teatinos – UMA' },
  'teatinos':              { park:'SJ', label:'Campus de Teatinos' },
  'facultad derecho':      { park:'SJ', label:'Facultad de Derecho – UMA' },
  'facultad económicas':   { park:'SJ', label:'Facultad de Económicas – UMA' },
  'ingeniería informática':{ park:'SJ', label:'E.T.S. Ingeniería Informática' },
  'etsii':                 { park:'SJ', label:'ETSII – UMA' },
  'politécnica':           { park:'SJ', label:'Escuela Politécnica Superior' },
  'instituto':             { park:'CE', label:'Instituto / Centro educativo' },
  'colegio':               { park:'CE', label:'Centro educativo' },

  // ── Centros comerciales y compras ─────────────────────────────────────────
  'el corte inglés':       { park:'AN', label:'El Corte Inglés – Av. de Andalucía' },
  'corte inglés':          { park:'AN', label:'El Corte Inglés' },
  'el corte inglés caleta':{ park:'CE', label:'El Corte Inglés – La Caleta' },
  'vialia':                { park:'SJ', label:'Centro Comercial Vialia' },
  'centro comercial vialia':{ park:'SJ', label:'Vialia' },
  'rosaleda':              { park:'SJ', label:'C.C. La Rosaleda' },
  'la rosaleda':           { park:'SJ', label:'C.C. La Rosaleda' },
  'plaza mayor':           { park:'AN', label:'C.C. Plaza Mayor' },
  'plaza mayor mall':      { park:'AN', label:'C.C. Plaza Mayor' },
  'nervión':               { park:'AN', label:'Zona Nervión' },
  'mercadona':             { park:'CE', label:'Supermercado' },
  'supermercado':          { park:'CE', label:'Supermercado' },
  'carrefour':             { park:'AN', label:'Carrefour' },
  'lidl':                  { park:'CA', label:'Lidl' },
  'mercado el palo':       { park:'PB', label:'Mercado Municipal El Palo' },

  // ── Estaciones de transporte ──────────────────────────────────────────────
  'estación tren':         { park:'SJ', label:'Estación de Tren María Zambrano' },
  'maria zambrano':        { park:'SJ', label:'Estación María Zambrano' },
  'renfe':                 { park:'SJ', label:'Estación Renfe – María Zambrano' },
  'estación autobuses':    { park:'SJ', label:'Estación de Autobuses' },
  'bus estación':          { park:'SJ', label:'Estación de Autobuses' },
  'aeropuerto':            { park:'AN', label:'Aeropuerto de Málaga-Costa del Sol' },
  'aeropuerto málaga':     { park:'AN', label:'Aeropuerto de Málaga' },
  'metro':                 { park:'SJ', label:'Zona metro Guadalmedina' },
  'metro málaga':          { park:'SJ', label:'Metro de Málaga' },
  'alameda':               { park:'CA', label:'Alameda Principal' },
  'alameda principal':     { park:'CA', label:'Alameda Principal' },

  // ── Ocio, cultura y gastronomía ───────────────────────────────────────────
  'teatro cervantes':      { park:'CE', label:'Teatro Cervantes' },
  'cine':                  { park:'CE', label:'Cines Málaga' },
  'cines':                 { park:'CE', label:'Cines Málaga' },
  'autocine':              { park:'AN', label:'Autocine / Zona oeste' },
  'sala gold':             { park:'CE', label:'Sala Gold' },
  'teatro echegaray':      { park:'CE', label:'Teatro Echegaray' },
  'auditorium':            { park:'MA', label:'Auditorio Municipal' },
  'auditorio':             { park:'MA', label:'Auditorio Municipal' },
  'bodega el pimpi':       { park:'AL', label:'El Pimpi' },
  'el pimpi':              { park:'AL', label:'El Pimpi' },
  'antigua casa guardia':  { park:'MA', label:'Antigua Casa Guardia' },
  'restaurante':           { park:'CE', label:'Zona de restaurantes' },
  'calle granada':         { park:'AL', label:'Calle Granada' },
  'calle marqués de larios':{ park:'CE', label:'Marqués de Larios' },
  'parque de málaga':      { park:'MA', label:'Parque de Málaga' },
  'parque':                { park:'MA', label:'Parque de Málaga' },
  'feria málaga':          { park:'AN', label:'Recinto Ferial de Málaga' },
  'recinto ferial':        { park:'AN', label:'Recinto Ferial' },
  'palacio deportes':      { park:'SJ', label:'Palacio de los Deportes José María Martín Carpena' },
  'carpena':               { park:'SJ', label:'Palacio de los Deportes Martín Carpena' },
  'estadio la rosaleda':   { park:'CE', label:'Estadio La Rosaleda' },
  'la rosaleda estadio':   { park:'CE', label:'Estadio La Rosaleda' },
  'rosaleda estadio':      { park:'CE', label:'Estadio La Rosaleda' },
  'málaga cf':             { park:'CE', label:'Estadio La Rosaleda – Málaga CF' },
  'museo interactivo música': { park:'AL', label:'MIM – Museo Interactivo de la Música' },
  'mim':                   { park:'AL', label:'MIM – Museo Interactivo de la Música' },
  'museo ruso':            { park:'AL', label:'Museo Ruso de Málaga' },

  // ── Hoteles ───────────────────────────────────────────────────────────────
  'hotel ac málaga':       { park:'MA', label:'Hotel AC Málaga Palacio' },
  'hotel molina lario':    { park:'AL', label:'Hotel Molina Lario' },
  'hotel vincci':          { park:'MA', label:'Hotel Vincci Málaga' },
  'parador málaga':        { park:'MA', label:'Parador de Málaga Gibralfaro' },
  'hotel room mate':       { park:'CE', label:'Hotel Room Mate Valeria' },
  'hotel don curro':       { park:'CE', label:'Hotel Don Curro' },
  'hotel ilunion':         { park:'MA', label:'Hotel Ilunion Málaga' },
  'hotel sh miramar':      { park:'MA', label:'Hotel SH Miramar' },
  'ihg málaga':            { park:'MA', label:'Hotel IHG Málaga' },
  'hotel':                 { park:'MA', label:'Hotel en Málaga' },

  // ── Barrios ───────────────────────────────────────────────────────────────
  'la caleta':             { park:'CE', label:'La Caleta' },
  'caleta':                { park:'CE', label:'La Caleta' },
  'carretera de cádiz':    { park:'AN', label:'Carretera de Cádiz' },
  'este málaga':           { park:'PB', label:'Zona Este de Málaga' },
  'zona este':             { park:'PB', label:'Zona Este de Málaga' },
  'churriana':             { park:'AN', label:'Churriana' },
  'campanillas':           { park:'AN', label:'Campanillas' },
  'palma palmilla':        { park:'SJ', label:'Palma-Palmilla' },
  'palmilla':              { park:'SJ', label:'Palmilla' },
  'perchel':               { park:'CA', label:'El Perchel' },
  'trinidad':              { park:'CA', label:'La Trinidad' },
  'lagunillas':            { park:'CE', label:'Lagunillas' },
  'victoria':              { park:'CE', label:'El Molinillo – La Victoria' },
  'molinillo':             { park:'CE', label:'El Molinillo' },
  'capuchinos':            { park:'CE', label:'Capuchinos' },
  'gibralfaro barrio':     { park:'AL', label:'Barrio de Gibralfaro' },
  'churriana zona':        { park:'AN', label:'Churriana' },

  // ── Servicios públicos ────────────────────────────────────────────────────
  'correos':               { park:'CE', label:'Correos' },
  'junta de andalucía':    { park:'CE', label:'Junta de Andalucía' },
  'delegación gobierno':   { park:'CE', label:'Delegación del Gobierno' },
  'registro civil':        { park:'CE', label:'Registro Civil de Málaga' },
  'juzgados':              { park:'CE', label:'Juzgados de Málaga' },
  'diputación':            { park:'CE', label:'Diputación Provincial de Málaga' },
  'museo municipal':       { park:'CE', label:'Museo Municipal de Málaga' },
  'biblioteca pública':    { park:'CE', label:'Biblioteca Pública Provincial' },
  'biblioteca':            { park:'CE', label:'Biblioteca' },
  'palacio congresos':     { park:'AN', label:'Palacio de Congresos y Exposiciones' },
  'fycma':                 { park:'AN', label:'FYCMA – Palacio de Ferias' },
  'palacio ferias':        { park:'AN', label:'Palacio de Ferias y Congresos' },
  'consolación':           { park:'CE', label:'C.E.I.P. La Consolación' },
  'conservatorio':         { park:'CE', label:'Conservatorio de Málaga' },
};

// ── Orígenes (tiempo de viaje estimado en minutos) ───────────────────────────
const ORIGENES = {
  'benalmádena':   20, 'benalmadena':  20,
  'torremolinos':  18, 'torremolinos': 18,
  'fuengirola':    35, 'mijas':        40,
  'marbella':      55, 'estepona':     80,
  'nerja':         60, 'frigiliana':   65,
  'torre del mar': 45, 'torre del mar málaga': 45,
  'rincón victoria': 25, 'rincon victoria': 25,
  'antequera':     50, 'ronda':        90,
  'granada':      110, 'sevilla':     210,
  'córdoba':      160, 'almería':     175,
  'cártama':       20, 'álora':        35,
  'alhaurín':      30, 'alhaurín el grande': 35,
  'alhaurín de la torre': 20,
  'coín':          30, 'monda':        35,
  'olías':         15, 'totalán':      20,
  'moclinejo':     20, 'almogía':      30,
  'colmenar':      35, 'casabermeja':  30,
  'vélez málaga':  40, 'torre del mar':45,
  'el borge':      40, 'benamocarra':  40,
  'torrox':        50, 'torrox costa': 50,
  'cómpeta':       65,
  'marbella':      55, 'nueva andalucía': 60,
  'puerto banús':  65, 'san pedro':    60,
  'la línea':     105, 'algeciras':    95,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function addMsg(texto, tipo) {
  const el = document.createElement('div');
  el.className = 'msg ' + tipo;
  el.innerHTML = texto;
  document.getElementById('msgs').appendChild(el);
  document.getElementById('msgs').scrollTop = 99999;
}

function rankParks() {
  // Devuelve IDs de parkings ordenados: primero los más libres
  const estado_actual = window._datosActuales || {};
  return Object.keys(CAT).sort((a, b) => {
    const pa = estado_actual[a]?.pct ?? 0.5;
    const pb = estado_actual[b]?.pct ?? 0.5;
    return pa - pb;
  });
}

function respuestaParking(parkId, label, minutosViaje) {
  const datos  = window._datosActuales || {};
  const d      = datos[parkId];
  const c      = CAT[parkId];
  const pctShow = d ? Math.round(d.pct * 100) : '?';
  const libresShow = d ? d.libres : '?';
  const estadoStr  = d ? estado(d.pct) : 'DESCONOCIDO';
  const color      = d ? colorEstado(d.pct) : '#94a3b8';

  let pctLlegada = null;
  if (minutosViaje && d) {
    pctLlegada = predecirHora(parkId, d.pct, minutosViaje / 60);
  }

  let html = `🅿️ Te recomiendo <b>${c.n}</b> para ir a <b>${label}</b>.<br>`;
  html += `Estado actual: <span style="color:${color};font-weight:700">${estadoStr}</span> · ${libresShow} plazas libres (${pctShow}% ocupado).<br>`;
  html += `📍 ${c.dir} `;
  html += `<a href="#" onclick="focusPark('${parkId}');return false;"
    style="color:#3b82f6;font-size:11px;white-space:nowrap">📍 Ver en mapa</a>`;

  if (pctLlegada !== null) {
    const eL = estado(pctLlegada);
    const cL = colorEstado(pctLlegada);
    html += `<br>🕐 En ${minutosViaje} min de viaje, se prevé <span style="color:${cL};font-weight:700">${eL}</span> (${Math.round(pctLlegada * 100)}%).`;
    if (pctLlegada >= 0.85) {
      // Sugerir alternativa y mostrarla en el mapa también
      const altId = rankParks().find(id => id !== parkId);
      if (altId) {
        const ca = CAT[altId];
        const da = (window._datosActuales || {})[altId];
        const pctA = da ? Math.round(da.pct * 100) : '?';
        const libresA = da ? da.libres : '?';
        html += `<br>⚠️ Alternativa: <b>${ca.n}</b> · ${libresA} libres (${pctA}%) `;
        html += `<a href="#" onclick="focusPark('${altId}');return false;"
          style="color:#3b82f6;font-size:11px;white-space:nowrap">📍 Ver en mapa</a>`;
        // Mostrar alternativa en mapa tras un pequeño delay
        setTimeout(() => {
          if (typeof focusPark === 'function') focusPark(altId);
        }, 1800);
      }
    }
  }

  // Resaltar parking recomendado en el mapa
  if (typeof focusPark === 'function') setTimeout(() => focusPark(parkId), 200);

  return html;
}

// ── Motor de respuesta ────────────────────────────────────────────────────────
function buscarEnTexto(texto) {
  const t = texto.toLowerCase().trim();

  // 1. ¿Hay un origen ("desde X al/a Y")?
  let minutosViaje = null;
  for (const [origen, mins] of Object.entries(ORIGENES)) {
    if (t.includes(origen)) {
      minutosViaje = mins;
      break;
    }
  }

  // 2. ¿Hay un destino conocido?
  // Primero prueba la cadena completa, luego substrings de longitud decreciente
  const palabras = t.replace(/[¿¡?!]/g, '').split(/\s+/);
  for (let len = palabras.length; len >= 1; len--) {
    for (let start = 0; start <= palabras.length - len; start++) {
      const clave = palabras.slice(start, start + len).join(' ');
      if (DESTINOS[clave]) {
        const { park, label } = DESTINOS[clave];
        return respuestaParking(park, label, minutosViaje);
      }
    }
  }

  // 3. Palabras clave generales
  if (/parking|aparca|plaza libre|plazas/.test(t)) {
    const mejor = rankParks()[0];
    return respuestaParking(mejor, 'tu destino', minutosViaje);
  }
  if (/cual|cuál|libre|disponible|hay/.test(t)) {
    const mejor = rankParks()[0];
    const c = CAT[mejor];
    const d = (window._datosActuales || {})[mejor];
    const libresShow = d ? d.libres : '?';
    return `El parking con más plazas libres ahora mismo es <b>${c.n}</b> con ${libresShow} plazas disponibles. ¿Quieres ir allí?`;
  }
  if (/hola|buenas|ey|hey/.test(t)) {
    return '¡Hola! Cuéntame a dónde vas en Málaga y te busco el mejor parking 🚗';
  }
  if (/gracias|perfecto|genial|ok|bien/.test(t)) {
    return '¡De nada! ¡Buen aparcamiento! 🅿️😊';
  }

  // 4. No entendido
  return `No he encontrado ese destino en mi mapa. Prueba con: <em>Catedral, Carlos Haya, El Palo, Estación de tren, Larios, Universidad…</em>`;
}

function enviar() {
  const inp = document.getElementById('chat-in');
  const txt = inp.value.trim();
  if (!txt) return;
  inp.value = '';
  addMsg(txt, 'user');
  setTimeout(() => addMsg(buscarEnTexto(txt), 'bot'), 220);
}
