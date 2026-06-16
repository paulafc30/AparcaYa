/**
 * datos.js
 * =========
 * Carga de datos de ocupación en tiempo real y actualización de la interfaz.
 *
 * Este módulo implementa un sistema de fallback en cascada con 3 niveles:
 *
 *   1. Supabase (base de datos en la nube)
 *      → Los datos más frescos, actualizados cada 5 min por el GitHub Action.
 *      → Requiere que el Action esté configurado con las credenciales correctas.
 *
 *   2. CSV del Ayuntamiento de Málaga (datos abiertos en tiempo real)
 *      → Se intenta primero directamente, luego a través de un proxy CORS
 *        (allorigins.win) porque los navegadores bloquean peticiones entre dominios.
 *      → Actualizado cada ~1 minuto por el Ayuntamiento.
 *
 *   3. Datos de demostración generados localmente
 *      → Se calculan en el momento usando los patrones de catalogo.js.
 *      → Útil para presentaciones sin conexión o cuando los servicios fallan.
 *
 * Depende de: catalogo.js (CAT, TIPO, PATRONES), prediccion.js, mapa.js, app.js
 */

// ── Configuración ─────────────────────────────────────────────────────────────
// URL del CSV oficial del Ayuntamiento de Málaga (datos abiertos, actualización ~1 min)
const URL_CSV =
  'https://datosabiertos.malaga.eu/recursos/transporte/estacionamiento/ocupacion-aparcamientos/ocupacionAparcamientos.csv';

// Proxy para evitar el bloqueo CORS del navegador al acceder a dominios externos
// CORS = "Cross-Origin Resource Sharing": los navegadores bloquean peticiones
// a dominios distintos al de la propia web por seguridad. El proxy actúa de intermediario.
const PROXY = 'https://api.allorigins.win/raw?url=';

// Supabase (sustituir por los valores reales del proyecto)
const SUPABASE_URL = 'https://nbjkulgjeshzdnxxcohc.supabase.co';
const SUPABASE_KEY = 'sb_secret_gwzAIzwHnqlBdQvlbAIhIA__ndkGfVv';
const SUPABASE_TABLA = 'parking_estado';

// ── Almacén global de datos actuales ─────────────────────────────────────────
// Guardamos los datos en window._datosActuales para que chatbot.js pueda
// consultarlos cuando el usuario escribe un destino, sin tener que volver
// a hacer una petición de red.
window._datosActuales = {};

// ── Mapeo nombre CSV → ID interno ─────────────────────────────────────────────
// El CSV del Ayuntamiento usa nombres completos ("Cervantes", "Marina"...).
// Aquí los traducimos a los IDs cortos que usamos internamente (CE, MA...).
// Si el Ayuntamiento cambia algún nombre en su CSV, hay que actualizar este diccionario.
// Nombres tal como aparecen en el CSV del Ayuntamiento → ID interno
// Verificado contra smassa.eu (junio 2026). El parking "Salitre" aparece
// a veces como "Salitre" en el CSV, no como "Marina".
const NOMBRE_A_ID = {
  Cervantes: 'CE',
  Salitre: 'MA',
  Camas: 'CA',
  'El Palo': 'PA',
  Andalucia: 'AN',
  Andalucía: 'AN',
  'Av. Andalucía': 'AN',
  'Tejón y Rodríguez': 'TE',
  'Tejon y Rodriguez': 'TE',
  Tejón: 'TE',
  Alcazaba: 'AL',
  'San Juan de la Cruz': 'SJ',
  'San Juan': 'SJ',
  'Carlos Haya': 'CY',
  'Pío Baroja': 'PB',
  'Pio Baroja': 'PB',
};

// ── Datos de demostración (fallback) ─────────────────────────────────────────
/**
 * Genera datos de ocupación realistas a partir de los patrones horarios.
 * No hace ninguna petición de red — calcula los valores en el momento
 * mirando qué hora y día es ahora y aplicando el patrón correspondiente.
 * Útil para demos sin conexión o cuando Supabase y el CSV fallan.
 * @returns {object} { CE: {libres, pct, tendencia}, MA: ..., ... }
 */
function datosDemo() {
  const now = new Date();
  const hora = now.getHours();
  const dia = now.getDay();
  const demo = {};
  Object.entries(CAT).forEach(([id, c]) => {
    const tipo = TIPO[id] || 'centro';
    const pct = PATRONES[tipo][hora][dia];
    const libres = Math.round(c.cap * (1 - pct));
    demo[id] = { libres, pct, tendencia: 0 };
  });
  return demo;
}

// ── Parser del CSV del Ayuntamiento ──────────────────────────────────────────
/**
 * Convierte el texto CSV del Ayuntamiento en el formato interno del proyecto.
 * Usa PapaParse (cargado en index.html) para parsear el CSV correctamente.
 * Nota: el CSV puede tener columnas con nombres distintos según la versión.
 *       Por eso probamos varios nombres de columna posibles (Libres / libres / LIBRES).
 * @param {string} csv - Texto CSV crudo
 * @returns {object} { CE: {libres, pct, tendencia}, ... }
 */
function parsearCSV(csv) {
  const result = Papa.parse(csv.trim(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });
  const datos = {};
  result.data.forEach((row) => {
    // Intentamos columnas habituales del CSV de Málaga
    const nombre = row['Nombre'] || row['nombre'] || row['NOMBRE'] || '';
    const libres = parseInt(
      row['Libres'] || row['libres'] || row['LIBRES'] || 0,
    );
    const ocupados = parseInt(
      row['Ocupados'] || row['ocupados'] || row['OCUPADOS'] || 0,
    );

    const id = NOMBRE_A_ID[nombre.trim()];
    if (!id) return;

    const cap = CAT[id]?.cap || libres + ocupados || 1;
    const pct = Math.min(1, ocupados / cap);
    datos[id] = { libres, pct, tendencia: 0 };
  });
  return datos;
}

