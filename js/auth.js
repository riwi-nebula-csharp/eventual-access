// ─────────────────────────────────────────────
//  auth.js  —  Eventual Access · Panel de Validación
//  Maneja login, forgot-password y sesión
// ─────────────────────────────────────────────

const AUTH_BASE_URL = 'https://service.auth.nebula.andrescortes.dev';

const STORAGE_KEYS = {
  TOKEN: 'ea_token',
  USER:  'ea_user',
};

// ── Helpers de sesión ──────────────────────────

function saveSession(token, user) {
  localStorage.setItem(STORAGE_KEYS.TOKEN, token);
  localStorage.setItem(STORAGE_KEYS.USER,  JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
}

function getToken() {
  return localStorage.getItem(STORAGE_KEYS.TOKEN);
}

function decodeJwtPayload(token) {
  try {
    const base64Payload = token.split('.')[1];
    const decoded = atob(base64Payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isSessionValid() {
  const token = getToken();
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  return payload.exp * 1000 > Date.now();
}

// Si ya hay sesión activa ir directo al dashboard
if (isSessionValid()) {
  window.location.href = 'public/dashboard.html';
}

// ── Validación de rol/permiso ──────────────────
// Solo admin o employee con permiso "access"

function hasAccessPermission(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'employee' && Array.isArray(user.permissions)) {
    return user.permissions.includes('access');
  }
  return false;
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
      <span>VALIDANDO...</span>`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalHtml || btn.innerHTML;
  }
}

function setButtonSuccess(btn) {
  btn.innerHTML = `
    <span class="material-symbols-outlined">check_circle</span>
    <span>ACCESO CONCEDIDO</span>`;
  btn.classList.remove('bg-brand-accent');
  btn.classList.add('!bg-green-600');
}

function showError(message) {
  const el = document.getElementById('login-error');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(el._hideTimeout);
  el._hideTimeout = setTimeout(() => el.classList.add('hidden'), 6000);
}

function hideError() {
  document.getElementById('login-error')?.classList.add('hidden');
}

function showForgotSuccess(message) {
  const el = document.getElementById('forgot-success');
  if (el) {
    el.textContent = message;
    el.classList.remove('hidden');
  }
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
  return res.json();
}

async function apiForgotPassword(email) {
  const res = await fetch(`${AUTH_BASE_URL}/api/auth/password/forgot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ email }),
  });
  return res.json();
}

// ── Handlers ───────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();
  hideError();

  const email    = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const btn      = document.getElementById('login-btn');

  setButtonLoading(btn, true);

  try {
    const data = await apiLogin(email, password);

    if (data.success) {
      const user = data.data.user;
      const tokenPayload = decodeJwtPayload(data.data.token);
      user.permissions = tokenPayload?.permissions || [];

      if (!hasAccessPermission(user)) {
        setButtonLoading(btn, false);
        showError('Tu cuenta no tiene acceso al Panel de Validación.');
        return;
      }

      saveSession(data.data.token, user);
      setButtonSuccess(btn);

      setTimeout(() => {
        window.location.href = 'public/dashboard.html';
      }, 700);

    } else {
      setButtonLoading(btn, false);
      showError(data.message || 'Credenciales inválidas.');
    }
  } catch (err) {
    setButtonLoading(btn, false);
    showError('No se pudo conectar con el servidor. Intenta de nuevo.');
    console.error('[auth] login error:', err);
  }
}

async function handleForgotPassword(e) {
  e.preventDefault();

  const email = document.getElementById('forgot-email').value.trim();
  const btn   = e.target.querySelector('button[type="submit"]');

  setButtonLoading(btn, true);

  try {
    const data = await apiForgotPassword(email);
    showForgotSuccess(data.message || 'Si el correo existe recibirás un enlace de recuperación.');
  } catch {
    showForgotSuccess('Si el correo existe recibirás un enlace de recuperación.');
  } finally {
    setButtonLoading(btn, false);
  }
}

function togglePasswordVisibility() {
  const input = document.getElementById('password');
  const icon  = document.getElementById('toggle-password').querySelector('.material-symbols-outlined');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) icon.textContent = 'visibility_off';
  } else {
    input.type = 'password';
    if (icon) icon.textContent = 'visibility';
  }
}

function openForgotModal() {
  const modal = document.getElementById('modal-forgot');
  if (modal) {
    modal.classList.remove('hidden');
    document.getElementById('forgot-success')?.classList.add('hidden');
    document.getElementById('forgot-email').value = '';
  }
}

function closeForgotModal() {
  document.getElementById('modal-forgot')?.classList.add('hidden');
}

// ── Event Listeners ────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-form')
    ?.addEventListener('submit', handleLogin);

  document.getElementById('toggle-password')
    ?.addEventListener('click', togglePasswordVisibility);

  document.getElementById('forgot-link')
    ?.addEventListener('click', (e) => { e.preventDefault(); openForgotModal(); });

  document.getElementById('forgot-password-form')
    ?.addEventListener('submit', handleForgotPassword);

  document.getElementById('forgot-modal-close')
    ?.addEventListener('click', closeForgotModal);

  document.getElementById('modal-forgot')
    ?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeForgotModal();
    });
});