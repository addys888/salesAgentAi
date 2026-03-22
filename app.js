// ════════════════════════════════════════════════════════
//  APP.JS — Core utilities, custom modals, theme, shortcuts, PWA
// ════════════════════════════════════════════════════════

// ── Custom Confirm / Alert Modal (replaces native alert/confirm) ──
// Returns a Promise — use with await:
//   await appAlert('Done!');
//   var yes = await appConfirm('Are you sure?');

var _confirmResolve = null;

function _showConfirmModal(message, isConfirm, icon) {
  var overlay = document.getElementById('appConfirmOverlay');
  var titleEl = document.getElementById('confirmTitle');
  var msgEl   = document.getElementById('confirmMsg');
  var iconEl  = document.getElementById('confirmIcon');
  var cancelBtn = document.getElementById('confirmCancelBtn');
  var okBtn     = document.getElementById('confirmOkBtn');

  iconEl.textContent = icon || (isConfirm ? '🤔' : 'ℹ️');
  titleEl.textContent = isConfirm ? 'Confirm' : 'Notice';
  msgEl.textContent = message;
  cancelBtn.style.display = isConfirm ? 'inline-flex' : 'none';
  okBtn.textContent = isConfirm ? 'Yes, proceed' : 'OK';
  overlay.classList.add('open');
  okBtn.focus();
}

window.appAlert = function(message, icon) {
  return new Promise(function(resolve) {
    _confirmResolve = function() { resolve(); };
    _showConfirmModal(message, false, icon);
  });
};

window.appConfirm = function(message, icon) {
  return new Promise(function(resolve) {
    _confirmResolve = function(val) { resolve(val); };
    _showConfirmModal(message, true, icon);
  });
};

window.confirmOk = function() {
  document.getElementById('appConfirmOverlay').classList.remove('open');
  if (_confirmResolve) { _confirmResolve(true); _confirmResolve = null; }
};

window.confirmCancel = function() {
  document.getElementById('appConfirmOverlay').classList.remove('open');
  if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
};


// ── Toast Notification ──
function showToast(msg, isError) {
  var t = document.getElementById('appToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'appToast';
    t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:11px 20px;border-radius:30px;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;z-index:99999;transition:opacity .4s;pointer-events:none;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.4)";
    document.body.appendChild(t);
  }
  t.style.background = isError ? 'var(--danger)' : 'var(--green)';
  t.style.color = isError ? '#fff' : '#000';
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.style.opacity = '0'; }, 3500);
}
window.showToast = showToast;


// ── Theme Toggle with localStorage Persistence ──
var isDark = true;

function initTheme() {
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch(e) {}
  if (saved === 'light') {
    isDark = false;
  } else if (saved === 'dark') {
    isDark = true;
  }
  // else default to dark
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  updateThemeButtons();
}

function updateThemeButtons() {
  ['themeBtn', 'adminThemeBtn'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.textContent = isDark ? '🌙' : '☀️';
  });
}

window.toggleTheme = function() {
  isDark = !isDark;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  updateThemeButtons();
  try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch(e) {}
};

// Apply theme immediately (before DOMContentLoaded) to prevent flash
initTheme();


// ── Keyboard Shortcuts ──
// Enter = mark called, → = next, s = skip, Esc = close modal
function initKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    // Don't capture when typing in input/textarea/select
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    // Close custom confirm modal on Escape
    if (e.key === 'Escape') {
      var confirmOverlay = document.getElementById('appConfirmOverlay');
      if (confirmOverlay && confirmOverlay.classList.contains('open')) {
        window.confirmCancel();
        return;
      }
      // Close other modals
      ['tplModal', 'aiModal', 'emailModal', 'resumeModal'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('open');
      });
      return;
    }

    // Only work when dialer panel is visible
    var dialerPanel = document.getElementById('dialerPanel');
    if (!dialerPanel || dialerPanel.style.display === 'none') return;

    // Any modal open? Don't capture
    var anyModalOpen = ['tplModal', 'aiModal', 'emailModal', 'resumeModal', 'appConfirmOverlay'].some(function(id) {
      var el = document.getElementById(id);
      return el && el.classList.contains('open');
    });
    if (anyModalOpen) return;

    if (e.key === 'Enter' && typeof window.markCalled === 'function') {
      e.preventDefault();
      window.markCalled();
    } else if (e.key === 'ArrowRight' && typeof window.nextContact === 'function') {
      e.preventDefault();
      window.nextContact();
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      if (typeof window.skipContact === 'function') window.skipContact();
    }
  });
}


