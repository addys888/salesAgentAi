// ════════════════════════════════════════════════════════
//  AUTH.JS — Configuration, Supabase, Authentication, Admin Panel
// ════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════
//  APP CONFIG — Edit everything here for each client
// ════════════════════════════════════════════════════════
const APP_CONFIG = {
  appName:        'DialKaro',
  appSubtitle:    'Dial Faster · Close Smarter',
  appEmoji:       '☎️',
  landingTitle:   'DialKaro',
  landingTagline: 'Your team\'s calling command centre',
  appMetaDesc:    'DialKaro by CelerApps — India\'s smartest sales dialer for outbound teams',
  userAuthTitle:  'Rep Login',
  userAuthSub:    'Sales Representative Portal · Secure Access',
  adminAuthTitle: 'Manager Console',
  adminAuthSub:   'Authorised Personnel Only',
  adminDashTitle: 'Manager Console',
  adminDashSub:   'Team Oversight · User Controls',
  dialerTitle:    'DialKaro',
  uploadTitle:    'Upload your lead list to begin',
  uploadSubtitle: 'Accepts Excel or CSV · Indian mobile numbers auto-detected',
  sessionDoneTitle: 'Session Done! 🎯',
  footerNote:     '🔒 Powered by CelerApps · Enterprise-grade security · Works on any device',
  userCardTitle:  'Sales Rep',
  userCardDesc:   'Login to your dialer, upload leads and start calling',
  adminCardTitle: 'Manager',
  adminCardDesc:  'Manage your team, track activity and control access',
};

function applyAppConfig() {
  var C = APP_CONFIG;
  document.title = C.appName + ' — Sales Dialer';
  var mapping = {
    landingH1: 'landingTitle', landingTagline: 'landingTagline', landingEmoji: 'appEmoji',
    userCardTitle: 'userCardTitle', userCardDesc: 'userCardDesc',
    adminCardTitle: 'adminCardTitle', adminCardDesc: 'adminCardDesc',
    userAuthTitle: 'userAuthTitle', userAuthSub: 'userAuthSub',
    adminAuthTitle: 'adminAuthTitle', adminAuthSub: 'adminAuthSub',
    adminDashH1: 'adminDashTitle', adminDashSub: 'adminDashSub',
    appHeaderH1: 'dialerTitle', appHeaderSub: 'appSubtitle', appLogoEmoji: 'appEmoji',
    uploadZoneH2: 'uploadTitle', uploadZoneSub: 'uploadSubtitle'
  };
  Object.keys(mapping).forEach(function(elId) {
    var el = document.getElementById(elId);
    if (el) el.textContent = C[mapping[elId]];
  });
  var fn = document.getElementById('footerNote');
  if (fn) fn.textContent = C.footerNote;
}

// ════════════════════════════════════════════════════════
//  SUPABASE + ADMIN CONSTANTS
// ════════════════════════════════════════════════════════
const SUPABASE_URL  = 'https://dxxrcnsfmuqbgaixsbig.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4eHJjbnNmbXVxYmdhaXhzYmlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NzAwMzUsImV4cCI6MjA4ODQ0NjAzNX0.F7CbBP0bG7UgVVR26czCvhl4L9eFCswv99sQ7SG1C10';
const ADMIN_USER    = 'admin';
// ── Hashed credentials (SHA-256) — defaults, overridden by tenant config ──
var ADMIN_HASH      = '4512f5c7a37aa142b97bde9f8b2d8a1382d5118e1e87ffdf035d3bfaeb6b8e29';
var SUPER_HASH      = '18c6a08bbf0b4a16a736238b3fee6d6330c778041f436cf22c2f61e729a81c39';
var MAX_REPS        = 10;
var isSuperAdmin    = false;

// ════════════════════════════════════════════════════════
//  MULTI-TENANT: Current tenant state
// ════════════════════════════════════════════════════════
var currentTenant   = null; // Loaded from tenants table on boot

// ── Admin security: rate limiting & session timeout ──
const ADMIN_MAX_ATTEMPTS   = 5;
const ADMIN_LOCKOUT_MS     = 30000;
const ADMIN_SESSION_TIMEOUT = 30 * 60 * 1000;
var _adminAttempts    = 0;
var _adminLockedUntil = 0;
var _adminSessionTimer = null;

async function sha256(str) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
}

function resetAdminIdleTimer() {
  clearTimeout(_adminSessionTimer);
  _adminSessionTimer = setTimeout(function(){
    if(isAdminSession) {
      isAdminSession = false;
      isSuperAdmin = false;
      document.getElementById('adminPanel').style.display = 'none';
      document.getElementById('landingScreen').style.display = 'flex';
      showToast('🔒 Admin session timed out (30 min idle)', true);
    }
  }, ADMIN_SESSION_TIMEOUT);
}

// ════════════════════════════════════════════════════════
//  SUPABASE INIT
// ════════════════════════════════════════════════════════
var _sb = null;

function initSupabase() {
  try {
    var lib = (window.supabase && typeof window.supabase.createClient === 'function') ? window.supabase
            : (window.Supabase && typeof window.Supabase.createClient === 'function') ? window.Supabase
            : null;
    if (lib) {
      _sb = lib.createClient(SUPABASE_URL, SUPABASE_ANON);
      console.log('Supabase ready:', !!_sb);
    } else {
      console.error('Supabase lib not found.');
      document.getElementById('configBanner').style.display = 'block';
    }
  } catch(e) {
    console.error('Supabase init error:', e);
    document.getElementById('configBanner').style.display = 'block';
  }
}

initSupabase();

function getSB() {
  if (!_sb) initSupabase();
  return _sb;
}

// ════════════════════════════════════════════════════════
//  MULTI-TENANT: Load tenant config from hostname
// ════════════════════════════════════════════════════════
async function loadTenantConfig() {
  if(!_sb) return;
  try {
    var hostname = window.location.hostname;
    // For localhost and GitHub Pages, use the default 'dialkaro' tenant
    var isLocal = (hostname === 'localhost' || hostname === '127.0.0.1');
    var isGitHub = hostname.endsWith('.github.io');

    var res;
    if(isLocal || isGitHub) {
      // Load default tenant for dev/demo
      res = await _sb.from('tenants')
        .select('*')
        .eq('slug', 'dialkaro')
        .eq('is_active', true)
        .single();
    } else {
      // Production: match by hostname
      res = await _sb.from('tenants')
        .select('*')
        .eq('hostname', hostname)
        .eq('is_active', true)
        .single();
      if(res.error || !res.data) {
        // Fallback: try slug from first part of hostname (e.g. 'dialkaro' from 'dialkaro.celerapps.com')
        var slugGuess = hostname.split('.')[0];
        var res2 = await _sb.from('tenants')
          .select('*')
          .eq('slug', slugGuess)
          .eq('is_active', true)
          .single();
        if(!res2.error && res2.data) {
          res = res2;
        }
      }
    }

    if(!res || res.error || !res.data) {
      console.log('[Tenant] No tenant found for', hostname, '— using defaults');
      return;
    }

    currentTenant = res.data;
    // Apply tenant overrides
    ADMIN_HASH = res.data.admin_hash || ADMIN_HASH;
    SUPER_HASH = res.data.super_hash || SUPER_HASH;
    MAX_REPS   = res.data.max_reps || MAX_REPS;
    // Apply branding
    if(res.data.app_name) {
      APP_CONFIG.appName = res.data.app_name;
      APP_CONFIG.dialerTitle = res.data.app_name;
      APP_CONFIG.adminDashTitle = res.data.app_name + ' Console';
    }
    if(res.data.app_subtitle)   APP_CONFIG.appSubtitle = res.data.app_subtitle;
    if(res.data.app_emoji)      APP_CONFIG.appEmoji = res.data.app_emoji;
    if(res.data.landing_title)  APP_CONFIG.landingTitle = res.data.landing_title;
    if(res.data.landing_tagline) APP_CONFIG.landingTagline = res.data.landing_tagline;
    applyAppConfig();
    console.log('[Tenant] Loaded:', res.data.app_name, '(' + res.data.slug + ')');
  } catch(e) {
    // tenants table may not exist yet — gracefully fall back
    console.warn('[Tenant] Config load skipped:', e.message);
  }
}

// ════════════════════════════════════════════════════════
//  TENANT SUBSCRIPTION CHECK
// ════════════════════════════════════════════════════════
function checkTenantSubscription(tenant) {
  if(!tenant || !tenant.subscription_end) return { blocked: false, warning: false, daysLeft: null };
  var now = new Date(); now.setHours(0,0,0,0);
  var subEnd = new Date(tenant.subscription_end); subEnd.setHours(0,0,0,0);
  var diff = Math.ceil((subEnd - now) / 86400000);
  if(diff <= 0) {
    return {
      blocked: true, warning: false, daysLeft: diff,
      message: 'Your organisation\'s subscription expired on ' + subEnd.toLocaleDateString('en-IN', {day:'numeric',month:'long',year:'numeric'}) + '. Please contact your administrator to renew.'
    };
  }
  if(diff <= 7) {
    return {
      blocked: false, warning: true, daysLeft: diff,
      message: 'Your subscription expires in ' + diff + ' day' + (diff === 1 ? '' : 's') + '. Please renew to avoid interruption.'
    };
  }
  return { blocked: false, warning: false, daysLeft: diff };
}

function showSubWarningBanner(message) {
  var existing = document.getElementById('tenantSubBanner');
  if(existing) existing.remove();
  var banner = document.createElement('div');
  banner.id = 'tenantSubBanner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;padding:10px 16px;font-size:12px;font-weight:600;text-align:center;font-family:Inter,sans-serif;';
  banner.style.background = 'linear-gradient(135deg,rgba(255,171,64,.95),rgba(255,140,0,.95))';
  banner.style.color = '#1a1a1a';
  banner.innerHTML = '⚠️ ' + message + ' <a href="mailto:support@celerapps.com" style="color:#1a1a1a;text-decoration:underline;font-weight:800;margin-left:8px">Contact Support</a>' +
    '<span onclick="this.parentElement.remove()" style="position:absolute;right:12px;top:8px;cursor:pointer;font-size:16px;opacity:.6">✕</span>';
  document.body.prepend(banner);
}

