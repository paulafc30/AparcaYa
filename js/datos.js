/**
 * datos.js
 * =========
 * Carga de datos de ocupación en tiempo real y actualización de la interfaz.
 *
 * Fuentes de datos (en orden de prioridad):
 *
 *   1. Supabase (base de datos en la nube)
 *      → Datos actualizados cada 5 min por el GitHub Action.
 *
 *   2. CSV del Ayuntamiento de Málaga (datos abiertos en tiempo real)
 *      → Se intenta directamente y luego por proxy CORS si falla.
 *      → Actualizado cada ~1 minuto por el Ayuntamiento.
 *
 * Si ambas fuentes fallan → se muestra error en la interfaz.
 * No hay datos simulados ni patrones de fallback.
 *
 * Depende de: catalogo.js (CAT, TIPO), prediccion.js, mapa.js, app.js
 */

// ── Configuración ─────────────────────────────────────────────────────────────
// URL del CSV oficial del Ayuntamiento de Málaga (datos abiertos, actualización ~1 min)
// El servidor bloquea proxies cloud (403); desde navegadores reales suele funcionar directamente.
const URL_CSV =
  'https://datosabiertos.malaga.eu/recursos/aparcamientos/ocupappublicosmun/ocupappublicosmun.csv';

// Proxies CORS en cascada — se prueban en orden hasta que uno funcione
const PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
];

// Supabase — sustituir SUPABASE_KEY por la anon key real del proyecto en supabase.co
const SUPABASE_URL = 'https://nbjkulgjeshzdnxxcohc.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iamt1bGdqZXNoemRueHhjb2hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjAwNTAsImV4cCI6MjA5NzE5NjA1MH0.980oFNXvE6pYJLXNzFfSH6_Xp-N0GA9z3QYGoVxevtY';
const SUPABASE_TABLA = 'parking_estado';

// Detecta si la key es el placeholder para saltar Supabase directamente
const SUPABASE_ACTIVO = SUPABASE_KEY && !SUPABASE_KEY.startsWith('sb_secret_');

// ── Almacén global de datos actuales ─────────────────────────────────────────
window._datosActuales = {};

