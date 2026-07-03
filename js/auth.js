/**
 * auth.js
 * ========
 * Módulo de autenticación de AparcaYa usando Supabase Auth.
 *
 * Expone funciones globales usadas desde index.html:
 *   iniciarSesion()      — login con email + password
 *   registrarse()        — crear cuenta nueva
 *   entrarComoInvitado() — acceso sin cuenta (sin historial guardado)
 *   cerrarSesion()       — sign out
 *   eliminarCuenta()     — borrado en cascada (RGPD), via RPC delete_my_account()
 *   toggleUserMenu()     — abre/cierra el dropdown del header
 *   abrirPanel(seccion)  — abre el panel lateral (perfil | historial | eliminar)
 *   cerrarPanel()        — cierra el panel lateral
 *
 * Estado global:
 *   window._authUser     — objeto de usuario Supabase o null si invitado
 *   window._esInvitado   — true si entró como invitado
 */

// ── Supabase client (reutiliza credenciales de datos.js) ──────────────────────
// SUPABASE_URL y SUPABASE_KEY están definidas en datos.js, que se carga antes.
// Creamos un cliente propio para auth (el de datos.js usa fetch directo, sin SDK).
const _sbAuth = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

window._authUser   = null;
window._esInvitado = false;

// ── Inicialización: comprobar sesión existente al cargar la app ───────────────
async function initAuth() {
  const { data: { session } } = await _sbAuth.auth.getSession();
  if (session?.user) {
    window._authUser = session.user;
    await _mostrarDashboard();
  } else {
    _mostrarLoginOverlay();
  }

  // Escuchar cambios de sesión (logout desde otra pestaña, token refresh, etc.)
  _sbAuth.auth.onAuthStateChange((_event, session) => {
    window._authUser = session?.user ?? null;
    if (!session && !window._esInvitado) {
      _mostrarLoginOverlay();
    }
  });
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function iniciarSesion() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    _setMensaje('Rellena email y contraseña.', 'error');
    return;
  }

  _setMensaje('Iniciando sesión…', 'info');
  _setBtnLoading('btn-login', true);

  const { data, error } = await _sbAuth.auth.signInWithPassword({ email, password });

  _setBtnLoading('btn-login', false);

  if (error) {
    _setMensaje(_traducirError(error.message), 'error');
    return;
  }

  window._authUser   = data.user;
  window._esInvitado = false;
  await _mostrarDashboard();
}

// ── Registro ──────────────────────────────────────────────────────────────────
async function registrarse() {
  const nombre   = document.getElementById('reg-nombre').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;

  if (!nombre || !email || !password) {
    _setMensaje('Rellena todos los campos.', 'error');
    return;
  }
  if (password.length < 6) {
    _setMensaje('La contraseña debe tener al menos 6 caracteres.', 'error');
    return;
  }

  _setMensaje('Creando cuenta…', 'info');
  _setBtnLoading('btn-register', true);

  const { data, error } = await _sbAuth.auth.signUp({ email, password });

  _setBtnLoading('btn-register', false);

  if (error) {
    _setMensaje(_traducirError(error.message), 'error');
    return;
  }

  window._authUser   = data.user;
  window._esInvitado = false;

  // Guardar nombre en user_perfil
  if (data.user) {
    await _sbAuth
      .from('user_perfil')
      .upsert({ user_id: data.user.id, nombre });
  }

  // Supabase puede pedir confirmación de email según config del proyecto
  if (!data.session) {
    _setMensaje('¡Cuenta creada! Revisa tu email para confirmarla.', 'ok');
    return;
  }

  await _mostrarDashboard();
}

// ── Invitado ──────────────────────────────────────────────────────────────────
function entrarComoInvitado() {
  window._authUser   = null;
  window._esInvitado = true;
  _mostrarDashboard();
}

// ── Cerrar sesión ─────────────────────────────────────────────────────────────
async function cerrarSesion() {
  await _sbAuth.auth.signOut();
  window._authUser   = null;
  window._esInvitado = false;
  cerrarPanel();
  _cerrarUserMenu();
  _mostrarLoginOverlay();
}

// ── Eliminar cuenta (RGPD) ────────────────────────────────────────────────────
async function eliminarCuenta() {
  const confirmado = document.getElementById('chk-confirmar-borrado')?.checked;
  if (!confirmado) {
    alert('Marca la casilla para confirmar que quieres eliminar tu cuenta.');
    return;
  }

  const btn = document.getElementById('btn-eliminar-cuenta');
  _setBtnLoading('btn-eliminar-cuenta', true);
  if (btn) btn.textContent = 'Eliminando…';

  const { error } = await _sbAuth.rpc('delete_my_account');

  if (error) {
    _setBtnLoading('btn-eliminar-cuenta', false);
    if (btn) btn.textContent = 'Eliminar mi cuenta';
    alert('Error al eliminar la cuenta: ' + error.message);
    return;
  }

  // Sesión ya invalidada por la RPC — limpiar estado local
  window._authUser   = null;
  window._esInvitado = false;
  cerrarPanel();
  _mostrarLoginOverlay();
}

