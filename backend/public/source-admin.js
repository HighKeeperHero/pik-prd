// ============================================================
// PIK — Source Admin UI (Sprint 5)
//
// Adds source management panel to the operator dashboard.
// - Create new sources with auto-generated API keys
// - Rotate API keys (shown once, copy to clipboard)
// - Suspend / activate / deactivate sources
// - View source stats (active links, total events)
//
// Place at: public/source-admin.js
// Loaded after main dashboard script.
// ============================================================

console.log('PIK source-admin.js loaded');

// ── Source Management Modal ──────────────────────────────

function openSourceManager() {
  // Remove existing modal if any
  const existing = document.getElementById('source-mgr-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'source-mgr-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;
    display:flex;align-items:center;justify-content:center;
    backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
  `;
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const modal = document.createElement('div');
  modal.style.cssText = `
    background:var(--bg2,#12121a);border:1px solid var(--border,#2a2a3a);
    border-radius:16px;width:min(600px,90vw);max-height:85vh;overflow:auto;
    padding:24px;color:var(--text,#e0dde6);font-family:inherit;
  `;

  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2 style="font-family:'Cinzel',serif;font-size:18px;letter-spacing:2px;margin:0">
        🌐 SOURCE MANAGER
      </h2>
      <button onclick="this.closest('#source-mgr-overlay').remove()" 
        style="background:none;border:none;color:var(--text2);font-size:20px;cursor:pointer">✕</button>
    </div>
    <div id="src-mgr-content" style="min-height:100px">
      <div style="text-align:center;color:var(--text3);padding:40px">Loading sources...</div>
    </div>
    <div id="src-mgr-key-display" style="display:none;margin-top:16px;padding:16px;
      background:var(--bg3,#1a1a26);border-radius:12px;border:1px solid var(--accent,#7c6aff)">
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  loadSourceManager();
}

async function loadSourceManager() {
  const container = document.getElementById('src-mgr-content');
  try {
    const resp = await apiFetch('/sources');
    let sources = resp;
    if (resp && resp.data && Array.isArray(resp.data)) sources = resp.data;
    if (!Array.isArray(sources)) { console.log('Sources resp:', JSON.stringify(resp).substring(0,300)); sources = []; }
    renderSourceManager(sources);
  } catch (err) {
    container.innerHTML = `<div style="color:var(--accent2);padding:20px;text-align:center">${err.message}</div>`;
  }
}

function renderSourceManager(sources) {
  const container = document.getElementById('src-mgr-content');

  const rows = sources.map(s => {
    const statusColor = s.status === 'active' ? 'var(--teal,#40e8c0)' :
                        s.status === 'suspended' ? 'var(--amber,#f0c050)' : 'var(--accent2,#ff6a8a)';
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:12px;
        background:var(--bg3,#1a1a26);border-radius:10px;border:1px solid var(--border,#2a2a3a);
        margin-bottom:8px" id="src-row-${s.source_id}">
        <div style="flex:1;min-width:0">
          <div style="font-weight:500;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${escHtml(s.source_name)}
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px;font-family:monospace">
            ${escHtml(s.source_id)}
          </div>
          <div style="font-size:11px;color:var(--text2);margin-top:4px">
            ${s.active_links || 0} linked · ${s.total_events || 0} events
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex-shrink:0">
          <span style="font-size:10px;letter-spacing:1px;text-transform:uppercase;
            color:${statusColor};padding:2px 8px;border:1px solid ${statusColor}33;
            border-radius:10px">${s.status}</span>
          <div style="display:flex;gap:4px;margin-top:4px">
            <button onclick="rotateSourceKey('${s.source_id}')" 
              style="font-size:10px;padding:3px 8px;border-radius:6px;border:1px solid var(--border);
              background:none;color:var(--accent);cursor:pointer;font-family:inherit"
              title="Generate new API key">🔑 Rotate</button>
            ${s.status === 'active' 
              ? `<button onclick="setSourceStatus('${s.source_id}','suspended')"
                  style="font-size:10px;padding:3px 8px;border-radius:6px;border:1px solid var(--border);
                  background:none;color:var(--amber,#f0c050);cursor:pointer;font-family:inherit">⏸ Suspend</button>`
              : `<button onclick="setSourceStatus('${s.source_id}','active')"
                  style="font-size:10px;padding:3px 8px;border-radius:6px;border:1px solid var(--border);
                  background:none;color:var(--teal,#40e8c0);cursor:pointer;font-family:inherit">▶ Activate</button>`
            }
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    ${rows || '<div style="color:var(--text3);padding:20px;text-align:center;font-style:italic">No sources registered yet.</div>'}
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border,#2a2a3a)">
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px;letter-spacing:1px;text-transform:uppercase">
        Register New Source
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input id="new-src-id" placeholder="source-id (e.g. src-my-game-01)"
          style="flex:1;min-width:160px;padding:8px 12px;background:var(--bg,#0a0a0f);
          border:1px solid var(--border);border-radius:8px;color:var(--text);
          font-family:monospace;font-size:12px">
        <input id="new-src-name" placeholder="Display Name"
          style="flex:1;min-width:160px;padding:8px 12px;background:var(--bg,#0a0a0f);
          border:1px solid var(--border);border-radius:8px;color:var(--text);
          font-family:inherit;font-size:13px">
        <button onclick="createNewSource()"
          style="padding:8px 20px;background:var(--accent,#7c6aff);color:white;border:none;
          border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:500;
          white-space:nowrap">+ Create Source</button>
      </div>
    </div>
  `;
}

// ── Create Source ─────────────────────────────────────────

async function createNewSource() {
  const idEl = document.getElementById('new-src-id');
  const nameEl = document.getElementById('new-src-name');
  const sourceId = idEl.value.trim();
  const sourceName = nameEl.value.trim();

  if (!sourceId || !sourceName) {
    showToast('Enter both source ID and display name', 'var(--amber)');
    return;
  }

  try {
    const resp = await apiFetch('/sources', {
      method: 'POST',
      body: JSON.stringify({ source_id: sourceId, source_name: sourceName }),
    });
    const result = resp.data || resp;

    // Show the API key (once!)
    showApiKey(result.api_key, result.source_id, 'New source created!');

    // Clear inputs
    idEl.value = '';
    nameEl.value = '';

    // Reload the list
    await loadSourceManager();

    showToast(`Source "${sourceName}" created`, 'var(--teal)');
  } catch (err) {
    showToast(err.message, 'var(--accent2)');
  }
}

// ── Rotate API Key ───────────────────────────────────────

async function rotateSourceKey(sourceId) {
  if (!confirm(`Rotate API key for "${sourceId}"?\n\nThe old key will stop working immediately.`)) {
    return;
  }

  try {
    const resp = await apiFetch(`/sources/${sourceId}/rotate-key`, {
      method: 'POST',
    });
    const result = resp.data || resp;

    showApiKey(result.api_key, sourceId, 'API key rotated!');
    showToast('API key rotated — old key is now invalid', 'var(--accent)');
  } catch (err) {
    showToast(err.message, 'var(--accent2)');
  }
}

// ── Set Source Status ────────────────────────────────────

async function setSourceStatus(sourceId, status) {
  const action = status === 'suspended' ? 'Suspend' : 'Activate';
  if (!confirm(`${action} source "${sourceId}"?`)) return;

  try {
    await apiFetch(`/sources/${sourceId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });

    await loadSourceManager();
    showToast(`Source ${status === 'active' ? 'activated' : 'suspended'}`, 'var(--teal)');
  } catch (err) {
    showToast(err.message, 'var(--accent2)');
  }
}

// ── API Key Display ──────────────────────────────────────

function showApiKey(apiKey, sourceId, message) {
  const display = document.getElementById('src-mgr-key-display');
  if (!display) return;

  display.style.display = 'block';
  display.innerHTML = `
    <div style="font-size:12px;color:var(--teal,#40e8c0);margin-bottom:8px;font-weight:500">
      ✓ ${escHtml(message)}
    </div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:6px">
      API Key for <strong>${escHtml(sourceId)}</strong> — copy now, it won't be shown again:
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <code id="src-api-key-text" style="flex:1;padding:10px 12px;background:var(--bg,#0a0a0f);
        border:1px solid var(--border);border-radius:8px;font-size:12px;color:var(--gold,#f0c050);
        word-break:break-all;user-select:all">${escHtml(apiKey)}</code>
      <button onclick="copyApiKey()" 
        style="padding:8px 14px;background:var(--accent,#7c6aff);color:white;border:none;
        border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;flex-shrink:0">
        📋 Copy
      </button>
    </div>
    <div style="font-size:10px;color:var(--accent2,#ff6a8a);margin-top:8px">
      ⚠ This key will NOT be shown again. Store it securely.
    </div>
  `;

  // Scroll to show key
  display.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function copyApiKey() {
  const keyText = document.getElementById('src-api-key-text');
  if (!keyText) return;
  navigator.clipboard.writeText(keyText.textContent).then(() => {
    showToast('API key copied to clipboard', 'var(--teal)');
  }).catch(() => {
    // Fallback: select the text
    const range = document.createRange();
    range.selectNodeContents(keyText);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    showToast('Select and copy the highlighted key', 'var(--amber)');
  });
}

// ── HTML Escaper ─────────────────────────────────────────
function escHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