// ── Carga desde Supabase ──────────────────────────────────────────────────────
/**
 * Obtiene el estado más reciente de cada parking desde la base de datos Supabase.
 * Solo trae los 10 últimos registros (uno por parking) para ser eficientes.
 * Lanza un error si las credenciales no están configuradas o hay fallo de red,
 * y entonces datos.js pasa automáticamente al siguiente nivel de fallback (CSV).
 * @returns {Promise<object>} { CE: {libres, pct, tendencia}, ... }
 * @throws {Error} Si Supabase no responde o la key es incorrecta
 */
async function cargarDesdeSupabase() {
  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLA}?select=parking_id,libres,pct_ocupacion&order=ts.desc&limit=10`;
  const resp = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!resp.ok) throw new Error('Supabase error ' + resp.status);
  const rows = await resp.json();
  const datos = {};
  rows.forEach((r) => {
    if (!CAT[r.parking_id]) return;
    datos[r.parking_id] = {
      libres: r.libres,
      pct: r.pct_ocupacion,
      tendencia: 0,
    };
  });
  return datos;
}

// ── Carga desde CSV (con proxy CORS) ─────────────────────────────────────────
/**
 * Descarga el CSV del Ayuntamiento de Málaga e intenta parsear sus datos.
 * Estrategia de dos intentos:
 *   1. Petición directa (funciona si la app está en el mismo dominio o sin CORS)
 *   2. Si falla, pasa por el proxy allorigins.win que hace la petición en el servidor
 * @returns {Promise<object>} Datos parseados
 * @throws {Error} Si ambos intentos fallan
 */
async function cargarDesdeCSV() {
  let csv;
  try {
    const r = await fetch(URL_CSV, { cache: 'no-store' });
    if (!r.ok) throw new Error('direct fetch failed');
    csv = await r.text();
  } catch {
    // Fallback: proxy allorigins
    const r2 = await fetch(PROXY + encodeURIComponent(URL_CSV), {
      cache: 'no-store',
    });
    if (!r2.ok) throw new Error('proxy failed');
    csv = await r2.text();
  }
  return parsearCSV(csv);
}

// ── Función principal de carga ────────────────────────────────────────────────
/**
 * Función principal: intenta las tres fuentes en orden y usa la primera que funcione.
 * Siempre completa los parkings sin datos usando el fallback de patrones.
 * Al final llama a actualizarUI() para refrescar tarjetas y mapa.
 *
 * Flujo:
 *   Supabase OK → usa Supabase
 *   Supabase falla → intenta CSV
 *   CSV falla → usa datos demo
 *   En cualquier caso → rellena huecos con demo y actualiza la UI
 *
 * Esta función se llama desde app.js al arrancar y cada 60 segundos.
 */
async function cargar() {
  let datos = null;
  let fuente = '';

  try {
    datos = await cargarDesdeSupabase();
    fuente = 'Supabase';
  } catch {
    try {
      datos = await cargarDesdeCSV();
      fuente = 'Ayuntamiento';
    } catch {
      datos = datosDemo();
      fuente = 'demo';
    }
  }

  // Completar parkings sin datos con fallback de patrones
  const demo = datosDemo();
  Object.keys(CAT).forEach((id) => {
    if (!datos[id]) datos[id] = demo[id];
  });

  window._datosActuales = datos;

  // Actualizar UI
  actualizarUI(datos, fuente);
}

// ── Actualización de la interfaz ──────────────────────────────────────────────
/**
 * Refresca toda la interfaz con los nuevos datos:
 *   - Timestamp "Última actualización" en el header
 *   - Tarjetas del sidebar (nombre, badge, barra, plazas, predicción)
 *   - Marcadores del mapa (color según estado)
 *
 * @param {object} datos  - { CE: {pct, libres}, MA: ..., ... }
 * @param {string} fuente - De dónde vienen los datos ('Supabase' | 'Ayuntamiento' | 'demo')
 */
function actualizarUI(datos, fuente) {
  const now = new Date();
  document.getElementById('last-update').textContent =
    now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) +
    (fuente ? ` (${fuente})` : '');

  // Tarjetas del sidebar
  const lista = document.getElementById('parking-list');
  lista.innerHTML = '';
  Object.entries(CAT).forEach(([id, c]) => {
    const d = datos[id] || { libres: 0, pct: 0, tendencia: 0 };
    const pct = d.pct;
    const pctP = Math.round(pct * 100);
    const div = document.createElement('div');
    div.className = 'card';
    div.id = 'card-' + id;
    div.onclick = () => focusPark(id);
    div.innerHTML = `
      <div class="card-top">
        <span class="card-name">${c.n}</span>
        <span class="badge badge-${badgeClass(pct)}">${estado(pct)}</span>
      </div>
      <div class="card-addr">${c.dir}</div>
      <div class="bar-wrap"><div class="bar ${barClass(pct)}" style="width:${pctP}%"></div></div>
      <div class="card-nums">
        <span><b>${d.libres}</b> libres</span>
        <span><b>${c.cap - d.libres}</b> ocupadas</span>
        <span><b>${pctP}%</b> ocupado</span>
      </div>
      <div class="card-pred">${textoPrediccion(id, pct)}</div>
    `;
    lista.appendChild(div);
  });

  // Marcadores del mapa
  if (typeof actualizarMarcas === 'function') actualizarMarcas(datos);
}