function showSubBlockedOverlay(message) {
  var existing = document.getElementById('tenantSubBlocked');
  if(existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.id = 'tenantSubBlocked';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif;';
  overlay.innerHTML = '<div style="text-align:center;max-width:400px;padding:40px">' +
    '<div style="font-size:64px;margin-bottom:20px">🔒</div>' +
    '<h2 style="color:var(--danger,#ff5252);font-size:22px;margin-bottom:12px">Subscription Expired</h2>' +
    '<p style="color:rgba(255,255,255,.7);font-size:14px;line-height:1.6;margin-bottom:24px">' + message + '</p>' +
    '<a href="mailto:support@celerapps.com" style="display:inline-block;background:rgba(255,171,64,.2);color:#ffab40;border:1px solid rgba(255,171,64,.4);padding:12px 28px;border-radius:10px;font-weight:700;font-size:13px;text-decoration:none">📧 Contact CelerApps Support</a>' +
    '<br><button onclick="location.reload()" style="margin-top:16px;background:none;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.5);padding:8px 20px;border-radius:8px;cursor:pointer;font-size:11px;font-family:Inter,sans-serif">← Back to Login</button>' +
    '</div>';
  document.body.appendChild(overlay);
}

// ════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════
var currentUser = null;
var isAdminSession = false;
var contacts = [], currentIndex = 0, calledCount = 0, skippedCount = 0;
var jumpReturnIndex = -1;
var hasCalledCurrent = false, currentOutcome = '';
var otpEmail = '', otpTimerInterval = null, otpSeconds = 30;

// ════════════════════════════════════════════════════════
//  SESSION CHECK ON LOAD
// ════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async function() {
  if (!_sb) initSupabase();
  if (!_sb) { document.getElementById('configBanner').style.display='block'; return; }

  // ── Multi-tenant: Load tenant config from hostname ──
  await loadTenantConfig();

  var hash = window.location.hash;
  if(hash && hash.includes('type=recovery')) {
    var hashParams = {};
    hash.replace('#','').split('&').forEach(function(pair){
      var kv = pair.split('=');
      hashParams[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]||'');
    });
    if(hashParams['error']) {
      await appAlert('❌ This password reset link has expired. Please ask your admin to send a new one.', '⏰');
      window.location.hash = '';
    } else {
      var overlay = document.getElementById('resetPwOverlay');
      overlay.style.display = 'flex';
      history.replaceState(null, '', window.location.pathname);
    }
    return;
  }

  await loadMaxReps();

  try {
    var sessionRes = await _sb.auth.getSession();
    if (sessionRes.data && sessionRes.data.session && sessionRes.data.session.user) {
      currentUser = sessionRes.data.session.user;
      try {
        var profRes = await _sb.from('user_profiles')
          .select('status, subscription_end, tenant_id')
          .eq('id', currentUser.id)
          .single();
        if(!profRes.error && profRes.data) {
          var p = profRes.data;
          if(p.status === 'suspended') {
            await _sb.auth.signOut();
            currentUser = null;
            return;
          }
          if(p.subscription_end) {
            var n = new Date(); n.setHours(0,0,0,0);
            var se = new Date(p.subscription_end); se.setHours(0,0,0,0);
            if(se < n) {
              try { await _sb.from('user_profiles').update({ status: 'suspended' }).eq('id', currentUser.id); } catch(e){}
              await _sb.auth.signOut();
              currentUser = null;
              return;
            }
          }
          // C-3 FIX: Check tenant-level subscription on auto-login
          if(p.tenant_id) {
            try {
              var tenRes = await _sb.from('tenants').select('subscription_end, is_active').eq('id', p.tenant_id).single();
              if(!tenRes.error && tenRes.data) {
                if(!tenRes.data.is_active) {
                  await _sb.auth.signOut();
                  currentUser = null;
                  return;
                }
                var tSubCheck = checkTenantSubscription(tenRes.data);
                if(tSubCheck.blocked) {
                  await _sb.auth.signOut();
                  currentUser = null;
                  return;
                }
              }
            } catch(te) { console.warn('Tenant sub check (non-fatal):', te); }
          }
        }
      } catch(pe) { console.warn('Session status check (non-fatal):', pe); }
      enterApp();
    }
  } catch(e) { console.warn('Session check error:', e); }

  // Wire file upload events
  var uz = document.getElementById('uploadZone');
  var fi = document.getElementById('fileInput');
  uz.addEventListener('dragover', function(e){ e.preventDefault(); uz.classList.add('drag-over'); });
  uz.addEventListener('dragleave', function(){ uz.classList.remove('drag-over'); });
  uz.addEventListener('drop', function(e){ e.preventDefault(); uz.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); });
  uz.addEventListener('click', function(e){ if(e.target.tagName !== 'BUTTON') fi.click(); });
  fi.addEventListener('change', function(e){ handleFile(e.target.files[0]); });

  // International number toggle
  var intlCb = document.getElementById('intlToggle');
  if(intlCb) {
    intlCb.addEventListener('change', function() {
      try {
        var slider = document.getElementById('intlSlider');
        var label = document.getElementById('intlLabel');
        var track = document.getElementById('intlTrack');
        if(this.checked) {
          if(slider) slider.style.transform = 'translateX(18px)';
          if(track) track.style.background = 'var(--green)';
          if(label) { label.textContent = 'All countries'; label.style.color = 'var(--green)'; }
        } else {
          if(slider) slider.style.transform = '';
          if(track) track.style.background = 'var(--border2)';
          if(label) { label.textContent = 'India only'; label.style.color = 'var(--muted)'; }
        }
      } catch(e) { console.warn('Toggle style error:', e); }
    });
  }

  // Modal backdrop close
  ['tplModal','aiModal'].forEach(function(id){
    document.getElementById(id).addEventListener('click', function(e){ if(e.target===e.currentTarget) e.target.classList.remove('open'); });
  });
});

// ════════════════════════════════════════════════════════
//  NAVIGATION FUNCTIONS
// ════════════════════════════════════════════════════════
window.showUserAuth = function() {
  document.getElementById('landingScreen').style.display = 'none';
  document.getElementById('userAuthScreen').classList.add('visible');
};

window.showAdminAuth = function() {
  document.getElementById('landingScreen').style.display = 'none';
  document.getElementById('adminAuthScreen').classList.add('visible');
};

window.backToLanding = function() {
  document.getElementById('userAuthScreen').classList.remove('visible');
  document.getElementById('adminAuthScreen').classList.remove('visible');
  document.getElementById('landingScreen').style.display = 'flex';
  clearMsgs();
};

function clearMsgs() {
  ['loginMsg','registerMsg','otpMsg','adminMsg'].forEach(function(id){
    var el = document.getElementById(id);
    if(el){ el.textContent=''; el.className='auth-msg'; }
  });
}

function showMsg(id, text, type) {
  type = type || 'error';
  var el = document.getElementById(id);
  if(!el) return;
  el.textContent = text;
  el.className = 'auth-msg ' + type;
}

window.switchTab = function(tab) {
  document.getElementById('loginForm').style.display = tab==='login' ? 'block' : 'none';
  document.getElementById('registerForm').style.display = tab==='register' ? 'block' : 'none';
  document.getElementById('tabLogin').className = 'auth-tab' + (tab==='login' ? ' active' : '');
  document.getElementById('tabRegister').className = 'auth-tab' + (tab==='register' ? ' active' : '');
  clearMsgs();
};

window.togglePw = function(id, eye) {
  var inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  eye.textContent = inp.type === 'password' ? '👁' : '🙈';
};

window.checkStrength = function(inp) {
  var v = inp.value, score = 0;
  if(v.length >= 8) score++;
  if(/[A-Z]/.test(v)) score++;
  if(/[0-9]/.test(v)) score++;
  if(/[^A-Za-z0-9]/.test(v)) score++;
  var colors = ['var(--danger)','var(--warn)','#ffeb3b','var(--accent)'];
  var fill = document.getElementById('strengthFill');
  fill.style.width = (score * 25) + '%';
  fill.style.background = colors[score-1] || 'transparent';
};

