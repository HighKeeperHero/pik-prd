// ============================================================
// PIK — WebAuthn Browser UI
// backend/public/auth-ui.js
//
// Handles passkey registration, authentication, key rotation,
// and key revocation. Uses @simplewebauthn/browser (UMD).
//
// Depends on: SimpleWebAuthnBrowser global, apiFetch(), showToast(),
//             fmtTime(), selectUser(), loadUsers(), loadAnalytics()
// ============================================================

const { startRegistration, startAuthentication } = SimpleWebAuthnBrowser;

// ── Session State ───────────────────────────────────────────

let pikSession = {
  token: null,
  rootId: null,
  heroName: null,
  expiresAt: null,
};

function setSession(token, rootId, heroName, expiresAt) {
  pikSession = { token, rootId, heroName, expiresAt };
  updateAuthUI();
}

function clearSession() {
  pikSession = { token: null, rootId: null, heroName: null, expiresAt: null };
  updateAuthUI();
  showToast('Signed out');
}

function updateAuthUI() {
  const signInBtn  = document.getElementById('auth-signin-btn');
  const authStatus = document.getElementById('auth-status');
  if (!signInBtn || !authStatus) return;

  if (pikSession.token) {
    signInBtn.style.display = 'none';
    authStatus.style.display = 'flex';
    authStatus.innerHTML =
      `<span style="color:var(--accent2)">🔑 ${pikSession.heroName}</span>` +
      `<button onclick="clearSession()" style="background:none;border:1px solid var(--border);` +
      `border-radius:4px;color:var(--dim);font-size:9px;padding:2px 8px;cursor:pointer;` +
      `font-family:inherit;margin-left:4px">Sign Out</button>`;
  } else {
    signInBtn.style.display = 'inline-block';
    authStatus.style.display = 'none';
    authStatus.innerHTML = '';
  }
}

// ── Registration (Enroll + Passkey) ─────────────────────────

async function registerWithPasskey() {
  const name      = document.getElementById('enroll-name').value.trim();
  const alignment = document.getElementById('enroll-alignment').value;
  const origin    = document.getElementById('enroll-origin').value.trim();
  const enrollBy  = document.getElementById('enroll-by').value;
  const sourceId  = document.getElementById('enroll-source').value;

  if (!name) { showToast('Enter a hero name', 'var(--red)'); return; }

  // Step 1: Get registration options from server
  const optResp = await apiFetch('/api/auth/register/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hero_name: name,
      fate_alignment: alignment,
      origin: origin || undefined,
      enrolled_by: enrollBy,
      source_id: sourceId || undefined,
    }),
  });

  if (optResp.status !== 'ok') {
    showToast(optResp.message || 'Failed to get options', 'var(--red)');
    return;
  }

  // Step 2: Browser passkey ceremony
  let attestation;
  try {
    attestation = await startRegistration({ optionsJSON: optResp.data });
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      showToast('Passkey registration cancelled', 'var(--amber)');
    } else {
      showToast(`Passkey error: ${err.message}`, 'var(--red)');
    }
    return;
  }

  // Step 3: Verify attestation with server
  const verResp = await apiFetch('/api/auth/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attestation,
      friendly_name: guessDeviceName(),
    }),
  });

  if (verResp.status === 'ok') {
    const d = verResp.data;
    setSession(d.session_token, d.root_id, d.hero_name, d.session_expires_at);
    closeEnrollModal();
    showToast(`🔑 ${d.hero_name} enrolled with passkey!`);
    await loadUsers();
    await loadAnalytics();
    selectUser(d.root_id);
  } else {
    showToast(verResp.message || 'Registration failed', 'var(--red)');
  }
}

// ── Authentication (Sign In) ────────────────────────────────

async function signInWithPasskey() {
  // Step 1: Get auth options (discoverable — no root_id needed)
  const optResp = await apiFetch('/api/auth/authenticate/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (optResp.status !== 'ok') {
    showToast(optResp.message || 'Failed to get auth options', 'var(--red)');
    return;
  }

  // Step 2: Browser passkey ceremony
  let assertion;
  try {
    assertion = await startAuthentication({ optionsJSON: optResp.data });
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      showToast('Sign-in cancelled', 'var(--amber)');
    } else {
      showToast(`Sign-in error: ${err.message}`, 'var(--red)');
    }
    return;
  }

  // Step 3: Verify assertion with server
  const verResp = await apiFetch('/api/auth/authenticate/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assertion }),
  });

  if (verResp.status === 'ok') {
    const d = verResp.data;
    setSession(d.session_token, d.root_id, d.hero_name, d.session_expires_at);
    showToast(`Welcome back, ${d.hero_name}!`);
    selectUser(d.root_id);
  } else {
    showToast(verResp.message || 'Sign-in failed', 'var(--red)');
  }
}

