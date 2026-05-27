// ─────────────────────────────────────────────
//  auth.js  —  Portal de Acceso · Teatro Eventual
//  Maneja login, sesión y guardia de ruta
// ─────────────────────────────────────────────

const AUTH_BASE_URL = 'https://service.auth.nebula.andrescortes.dev';

const STORAGE_KEYS = {
  TOKEN: 'access_token',
  USER:  'access_user',
};

// ── Helpers de sesión ──────────────────────────

function saveSession(token, user) {
  localStorage.setItem(STORAGE_KEYS.TOKEN, token);
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
}

function getToken() {
  return localStorage.getItem(STORAGE_KEYS.TOKEN);
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.USER));
  } catch {
    return null;
  }
}

/** Decodifica el payload del JWT sin librerías externas */
function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1];
    const decoded = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/** true si el token existe, es válido y no ha expirado */
function isSessionValid() {
  const token = getToken();
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  return payload.exp * 1000 > Date.now();
}

/** true si el usuario tiene permiso para este portal */
function hasAccessPermission(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'employee') {
    const perms = user.permissions ?? [];
    return perms.includes('access');
  }
  return false;
}

// Redirigir al dashboard si ya hay sesión activa
if (isSessionValid() && document.getElementById('login-form') !== null || isSessionValid() && document.readyState === 'loading') {
  // Se evalúa cuando el script carga; la redirección real
  // la hace el DOMContentLoaded para no correr antes del DOM
}

// ── UI Helpers ─────────────────────────────────

function setButtonLoading(btn, isLoading) {
  if (isLoading) {
    btn.disabled = true;
    btn.dataset.originalHtml = btn.innerHTML;
    btn.innerHTML = `
      <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span>Autenticando...</span>`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalHtml || btn.innerHTML;
  }
}

function setButtonSuccess(btn) {
  btn.innerHTML = `
    <span class="material-symbols-outlined">check_circle</span>
    <span>Acceso Concedido</span>`;
  btn.style.background = '#16a34a'; // green-600
}

function setButtonError(btn) {
  btn.disabled = false;
  btn.innerHTML = btn.dataset.originalHtml || btn.innerHTML;
  btn.style.background = '';
}

function showError(message) {
  const el = document.getElementById('login-error');
  if (!el) return;
  // El span de texto es el segundo hijo (después del ícono)
  const textSpan = el.querySelector('span:last-child');
  if (textSpan) textSpan.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(el._hideTimeout);
  el._hideTimeout = setTimeout(() => el.classList.add('hidden'), 6000);
}

function hideError() {
  document.getElementById('login-error')?.classList.add('hidden');
}

function showFieldError(fieldId, message) {
  const el = document.getElementById(`${fieldId}-error`);
  if (el) {
    el.textContent = message;
    el.classList.remove('hidden');
  }
}

function clearFieldErrors() {
  document.querySelectorAll('[id$="-error"]').forEach(el => {
    if (el.id !== 'login-error') {
      el.textContent = '';
      el.classList.add('hidden');
    }
  });
}

// ── API Calls ──────────────────────────────────

async function apiLogin(email, password) {
  const res = await fetch(`${AUTH_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, data: await res.json() };
}

async function apiLogout(token) {
  try {
    await fetch(`${AUTH_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });
  } catch {
    // Stateless: limpiar local aunque falle la red
  }
}

// ── Handlers ───────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();
  hideError();
  clearFieldErrors();

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const btn      = e.target.querySelector('button[type="submit"]');

  // Validación local
  let hasErrors = false;
  if (!email) {
    showFieldError('email', 'El correo es requerido.');
    hasErrors = true;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFieldError('email', 'Ingresa un correo válido.');
    hasErrors = true;
  }
  if (!password) {
    showFieldError('password', 'La contraseña es requerida.');
    hasErrors = true;
  }
  if (hasErrors) return;

  setButtonLoading(btn, true);

  try {
    const { status, data } = await apiLogin(email, password);

    if (data.success) {
      const { token, user } = data.data;

      // Verificar permiso para este portal
      if (!hasAccessPermission(user)) {
        setButtonError(btn);
        showError('No tienes permiso para acceder a este portal.');
        return;
      }

      saveSession(token, user);
      setButtonSuccess(btn);

      setTimeout(() => {
        window.location.href = 'public/dashboard.html';
      }, 700);

    } else if (status === 422 && data.errors) {
      setButtonError(btn);
      for (const [field, messages] of Object.entries(data.errors)) {
        showFieldError(field, messages[0]);
      }

    } else {
      setButtonError(btn);
      showError(data.message || 'Credenciales inválidas.');
    }

  } catch (err) {
    setButtonError(btn);
    showError('No se pudo conectar con el servidor. Intenta de nuevo.');
    console.error('[auth] login error:', err);
  }
}

// ── Logout (llamado desde el dashboard) ────────

async function logout() {
  const token = getToken();
  if (token) await apiLogout(token);
  clearSession();
  window.location.href = '../index.html';
}

// ── Guardia de ruta (llamado desde el dashboard) 

function requireAuth() {
  if (!isSessionValid()) {
    clearSession();
    window.location.href = '../index.html';
    return null;
  }
  return { token: getToken(), user: getUser() };
}

// ── Poblar header del dashboard ────────────────

function populateUserHeader(user) {
  const nameEl    = document.getElementById('user-name');
  const emailEl   = document.getElementById('user-email');
  const avatarEl  = document.getElementById('user-avatar');
  const fallback  = document.getElementById('user-avatar-fallback');

  if (nameEl)  nameEl.textContent  = user.name;
  if (emailEl) emailEl.textContent = user.email;

  if (avatarEl && user.avatar_url) {
    avatarEl.src = user.avatar_url;
    avatarEl.alt = user.name;
    avatarEl.classList.remove('hidden');
    fallback?.classList.add('hidden');
  }
}

// ── Init ───────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Si ya hay sesión válida y estamos en el login, redirigir
  if (isSessionValid() && document.getElementById('login-form')) {
    window.location.href = 'public/dashboard.html';
    return;
  }

  document.getElementById('login-form')
    ?.addEventListener('submit', handleLogin);

  // Limpiar error de campo al escribir
  ['email', 'password'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      document.getElementById(`${id}-error`)?.classList.add('hidden');
    });
  });

  // Micro-interacción: ícono del input al hacer focus
  ['email', 'password'].forEach(id => {
    const input = document.getElementById(id);
    const icon  = document.getElementById(`icon-${id}`);
    if (!input || !icon) return;
    input.addEventListener('focus', () => { icon.style.color = '#F5F1E8'; });
    input.addEventListener('blur',  () => { icon.style.color = 'rgba(139, 30, 63, 0.5)'; });
  });
});