// ════════════════════════════════════════════════════════
//  USER REGISTER
// ════════════════════════════════════════════════════════
window.userRegister = async function() {
  var name  = document.getElementById('regName').value.trim();
  var email = document.getElementById('regEmail').value.trim();
  var phone = document.getElementById('regPhone').value.trim();
  var pass  = document.getElementById('regPassword').value;
  var teamCode = (document.getElementById('regTeamCode').value || '').trim().toUpperCase();
  if(!name)  return showMsg('registerMsg','❌ Please enter your full name');
  if(!email) return showMsg('registerMsg','❌ Please enter your email');
  if(!phone || !/^[6-9]\d{9}$/.test(phone)) return showMsg('registerMsg','❌ Enter a valid 10-digit Indian mobile number');
  if(pass.length < 8) return showMsg('registerMsg','❌ Password must be at least 8 characters');
  if(!teamCode) return showMsg('registerMsg','❌ Please enter your Team Code (ask your manager)');
  var btn = document.getElementById('registerBtn');
  btn.disabled = true; btn.textContent = '⏳ Verifying team...';
  try {
    var sb = _sb;
    if(!sb) throw new Error('Auth service not ready. Please refresh and try again.');

    // Validate team code and switch to correct tenant
    try {
      var tcRes = await sb.from('tenants')
        .select('*')
        .eq('team_code', teamCode)
        .eq('is_active', true)
        .single();
      if(tcRes.error || !tcRes.data) {
        showMsg('registerMsg','❌ Invalid Team Code. Please check with your manager and try again.');
        btn.disabled = false; btn.textContent = 'Create Account →';
        return;
      }
      // Switch to the matched tenant
      currentTenant = tcRes.data;
      ADMIN_HASH = tcRes.data.admin_hash || ADMIN_HASH;
      SUPER_HASH = tcRes.data.super_hash || SUPER_HASH;
      MAX_REPS = tcRes.data.max_reps || MAX_REPS;
      // Apply tenant branding immediately
      if(tcRes.data.app_name) {
        APP_CONFIG.appName = tcRes.data.app_name;
        APP_CONFIG.dialerTitle = tcRes.data.app_name;
        APP_CONFIG.adminDashTitle = tcRes.data.app_name + ' Console';
      }
      if(tcRes.data.app_subtitle)   APP_CONFIG.appSubtitle = tcRes.data.app_subtitle;
      if(tcRes.data.app_emoji)      APP_CONFIG.appEmoji = tcRes.data.app_emoji;
      if(tcRes.data.landing_title)  APP_CONFIG.landingTitle = tcRes.data.landing_title;
      if(tcRes.data.landing_tagline) APP_CONFIG.landingTagline = tcRes.data.landing_tagline;
      applyAppConfig();

      // Block registration if tenant subscription expired
      var subCheck = checkTenantSubscription(tcRes.data);
      if(subCheck.blocked) {
        showMsg('registerMsg','🔒 Registration is closed — your organisation\'s subscription has expired. Contact your administrator.');
        btn.disabled = false; btn.textContent = 'Create Account →';
        return;
      }
    } catch(tcErr) {
      showMsg('registerMsg','❌ Team verification failed. Please try again.');
      btn.disabled = false; btn.textContent = 'Create Account →';
      return;
    }

    btn.textContent = '⏳ Creating...';
    await loadMaxReps();

    var slotCheckPassed = false;
    try {
      var countQuery = sb.from('user_profiles').select('id', { count: 'exact', head: true });
      if(currentTenant) countQuery = countQuery.eq('tenant_id', currentTenant.id);
      var countRes = await countQuery;
      if(countRes.error) {
        showMsg('registerMsg','❌ Unable to verify registration slots. Please try again in a moment or contact your administrator.');
        btn.disabled = false; btn.textContent = 'Create Account →';
        return;
      }
      var currentCount = countRes.count || 0;
      if(currentCount >= MAX_REPS) {
        showMsg('registerMsg','❌ Registration is closed. This team has reached its maximum of ' + MAX_REPS + ' rep' + (MAX_REPS === 1 ? '' : 's') + '. Please contact your administrator to add more seats.');
        btn.disabled = false; btn.textContent = 'Create Account →';
        return;
      }
      slotCheckPassed = true;
    } catch(ce) {
      console.error('Slot count check failed:', ce.message);
      showMsg('registerMsg','❌ Registration check failed. Please refresh and try again, or contact your administrator.');
      btn.disabled = false; btn.textContent = 'Create Account →';
      return;
    }

    var res = await sb.auth.signUp({
      email: email,
      password: pass,
      options: { data: { full_name: name, phone_number: phone, status: 'active' } }
    });

    if(res.error && res.error.message && res.error.message.toLowerCase().includes('already')) {
      showMsg('registerMsg','❌ Email already registered. Please login instead.');
      btn.disabled = false; btn.textContent = 'Create Account →';
      return;
    }

    if(res.error && res.error.status === 500) {
      var tryLogin = await sb.auth.signInWithPassword({ email: email, password: pass });
      if(!tryLogin.error) {
        currentUser = tryLogin.data.user;
        try {
          await sb.from('user_profiles').upsert({
            id: currentUser.id, full_name: name, email: email,
            phone_number: phone, status: 'active',
            tenant_id: currentTenant ? currentTenant.id : null
          }, { onConflict: 'id' });
        } catch(pe) { console.warn('profile upsert:', pe); }
        showMsg('registerMsg','✅ Account created! Entering app...','success');
        setTimeout(function(){ enterApp(); }, 800);
        return;
      }
      throw res.error;
    }

    if(res.error) throw res.error;

    var user = res.data && res.data.user;
    var session = res.data && res.data.session;

    if(session) {
      currentUser = user;
      try {
        await sb.from('user_profiles').upsert({
          id: user.id, full_name: name, email: email,
          phone_number: phone, status: 'active',
          tenant_id: currentTenant ? currentTenant.id : null
        }, { onConflict: 'id' });
      } catch(pe) { console.warn('profile upsert:', pe); }
      showMsg('registerMsg','✅ Account created! Entering app...','success');
      setTimeout(function(){ enterApp(); }, 800);
    } else {
      // Email confirmation might be on — try auto-login first
      if(user) {
        try {
          await sb.from('user_profiles').upsert({
            id: user.id, full_name: name, email: email,
            phone_number: phone, status: 'active',
            tenant_id: currentTenant ? currentTenant.id : null
          }, { onConflict: 'id' });
        } catch(pe) {}
      }
      // Attempt immediate login (works when email confirmation is OFF)
      try {
        var autoLogin = await sb.auth.signInWithPassword({ email: email, password: pass });
        if(!autoLogin.error && autoLogin.data && autoLogin.data.user) {
          currentUser = autoLogin.data.user;
          showMsg('registerMsg','✅ Account created! Entering app...','success');
          setTimeout(function(){ enterApp(); }, 800);
          return;
        }
      } catch(al) {}
      // If auto-login failed, email confirmation is probably still on
      showMsg('registerMsg','✅ Account created! Your admin will activate your account shortly.','success');
      setTimeout(function(){ switchTab('login'); }, 3000);
    }

  } catch(e) {
    var msg = e.message || 'Registration failed';
    showMsg('registerMsg','❌ ' + msg);
  }
  btn.disabled = false; btn.textContent = 'Create Account →';
};

// ════════════════════════════════════════════════════════
//  USER LOGIN
// ════════════════════════════════════════════════════════
window.userLogin = async function() {
  var email = document.getElementById('loginEmail').value.trim();
  var pass  = document.getElementById('loginPassword').value;
  if(!email || !pass) return showMsg('loginMsg','❌ Please enter email and password');
  var btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = '⏳ Logging in...';
  try {
    var sb = _sb;
    if(!sb) throw new Error('Auth service not ready. Please refresh.');
    var res = await sb.auth.signInWithPassword({ email: email, password: pass });
    if(res.error) throw res.error;
    currentUser = res.data.user;

    try {
      var profileCheck = await sb.from('user_profiles')
        .select('status, full_name, subscription_end')
        .eq('id', currentUser.id)
        .single();

      if(!profileCheck.error && profileCheck.data) {
        var prof = profileCheck.data;
        if(prof.status === 'suspended') {
          await sb.auth.signOut();
          currentUser = null;
          showMsg('loginMsg','❌ Your account has been suspended. Please contact your administrator.');
          btn.disabled = false; btn.textContent = 'Login →';
          return;
        }
        if(prof.subscription_end) {
          var now = new Date(); now.setHours(0,0,0,0);
          var subEnd = new Date(prof.subscription_end); subEnd.setHours(0,0,0,0);
          if(subEnd < now) {
            try { await sb.from('user_profiles').update({ status: 'suspended' }).eq('id', currentUser.id); } catch(e){}
            await sb.auth.signOut();
            currentUser = null;
            showMsg('loginMsg','❌ Your subscription expired on ' + subEnd.toLocaleDateString('en-IN') + '. Please contact your administrator to renew.');
            btn.disabled = false; btn.textContent = 'Login →';
            return;
          }
        }
      }
    } catch(pe) { console.warn('Profile check on login (non-fatal):', pe); }

    // Check tenant-level subscription (blocks entire org)
    if(currentTenant && currentTenant.subscription_end) {
      var tSubCheck = checkTenantSubscription(currentTenant);
      if(tSubCheck.blocked) {
        await sb.auth.signOut();
        currentUser = null;
        showMsg('loginMsg','🔒 ' + tSubCheck.message);
        btn.disabled = false; btn.textContent = 'Login →';
        return;
      }
    }

    showMsg('loginMsg','✅ Welcome back! Loading...','success');
    setTimeout(function(){ enterApp(); }, 600);
  } catch(e) {
    var msg = e.message || '';
    if(msg === 'Invalid login credentials') msg = 'Wrong email or password. Please try again.';
    else if(msg.includes('Email not confirmed')) msg = '📧 Please check your email and click the confirmation link first, then login here.';
    else if(msg.includes('disabled') || msg.includes('not enabled')) msg = 'Login is currently disabled. Please contact your admin.';
    showMsg('loginMsg','❌ ' + msg);
  }
  btn.disabled = false; btn.textContent = 'Login →';
};

// ════════════════════════════════════════════════════════
//  OTP
// ════════════════════════════════════════════════════════
function getOTPValue() {
  return [0,1,2,3,4,5].map(function(i){ return document.getElementById('otp'+i).value; }).join('');
}

window.verifyOTP = async function() {
  var token = getOTPValue();
  if(token.length !== 6) return showMsg('otpMsg','❌ Enter all 6 digits');
  var btn = document.getElementById('verifyBtn');
  btn.disabled = true; btn.textContent = '⏳ Verifying...';
  try {
    var sb = _sb;
    var res = await sb.auth.verifyOtp({ email: otpEmail, token: token, type: 'email' });
    if(res.error) throw res.error;
    currentUser = res.data.user;
    clearOTPTimer();
    enterApp();
  } catch(e) {
    showMsg('otpMsg','❌ Invalid or expired OTP. Please try again.');
  }
  btn.disabled = false; btn.textContent = 'Verify & Login →';
};

window.resendOTP = async function() {
  document.getElementById('resendBtn').disabled = true;
  try {
    var sb = _sb;
    await sb.auth.signInWithOtp({ email: otpEmail, options: { shouldCreateUser: false } });
    showMsg('otpMsg','📬 New OTP sent!','success');
    startOTPTimer();
  } catch(e) { showMsg('otpMsg','❌ Failed to resend. Try again.'); }
};

function startOTPTimer() {
  clearOTPTimer();
  otpSeconds = 30;
  document.getElementById('resendBtn').disabled = true;
  document.getElementById('otpTimer').textContent = 'Resend in 30s';
  otpTimerInterval = setInterval(function(){
    otpSeconds--;
    if(otpSeconds <= 0){
      clearOTPTimer();
      document.getElementById('resendBtn').disabled = false;
      document.getElementById('otpTimer').textContent = '';
    } else {
      document.getElementById('otpTimer').textContent = 'Resend in ' + otpSeconds + 's';
    }
  }, 1000);
}
function clearOTPTimer() { if(otpTimerInterval){ clearInterval(otpTimerInterval); otpTimerInterval=null; } }