// ── UI: login overlay ─────────────────────────────────────────────────────────
function _mostrarLoginOverlay() {
  document.getElementById('login-overlay').style.display = 'flex';
  document.getElementById('app-wrapper').style.display   = 'none';
  _setMensaje('', '');
  // Reset formularios
  ['login-email','login-password','reg-nombre','reg-email','reg-password']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  mostrarFormLogin();
}

// Flag para que initDashboard solo se llame una vez aunque _mostrarDashboard se ejecute varias veces
let _dashboardIniciado = false;

async function _mostrarDashboard() {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('app-wrapper').style.display   = 'flex';
  _actualizarHeaderUsuario();

  // Si hay sesión, cargar el perfil para tener el nombre
  if (window._authUser) {
    const { data } = await _sbAuth
      .from('user_perfil')
      .select('nombre')
      .eq('user_id', window._authUser.id)
      .single();
    window._authUser._nombre = data?.nombre || '';
    _actualizarHeaderUsuario();
  }

  // Arrancar el dashboard solo la primera vez (mapa, datos, timer)
  if (!_dashboardIniciado) {
    _dashboardIniciado = true;
    if (typeof initDashboard === 'function') initDashboard();
  }
}

// ── UI: formularios login / registro ─────────────────────────────────────────
function mostrarFormLogin() {
  document.getElementById('form-login').style.display    = 'flex';
  document.getElementById('form-register').style.display = 'none';
  _setMensaje('', '');
}

function mostrarFormRegistro() {
  document.getElementById('form-login').style.display    = 'none';
  document.getElementById('form-register').style.display = 'flex';
  _setMensaje('', '');
}

// ── UI: header — icono de usuario ────────────────────────────────────────────
function _actualizarHeaderUsuario() {
  const btn    = document.getElementById('user-btn');
  const avatar = document.getElementById('user-avatar');
  if (!btn || !avatar) return;

  if (window._esInvitado) {
    avatar.textContent = '👤';
    avatar.title       = 'Invitado';
  } else if (window._authUser) {
    const nombre = window._authUser._nombre || window._authUser.email || '';
    const inicial = nombre.charAt(0).toUpperCase() || '?';
    avatar.textContent = inicial;
    avatar.title       = nombre || window._authUser.email;
    avatar.classList.add('avatar-inicial');
  }
}

// ── UI: dropdown menú usuario ─────────────────────────────────────────────────
function toggleUserMenu() {
  const menu = document.getElementById('user-menu');
  const abierto = menu.classList.toggle('open');
  if (abierto) _renderUserMenu();

  // Cerrar al clicar fuera
  if (abierto) {
    setTimeout(() => {
      document.addEventListener('click', _cierreMenuExterno, { once: true });
    }, 0);
  }
}

function _cerrarUserMenu() {
  document.getElementById('user-menu')?.classList.remove('open');
}

function _cierreMenuExterno(e) {
  const wrap = document.getElementById('user-btn-wrap');
  if (!wrap?.contains(e.target)) _cerrarUserMenu();
}

function _renderUserMenu() {
  const menu = document.getElementById('user-menu');

  if (window._esInvitado) {
    menu.innerHTML = `
      <div class="user-menu-info">
        <span class="user-menu-nombre">Modo invitado</span>
        <span class="user-menu-email">Sin cuenta activa</span>
      </div>
      <div class="user-menu-sep"></div>
      <button class="user-menu-item" onclick="_cerrarUserMenu();mostrarFormRegistro();document.getElementById('login-overlay').style.display='flex';document.getElementById('app-wrapper').style.display='none';">
        ✨ Crear cuenta
      </button>
      <button class="user-menu-item" onclick="_cerrarUserMenu();mostrarFormLogin();document.getElementById('login-overlay').style.display='flex';document.getElementById('app-wrapper').style.display='none';">
        🔑 Iniciar sesión
      </button>
    `;
    return;
  }

  const nombre = window._authUser?._nombre || '';
  const email  = window._authUser?.email   || '';

  menu.innerHTML = `
    <div class="user-menu-info">
      <span class="user-menu-nombre">${nombre || 'Mi cuenta'}</span>
      <span class="user-menu-email">${email}</span>
    </div>
    <div class="user-menu-sep"></div>
    <button class="user-menu-item" onclick="_cerrarUserMenu();abrirPanel('perfil')">
      👤 Datos personales
    </button>
    <button class="user-menu-item" onclick="_cerrarUserMenu();abrirPanel('historial')">
      🕐 Historial de consultas
    </button>
    <div class="user-menu-sep"></div>
    <button class="user-menu-item" onclick="_cerrarUserMenu();cerrarSesion()">
      🚪 Cerrar sesión
    </button>
    <button class="user-menu-item user-menu-danger" onclick="_cerrarUserMenu();abrirPanel('eliminar')">
      🗑️ Eliminar cuenta
    </button>
  `;
}