// ── Mapeo nombre CSV → ID interno ─────────────────────────────────────────────
// El CSV del Ayuntamiento usa nombres completos ("Cervantes", "Marina"...).
// Aquí los traducimos a los IDs cortos que usamos internamente (CE, MA...).
// Si el Ayuntamiento cambia algún nombre en su CSV, hay que actualizar este diccionario.
// Nombres tal como aparecen en el CSV del Ayuntamiento → ID interno
// Verificado contra smassa.eu y CSV del Ayuntamiento (junio 2026).
// CAMBIO: MA ya no es "Salitre" sino "Plaza de la Marina". Salitre → SA.
const NOMBRE_A_ID = {
  Cervantes: 'CE',
  // MA = Plaza de la Marina (renombrado por Luisa jun-2026)
  'Plaza de la Marina': 'MA',
  'Pz. de la Marina':   'MA',
  Marina:               'MA',
  // SA = Salitre (ID nuevo para el parking original de C/ Salitre)
  Salitre: 'SA',
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
    // El CSV del Ayuntamiento usa columna 'id' (código) y 'libres' (plazas libres).
    // Formato verificado: ocupappublicosmun.csv → columnas: dato, id, libres, ...
    const id = (row['id'] || row['ID'] || '').toString().trim().toUpperCase();
    const libres = parseInt(
      row['libres'] || row['Libres'] || row['LIBRES'] || 0,
    );

    if (!id || !CAT[id]) {
      // Fallback: si no hay columna 'id', intentar mapear por nombre
      const nombre = row['Nombre'] || row['nombre'] || row['dato'] || '';
      const idPorNombre = NOMBRE_A_ID[nombre.trim()];
      if (!idPorNombre) return;
      const cap2 = CAT[idPorNombre]?.cap || 1;
      const libresPorNombre = parseInt(row['libres'] || row['Libres'] || 0);
      const ocupados2 = parseInt(row['Ocupados'] || row['ocupados'] || 0);
      const pct2 =
        libresPorNombre > 0
          ? Math.min(1, (cap2 - libresPorNombre) / cap2)
          : Math.min(1, ocupados2 / cap2);
      datos[idPorNombre] = { libres: libresPorNombre, pct: pct2, tendencia: 0 };
      return;
    }

    const cap = CAT[id].cap;
    const pct = Math.min(1, Math.max(0, (cap - libres) / cap));
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
// Timestamp real del último dato en Supabase (no la hora del navegador)
let _tsSupabase = null;

async function cargarDesdeSupabase() {
  // Incluimos 'ts' para mostrar cuándo se generó el dato, no cuándo se descargó.
  const url = `${SUPABASE_URL}/rest/v1/parking_ultimo?select=parking_id,libres,pct_ocupacion,tendencia,ts`;
  const resp = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!resp.ok) throw new Error('Supabase error ' + resp.status);
  const rows = await resp.json();
  const datos = {};
  let tsMax = null;
  rows.forEach((r) => {
    if (!CAT[r.parking_id]) return;
    datos[r.parking_id] = {
      libres:    r.libres,
      pct:       r.pct_ocupacion,
      tendencia: r.tendencia ?? 0,
    };
    // Guardamos el timestamp más reciente entre todos los parkings
    const t = r.ts ? new Date(r.ts) : null;
    if (t && (!tsMax || t > tsMax)) tsMax = t;
  });
  _tsSupabase = tsMax;
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
  // 1. Intento directo (funciona si hay CORS permisivo o desde el mismo dominio)
  try {
    const r = await fetch(URL_CSV, { cache: 'no-store' });
    if (r.ok) {
      const csv = await r.text();
      const d = parsearCSV(csv);
      if (Object.keys(d).length > 0) return d;
    }
  } catch {
    /* sigue al proxy */
  }

  // 2. Proxies CORS en cascada
  for (const proxy of PROXIES) {
    try {
      const r = await fetch(proxy + encodeURIComponent(URL_CSV), {
        cache: 'no-store',
      });
      if (r.ok) {
        const csv = await r.text();
        const d = parsearCSV(csv);
        if (Object.keys(d).length > 0) return d;
      }
    } catch {
      /* prueba el siguiente proxy */
    }
  }

  throw new Error('CSV no disponible por ninguna vía');
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

  // 1. Supabase — solo si la key está configurada con un valor real
  if (SUPABASE_ACTIVO) {
    try {
      const sb = await cargarDesdeSupabase();
      if (Object.keys(sb).length >= 5) {
        datos = sb;
        fuente = 'Supabase';
      } else {
        console.warn('[datos] Supabase conectado pero tabla vacía — intentando CSV');
      }
    } catch (e) {
      console.warn('[datos] Supabase falló:', e.message);
    }
  }

  // 2. CSV del Ayuntamiento
  if (!datos) {
    try {
      datos = await cargarDesdeCSV();
      fuente = 'Ayuntamiento';
    } catch (e) {
      console.warn('[datos] CSV falló:', e.message);
    }
  }

  // Sin datos reales → mostrar error, no inventar nada
  if (!datos) {
    mostrarError('No se puede conectar con el Ayuntamiento ni con Supabase. Comprueba tu conexión.');
    return;
  }

  // Cargar datos de visión artificial (SACABA / SC) desde window.ESTADO_VISION,
  // que carga data/estado_vision.js vía <script> y funciona con file:// y servidores.
  const v = window.ESTADO_VISION;
  if (v) {
    const pid = v.parking_id || 'SC';
    if (CAT[pid] && typeof v.pct_ocupacion === 'number') {
      datos[pid] = {
        libres:    v.libres,
        ocupadas:  v.ocupadas,
        pct:       v.pct_ocupacion,
        tendencia: 0,
        fuente:    'vision',
      };
    }
  }

  window._datosActuales = datos;
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
/**
 * Muestra un mensaje de error en la interfaz cuando no hay datos reales.
 * No inventa datos ni usa patrones — muestra el problema claramente.
 */
function mostrarError(msg) {
  document.getElementById('last-update').textContent = '⚠️ Sin datos';
  const lista = document.getElementById('parking-list');
  lista.innerHTML = `
    <div style="padding:20px;text-align:center;color:#ef4444;font-size:13px;line-height:1.6">
      ⚠️ ${msg}
    </div>`;
}

function actualizarUI(datos, fuente) {
  const now = new Date();
  const hora = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  // Si los datos vienen de Supabase, mostramos el timestamp REAL del dato
  // (cuándo lo capturó el GitHub Action), no la hora del navegador.
  // Así el usuario ve la antigüedad real de la información.
  let labelHora = hora;
  if (fuente === 'Supabase' && _tsSupabase) {
    labelHora = _tsSupabase.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
  document.getElementById('last-update').textContent = `datos de las ${labelHora}`;

  // Quitar banner de error previo si lo hubiera
  document.getElementById('error-banner')?.remove();

  // Tarjetas del sidebar
  const lista = document.getElementById('parking-list');
  lista.innerHTML = '';
  Object.entries(CAT).forEach(([id, c]) => {
    const d = datos[id];   // undefined si el parking no tiene dato real
    const div = document.createElement('div');
    div.className = 'card';
    div.id = 'card-' + id;
    div.onclick = () => focusPark(id);

    if (!d) {
      // Parking en catálogo pero sin dato real (p.ej. SC sin visión activa)
      div.innerHTML = `
        <div class="card-top">
          <span class="card-name">${c.n}</span>
          <span class="badge badge-sindata">SIN DATOS</span>
        </div>
        <div class="card-addr">${c.dir}</div>
        <div class="bar-wrap"><div class="bar" style="width:0%;background:#e2e8f0"></div></div>
        <div class="card-nums" style="color:#94a3b8">— libres &nbsp;·&nbsp; — ocupadas &nbsp;·&nbsp; —%</div>
        <div class="card-pred" style="color:#94a3b8">📡 Esperando datos en tiempo real</div>
      `;
    } else {
      const pct  = d.pct;
      const pctP = Math.round(pct * 100);
      const cap  = c.cap || (d.libres + (d.ocupadas ?? 0));
      div.innerHTML = `
        <div class="card-top">
          <span class="card-name">${c.n}</span>
          <span class="badge badge-${badgeClass(pct)}">${estado(pct)}</span>
        </div>
        <div class="card-addr">${c.dir}</div>
        <div class="bar-wrap"><div class="bar ${barClass(pct)}" style="width:${pctP}%"></div></div>
        <div class="card-nums">
          <span><b>${d.libres}</b> libres</span>
          <span><b>${d.ocupadas ?? (cap - d.libres)}</b> ocupadas</span>
          <span><b>${pctP}%</b> ocupado</span>
        </div>
        <div class="card-pred">${textoPrediccion(id, pct)}</div>
      `;
    }

    lista.appendChild(div);
  });

  // Marcadores del mapa
  if (typeof actualizarMarcas === 'function') actualizarMarcas(datos);
}