window.otpMove = function(el, idx) {
  el.value = el.value.replace(/\D/g,'').slice(-1);
  if(el.value && idx < 5) document.getElementById('otp'+(idx+1)).focus();
  if(getOTPValue().length === 6) window.verifyOTP();
};

// ════════════════════════════════════════════════════════
//  ENTER APP
// ════════════════════════════════════════════════════════
function enterApp() {
  var meta = (currentUser && currentUser.user_metadata) || {};
  var name = meta.full_name || (currentUser && currentUser.email && currentUser.email.split('@')[0]) || 'User';
  document.getElementById('userChipName').textContent = name.split(' ')[0];
  document.getElementById('userAvatarSm').textContent = name[0].toUpperCase();
  document.getElementById('userAuthScreen').classList.remove('visible');
  document.getElementById('landingScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'block';
  checkSubscription();
  // Load correct tenant branding for this user
  loadUserTenant();
  setTimeout(function(){ checkForActiveSession(); }, 800);
  setTimeout(function(){ if(typeof checkTodayCallbacks === 'function') checkTodayCallbacks(); }, 1200);
}

// Load tenant branding based on logged-in user's tenant_id
async function loadUserTenant() {
  if(!_sb || !currentUser) return;
  try {
    var profRes = await _sb.from('user_profiles')
      .select('tenant_id')
      .eq('id', currentUser.id)
      .single();
    if(profRes.error || !profRes.data || !profRes.data.tenant_id) return;
    // If we already have the right tenant loaded, skip
    if(currentTenant && currentTenant.id === profRes.data.tenant_id) return;
    // Load the tenant
    var tenRes = await _sb.from('tenants')
      .select('*')
      .eq('id', profRes.data.tenant_id)
      .single();
    if(tenRes.error || !tenRes.data) return;
    currentTenant = tenRes.data;
    ADMIN_HASH = tenRes.data.admin_hash || ADMIN_HASH;
    SUPER_HASH = tenRes.data.super_hash || SUPER_HASH;
    MAX_REPS = tenRes.data.max_reps || MAX_REPS;
    if(tenRes.data.app_name) {
      APP_CONFIG.appName = tenRes.data.app_name;
      APP_CONFIG.dialerTitle = tenRes.data.app_name;
      APP_CONFIG.adminDashTitle = tenRes.data.app_name + ' Console';
    }
    if(tenRes.data.app_subtitle)   APP_CONFIG.appSubtitle = tenRes.data.app_subtitle;
    if(tenRes.data.app_emoji)      APP_CONFIG.appEmoji = tenRes.data.app_emoji;
    if(tenRes.data.landing_title)  APP_CONFIG.landingTitle = tenRes.data.landing_title;
    if(tenRes.data.landing_tagline) APP_CONFIG.landingTagline = tenRes.data.landing_tagline;
    applyAppConfig();

    // Check tenant subscription for reps
    var subCheck = checkTenantSubscription(tenRes.data);
    if(subCheck.blocked) {
      showSubBlockedOverlay(subCheck.message);
      return;
    }
    if(subCheck.warning) showSubWarningBanner(subCheck.message);

  } catch(e) { console.warn('[Tenant] User tenant load:', e.message); }
}

// ════════════════════════════════════════════════════════
//  SUBSCRIPTION CHECK
// ════════════════════════════════════════════════════════
async function checkSubscription() {
  if(!currentUser || !_sb) return;
  if(isAdminSession) {
    document.getElementById('subBadge').style.display = 'none';
    return;
  }
  try {
    var res = await _sb.from('user_profiles').select('subscription_end, status').eq('id', currentUser.id).single();
    if(res.error) return;
    var profile = res.data;

    if(profile && profile.status === 'suspended') {
      showExpiredOverlay('Your account has been suspended by the administrator.');
      return;
    }

    var subEnd = profile && profile.subscription_end ? new Date(profile.subscription_end) : null;
    if(!subEnd) {
      document.getElementById('subBadge').style.display = 'none';
      return;
    }

    var now = new Date();
    now.setHours(0,0,0,0);
    subEnd.setHours(0,0,0,0);
    var daysLeft = Math.round((subEnd - now) / (1000 * 60 * 60 * 24));

    if(daysLeft < 0) {
      try { await _sb.from('user_profiles').update({ status: 'suspended' }).eq('id', currentUser.id); } catch(e){}
      showExpiredOverlay('Your subscription expired on ' + subEnd.toLocaleDateString('en-IN') + '.');
      return;
    }

    renderSubBadge(daysLeft, subEnd);

    // Re-check every hour — clear previous interval first
    clearInterval(window._subTimer);
    window._subTimer = setInterval(function(){ checkSubscription(); }, 3600000);

  } catch(e) { console.warn('Subscription check (non-fatal):', e.message); }
}

function renderSubBadge(daysLeft, subEnd) {
  var badge = document.getElementById('subBadge');
  badge.style.display = 'inline-flex';
  var cls, icon, label;
  if(daysLeft === 0)       { cls='critical'; icon='⚠️'; label='Expires Today!'; }
  else if(daysLeft <= 7)   { cls='critical'; icon='🔴'; label=daysLeft+'d left'; }
  else if(daysLeft <= 30)  { cls='warn';     icon='🟡'; label=daysLeft+'d left'; }
  else                     { cls='safe';     icon='🟢'; label=daysLeft+'d left'; }
  badge.className = 'sub-badge ' + cls;
  // Safe DOM — no innerHTML with user data
  badge.textContent = '';
  badge.append(icon + ' ' + label);
  badge.title = 'Subscription valid until ' + subEnd.toLocaleDateString('en-IN', {day:'numeric',month:'long',year:'numeric'});
}

function showExpiredOverlay(reason) {
  document.getElementById('appContainer').style.display = 'none';
  var overlay = document.getElementById('expiredOverlay');
  if(reason) {
    var p = overlay.querySelector('p');
    if(p) p.textContent = reason;
  }
  overlay.classList.add('show');
}

// ════════════════════════════════════════════════════════
//  ADMIN LOGIN (async — SHA-256 hash comparison + rate limiting)
// ════════════════════════════════════════════════════════
window.adminLogin = async function() {
  var u = document.getElementById('adminUser').value.trim();
  var p = document.getElementById('adminPass').value;

  if(Date.now() < _adminLockedUntil) {
    var secsLeft = Math.ceil((_adminLockedUntil - Date.now()) / 1000);
    showMsg('adminMsg','🔒 Too many failed attempts. Try again in ' + secsLeft + 's');
    return;
  }

  if(!u || !p) {
    showMsg('adminMsg','❌ Please enter username and password');
    return;
  }

  var btn = document.querySelector('#adminAuthScreen .auth-btn');
  if(btn) { btn.disabled = true; btn.textContent = '⏳ Verifying...'; }

  try {
    var hash = await sha256(p);
    // Multi-tenant: match against current tenant's hashes
    var validAdmin = (u === ADMIN_USER && hash === ADMIN_HASH);
    var validSuper = (u === ADMIN_USER && hash === SUPER_HASH);

    // If no tenant loaded yet, try to find tenant by admin_hash match
    if(!validAdmin && !validSuper && _sb) {
      try {
        var tenantRes = await _sb.from('tenants')
          .select('*')
          .or('admin_hash.eq.' + hash + ',super_hash.eq.' + hash)
          .single();
        if(!tenantRes.error && tenantRes.data) {
          currentTenant = tenantRes.data;
          ADMIN_HASH = tenantRes.data.admin_hash;
          SUPER_HASH = tenantRes.data.super_hash;
          MAX_REPS = tenantRes.data.max_reps || 10;
          validAdmin = (hash === ADMIN_HASH);
          validSuper = (hash === SUPER_HASH);
          // Apply tenant branding
          APP_CONFIG.appName = tenantRes.data.app_name || APP_CONFIG.appName;
          APP_CONFIG.appSubtitle = tenantRes.data.app_subtitle || APP_CONFIG.appSubtitle;
          APP_CONFIG.appEmoji = tenantRes.data.app_emoji || APP_CONFIG.appEmoji;
          APP_CONFIG.landingTitle = tenantRes.data.landing_title || APP_CONFIG.landingTitle;
          APP_CONFIG.landingTagline = tenantRes.data.landing_tagline || APP_CONFIG.landingTagline;
          applyAppConfig();
        }
      } catch(te) { console.warn('Tenant lookup:', te.message); }
    }

    if(validAdmin || validSuper) {
      // Check tenant subscription before allowing access
      var subCheck = checkTenantSubscription(currentTenant);
      if(subCheck.blocked) {
        showMsg('adminMsg','🔒 ' + subCheck.message);
        return;
      }
      _adminAttempts = 0;
      isAdminSession = true;
      isSuperAdmin = validSuper;
      document.getElementById('adminAuthScreen').classList.remove('visible');
      document.getElementById('adminPanel').style.display = 'block';
      if(subCheck.warning) showSubWarningBanner(subCheck.message);
      var badge = document.getElementById('superAdminBadge');
      if(badge) badge.style.display = isSuperAdmin ? 'inline-flex' : 'none';
      resetAdminIdleTimer();
      document.getElementById('adminPanel').addEventListener('click', resetAdminIdleTimer);
      document.getElementById('adminPanel').addEventListener('keydown', resetAdminIdleTimer);
      // Default to users tab
      switchAdminTab('users');
      loadMaxReps().then(function(){ window.loadUsers(); });
    } else {
      _adminAttempts++;
      var remaining = ADMIN_MAX_ATTEMPTS - _adminAttempts;
      if(_adminAttempts >= ADMIN_MAX_ATTEMPTS) {
        _adminLockedUntil = Date.now() + ADMIN_LOCKOUT_MS;
        _adminAttempts = 0;
        showMsg('adminMsg','🔒 Too many failed attempts. Locked for 30 seconds.');
      } else {
        showMsg('adminMsg','❌ Invalid credentials. ' + remaining + ' attempt' + (remaining !== 1 ? 's' : '') + ' remaining.');
      }
      document.getElementById('adminPass').value = '';
    }
  } catch(e) {
    showMsg('adminMsg','❌ Authentication error: ' + e.message);
  }

  if(btn) { btn.disabled = false; btn.textContent = 'Access Admin Panel →'; }
};

window.adminLogout = function() {
  isAdminSession = false;
  isSuperAdmin = false;
  clearTimeout(_adminSessionTimer);
  clearInterval(window._subTimer); // Clear subscription timer
  var panel = document.getElementById('adminPanel');
  panel.removeEventListener('click', resetAdminIdleTimer);
  panel.removeEventListener('keydown', resetAdminIdleTimer);
  panel.style.display = 'none';
  document.getElementById('landingScreen').style.display = 'flex';
};

// ════════════════════════════════════════════════════════
//  ADMIN — LOAD USERS (safe DOM construction)
// ════════════════════════════════════════════════════════
window.loadUsers = async function() {
  document.getElementById('usersLoading').style.display = 'flex';
  document.getElementById('usersEmpty').style.display = 'none';
  document.getElementById('usersTable').style.display = 'none';
  try {
    var sb = _sb;
    var query = sb.from('user_profiles').select('*').order('created_at', { ascending: false });
    // Multi-tenant: filter by tenant
    if(currentTenant) query = query.eq('tenant_id', currentTenant.id);
    var res = await query;
    if(res.error) throw res.error;
    var data = res.data;
    if(!data || data.length === 0){
      document.getElementById('usersLoading').style.display = 'none';
      document.getElementById('usersEmpty').style.display = 'block';
      updateAdminStats(0,0,0,0); return;
    }
    var active    = data.filter(function(u){ return u.status==='active'; }).length;
    var suspended = data.filter(function(u){ return u.status==='suspended'; }).length;
    var pending   = data.filter(function(u){ return u.status==='pending'; }).length;
    updateAdminStats(data.length, active, suspended, pending);

    var body = document.getElementById('usersBody');
    body.textContent = ''; // Safe clear — no innerHTML

    data.forEach(function(u, i){
      var tr = document.createElement('tr');

      // Index cell
      var tdIdx = document.createElement('td');
      tdIdx.style.color = 'var(--muted)';
      tdIdx.textContent = (i+1);
      tr.appendChild(tdIdx);

      // Name cell
      var tdName = document.createElement('td');
      tdName.style.fontWeight = '600';
      tdName.textContent = u.full_name || '—';
      tr.appendChild(tdName);

      // Email cell
      var tdEmail = document.createElement('td');
      tdEmail.style.color = 'var(--muted)';
      tdEmail.textContent = u.email || '—';
      tr.appendChild(tdEmail);

      // Phone cell
      var tdPhone = document.createElement('td');
      tdPhone.className = 'mono';
      tdPhone.textContent = u.phone_number || '—';
      tr.appendChild(tdPhone);

      // Registered date cell
      var tdDate = document.createElement('td');
      tdDate.style.cssText = 'color:var(--muted);font-size:11px';
      tdDate.textContent = u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN') : '—';
      tr.appendChild(tdDate);

      // Subscription cell (safe DOM)
      var tdSub = document.createElement('td');
      var subEnd = u.subscription_end ? new Date(u.subscription_end) : null;
      var subBadge = document.createElement('span');
      subBadge.className = 'sub-days-badge';
      if(!subEnd) {
        subBadge.classList.add('none');
        subBadge.textContent = 'Not Set';
      } else {
        var now2 = new Date(); now2.setHours(0,0,0,0);
        var se2 = new Date(subEnd); se2.setHours(0,0,0,0);
        var dl = Math.round((se2 - now2)/(1000*60*60*24));
        var sc = dl < 0 ? 'expired' : dl <= 7 ? 'critical' : dl <= 30 ? 'warn' : 'safe';
        var sl = dl < 0 ? 'EXPIRED' : dl === 0 ? 'Today!' : dl+'d left';
        subBadge.classList.add(sc);
        subBadge.title = se2.toLocaleDateString('en-IN');
        subBadge.textContent = sl;
      }
      tdSub.appendChild(subBadge);
      if(isSuperAdmin) {
        var br = document.createElement('br');
        tdSub.appendChild(br);
        var subInput = document.createElement('input');
        subInput.type = 'date';
        subInput.className = 'sub-input';
        subInput.style.marginTop = '5px';
        subInput.title = 'Set subscription end date (Super Admin only)';
        subInput.value = subEnd ? subEnd.toISOString().split('T')[0] : '';
        subInput.dataset.userId = u.id;
        subInput.addEventListener('change', function(e) {
          window.adminSetSubscription(e.target.dataset.userId, e.target.value);
        });
        tdSub.appendChild(subInput);
      }
      tr.appendChild(tdSub);

      // Status cell
      var tdStatus = document.createElement('td');
      var statusBadge = document.createElement('span');
      statusBadge.className = 'user-badge ' + (u.status||'active');
      statusBadge.textContent = (u.status||'active').toUpperCase();
      tdStatus.appendChild(statusBadge);
      tr.appendChild(tdStatus);

      // Actions cell
      var tdActions = document.createElement('td');
      var resetBtn = document.createElement('button');
      resetBtn.className = 'action-btn reset';
      resetBtn.textContent = '✉️ Reset PW';
      resetBtn.dataset.email = u.email;
      resetBtn.addEventListener('click', function(e) {
        window.adminResetPw(e.target.dataset.email);
      });
      tdActions.appendChild(resetBtn);

      var toggleBtn = document.createElement('button');
      if(u.status !== 'suspended') {
        toggleBtn.className = 'action-btn suspend';
        toggleBtn.textContent = '🚫 Suspend';
        toggleBtn.addEventListener('click', function() {
          window.adminToggleStatus(u.id, 'suspended');
        });
      } else {
        toggleBtn.className = 'action-btn activate';
        toggleBtn.textContent = '✅ Activate';
        toggleBtn.addEventListener('click', function() {
          window.adminToggleStatus(u.id, 'active');
        });
      }
      tdActions.appendChild(toggleBtn);
      tr.appendChild(tdActions);

      body.appendChild(tr);
    });
    document.getElementById('usersLoading').style.display = 'none';
    document.getElementById('usersTable').style.display = 'table';
  } catch(e) {
    var loadingEl = document.getElementById('usersLoading');
    loadingEl.textContent = '';
    var errorMsg = document.createElement('span');
    errorMsg.textContent = '⚠️ Could not load users. Make sure the user_profiles table exists in Supabase. ';
    var errorDetail = document.createElement('small');
    errorDetail.style.color = 'var(--danger)';
    errorDetail.textContent = e.message;
    loadingEl.appendChild(errorMsg);
    loadingEl.appendChild(errorDetail);
  }
};

function updateAdminStats(total, active, suspended, pending) {
  document.getElementById('aStatTotal').textContent = total;
  document.getElementById('aStatActive').textContent = active;
  document.getElementById('aStatSuspended').textContent = suspended;
  document.getElementById('aStatPending').textContent = pending;
  var slotsEl   = document.getElementById('aStatSlots');
  var slotMaxEl = document.getElementById('aStatSlotsMax');
  var slotCard  = document.getElementById('aStatSlotsCard');
  if(!slotsEl) return;
  var used = total;
  slotsEl.textContent = used;
  var pct = MAX_REPS > 0 ? (used / MAX_REPS) : 1;
  if(pct >= 1) {
    slotsEl.style.color = 'var(--danger)';
    slotCard.style.borderColor = 'rgba(255,82,82,.5)';
    slotMaxEl.textContent = '🔴 LIMIT REACHED · ' + used + '/' + MAX_REPS;
  } else if(pct >= 0.8) {
    slotsEl.style.color = 'var(--warn)';
    slotCard.style.borderColor = 'rgba(255,171,64,.4)';
    slotMaxEl.textContent = '🟡 ' + (MAX_REPS - used) + ' slot(s) left · max ' + MAX_REPS;
  } else {
    slotsEl.style.color = 'var(--green)';
    slotCard.style.borderColor = 'var(--border2)';
    slotMaxEl.textContent = (MAX_REPS - used) + ' slots free · max ' + MAX_REPS;
  }
  var inp = document.getElementById('superAdminSlotInput');
  if(inp) {
    inp.style.display = isSuperAdmin ? 'block' : 'none';
    var mi = document.getElementById('maxRepsInput');
    if(mi) mi.value = MAX_REPS;
  }
}

// ════════════════════════════════════════════════════════
//  MAX REPS — C-4 FIX: prioritize tenant's max_reps
// ════════════════════════════════════════════════════════
async function loadMaxReps() {
  // Priority 1: use current tenant's max_reps
  if(currentTenant && currentTenant.max_reps) {
    MAX_REPS = currentTenant.max_reps;
    return;
  }
  // Priority 2: fall back to app_config table
  if(_sb) {
    try {
      var res = await _sb.from('app_config').select('value').eq('key','max_reps').single();
      if(!res.error && res.data && res.data.value) {
        MAX_REPS = parseInt(res.data.value) || 10;
        return;
      }
    } catch(e) {}
  }
  // Priority 3: localStorage fallback
  try {
    var local = localStorage.getItem('max_reps_override');
    if(local) { MAX_REPS = parseInt(local) || 10; }
  } catch(le) {}
}

window.saveMaxReps = async function() {
  if(!isSuperAdmin) return;
  var inp = document.getElementById('maxRepsInput');
  var val = parseInt(inp && inp.value);
  if(!val || val < 1) return showToast('❌ Enter a valid number');

  try {
    var countQuery = _sb.from('user_profiles').select('id', { count: 'exact', head: true });
    if(currentTenant) countQuery = countQuery.eq('tenant_id', currentTenant.id);
    var countRes = await countQuery;
    var currentCount = countRes.count || 0;
    if(val < currentCount) {
      var proceed = await appConfirm('⚠️ You have ' + currentCount + ' registered reps but are setting limit to ' + val + '. New registrations will be blocked. Continue?', '⚠️');
      if(!proceed) return;
    }
  } catch(ce) {}

  var savedToCloud = false;
  try {
    var res = await _sb.from('app_config').upsert(
      { key: 'max_reps', value: String(val) },
      { onConflict: 'key' }
    );
    if(!res.error) savedToCloud = true;
  } catch(e) {}

  try { localStorage.setItem('max_reps_override', String(val)); } catch(le) {}
  MAX_REPS = val;

  if(savedToCloud) {
    showToast('✅ Rep limit saved to ' + val + ' (synced to cloud)');
  } else {
    showToast('✅ Rep limit set to ' + val + ' (saved locally)');
  }
  loadUsers();
};

// ════════════════════════════════════════════════════════
//  ADMIN ACTIONS (using custom modals instead of alert/confirm)
// ════════════════════════════════════════════════════════
window.adminResetPw = async function(email) {
  if(!email) return;
  var proceed = await appConfirm('Send password reset email to ' + email + '?', '✉️');
  if(!proceed) return;
  try {
    var sb = _sb;
    var canonicalUrl = window.location.origin + window.location.pathname;
    var res = await sb.auth.resetPasswordForEmail(email, { redirectTo: canonicalUrl });
    if(res.error) throw res.error;
    await appAlert('✅ Password reset email sent to ' + email, '✅');
  } catch(e) { await appAlert('❌ Failed: ' + e.message, '❌'); }
};

window.adminToggleStatus = async function(userId, newStatus) {
  try {
    var sb = _sb;
    var res = await sb.from('user_profiles').update({ status: newStatus }).eq('id', userId);
    if(res.error) throw res.error;
    window.loadUsers();
  } catch(e) { await appAlert('Failed: ' + e.message, '❌'); }
};

window.adminSetSubscription = async function(userId, dateValue) {
  if(!isSuperAdmin) { await appAlert('⛔ Only Super Admin can change subscription dates.', '⛔'); return; }
  if(!dateValue) return;
  try {
    var sb = _sb;
    var updateData = { subscription_end: dateValue };
    var profRes = await sb.from('user_profiles').select('status').eq('id', userId).single();
    if(!profRes.error && profRes.data && profRes.data.status === 'suspended') {
      updateData.status = 'active';
    }
    var res = await sb.from('user_profiles').update(updateData).eq('id', userId);
    if(res.error) throw res.error;
    var endDate = new Date(dateValue);
    var now3 = new Date(); now3.setHours(0,0,0,0);
    var daysSet = Math.round((endDate - now3)/(1000*60*60*24));
    await appAlert('Subscription set to ' + endDate.toLocaleDateString('en-IN') + ' (' + daysSet + ' days).' + (updateData.status === 'active' ? ' User re-activated.' : ''), '📅');
    window.loadUsers();
  } catch(e) { await appAlert('Failed to set subscription: ' + e.message, '❌'); }
};

// ════════════════════════════════════════════════════════
//  PASSWORD RESET SUBMIT
// ════════════════════════════════════════════════════════
window.submitNewPassword = async function() {
  var p1 = document.getElementById('newPw1').value;
  var p2 = document.getElementById('newPw2').value;
  var msg = document.getElementById('resetPwMsg');
  var btn = document.getElementById('resetPwBtn');

  if(p1.length < 8) {
    msg.className = 'auth-msg error';
    msg.textContent = '❌ Password must be at least 8 characters';
    return;
  }
  if(p1 !== p2) {
    msg.className = 'auth-msg error';
    msg.textContent = '❌ Passwords do not match';
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Saving...';
  msg.textContent = '';

  try {
    var sb = _sb;
    var res = await sb.auth.updateUser({ password: p1 });
    if(res.error) throw res.error;

    msg.className = 'auth-msg success';
    msg.textContent = '✅ Password updated successfully!';
    btn.textContent = 'Password Set →';

    setTimeout(function() {
      document.getElementById('resetPwOverlay').style.display = 'none';
      sb.auth.signOut().then(function(){
        document.getElementById('landingScreen').style.display = 'flex';
        showToast('✅ Password updated — please login with your new password');
      });
    }, 2000);

  } catch(e) {
    msg.className = 'auth-msg error';
    msg.textContent = '❌ ' + (e.message || 'Failed to update password');
    btn.disabled = false;
    btn.textContent = 'Set New Password →';
  }
};

// ════════════════════════════════════════════════════════
//  LOGOUT (clears subscription timer)
// ════════════════════════════════════════════════════════
window.appLogout = async function() {
  var proceed = await appConfirm('Logout and return to home?', '🚪');
  if(!proceed) return;
  try { var sb=getSB(); if(sb) await sb.auth.signOut(); } catch(e) {}
  currentUser = null;
  clearInterval(window._subTimer);
  window.resetDialer();
  document.getElementById('appContainer').style.display = 'none';
  document.getElementById('landingScreen').style.display = 'flex';
};

// ════════════════════════════════════════════════════════
//  ADMIN TABS
// ════════════════════════════════════════════════════════
window.switchAdminTab = function(tab) {
  ['users','analytics','leaderboard'].forEach(function(t){
    var tabBtn = document.getElementById('adminTab-'+t);
    var panel = document.getElementById('adminPanel-'+t);
    if(tabBtn) tabBtn.className = 'admin-tab' + (t===tab?' active':'');
    if(panel) panel.style.display = (t===tab) ? 'block' : 'none';
  });
  if(tab === 'analytics') loadAnalytics();
  if(tab === 'leaderboard') loadLeaderboard();
};

// ════════════════════════════════════════════════════════
//  F1: ANALYTICS DASHBOARD
// ════════════════════════════════════════════════════════
window.loadAnalytics = async function(days) {
  days = days || parseInt((document.getElementById('analyticsPeriod')||{}).value) || 7;
  if(!_sb) return;
  try {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    var res = await _sb.from('daily_stats')
      .select('*, user_profiles!inner(full_name, email)')
      .gte('stat_date', cutoff.toISOString().split('T')[0])
      .order('stat_date', {ascending: true});
    // Multi-tenant: filter by tenant (applied if join succeeds)
    if(currentTenant) {
      res = await _sb.from('daily_stats')
        .select('*, user_profiles!inner(full_name, email, tenant_id)')
        .eq('tenant_id', currentTenant.id)
        .gte('stat_date', cutoff.toISOString().split('T')[0])
        .order('stat_date', {ascending: true});
    }
    if(res.error) {
      // Fallback if join fails
      var fallbackQuery = _sb.from('daily_stats')
        .select('*')
        .gte('stat_date', cutoff.toISOString().split('T')[0])
        .order('stat_date', {ascending: true});
      if(currentTenant) fallbackQuery = fallbackQuery.eq('tenant_id', currentTenant.id);
      var res2 = await fallbackQuery;
      if(res2.error) throw res2.error;
      renderAnalyticsCharts(res2.data || [], days);
      return;
    }
    renderAnalyticsCharts(res.data || [], days);
  } catch(e) {
    console.warn('Analytics load:', e.message);
    var wrap = document.getElementById('analyticsCharts');
    if(wrap) wrap.textContent = 'No analytics data yet. Data appears after reps complete calling sessions.';
  }
};

function renderAnalyticsCharts(data, days) {
  if(typeof Chart === 'undefined') {
    var wrap = document.getElementById('analyticsCharts');
    if(wrap) wrap.textContent = 'Chart.js not loaded. Please check your internet connection.';
    return;
  }
  // Destroy existing charts
  ['chartCallVolume','chartOutcomes','chartConversion','chartDuration'].forEach(function(id){
    var canvas = document.getElementById(id);
    if(canvas && canvas._chartInstance) { canvas._chartInstance.destroy(); }
  });

  // Aggregate by date
  var byDate = {};
  data.forEach(function(d){
    var dt = d.stat_date;
    if(!byDate[dt]) byDate[dt] = {called:0,skipped:0,interested:0,callback:0,noanswer:0,notinterested:0,total:0,durSum:0,durCount:0};
    byDate[dt].called += d.called || 0;
    byDate[dt].skipped += d.skipped || 0;
    byDate[dt].interested += d.interested || 0;
    byDate[dt].callback += d.callback || 0;
    byDate[dt].noanswer += d.noanswer || 0;
    byDate[dt].notinterested += d.notinterested || 0;
    byDate[dt].total += d.total_leads || 0;
    if(d.avg_call_duration > 0) { byDate[dt].durSum += d.avg_call_duration; byDate[dt].durCount++; }
  });
  var dates = Object.keys(byDate).sort();
  var shortDates = dates.map(function(d){ var p=d.split('-'); return p[2]+'/'+p[1]; });

  var chartColors = {
    green: 'rgba(37,211,102,0.8)',
    red: 'rgba(255,82,82,0.8)',
    orange: 'rgba(255,171,64,0.8)',
    blue: 'rgba(100,181,246,0.8)',
    purple: 'rgba(168,85,247,0.8)',
    gray: 'rgba(90,122,90,0.8)'
  };

  // 1. Call Volume Bar Chart
  var ctx1 = document.getElementById('chartCallVolume');
  if(ctx1) {
    var c1 = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: shortDates,
        datasets: [{
          label: 'Called', data: dates.map(function(d){return byDate[d].called;}),
          backgroundColor: chartColors.green, borderRadius: 4
        },{
          label: 'Skipped', data: dates.map(function(d){return byDate[d].skipped;}),
          backgroundColor: chartColors.orange, borderRadius: 4
        }]
      },
      options: { responsive:true, plugins:{legend:{labels:{color:'#888',font:{size:10}}}}, scales:{x:{ticks:{color:'#888'}},y:{ticks:{color:'#888'}}} }
    });
    ctx1._chartInstance = c1;
  }

  // 2. Outcome Pie Chart
  var totals = {interested:0,callback:0,noanswer:0,notinterested:0};
  dates.forEach(function(d){ Object.keys(totals).forEach(function(k){ totals[k]+=byDate[d][k]; }); });
  var ctx2 = document.getElementById('chartOutcomes');
  if(ctx2) {
    var c2 = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['Interested','Callback','No Answer','Not Interested'],
        datasets: [{ data: [totals.interested,totals.callback,totals.noanswer,totals.notinterested],
          backgroundColor: [chartColors.green,chartColors.orange,chartColors.gray,chartColors.red] }]
      },
      options: { responsive:true, plugins:{legend:{position:'bottom',labels:{color:'#888',font:{size:10}}}} }
    });
    ctx2._chartInstance = c2;
  }

  // 3. Conversion Rate Trend
  var ctx3 = document.getElementById('chartConversion');
  if(ctx3) {
    var c3 = new Chart(ctx3, {
      type: 'line',
      data: {
        labels: shortDates,
        datasets: [{
          label: 'Conversion %',
          data: dates.map(function(d){ var b=byDate[d]; return b.called>0 ? Math.round(b.interested/b.called*100) : 0; }),
          borderColor: chartColors.green, backgroundColor: 'rgba(37,211,102,0.1)', fill: true, tension: 0.3
        }]
      },
      options: { responsive:true, plugins:{legend:{labels:{color:'#888'}}}, scales:{x:{ticks:{color:'#888'}},y:{ticks:{color:'#888'},min:0,max:100}} }
    });
    ctx3._chartInstance = c3;
  }

  // 4. Avg Duration
  var ctx4 = document.getElementById('chartDuration');
  if(ctx4) {
    var c4 = new Chart(ctx4, {
      type: 'bar',
      data: {
        labels: shortDates,
        datasets: [{
          label: 'Avg Duration (sec)',
          data: dates.map(function(d){ var b=byDate[d]; return b.durCount>0 ? Math.round(b.durSum/b.durCount) : 0; }),
          backgroundColor: chartColors.purple, borderRadius: 4
        }]
      },
      options: { responsive:true, plugins:{legend:{labels:{color:'#888'}}}, scales:{x:{ticks:{color:'#888'}},y:{ticks:{color:'#888'}}} }
    });
    ctx4._chartInstance = c4;
  }
}