// ── UI: panel lateral ─────────────────────────────────────────────────────────
function abrirPanel(seccion) {
  const panel  = document.getElementById('user-panel');
  const titulo = document.getElementById('panel-titulo');
  const cuerpo = document.getElementById('panel-cuerpo');

  if (seccion === 'perfil') {
    titulo.textContent = 'Datos personales';
    const nombre = window._authUser?._nombre || '';
    const email  = window._authUser?.email   || '';
    cuerpo.innerHTML = `
      <div class="panel-campo">
        <label>Nombre</label>
        <input id="panel-nombre" type="text" value="${nombre}" placeholder="Tu nombre">
      </div>
      <div class="panel-campo">
        <label>Email</label>
        <input type="email" value="${email}" disabled class="input-disabled">
      </div>
      <button class="panel-btn" onclick="guardarPerfil()">Guardar cambios</button>
      <div id="panel-msg" class="panel-msg"></div>
    `;
  } else if (seccion === 'historial') {
    titulo.textContent = 'Historial de consultas';
    cuerpo.innerHTML = '<div class="panel-loading">Cargando…</div>';
    _cargarHistorialEnPanel();
  } else if (seccion === 'eliminar') {
    titulo.textContent = 'Eliminar cuenta';
    cuerpo.innerHTML = `
      <div class="panel-warning">
        <p>Esta acción es <strong>irreversible</strong>. Se eliminarán tu cuenta y todo tu historial de consultas.</p>
      </div>
      <label class="panel-check-label">
        <input type="checkbox" id="chk-confirmar-borrado">
        Entiendo que mis datos se eliminarán permanentemente
      </label>
      <button class="panel-btn panel-btn-danger" id="btn-eliminar-cuenta" onclick="eliminarCuenta()">
        Eliminar mi cuenta
      </button>
    `;
  }

  panel.classList.add('open');
  document.getElementById('panel-overlay').classList.add('open');
}

function cerrarPanel() {
  document.getElementById('user-panel')?.classList.remove('open');
  document.getElementById('panel-overlay')?.classList.remove('open');
}

// ── Guardar perfil ────────────────────────────────────────────────────────────
async function guardarPerfil() {
  const nombre = document.getElementById('panel-nombre')?.value.trim();
  const msg    = document.getElementById('panel-msg');
  if (!nombre) { if (msg) msg.textContent = 'El nombre no puede estar vacío.'; return; }

  const { error } = await _sbAuth
    .from('user_perfil')
    .upsert({ user_id: window._authUser.id, nombre });

  if (error) {
    if (msg) msg.textContent = 'Error al guardar.';
    return;
  }

  window._authUser._nombre = nombre;
  _actualizarHeaderUsuario();
  if (msg) { msg.textContent = '✅ Guardado'; msg.style.color = '#22c55e'; }
}

// ── Historial en el panel ─────────────────────────────────────────────────────
async function _cargarHistorialEnPanel() {
  const cuerpo = document.getElementById('panel-cuerpo');

  const { data, error } = await _sbAuth
    .from('user_historial')
    .select('parking_nombre, estado, libres, ts')
    .order('ts', { ascending: false })
    .limit(10);

  if (error || !data?.length) {
    cuerpo.innerHTML = '<p class="panel-vacio">Aún no has consultado ningún aparcamiento.</p>';
    return;
  }

  const estadoIcon = { LIBRE: '🟢', DISPONIBLE: '🟡', LLENO: '🔴' };
  cuerpo.innerHTML = data.map(r => {
    const fecha = new Date(r.ts).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    return `
      <div class="historial-item">
        <div class="historial-nombre">${estadoIcon[r.estado] || '⚫'} ${r.parking_nombre}</div>
        <div class="historial-meta">${r.libres ?? '—'} libres · ${fecha}</div>
      </div>
    `;
  }).join('');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _setMensaje(texto, tipo) {
  const el = document.getElementById('login-msg');
  if (!el) return;
  el.textContent  = texto;
  el.className    = 'login-msg' + (tipo ? ' login-msg-' + tipo : '');
  el.style.display = texto ? 'block' : 'none';
}

function _setBtnLoading(id, loading) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = loading;
  btn.style.opacity = loading ? '.6' : '1';
}

function _traducirError(msg) {
  if (msg.includes('Invalid login'))         return 'Email o contraseña incorrectos.';
  if (msg.includes('Email not confirmed'))   return 'Confirma tu email antes de entrar.';
  if (msg.includes('already registered'))    return 'Este email ya tiene una cuenta.';
  if (msg.includes('Password should be'))    return 'La contraseña debe tener al menos 6 caracteres.';
  if (msg.includes('Unable to validate'))    return 'Email no válido.';
  return msg;
}
