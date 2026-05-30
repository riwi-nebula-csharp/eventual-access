// ─────────────────────────────────────────────
//  scanner.js  —  Eventual Access · Panel de Validación
//  Integración real con Access Service (POST /api/scan)
// ─────────────────────────────────────────────

const ACCESS_BASE_URL = 'https://service.access.nebula.andrescortes.dev';

// ── Helpers de sesión (reutilizados de dashboard-auth) ──
function getScannerToken() {
  return localStorage.getItem('ea_token');
}

// ── API ─────────────────────────────────────────────────
async function apiScan(qrUuid) {
  const token = getScannerToken();
  const res = await fetch(`${ACCESS_BASE_URL}/api/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ qrUuid }),
  });
  return res.json();
}

// ── UI: Badge de estado ─────────────────────────────────

/**
 * Renderiza el badge superior del panel de resultado.
 * Estados: 'valid' | 'denied' | 'fraud' | 'loading'
 */
function renderStatusBadge(state, reason = '') {
  const badge = document.getElementById('scan-status-badge');
  if (!badge) return;

  const configs = {
    valid: {
      wrap:   'bg-emerald-900/20 border-emerald-500/30',
      icon:   'bg-emerald-500',
      symbol: 'check_circle',
      label:  'VÁLIDO',
      sub:    'Acceso permitido',
      labelColor: 'text-emerald-400',
      subColor:   'text-emerald-400/70',
    },
    denied: {
      wrap:   'bg-amber-900/20 border-amber-500/30',
      icon:   'bg-amber-500',
      symbol: 'block',
      label:  'DENEGADO',
      sub:    reason || 'Acceso no permitido',
      labelColor: 'text-amber-400',
      subColor:   'text-amber-400/70',
    },
    fraud: {
      wrap:   'bg-red-900/30 border-red-500/50',
      icon:   'bg-red-600',
      symbol: 'warning',
      label:  '⚠️ ALERTA DE FRAUDE',
      sub:    reason || 'Boleta ya utilizada',
      labelColor: 'text-red-400',
      subColor:   'text-red-400/70',
    },
    loading: {
      wrap:   'bg-surface-container border-outline-variant',
      icon:   'bg-outline-variant',
      symbol: 'hourglass_top',
      label:  'VALIDANDO...',
      sub:    'Consultando servidor',
      labelColor: 'text-on-surface-variant',
      subColor:   'text-on-surface-variant/60',
    },
  };

  const c = configs[state] || configs.denied;

  badge.className = `border rounded-lg p-4 flex items-center gap-4 mb-6 transition-all duration-300 ${c.wrap}`;
  badge.innerHTML = `
    <div class="${c.icon} rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0">
      <span class="material-symbols-outlined text-white" style="font-variation-settings:'FILL' 1;">${c.symbol}</span>
    </div>
    <div class="flex flex-col min-w-0">
      <span class="${c.labelColor} font-bold tracking-widest text-sm">${c.label}</span>
      <span class="${c.subColor} text-xs truncate">${c.sub}</span>
    </div>`;
}

// ── UI: Poblar panel con datos del ticket ───────────────
function populateTicketPanel(data) {
  // Nombre del propietario
  document.getElementById('res-name').innerText = data.ownerName || 'Cliente';

  // Obra
  document.getElementById('res-show').innerText = data.playName || '—';

  // Fecha y hora
  const dateEl = document.getElementById('res-date');
  if (dateEl) {
    dateEl.innerHTML = `${data.performanceDate || '—'} <span class="text-theater-gold mx-1">•</span> ${data.startTime?.slice(0,5) || '—'}`;
  }

  // Email del propietario (campo res-type reutilizado)
  document.getElementById('res-type').innerText = data.ownerEmail || '—';
  const seat = data.seat;
  document.getElementById('res-seat').innerText =
    seat ? `Fila ${seat.row} • Asiento ${seat.number}` : '—';

  // Código QR uuid escaneado (guardado en dataset del trigger)
  const codeEl = document.getElementById('res-code');
  if (codeEl) codeEl.innerText = data._qrUuid || '—';

  // Hora de escaneo
  const scannedAt = data.scannedAt || '';
  const timeDisplay = scannedAt ? scannedAt.split(' ')[1]?.slice(0, 8) || scannedAt : '—';
  document.getElementById('res-time').innerText = timeDisplay;
}

// ── UI: Panel vacío ─────────────────────────────────────
function showEmptyState() {
  document.getElementById('scan-empty-state')?.classList.remove('hidden-section');
  document.getElementById('scan-details')?.classList.add('hidden-section');
}

// ── UI: Panel con resultado ─────────────────────────────
function showScanDetails() {
  document.getElementById('scan-empty-state')?.classList.add('hidden-section');
  const details = document.getElementById('scan-details');
  details?.classList.remove('hidden-section');
  details?.classList.add('fade-in-up');
}

// ── UI: Loading en el panel ─────────────────────────────
function showLoadingState() {
  renderStatusBadge('loading');
  document.getElementById('res-name').innerText = '—';
  document.getElementById('res-show').innerText = '—';
  document.getElementById('res-seat').innerText = '—';
  document.getElementById('res-code').innerText = '—';
  document.getElementById('res-time').innerText = '—';
  const dateEl = document.getElementById('res-date');
  if (dateEl) dateEl.innerText = '—';
  showScanDetails();
}

// ── Lógica principal de escaneo ─────────────────────────

/**
 * Función principal. Llama al endpoint y actualiza la UI.
 * @param {string} qrUuid - UUID del QR escaneado
 */
async function processScan(qrUuid) {
  if (!qrUuid || !qrUuid.trim()) return;

  showLoadingState();

  try {
    const result = await apiScan(qrUuid.trim());

    if (result.success) {
      // ✅ Acceso permitido
      const ticketData = { ...result.data, _qrUuid: qrUuid };
      populateTicketPanel(ticketData);
      renderStatusBadge('valid');

    } else {
      // ❌ Acceso denegado — diferenciar fraude del resto
      const reason = result.data?.reason || result.message || 'Acceso denegado.';
      const isFraud = reason.includes('ALERTA');

      // En caso de denegación no hay datos de ticket, limpiar campos
      document.getElementById('res-name').innerText = '—';
      document.getElementById('res-show').innerText = '—';
      document.getElementById('res-seat').innerText = '—';
      document.getElementById('res-code').innerText = qrUuid;
      const scannedAt = result.data?.scannedAt;
      document.getElementById('res-time').innerText = scannedAt
        ? scannedAt.split(' ')[1]?.slice(0, 8) || scannedAt
        : '—';
      const dateEl = document.getElementById('res-date');
      if (dateEl) dateEl.innerText = '—';

      renderStatusBadge(isFraud ? 'fraud' : 'denied', reason.replace('⚠️ ALERTA: ', ''));
    }

  } catch (err) {
    console.error('[scanner] Error al conectar con Access Service:', err);
    renderStatusBadge('denied', 'No se pudo conectar con el servidor.');
    document.getElementById('res-name').innerText = '—';
    document.getElementById('res-show').innerText = '—';
    document.getElementById('res-seat').innerText = '—';
    document.getElementById('res-code').innerText = qrUuid;
    document.getElementById('res-time').innerText = '—';
    const dateEl = document.getElementById('res-date');
    if (dateEl) dateEl.innerText = '—';
  }

  showScanDetails();
}

// ── Exposición global para el escáner físico/cámara ────
// El escáner (lector QR, cámara, etc.) debe llamar esta función
// con el UUID decodificado del QR:
//   window.onQrScanned('a3f2c1d4-89ab-4e12-b456-426614174000')

window.onQrScanned = function (qrUuid) {
  processScan(qrUuid);
};

// ── Init: conectar con el trigger existente del dashboard ──
document.addEventListener('DOMContentLoaded', () => {
  // El div #simulate-scan sigue funcionando como trigger de prueba
  // pero ahora pide un UUID real por prompt (útil para desarrollo)
  const scanTrigger = document.getElementById('simulate-scan');
  if (scanTrigger) {
    scanTrigger.addEventListener('click', () => {
      scanTrigger.classList.add('ring-4', 'ring-white', 'opacity-50');
      setTimeout(() => scanTrigger.classList.remove('ring-4', 'ring-white', 'opacity-50'), 300);

      const uuid = prompt('UUID del QR escaneado:');
      if (uuid) processScan(uuid);
    });
  }
});