// ════════════════════════════════════════════════════════
//  F3: TEAM LEADERBOARD
// ════════════════════════════════════════════════════════
window.loadLeaderboard = async function(days) {
  days = days || parseInt((document.getElementById('leaderboardPeriod')||{}).value) || 7;
  if(!_sb) return;
  var body = document.getElementById('leaderboardBody');
  if(!body) return;
  body.textContent = '';
  try {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    var leaderQuery = _sb.from('daily_stats')
      .select('user_id, called, interested, avg_call_duration')
      .gte('stat_date', cutoff.toISOString().split('T')[0]);
    // Multi-tenant: filter by tenant
    if(currentTenant) leaderQuery = leaderQuery.eq('tenant_id', currentTenant.id);
    var res = await leaderQuery;
    if(res.error) throw res.error;
    if(!res.data || !res.data.length) {
      body.textContent = '';
      var emptyTr = document.createElement('tr');
      var emptyTd = document.createElement('td');
      emptyTd.colSpan = 5;
      emptyTd.style.cssText = 'text-align:center;padding:20px;color:var(--muted)';
      emptyTd.textContent = 'No data yet. Stats appear after reps complete sessions.';
      emptyTr.appendChild(emptyTd);
      body.appendChild(emptyTr);
      return;
    }

    // Aggregate by user
    var byUser = {};
    res.data.forEach(function(d){
      if(!byUser[d.user_id]) byUser[d.user_id] = {called:0,interested:0,durSum:0,durCount:0};
      byUser[d.user_id].called += d.called || 0;
      byUser[d.user_id].interested += d.interested || 0;
      if(d.avg_call_duration > 0) { byUser[d.user_id].durSum += d.avg_call_duration; byUser[d.user_id].durCount++; }
    });

    // Get user names
    var userIds = Object.keys(byUser);
    var namesRes = await _sb.from('user_profiles').select('id, full_name, email').in('id', userIds);
    var nameMap = {};
    if(!namesRes.error && namesRes.data) {
      namesRes.data.forEach(function(u){ nameMap[u.id] = u.full_name || u.email || 'Unknown'; });
    }

    // Sort by calls
    var sorted = userIds.map(function(uid){
      var u = byUser[uid];
      return { id:uid, name: nameMap[uid]||'Rep', called: u.called, interested: u.interested,
        rate: u.called > 0 ? Math.round(u.interested/u.called*100) : 0,
        avgDur: u.durCount > 0 ? Math.round(u.durSum/u.durCount) : 0 };
    }).sort(function(a,b){ return b.called - a.called; });

    var maxCalls = sorted[0] ? sorted[0].called : 1;
    var medals = ['gold','silver','bronze'];
    var medalEmojis = ['🥇','🥈','🥉'];

    sorted.forEach(function(rep, i){
      var tr = document.createElement('tr');
      // Rank
      var tdRank = document.createElement('td');
      var rankSpan = document.createElement('span');
      rankSpan.className = 'lb-rank' + (i < 3 ? ' '+medals[i] : '');
      rankSpan.textContent = i < 3 ? medalEmojis[i] : '#'+(i+1);
      tdRank.appendChild(rankSpan);
      tr.appendChild(tdRank);
      // Name
      var tdName = document.createElement('td');
      tdName.style.fontWeight = '600';
      tdName.textContent = rep.name;
      tr.appendChild(tdName);
      // Calls with bar
      var tdCalls = document.createElement('td');
      tdCalls.textContent = rep.called;
      var bar = document.createElement('div');
      bar.className = 'lb-bar';
      var fill = document.createElement('div');
      fill.className = 'lb-bar-fill';
      fill.style.width = Math.round(rep.called/maxCalls*100)+'%';
      bar.appendChild(fill);
      tdCalls.appendChild(bar);
      tr.appendChild(tdCalls);
      // Conversion
      var tdRate = document.createElement('td');
      tdRate.textContent = rep.rate + '%';
      tdRate.style.color = rep.rate >= 20 ? 'var(--green)' : rep.rate >= 10 ? 'var(--warn)' : 'var(--danger)';
      tr.appendChild(tdRate);
      // Avg Duration
      var tdDur = document.createElement('td');
      tdDur.textContent = rep.avgDur > 0 ? Math.floor(rep.avgDur/60)+'m '+rep.avgDur%60+'s' : '-';
      tdDur.style.color = 'var(--muted)';
      tr.appendChild(tdDur);

      body.appendChild(tr);
    });
  } catch(e) {
    console.warn('Leaderboard load:', e.message);
    body.textContent = '';
    var errTr = document.createElement('tr');
    var errTd = document.createElement('td');
    errTd.colSpan = 5;
    errTd.style.cssText = 'text-align:center;padding:20px;color:var(--muted)';
    errTd.textContent = 'Could not load leaderboard data.';
    errTr.appendChild(errTd);
    body.appendChild(errTr);
  }
};

