/**
 * datos.js
 * Carga de datos de ocupación en tiempo real.
 * Fuente primaria: CSV del Ayuntamiento de Málaga (via allorigins proxy).
 * Fuente secundaria: Supabase (tabla parking_estado).
 * Fallback: datos simulados basados en patrones horarios.
 */

// ── Configuración ─────────────────────────────────────────────────────────────
const URL_CSV = 'https://datosabiertos.malaga.eu/recursos/transporte/estacionamiento/ocupacion-aparcamientos/ocupacionAparcamientos.csv';
const PROXY   = 'https://api.allorigins.win/raw?url=';

// Supabase (sustituir por los valores reales del proyecto)
const SUPABASE_URL  = 'https://TU_PROYECTO.supabase.co';
const SUPABASE_KEY  = 'TU_ANON_KEY';
const SUPABASE_TABLA = 'parking_estado';

// ── Almacén global de datos actuales ─────────────────────────────────────────
window._datosActuales = {};

// ── Mapeo nombre CSV → ID interno ─────────────────────────────────────────────
// Los nombres en el CSV pueden variar; ajustar si fuera necesario.
const NOMBRE_A_ID = {
  'Cervantes':          'CE',
  'Marina':             'MA',
  'Plaza de la Marina': 'MA',
  'Camas':              'CA',
  'El Palo':            'PA',
  'Andalucia':          'AN',
  'Andalucía':          'AN',
  'Tejón y Rodríguez':  'TE',
  'Tejon y Rodriguez':  'TE',
  'Alcazaba':           'AL',
  'San Juan de la Cruz':'SJ',
  'Carlos Haya':        'CY',
  'Pío Baroja':         'PB',
  'Pio Baroja':         'PB',
};

// ── Datos de demostración (fallback) ─────────────────────────────────────────
function datosDemo() {
  const now  = new Date();
  const hora = now.getHours();
  const dia  = now.getDay();
  const demo = {};
  Object.entries(CAT).forEach(([id, c]) => {
    const tipo = TIPO[id] || 'centro';
    const pct  = PATRONES[tipo][hora][dia];
    const libres = Math.round(c.cap * (1 - pct));
    demo[id] = { libres, pct, tendencia: 0 };
  });
  return demo;
}

// ── Parser del CSV del Ayuntamiento ──────────────────────────────────────────
function parsearCSV(csv) {
  const result = Papa.parse(csv.trim(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });
  const datos = {};
  result.data.forEach(row => {
    // Intentamos columnas habituales del CSV de Málaga
    const nombre   = row['Nombre'] || row['nombre'] || row['NOMBRE'] || '';
    const libres   = parseInt(row['Libres'] || row['libres'] || row['LIBRES'] || 0);
    const ocupados = parseInt(row['Ocupados'] || row['ocupados'] || row['OCUPADOS'] || 0);

    const id = NOMBRE_A_ID[nombre.trim()];
    if (!id) return;

    const cap = CAT[id]?.cap || libres + ocupados || 1;
    const pct = Math.min(1, ocupados / cap);
    datos[id] = { libres, pct, tendencia: 0 };
  });
  return datos;
}

// ── Carga desde Supabase ──────────────────────────────────────────────────────
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
  rows.forEach(r => {
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
async function cargarDesdeCSV() {
  let csv;
  try {
    const r = await fetch(URL_CSV, { cache: 'no-store' });
    if (!r.ok) throw new Error('direct fetch failed');
    csv = await r.text();
  } catch {
    // Fallback: proxy allorigins
    const r2 = await fetch(PROXY + encodeURIComponent(URL_CSV), { cache: 'no-store' });
    if (!r2.ok) throw new Error('proxy failed');
    csv = await r2.text();
  }
  return parsearCSV(csv);
}

// ── Función principal de carga ────────────────────────────────────────────────
async function cargar() {
  let datos = null;
  let fuente = '';

  try {
    datos  = await cargarDesdeSupabase();
    fuente = 'Supabase';
  } catch {
    try {
      datos  = await cargarDesdeCSV();
      fuente = 'Ayuntamiento';
    } catch {
      datos  = datosDemo();
      fuente = 'demo';
    }
  }

  // Completar parkings sin datos con fallback de patrones
  const demo = datosDemo();
  Object.keys(CAT).forEach(id => {
    if (!datos[id]) datos[id] = demo[id];
  });

  window._datosActuales = datos;

  // Actualizar UI
  actualizarUI(datos, fuente);
}

// ── Actualización de la interfaz ──────────────────────────────────────────────
function actualizarUI(datos, fuente) {
  const now = new Date();
  document.getElementById('last-update').textContent =
    now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) +
    (fuente ? ` (${fuente})` : '');

  // Tarjetas del sidebar
  const lista = document.getElementById('parking-list');
  lista.innerHTML = '';
  Object.entries(CAT).forEach(([id, c]) => {
    const d    = datos[id] || { libres: 0, pct: 0, tendencia: 0 };
    const pct  = d.pct;
    const pctP = Math.round(pct * 100);
    const div  = document.createElement('div');
    div.className = 'card';
    div.id        = 'card-' + id;
    div.onclick   = () => focusPark(id);
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
