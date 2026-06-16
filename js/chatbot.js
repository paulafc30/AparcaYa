/**
 * chatbot.js
 * ===========
 * Asistente conversacional de AparcaYa.
 *
 * Mejoras respecto a la versión anterior:
 *   - Memoria de contexto: recuerda el último parking recomendado, el destino
 *     y el tiempo de viaje para responder preguntas de seguimiento.
 *   - Preguntas de seguimiento: "¿cuántas plazas tiene?", "¿está muy lleno?",
 *     "¿y en 2 horas?", "¿hay alternativas?", "el que me dijiste"...
 *   - Normalización de texto: quita acentos, puntuación y espacios extra
 *     para tolerar errores de escritura.
 *   - Preguntas generales: "¿cuál está más libre?", "¿hay parking cerca de X?",
 *     "¿cuánto tarda en llenarse?"
 *   - Panel flotante: la función toggleChat() abre/cierra el panel.
 *
 * Depende de: catalogo.js (CAT, TIPO, PATRONES), prediccion.js, mapa.js
 */

// ── Contexto de conversación ──────────────────────────────────────────────────
// Guarda información del turno anterior para responder preguntas de seguimiento.
const _ctx = {
  ultimoPark:    null,   // ID del último parking recomendado (ej: 'CE')
  ultimoLabel:   null,   // Nombre del destino (ej: 'Catedral de Málaga')
  ultimoMinutos: null,   // Tiempo de viaje si el usuario vino de fuera
};

// ── Toggle del panel flotante ─────────────────────────────────────────────────
function toggleChat() {
  const panel = document.getElementById('chat-panel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) {
    setTimeout(() => document.getElementById('chat-in')?.focus(), 200);
  }
}