// ════════════════════════════════════════════════════════
//  CELERAPPS SUPER ADMIN PANEL
// ════════════════════════════════════════════════════════

// Default SUPER_HASH (hardcoded in auth.js line 61) is the CelerApps master key
var CELERAPPS_SUPER_HASH = '87859159d3dcdf468afe630139ba14d72603a795a085c25ca60c1ad6c3c154b7';

// Triple-click footer to reveal super admin login
(function() {
  var clickCount = 0;
  var clickTimer = null;
  document.addEventListener('click', function(e) {
    var footer = document.getElementById('landingFooter');
    if(!footer || !footer.contains(e.target)) return;
    clickCount++;
    clearTimeout(clickTimer);
    if(clickCount >= 3) {
      clickCount = 0;
      showSuperAuth();
    }
    clickTimer = setTimeout(function() { clickCount = 0; }, 600);
  });
})();

window.showSuperAuth = function() {
  document.getElementById('landingScreen').style.display = 'none';
  document.getElementById('superAuthScreen').classList.add('visible');
  setTimeout(function(){ document.getElementById('superAdminPass').focus(); }, 200);
};

// C-1 FIX: Removed duplicate sha256() — already defined at line 78

window.superAdminLogin = async function() {
  var pass = document.getElementById('superAdminPass').value;
  if(!pass) return showMsg('superAdminMsg','❌ Enter the super admin password');
  var hash = await sha256(pass);
  if(hash !== CELERAPPS_SUPER_HASH) {
    return showMsg('superAdminMsg','❌ Invalid password. This is for CelerApps admins only.');
  }
  document.getElementById('superAuthScreen').classList.remove('visible');
  document.getElementById('superPanel').style.display = 'block';
  loadAllTenants();
};