// ── PWA — Dynamic Manifest + Service Worker ──
function initPWA() {
  // Inject manifest dynamically
  var manifest = {
    name: "WhatsApp Sales Dialer",
    short_name: "Sales Dialer",
    description: "Smart calling tool for Indian sales teams",
    start_url: window.location.href,
    display: "standalone",
    background_color: "#0a0f0d",
    theme_color: "#0a0f0d",
    orientation: "portrait",
    icons: [
      { src: "https://img.icons8.com/color/192/whatsapp.png", sizes: "192x192", type: "image/png" },
      { src: "https://img.icons8.com/color/512/whatsapp.png", sizes: "512x512", type: "image/png" }
    ]
  };
  var blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var manifestEl = document.getElementById('pwa-manifest');
  if (manifestEl) manifestEl.setAttribute('href', url);

  // Register Service Worker with dynamic cache version (timestamp)
  if ('serviceWorker' in navigator) {
    var cacheVersion = 'sales-dialer-' + Date.now();
    var swCode = [
      "var CACHE = '" + cacheVersion + "';",
      "var ASSETS = ['/'];",
      "",
      "self.addEventListener('install', function(e) {",
      "  e.waitUntil(caches.open(CACHE).then(function(cache) { return cache.addAll(ASSETS); }));",
      "  self.skipWaiting();",
      "});",
      "",
      "self.addEventListener('activate', function(e) {",
      "  e.waitUntil(caches.keys().then(function(keys) {",
      "    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));",
      "  }));",
      "  self.clients.claim();",
      "});",
      "",
      "self.addEventListener('fetch', function(e) {",
      "  if (e.request.method !== 'GET') return;",
      "  e.respondWith(fetch(e.request).catch(function() { return caches.match(e.request); }));",
      "});"
    ].join('\n');

    var swBlob = new Blob([swCode], { type: 'application/javascript' });
    var swUrl = URL.createObjectURL(swBlob);
    navigator.serviceWorker.register(swUrl, { scope: '/' })
      .then(function(reg) { console.log('SW registered:', reg.scope); })
      .catch(function(e) { console.warn('SW registration failed (non-fatal):', e.message); });
  }

  // Android install prompt
  var deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    var banner = document.createElement('div');
    banner.id = 'installBanner';
    banner.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--green);color:#000;padding:12px 20px;border-radius:30px;font-weight:700;font-size:13px;z-index:9999;cursor:pointer;box-shadow:0 4px 20px rgba(37,211,102,0.4);white-space:nowrap;';
    banner.textContent = '📲 Install App on your Phone';
    banner.onclick = function() {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then(function() { banner.remove(); });
    };
    document.body.appendChild(banner);
    setTimeout(function() { if (banner.parentNode) banner.remove(); }, 8000);
  });
}


// ── Escape-safe text helper (for safe DOM construction) ──
function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
window.escapeHtml = escapeHtml;


// ── Bootstrap on DOMContentLoaded ──
document.addEventListener('DOMContentLoaded', function() {
  initKeyboardShortcuts();
  initPWA();

  // Apply branding config
  if (typeof applyAppConfig === 'function') applyAppConfig();

  // Modal backdrop close for confirm overlay
  var confirmOverlay = document.getElementById('appConfirmOverlay');
  if (confirmOverlay) {
    confirmOverlay.addEventListener('click', function(e) {
      if (e.target === e.currentTarget) window.confirmCancel();
    });
  }
});