// ── Key Management (session-protected) ──────────────────────

async function loadAuthKeys(rootId) {
  if (!pikSession.token || pikSession.rootId !== rootId) return '';

  try {
    const resp = await fetch(API + '/api/auth/keys', {
      headers: { Authorization: 'Bearer ' + pikSession.token },
    });
    const r = await resp.json();
    if (r.status !== 'ok') return '';

    const keys = r.data || [];
    return `
      <div class="section">
        <h4>🔑 Auth Keys</h4>
        ${keys.map(k => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-size:12px;color:var(--text)">${k.friendly_name || k.device_type || 'Passkey'}</div>
              <div style="font-size:9px;color:var(--dim)">
                ${k.status === 'active' ? '🟢' : '🔴'} ${k.status}
                · Created ${fmtTime(k.created_at)}
                ${k.last_used_at ? ' · Last used ' + fmtTime(k.last_used_at) : ''}
              </div>
            </div>
            ${k.status === 'active'
              ? `<button onclick="revokeAuthKey('${k.key_id}')"
                  style="background:none;border:1px solid var(--red);border-radius:4px;
                  color:var(--red);font-size:9px;padding:3px 8px;cursor:pointer;font-family:inherit">Revoke</button>`
              : '<span style="font-size:9px;color:var(--dim)">REVOKED</span>'}
          </div>
        `).join('')}
        <button onclick="rotateKey()"
          style="margin-top:10px;padding:6px 14px;font-size:9px;letter-spacing:1px;
          background:var(--accent);border:none;border-radius:4px;color:white;
          cursor:pointer;font-family:inherit;text-transform:uppercase">+ Add New Key</button>
      </div>`;
  } catch (e) {
    console.warn('loadAuthKeys error:', e);
    return '';
  }
}

async function rotateKey() {
  if (!pikSession.token) { showToast('Sign in first', 'var(--red)'); return; }

  // Step 1: Get rotation options
  const optResp = await fetch(API + '/api/auth/keys/rotate', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + pikSession.token },
  }).then(r => r.json());

  const options = optResp.data || optResp;

  // Step 2: Browser ceremony
  let attestation;
  try {
    attestation = await startRegistration({ optionsJSON: options });
  } catch (err) {
    showToast(`Key registration cancelled`, 'var(--amber)');
    return;
  }

  // Step 3: Verify
  const verResp = await fetch(API + '/api/auth/keys/rotate/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + pikSession.token,
    },
    body: JSON.stringify({
      attestation,
      friendly_name: guessDeviceName(),
    }),
  }).then(r => r.json());

  if (verResp.status === 'ok') {
    showToast('New key registered!');
    if (selectedRootId) selectUser(selectedRootId);
  } else {
    showToast(verResp.message || 'Key rotation failed', 'var(--red)');
  }
}

async function revokeAuthKey(keyId) {
  if (!pikSession.token) return;
  if (!confirm('Revoke this key? It will immediately stop working for sign-in.')) return;

  const resp = await fetch(API + '/api/auth/keys/' + keyId + '/revoke', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + pikSession.token },
  }).then(r => r.json());

  if (resp.status === 'ok') {
    showToast('Key revoked');
    if (selectedRootId) selectUser(selectedRootId);
  } else {
    showToast(resp.message || 'Revoke failed', 'var(--red)');
  }
}

// ── Monkey-patch selectUser to inject auth keys section ─────

const _origSelectUser = window.selectUser;
window.selectUser = async function(rootId) {
  await _origSelectUser(rootId);

  // After detail panel is populated, append auth keys if signed in as this user
  if (pikSession.token && pikSession.rootId === rootId) {
    const keysHtml = await loadAuthKeys(rootId);
    if (keysHtml) {
      const dc = document.getElementById('detail-content');
      if (dc) dc.insertAdjacentHTML('beforeend', keysHtml);
    }
  }
};

// ── Helpers ──────────────────────────────────────────────────

function guessDeviceName() {
  const ua = navigator.userAgent;
  if (ua.includes('Windows'))  return 'Windows Hello';
  if (ua.includes('Mac'))      return 'Touch ID';
  if (ua.includes('iPhone'))   return 'Face ID / Touch ID';
  if (ua.includes('Android'))  return 'Android Biometric';
  return 'Passkey';
}

// Check for WebAuthn support
if (!window.PublicKeyCredential) {
  console.warn('PIK: WebAuthn not supported in this browser');
  const btn = document.getElementById('auth-signin-btn');
  if (btn) btn.title = 'WebAuthn not supported in this browser';
}

console.log('PIK auth-ui.js loaded');