window.superAdminLogout = function() {
  document.getElementById('superPanel').style.display = 'none';
  document.getElementById('landingScreen').style.display = '';
};

window.switchSuperTab = function(tab) {
  ['tenants','addtenant','globalstats'].forEach(function(t) {
    var btn = document.getElementById('superTab-' + t);
    var panel = document.getElementById('superPanel-' + t);
    if(btn) btn.className = 'super-tab' + (t === tab ? ' active' : '');
    if(panel) panel.style.display = (t === tab) ? 'block' : 'none';
  });
  if(tab === 'globalstats') loadGlobalStats();
};

// ── Load All Tenants ──────────────────────────────────
window.loadAllTenants = async function() {
  if(!_sb) return;
  try {
    var res = await _sb.from('tenants').select('*').order('created_at', { ascending: true });
    if(res.error) throw res.error;
    var tenants = res.data || [];

    // Count reps per tenant
    var repRes = await _sb.from('user_profiles').select('tenant_id');
    var repCounts = {};
    var totalReps = 0;
    (repRes.data || []).forEach(function(u) {
      var tid = u.tenant_id || 'none';
      repCounts[tid] = (repCounts[tid] || 0) + 1;
      totalReps++;
    });

    // Count daily calls
    var today = new Date().toISOString().split('T')[0];
    var statsRes = await _sb.from('daily_stats').select('calls_made, stat_date');
    var totalCalls = 0;
    var activeToday = 0;
    (statsRes.data || []).forEach(function(s) {
      totalCalls += (s.calls_made || 0);
      if(s.stat_date === today && s.calls_made > 0) activeToday++;
    });

    // Update stats bar
    document.getElementById('sStatTenants').textContent = tenants.length;
    document.getElementById('sStatReps').textContent = totalReps;
    document.getElementById('sStatCalls').textContent = totalCalls;
    document.getElementById('sStatActive').textContent = activeToday;

    // Render table
    var body = document.getElementById('tenantsTableBody');
    body.innerHTML = '';
    tenants.forEach(function(t) {
      var reps = repCounts[t.id] || 0;
      var created = t.created_at ? new Date(t.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'2-digit' }) : '—';

      // Subscription info
      var subEnd = t.subscription_end ? new Date(t.subscription_end) : null;
      var subDays = '';
      var subColor = 'var(--muted)';
      if(subEnd) {
        var now = new Date(); now.setHours(0,0,0,0); subEnd.setHours(0,0,0,0);
        var diff = Math.ceil((subEnd - now) / 86400000);
        if(diff > 7) { subDays = diff + 'd'; subColor = 'var(--green)'; }
        else if(diff > 0) { subDays = diff + 'd'; subColor = 'var(--warn)'; }
        else { subDays = 'Expired'; subColor = 'var(--danger)'; }
      } else {
        subDays = 'No limit';
        subColor = 'var(--muted)';
      }

      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><span class="tenant-emoji">' + (t.app_emoji || '📱') + '</span>' +
        '<span class="tenant-name">' + (t.app_name || t.slug) + '</span><br>' +
        '<span class="tenant-slug">' + t.slug + '</span></td>' +
        // Editable Team Code
        '<td><input type="text" value="' + (t.team_code || '') + '" ' +
        'style="background:rgba(255,171,64,.1);border:1px solid rgba(255,171,64,.2);color:var(--warn);padding:3px 8px;border-radius:4px;font-size:11px;width:90px;text-transform:uppercase;font-family:monospace" ' +
        'onchange="updateTenantField(\'' + t.id + '\',\'team_code\',this.value.toUpperCase())" title="Edit team code"></td>' +
        '<td style="font-weight:700">' + reps + '</td>' +
        // Editable Max Reps
        '<td><input type="number" value="' + (t.max_reps || 10) + '" min="1" max="500" ' +
        'style="background:rgba(255,255,255,.05);border:1px solid var(--border2);color:var(--text);padding:3px 6px;border-radius:4px;font-size:12px;width:55px;text-align:center" ' +
        'onchange="updateTenantField(\'' + t.id + '\',\'max_reps\',parseInt(this.value))" title="Edit max reps"></td>' +
        // Subscription
        '<td><span style="color:' + subColor + ';font-weight:600;font-size:11px">' + subDays + '</span><br>' +
        '<input type="date" value="' + (t.subscription_end || '') + '" ' +
        'style="background:rgba(255,255,255,.05);border:1px solid var(--border2);color:var(--muted);padding:2px 4px;border-radius:4px;font-size:9px;width:110px;margin-top:3px" ' +
        'onchange="updateTenantField(\'' + t.id + '\',\'subscription_end\',this.value)" title="Set subscription end date"></td>' +
        '<td><span class="' + (t.is_active ? 'status-active' : 'status-inactive') + '">' + (t.is_active ? '● Active' : '● Disabled') + '</span></td>' +
        '<td style="font-size:11px;color:var(--muted)">' + created + '</td>' +
        '<td><button class="action-btn' + (t.is_active ? ' danger' : '') + '" onclick="toggleTenantActive(\'' + t.id + '\',' + !t.is_active + ')">' + (t.is_active ? 'Disable' : 'Enable') + '</button></td>';
      body.appendChild(tr);
    });
  } catch(e) {
    console.error('Load tenants:', e);
  }
};