// ── Normalización de texto ────────────────────────────────────────────────────
/**
 * Convierte el texto a minúsculas, elimina acentos y puntuación extra.
 * Así "¿Dónde está la Cátedral?" y "donde esta la catedral" dan el mismo resultado.
 */
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/[¿¡?!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Destinos de Málaga → parking recomendado ─────────────────────────────────
// Claves ya en minúsculas sin acentos (normalizadas) para que la búsqueda funcione.
const DESTINOS = {
  // ── Centro histórico ──────────────────────────────────────────────────────
  'catedral':                   { park:'AL', label:'Catedral de Málaga' },
  'catedral malaga':            { park:'AL', label:'Catedral de Málaga' },
  'alcazaba':                   { park:'AL', label:'Alcazaba' },
  'teatro romano':              { park:'AL', label:'Teatro Romano' },
  'gibralfaro':                 { park:'AL', label:'Castillo de Gibralfaro' },
  'castillo':                   { park:'AL', label:'Castillo de Gibralfaro' },
  'picasso':                    { park:'AL', label:'Museo Picasso' },
  'museo picasso':              { park:'AL', label:'Museo Picasso' },
  'fundacion picasso':          { park:'AL', label:'Fundación Picasso – Casa Natal' },
  'casa natal':                 { park:'AL', label:'Casa Natal de Picasso' },
  'calle larios':               { park:'CE', label:'Calle Larios' },
  'larios':                     { park:'CE', label:'Calle Larios' },
  'mercado central':            { park:'CE', label:'Mercado Central de Atarazanas' },
  'atarazanas':                 { park:'CE', label:'Mercado de Atarazanas' },
  'ayuntamiento':               { park:'MA', label:'Ayuntamiento de Málaga' },
  'plaza de la constitucion':   { park:'CE', label:'Plaza de la Constitución' },
  'plaza constitucion':         { park:'CE', label:'Plaza de la Constitución' },
  'centro':                     { park:'CE', label:'Centro de Málaga' },
  'centro historico':           { park:'CE', label:'Centro histórico' },
  'soho':                       { park:'CA', label:'Barrio SoHo' },
  'barrio soho':                { park:'CA', label:'Barrio SoHo' },
  'cac':                        { park:'CA', label:'CAC Málaga' },
  'museo arte contemporaneo':   { park:'CA', label:'CAC Málaga' },
  'cac malaga':                 { park:'CA', label:'CAC Málaga' },
  'muelle heredia':             { park:'MA', label:'Muelle Heredia' },
  'muelle uno':                 { park:'MA', label:'Muelle Uno' },
  'puerto':                     { park:'MA', label:'Puerto de Málaga' },
  'palmeral del puerto':        { park:'MA', label:'Palmeral del Puerto' },
  'pompidou':                   { park:'MA', label:'Centre Pompidou Málaga' },
  'centre pompidou':            { park:'MA', label:'Centre Pompidou Málaga' },
  'museo automovilistico':      { park:'SJ', label:'Museo Automovilístico' },
  'museo carmen thyssen':       { park:'TE', label:'Museo Carmen Thyssen' },
  'thyssen':                    { park:'TE', label:'Museo Carmen Thyssen' },
  'museo vidrio':               { park:'AL', label:'Museo Vidrio y Cristal' },
  'palacio episcopal':          { park:'AL', label:'Palacio Episcopal' },
  'mim':                        { park:'AL', label:'MIM – Museo Interactivo de la Música' },
  'museo interactivo musica':   { park:'AL', label:'MIM – Museo Interactivo de la Música' },
  'museo ruso':                 { park:'AL', label:'Museo Ruso de Málaga' },

  // ── Playas ───────────────────────────────────────────────────────────────
  'playa la malagueta':         { park:'MA', label:'Playa La Malagueta' },
  'malagueta':                  { park:'MA', label:'Playa La Malagueta' },
  'paseo maritimo':             { park:'MA', label:'Paseo Marítimo' },
  'playa el palo':              { park:'PB', label:'Playa El Palo' },
  'el palo':                    { park:'PB', label:'El Palo' },
  'palo':                       { park:'PB', label:'El Palo' },
  'pedregalejo':                { park:'PB', label:'Pedregalejo' },
  'banos del carmen':           { park:'PB', label:'Baños del Carmen' },
  'playa misericordia':         { park:'AN', label:'Playa de la Misericordia' },
  'misericordia':               { park:'AN', label:'Playa de la Misericordia' },
  'guadalmar':                  { park:'AN', label:'Playa de Guadalmar' },
  'playa':                      { park:'MA', label:'la playa más cercana al centro' },

  // ── Hospitales ───────────────────────────────────────────────────────────
  'hospital carlos haya':       { park:'CY', label:'Hospital Universitario Virgen de la Victoria' },
  'carlos haya':                { park:'CY', label:'Hospital Carlos Haya' },
  'virgen victoria':            { park:'CY', label:'Hospital Virgen de la Victoria' },
  'hospital regional':          { park:'CY', label:'Hospital Regional de Málaga' },
  'hospital civil':             { park:'CY', label:'Hospital Civil' },
  'hospital materno':           { park:'CY', label:'Hospital Materno Infantil' },
  'materno':                    { park:'CY', label:'Hospital Materno Infantil' },
  'hospital':                   { park:'CY', label:'zona hospitalaria' },
  'urgencias':                  { park:'CY', label:'Urgencias' },

  // ── Universidad ───────────────────────────────────────────────────────────
  'universidad malaga':         { park:'SJ', label:'Universidad de Málaga' },
  'uma':                        { park:'SJ', label:'Universidad de Málaga' },
  'universidad':                { park:'SJ', label:'Universidad de Málaga' },
  'campus teatinos':            { park:'SJ', label:'Campus de Teatinos' },
  'teatinos':                   { park:'SJ', label:'Campus de Teatinos' },
  'etsii':                      { park:'SJ', label:'ETSII – UMA' },

  // ── Centros comerciales ───────────────────────────────────────────────────
  'el corte ingles':            { park:'AN', label:'El Corte Inglés – Av. de Andalucía' },
  'corte ingles':               { park:'AN', label:'El Corte Inglés' },
  'vialia':                     { park:'SJ', label:'Centro Comercial Vialia' },
  'la rosaleda':                { park:'SJ', label:'C.C. La Rosaleda' },
  'rosaleda':                   { park:'SJ', label:'C.C. La Rosaleda' },
  'plaza mayor':                { park:'AN', label:'C.C. Plaza Mayor' },
  'carrefour':                  { park:'AN', label:'Carrefour' },
  'lidl':                       { park:'CA', label:'Lidl' },

  // ── Transporte ────────────────────────────────────────────────────────────
  'estacion tren':              { park:'SJ', label:'Estación de Tren María Zambrano' },
  'maria zambrano':             { park:'SJ', label:'Estación María Zambrano' },
  'renfe':                      { park:'SJ', label:'Estación Renfe' },
  'estacion autobuses':         { park:'SJ', label:'Estación de Autobuses' },
  'aeropuerto':                 { park:'AN', label:'Aeropuerto de Málaga-Costa del Sol' },
  'metro':                      { park:'SJ', label:'Metro de Málaga' },
  'alameda principal':          { park:'CA', label:'Alameda Principal' },
  'alameda':                    { park:'CA', label:'Alameda Principal' },

  // ── Ocio y cultura ────────────────────────────────────────────────────────
  'teatro cervantes':           { park:'CE', label:'Teatro Cervantes' },
  'teatro echegaray':           { park:'CE', label:'Teatro Echegaray' },
  'cines':                      { park:'CE', label:'Cines' },
  'cine':                       { park:'CE', label:'Cines' },
  'auditorio':                  { park:'MA', label:'Auditorio Municipal' },
  'el pimpi':                   { park:'AL', label:'El Pimpi' },
  'parque de malaga':           { park:'MA', label:'Parque de Málaga' },
  'parque':                     { park:'MA', label:'Parque de Málaga' },
  'feria malaga':               { park:'AN', label:'Recinto Ferial' },
  'recinto ferial':             { park:'AN', label:'Recinto Ferial' },
  'carpena':                    { park:'SJ', label:'Palacio de los Deportes Martín Carpena' },
  'estadio la rosaleda':        { park:'CE', label:'Estadio La Rosaleda' },
  'malaga cf':                  { park:'CE', label:'Estadio La Rosaleda – Málaga CF' },
  'fycma':                      { park:'AN', label:'FYCMA – Palacio de Ferias' },
  'palacio congresos':          { park:'AN', label:'Palacio de Congresos' },

  // ── Hoteles ───────────────────────────────────────────────────────────────
  'hotel molina lario':         { park:'AL', label:'Hotel Molina Lario' },
  'hotel':                      { park:'MA', label:'hotel en Málaga' },

  // ── Barrios ───────────────────────────────────────────────────────────────
  'la caleta':                  { park:'CE', label:'La Caleta' },
  'carretera de cadiz':         { park:'AN', label:'Carretera de Cádiz' },
  'churriana':                  { park:'AN', label:'Churriana' },
  'perchel':                    { park:'CA', label:'El Perchel' },
  'trinidad':                   { park:'CA', label:'La Trinidad' },
  'lagunillas':                 { park:'CE', label:'Lagunillas' },

  // ── Servicios públicos ────────────────────────────────────────────────────
  'correos':                    { park:'CE', label:'Correos' },
  'juzgados':                   { park:'CE', label:'Juzgados de Málaga' },
  'diputacion':                 { park:'CE', label:'Diputación Provincial' },
  'biblioteca':                 { park:'CE', label:'Biblioteca' },
  'conservatorio':              { park:'CE', label:'Conservatorio de Málaga' },
};

// ── Orígenes (tiempo de viaje estimado en minutos) ───────────────────────────
const ORIGENES = {
  'benalmadena': 20, 'torremolinos': 18, 'fuengirola': 35, 'mijas': 40,
  'marbella': 55, 'estepona': 80, 'nerja': 60, 'frigiliana': 65,
  'torre del mar': 45, 'rincon victoria': 25, 'antequera': 50, 'ronda': 90,
  'granada': 110, 'sevilla': 210, 'cordoba': 160, 'almeria': 175,
  'cartama': 20, 'alora': 35, 'alhaurin': 30, 'alhaurin el grande': 35,
  'alhaurin de la torre': 20, 'coin': 30, 'olias': 15, 'totalán': 20,
  'velez malaga': 40, 'torrox': 50, 'competa': 65, 'puerto banus': 65,
  'san pedro': 60, 'algeciras': 95, 'la linea': 105,
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

/** Parkings ordenados de menor a mayor ocupación */
function rankParks() {
  return Object.keys(CAT).sort((a, b) => {
    const pa = (window._datosActuales?.[a]?.pct) ?? 0.5;
    const pb = (window._datosActuales?.[b]?.pct) ?? 0.5;
    return pa - pb;
  });
}

/** Construye el HTML de respuesta para un parking recomendado */
function respuestaParking(parkId, label, minutosViaje) {
  const d   = window._datosActuales?.[parkId];
  const c   = CAT[parkId];
  const pctShow    = d ? Math.round(d.pct * 100) : '?';
  const libresShow = d ? d.libres : '?';
  const estadoStr  = d ? estado(d.pct) : '–';
  const color      = d ? colorEstado(d.pct) : '#94a3b8';

  // Guardar contexto para preguntas de seguimiento
  _ctx.ultimoPark    = parkId;
  _ctx.ultimoLabel   = label;
  _ctx.ultimoMinutos = minutosViaje;

  let html = `🅿️ Te recomiendo <b>${c.n}</b> para ir a <b>${label}</b>.<br>`;
  html += `Estado: <span style="color:${color};font-weight:700">${estadoStr}</span> · `;
  html += `${libresShow} plazas libres (${pctShow}% ocupado).<br>`;
  html += `📍 ${c.dir} `;
  html += `<a href="#" onclick="focusPark('${parkId}');return false;"
    style="color:#3b82f6;font-size:11px">📍 Ver en mapa</a>`;

  if (minutosViaje && d) {
    const pctLleg = predecirHora(parkId, d.pct, minutosViaje / 60);
    const eL = estado(pctLleg);
    const cL = colorEstado(pctLleg);
    html += `<br>🕐 En ${minutosViaje} min, se prevé <span style="color:${cL};font-weight:700">${eL}</span> (${Math.round(pctLleg * 100)}%).`;

    if (pctLleg >= 0.85) {
      const altId = rankParks().find(id => id !== parkId);
      if (altId) {
        const ca = CAT[altId];
        const da = window._datosActuales?.[altId];
        html += `<br>⚠️ Alternativa: <b>${ca.n}</b> · ${da?.libres ?? '?'} libres `;
        html += `<a href="#" onclick="focusPark('${altId}');return false;"
          style="color:#3b82f6;font-size:11px">📍 Ver en mapa</a>`;
        setTimeout(() => focusPark?.(altId), 1800);
      }
    }
  }

  setTimeout(() => focusPark?.(parkId), 200);
  return html;
}

// ── Respuestas de seguimiento (preguntas sobre el último parking) ─────────────
/**
 * Intenta responder usando el contexto del turno anterior.
 * Retorna HTML si encuentra una respuesta, null si no aplica.
 */
function respuestaContextual(t) {
  if (!_ctx.ultimoPark) return null;

  const id = _ctx.ultimoPark;
  const d  = window._datosActuales?.[id];
  const c  = CAT[id];

  // "¿cuántas plazas tiene?" / "¿cuántos huecos?" / "capacidad"
  if (/cuantas|cuántas|capacidad|total|huecos|sitios/.test(t)) {
    return `<b>${c.n}</b> tiene una capacidad total de <b>${c.cap} plazas</b>.${d ? ` Ahora mismo hay ${d.libres} libres.` : ''}`;
  }

  // "¿cómo está?" / "¿está lleno?" / "estado" / "ahora"
  if (/como esta|cómo está|esta lleno|sigue|ahora|estado|ocupacion/.test(t)) {
    if (!d) return `No tengo datos en tiempo real de <b>${c.n}</b> ahora mismo.`;
    const color = colorEstado(d.pct);
    return `<b>${c.n}</b> ahora mismo: <span style="color:${color};font-weight:700">${estado(d.pct)}</span> · ${d.libres} plazas libres (${Math.round(d.pct*100)}% ocupado).`;
  }

  // "¿y en 2 horas?" / "a las 3" / "en 1 hora"
  const horasMatch = t.match(/en (\d+) hora|(\d+)h|a las (\d+)/);
  if (horasMatch && d) {
    const h = parseInt(horasMatch[1] || horasMatch[2] || horasMatch[3]) || 1;
    const horas = horasMatch[3] ? Math.max(0, parseInt(horasMatch[3]) - new Date().getHours()) : h;
    if (horas >= 0 && horas <= 12) {
      const p = predecirHora(id, d.pct, horas);
      const col = colorEstado(p);
      return `En ${horas > 0 ? horas + 'h' : 'este momento'}, <b>${c.n}</b> se prevé <span style="color:${col};font-weight:700">${estado(p)}</span> (${Math.round(p*100)}% previsto).`;
    }
  }

  // "¿hay alternativas?" / "¿otro parking?" / "¿alguno más libre?"
  if (/alternativa|otro parking|otro|mas libre|más libre|diferente|cerca/.test(t)) {
    const alts = rankParks().filter(p => p !== id).slice(0, 2);
    let html = '🅿️ Otras opciones ahora mismo:<br>';
    alts.forEach(pid => {
      const dc = window._datosActuales?.[pid];
      const cc = CAT[pid];
      const col = dc ? colorEstado(dc.pct) : '#94a3b8';
      html += `• <b>${cc.n}</b>: <span style="color:${col};font-weight:700">${dc ? estado(dc.pct) : '–'}</span> · ${dc?.libres ?? '?'} libres `;
      html += `<a href="#" onclick="focusPark('${pid}');return false;" style="color:#3b82f6;font-size:11px">📍 Ver</a><br>`;
    });
    return html;
  }

  // "¿dónde está?" / "dirección" / "cómo llego"
  if (/donde|dónde|direccion|dirección|llego|ubicacion|como llego/.test(t)) {
    return `<b>${c.n}</b> está en ${c.dir}. <a href="#" onclick="focusPark('${id}');return false;" style="color:#3b82f6">📍 Ver en mapa</a>`;
  }

  // "precio" / "tarifa" / "cuánto cuesta"
  if (/precio|tarifa|cuesta|coste|pagar|euro/.test(t)) {
    return `Las tarifas de los aparcamientos SMASSA están en <a href="https://smassa.eu" target="_blank" style="color:#3b82f6">smassa.eu</a>. Suelen estar entre 1–2€/hora según el parking y horario.`;
  }

  return null; // No aplica el contexto
}

// ── Motor de respuesta principal ──────────────────────────────────────────────
function buscarEnTexto(texto) {
  const t = normalizar(texto);

  // 1. ¿Saludo?
  if (/^(hola|buenas|ey|hey|buenos dias|buenas tardes|que tal)/.test(t)) {
    return '¡Hola! Cuéntame a dónde vas en Málaga y te busco el mejor parking 🚗';
  }

  // 2. ¿Agradecimiento?
  if (/^(gracias|perfecto|genial|ok|bien|vale|guay|de acuerdo)/.test(t)) {
    return '¡De nada! ¡Buen aparcamiento! 🅿️😊';
  }

  // 3. ¿Pregunta de seguimiento sobre el último parking?
  const ctxResp = respuestaContextual(t);
  if (ctxResp) return ctxResp;

  // 4. ¿Pregunta general sobre el mejor parking disponible?
  if (/cual.*libre|mas libre|más libre|mejor parking|donde aparco|donde hay|hay plazas/.test(t)) {
    const mejor = rankParks()[0];
    const d = window._datosActuales?.[mejor];
    const c = CAT[mejor];
    const col = d ? colorEstado(d.pct) : '#94a3b8';
    _ctx.ultimoPark = mejor;
    return `El parking con más plazas libres ahora es <b>${c.n}</b>: <span style="color:${col};font-weight:700">${d ? estado(d.pct) : '–'}</span> · ${d?.libres ?? '?'} libres. <a href="#" onclick="focusPark('${mejor}');return false;" style="color:#3b82f6;font-size:11px">📍 Ver en mapa</a>`;
  }

  // 5. ¿Origen explícito? (desde X al/a Y)
  let minutosViaje = null;
  for (const [origen, mins] of Object.entries(ORIGENES)) {
    if (t.includes(origen)) { minutosViaje = mins; break; }
  }

  // 6. Buscar destino: prueba combinaciones de mayor a menor longitud
  const palabras = t.split(/\s+/);
  for (let len = palabras.length; len >= 1; len--) {
    for (let start = 0; start <= palabras.length - len; start++) {
      const clave = palabras.slice(start, start + len).join(' ');
      if (DESTINOS[clave]) {
        const { park, label } = DESTINOS[clave];
        return respuestaParking(park, label, minutosViaje);
      }
    }
  }

  // 7. Detecta nombres de parking directamente (ej: "Cervantes", "Alcazaba")
  for (const [id, c] of Object.entries(CAT)) {
    const nombreNorm = normalizar(c.n);
    if (t.includes(nombreNorm)) {
      return respuestaParking(id, c.n, minutosViaje);
    }
  }

  // 8. No entendido — si hay contexto, ofrecer ayuda relacionada
  if (_ctx.ultimoPark) {
    const c = CAT[_ctx.ultimoPark];
    return `No entendí bien tu pregunta. ¿Quieres saber algo más sobre <b>${c.n}</b>? Puedes preguntarme: "¿cuántas plazas tiene?", "¿cómo está ahora?", "¿y en 2 horas?", "¿hay alternativas?"`;
  }

  return `No he encontrado ese destino. Prueba con: <em>Catedral, Carlos Haya, El Palo, Estación de tren, Larios, Universidad, Alcazaba…</em>`;
}

// ── Función pública: enviar mensaje ──────────────────────────────────────────
function enviar() {
  const inp = document.getElementById('chat-in');
  const txt = inp.value.trim();
  if (!txt) return;
  inp.value = '';
  addMsg(txt, 'user');
  setTimeout(() => addMsg(buscarEnTexto(txt), 'bot'), 220);
}