// ── Toggle Tenant Active/Inactive ─────────────────────
window.toggleTenantActive = async function(tenantId, newState) {
  if(!_sb) return;
  var confirmMsg = newState ? 'Enable this tenant? Their reps will be able to login again.' : 'Disable this tenant? Their reps will NOT be able to login.';
  var ok = await appConfirm(confirmMsg, '⚡');
  if(!ok) return;
  try {
    var res = await _sb.from('tenants').update({ is_active: newState }).eq('id', tenantId);
    if(res.error) throw res.error;
    showToast(newState ? '✅ Tenant enabled' : '🚫 Tenant disabled');
    loadAllTenants();
  } catch(e) {
    appAlert('Error: ' + e.message, '❌');
  }
};

// ── Update Any Tenant Field Inline ────────────────────
window.updateTenantField = async function(tenantId, field, value) {
  if(!_sb) return;
  try {
    var update = {};
    update[field] = value;
    var res = await _sb.from('tenants').update(update).eq('id', tenantId);
    if(res.error) throw res.error;
    var labels = { team_code: 'Team Code', max_reps: 'Max Reps', subscription_end: 'Subscription' };
    showToast('✅ ' + (labels[field] || field) + ' updated');
  } catch(e) {
    if(e.message && e.message.includes('unique')) {
      appAlert('❌ That value is already in use by another tenant.', '❌');
    } else {
      appAlert('❌ Update failed: ' + e.message, '❌');
    }
    loadAllTenants(); // revert to DB values
  }
};

// ── Add New Tenant ────────────────────────────────────
window.addNewTenant = async function() {
  var name = document.getElementById('ntName').value.trim();
  var subtitle = document.getElementById('ntSubtitle').value.trim();
  var emoji = document.getElementById('ntEmoji').value.trim() || '📱';
  var color = document.getElementById('ntColor').value.trim() || '#25D366';
  var tagline = document.getElementById('ntTagline').value.trim();
  var teamCode = document.getElementById('ntTeamCode').value.trim().toUpperCase();
  var maxReps = parseInt(document.getElementById('ntMaxReps').value) || 15;
  var adminPass = document.getElementById('ntAdminPass').value.trim();
  var superPass = document.getElementById('ntSuperPass').value.trim();
  var subEnd = document.getElementById('ntSubEnd').value || null;

  if(!name) return showMsg('addTenantMsg','❌ Company name is required');
  if(!teamCode) return showMsg('addTenantMsg','❌ Team code is required');
  if(!adminPass) return showMsg('addTenantMsg','❌ Admin password is required');
  if(!superPass) return showMsg('addTenantMsg','❌ Super admin password is required');
  if(adminPass.length < 8) return showMsg('addTenantMsg','❌ Admin password must be at least 8 characters');

  var btn = document.getElementById('addTenantBtn');
  btn.disabled = true; btn.textContent = '⏳ Creating...';

  try {
    // Generate slug from name
    var slug = name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);

    // Hash passwords using browser crypto
    var adminHash = await sha256(adminPass);
    var superHash = await sha256(superPass);

    var res = await _sb.from('tenants').insert({
      slug: slug,
      hostname: 'dialkaro.celerapps.com',
      app_name: name,
      app_subtitle: subtitle || 'Powered by DialKaro',
      app_emoji: emoji,
      landing_title: name,
      landing_tagline: tagline || 'Smart sales dialing for your team',
      primary_color: color,
      team_code: teamCode,
      admin_hash: adminHash,
      super_hash: superHash,
      max_reps: maxReps,
      subscription_end: subEnd,
      is_active: true
    });

    if(res.error) {
      if(res.error.message.includes('duplicate') || res.error.message.includes('unique')) {
        showMsg('addTenantMsg','❌ Duplicate slug or team code. Use a different name or team code.');
      } else {
        showMsg('addTenantMsg','❌ ' + res.error.message);
      }
      btn.disabled = false; btn.textContent = '🚀 Create Tenant';
      return;
    }

    showMsg('addTenantMsg','✅ Tenant "' + name + '" created! Team Code: ' + teamCode, 'success');
    // Clear form
    ['ntName','ntSubtitle','ntEmoji','ntTagline','ntTeamCode','ntAdminPass','ntSuperPass','ntSubEnd'].forEach(function(id) {
      document.getElementById(id).value = '';
    });
    document.getElementById('ntMaxReps').value = '15';
    document.getElementById('ntColor').value = '#25D366';

    // Refresh tenants list
    loadAllTenants();
    // Auto-switch to tenants tab after 2 seconds
    setTimeout(function(){ switchSuperTab('tenants'); }, 2000);
  } catch(e) {
    showMsg('addTenantMsg','❌ ' + e.message);
  }
  btn.disabled = false; btn.textContent = '🚀 Create Tenant';
};

// ── Global Stats (Cross-Tenant) ───────────────────────
window.loadGlobalStats = async function() {
  if(!_sb) return;
  try {
    // Get all tenants
    var tRes = await _sb.from('tenants').select('id, app_name, app_emoji');
    if(tRes.error) throw tRes.error;
    var tenants = tRes.data || [];

    // Get all reps
    var repRes = await _sb.from('user_profiles').select('tenant_id');
    var repCounts = {};
    (repRes.data || []).forEach(function(u) {
      var tid = u.tenant_id || 'none';
      repCounts[tid] = (repCounts[tid] || 0) + 1;
    });

    // Get all daily stats — C-5 FIX: use correct column names matching saveDailyStats()
    var statsRes = await _sb.from('daily_stats').select('user_id, called, interested, callback, avg_call_duration, user_profiles!inner(tenant_id)');
    var tenantStats = {};
    (statsRes.data || []).forEach(function(s) {
      var tid = (s.user_profiles && s.user_profiles.tenant_id) || 'none';
      if(!tenantStats[tid]) tenantStats[tid] = { calls: 0, interested: 0, callbacks: 0, totalDur: 0, durCount: 0 };
      tenantStats[tid].calls += (s.called || 0);
      tenantStats[tid].interested += (s.interested || 0);
      tenantStats[tid].callbacks += (s.callback || 0);
      if(s.avg_call_duration > 0) {
        tenantStats[tid].totalDur += s.avg_call_duration;
        tenantStats[tid].durCount++;
      }
    });

    var body = document.getElementById('globalStatsBody');
    body.innerHTML = '';
    tenants.forEach(function(t) {
      var reps = repCounts[t.id] || 0;
      var st = tenantStats[t.id] || { calls: 0, interested: 0, callbacks: 0, totalDur: 0, durCount: 0 };
      var avgDur = st.durCount > 0 ? Math.round(st.totalDur / st.durCount) : 0;
      var durStr = avgDur > 0 ? Math.floor(avgDur / 60) + ':' + String(avgDur % 60).padStart(2, '0') : '—';
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><span class="tenant-emoji">' + (t.app_emoji || '📱') + '</span><span class="tenant-name">' + t.app_name + '</span></td>' +
        '<td style="font-weight:700">' + reps + '</td>' +
        '<td style="font-weight:700;color:#4A90D9">' + st.calls + '</td>' +
        '<td style="color:var(--green)">' + st.interested + '</td>' +
        '<td style="color:var(--warn)">' + st.callbacks + '</td>' +
        '<td>' + durStr + '</td>';
      body.appendChild(tr);
    });
  } catch(e) {
    console.error('Global stats:', e);
  }
};

// C-2 FIX: Removed showMsg override — original at L381 handles success type correctly
