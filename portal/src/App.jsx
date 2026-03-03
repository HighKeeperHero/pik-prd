import { useState, useEffect, useCallback } from 'react';
import PIKOnboarding from './PIKOnboarding.jsx';
import PIKPortal from './PIKPortal.jsx';
import api from './api.js';

/**
 * PIK App Root
 * 
 * Screens:
 *   1. Player login — passkey auth + social login buttons
 *   2. Admin login — operator credentials → user management panel
 *   3. Onboarding — new user registration flow
 *   4. Portal — authenticated player experience
 */

const API_BASE = import.meta.env.VITE_PIK_API_URL || 'https://pik-prd-production.up.railway.app';

// ── Styles ──
const FONT = "'Crimson Pro', 'Georgia', serif";
const FONT_B = "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const BG = "#08080f";
const SURFACE = "rgba(255,255,255,0.025)";
const SURFACE2 = "rgba(255,255,255,0.04)";
const BORDER = "rgba(255,255,255,0.06)";
const MUTED = "rgba(255,255,255,0.35)";
const DIM = "rgba(255,255,255,0.5)";
const ACCENT = "#6366f1";


// ══════════════════════════════════════════════════════════
// PLAYER LOGIN — passkey + social auth
// ══════════════════════════════════════════════════════════

function PlayerLogin({ onLogin, onNewUser, onAdminSwitch }) {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handlePasskeyLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      // Step 1: Get authentication options from backend
      const optResp = await api.post('/api/auth/authenticate/options', {});
      if (!optResp.ok) {
        setError('Could not start authentication. Try again.');
        setLoading(false);
        return;
      }

      // Step 2: Trigger browser passkey prompt
      const options = optResp.data;
      
      // Check if WebAuthn is available
      if (!window.PublicKeyCredential) {
        setError('Passkeys are not supported on this device/browser.');
        setLoading(false);
        return;
      }

      const publicKeyOptions = {
        challenge: base64UrlToBuffer(options.challenge),
        timeout: options.timeout || 60000,
        rpId: options.rpId || window.location.hostname,
        allowCredentials: (options.allowCredentials || []).map(c => ({
          ...c,
          id: base64UrlToBuffer(c.id),
        })),
        userVerification: options.userVerification || 'preferred',
      };

      const assertion = await navigator.credentials.get({ publicKey: publicKeyOptions });

      // Step 3: Verify with backend
      const verifyResp = await api.post('/api/auth/authenticate/verify', {
        assertion: {
          id: assertion.id,
          rawId: bufferToBase64Url(assertion.rawId),
          response: {
            authenticatorData: bufferToBase64Url(assertion.response.authenticatorData),
            clientDataJSON: bufferToBase64Url(assertion.response.clientDataJSON),
            signature: bufferToBase64Url(assertion.response.signature),
          },
          type: assertion.type,
          clientExtensionResults: assertion.getClientExtensionResults(),
        },
      });

      if (verifyResp.ok && verifyResp.data) {
        const token = verifyResp.data.session_token || verifyResp.data.token;
        const rootId = verifyResp.data.root_id;
        if (token && rootId) {
          api.setSession(token, rootId);
          onLogin(rootId);
        } else {
          setError('Authentication succeeded but no session returned.');
        }
      } else {
        setError('Authentication failed. Please try again.');
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Authentication was cancelled.');
      } else {
        console.error('Passkey auth error:', err);
        setError('Authentication failed. Make sure you have a registered passkey.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = (provider) => {
    setError(`${provider} login coming soon. Use passkey or create a new hero.`);
  };

  return (
    <div style={pageStyle}>
      <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      
      {/* Logo + Title */}
      <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, marginBottom: 24, boxShadow: "0 8px 32px rgba(99,102,241,0.3)" }}>{"\u25C8"}</div>
      <h1 style={{ fontSize: 28, fontWeight: 700, fontFamily: FONT, margin: "0 0 6px", textAlign: "center", color: "#fff" }}>Heroes' Veritas</h1>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 40px", textAlign: "center", fontFamily: FONT_B }}>Enter the Realms of Elysendar</p>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", marginBottom: 20, width: "100%", maxWidth: 340 }}>
          <p style={{ fontSize: 12, color: "#ef4444", margin: 0, fontFamily: FONT_B, textAlign: "center" }}>{error}</p>
        </div>
      )}

      {/* Passkey Login */}
      <button
        onClick={handlePasskeyLogin}
        disabled={loading}
        style={{
          width: "100%", maxWidth: 340, padding: "14px 20px", borderRadius: 12,
          background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
          border: "none", color: "#fff", fontSize: 15, fontWeight: 600,
          cursor: loading ? "wait" : "pointer", fontFamily: FONT_B,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          boxShadow: "0 4px 20px rgba(99,102,241,0.25)",
          opacity: loading ? 0.7 : 1, transition: "opacity 0.2s",
        }}
      >
        <span style={{ fontSize: 18 }}>{"\uD83D\uDD11"}</span>
        {loading ? "Authenticating..." : "Sign In with Passkey"}
      </button>

      {/* Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", maxWidth: 340, margin: "20px 0" }}>
        <div style={{ flex: 1, height: 1, background: BORDER }} />
        <span style={{ fontSize: 11, color: MUTED, fontFamily: FONT_B, textTransform: "uppercase", letterSpacing: "0.08em" }}>or continue with</span>
        <div style={{ flex: 1, height: 1, background: BORDER }} />
      </div>

      {/* Social Login */}
      <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 340 }}>
        <button onClick={() => handleSocialLogin('Google')} style={socialBtnStyle}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          <span>Google</span>
        </button>
        <button onClick={() => handleSocialLogin('Apple')} style={socialBtnStyle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.32 2.32-2.12 4.54-3.74 4.25z"/></svg>
          <span>Apple</span>
        </button>
      </div>

      {/* Create New Hero */}
      <button
        onClick={onNewUser}
        style={{
          marginTop: 28, width: "100%", maxWidth: 340, padding: "12px 20px", borderRadius: 12,
          background: SURFACE2, border: `1px solid ${BORDER}`,
          color: DIM, fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: FONT_B,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 16 }}>{"\u2728"}</span>
        Create New Hero
      </button>

      {/* Admin link */}
      <button
        onClick={onAdminSwitch}
        style={{
          marginTop: 32, background: "none", border: "none",
          color: "rgba(255,255,255,0.15)", fontSize: 11, cursor: "pointer",
          fontFamily: FONT_B, padding: "8px 16px",
          transition: "color 0.2s",
        }}
        onMouseEnter={e => e.target.style.color = "rgba(255,255,255,0.4)"}
        onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.15)"}
      >
        Operator Access
      </button>
    </div>
  );
}


// ══════════════════════════════════════════════════════════
// ADMIN LOGIN + USER MANAGEMENT
// ══════════════════════════════════════════════════════════

function AdminPanel({ onImpersonate, onBack }) {
  const [step, setStep] = useState('login'); // 'login' | 'panel'
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [loggingIn, setLoggingIn] = useState(null);

  // Simple operator passphrase (in production: proper admin auth)
  const OPERATOR_PASS = 'heroesveritas2025';

  const handleAdminLogin = () => {
    if (passphrase === OPERATOR_PASS) {
      setStep('panel');
      setError(null);
      loadUsers();
    } else {
      setError('Invalid operator passphrase');
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    const resp = await api.listUsers();
    if (resp.ok && Array.isArray(resp.data)) {
      setUsers(resp.data);
    } else {
      setError('Failed to load users from backend');
    }
    setLoading(false);
  };

  const handleImpersonate = async (user) => {
    setLoggingIn(user.root_id);
    const resp = await api.impersonate(user.root_id);
    if (resp.ok) {
      onImpersonate(user.root_id);
    } else {
      setError(`Failed to impersonate: ${resp.error}`);
      setLoggingIn(null);
    }
  };

  const filtered = users.filter(u => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (u.hero_name || '').toLowerCase().includes(s) ||
           (u.root_id || '').toLowerCase().includes(s) ||
           (u.fate_alignment || '').toLowerCase().includes(s);
  });

  const alignColor = (a) => a === 'ORDER' ? '#3b82f6' : a === 'CHAOS' ? '#ef4444' : a === 'VEIL' ? '#a855f7' : '#a78bfa';

  // ── Admin Login Screen ──
  if (step === 'login') {
    return (
      <div style={pageStyle}>
        <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

        <button onClick={onBack} style={backBtnStyle}>{"\u2190"} Back to Player Login</button>

        <div style={{ width: 52, height: 52, borderRadius: 12, background: "linear-gradient(135deg, #f59e0b, #d97706)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 20 }}>{"\u2699\uFE0F"}</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, fontFamily: FONT, margin: "0 0 6px", color: "#fff" }}>Operator Access</h2>
        <p style={{ fontSize: 12, color: MUTED, margin: "0 0 28px", fontFamily: FONT_B }}>Admin panel for user management and impersonation</p>

        {error && (
          <div style={{ padding: "10px 16px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", marginBottom: 16, width: "100%", maxWidth: 320 }}>
            <p style={{ fontSize: 12, color: "#ef4444", margin: 0, fontFamily: FONT_B }}>{error}</p>
          </div>
        )}

        <div style={{ width: "100%", maxWidth: 320 }}>
          <label style={{ fontSize: 11, color: DIM, fontFamily: FONT_B, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, display: "block" }}>Operator Passphrase</label>
          <input
            type="password"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdminLogin()}
            placeholder="Enter passphrase"
            style={{
              width: "100%", padding: "12px 16px", borderRadius: 10,
              background: SURFACE2, border: `1px solid ${BORDER}`,
              color: "#fff", fontSize: 14, fontFamily: FONT_B,
              outline: "none", boxSizing: "border-box",
            }}
          />
          <button
            onClick={handleAdminLogin}
            style={{
              width: "100%", marginTop: 12, padding: "12px 20px", borderRadius: 10,
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              border: "none", color: "#000", fontSize: 14, fontWeight: 700,
              cursor: "pointer", fontFamily: FONT_B,
            }}
          >
            Sign In as Operator
          </button>
        </div>
      </div>
    );
  }

  // ── Admin User Panel ──
  return (
    <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: BG, fontFamily: FONT_B, color: "#fff" }}>
      <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ padding: "16px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: BG, zIndex: 50, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg, #f59e0b, #d97706)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{"\u2699\uFE0F"}</div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#f59e0b" }}>Operator Panel</span>
        </div>
        <button onClick={onBack} style={{ background: "none", border: "none", color: MUTED, fontSize: 12, cursor: "pointer", fontFamily: FONT_B }}>Sign Out</button>
      </div>

      {/* Stats bar */}
      <div style={{ padding: "12px 20px", display: "flex", gap: 16, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 11, color: DIM, fontFamily: FONT_B }}>
          <span style={{ fontWeight: 700, color: "#fff", fontSize: 16, marginRight: 4 }}>{users.length}</span> Enrolled Heroes
        </div>
        <div style={{ fontSize: 11, color: DIM, fontFamily: FONT_B }}>
          <span style={{ fontWeight: 700, color: "#22c55e", fontSize: 16, marginRight: 4 }}>{"\u2022"}</span> Backend Connected
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: "12px 20px" }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, ID, or alignment..."
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 10,
            background: SURFACE2, border: `1px solid ${BORDER}`,
            color: "#fff", fontSize: 13, fontFamily: FONT_B,
            outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {error && (
        <div style={{ margin: "0 20px 12px", padding: "10px 16px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>{error}</p>
        </div>
      )}

      {/* User List */}
      <div style={{ padding: "4px 20px 40px" }}>
        {loading && <p style={{ fontSize: 13, color: DIM, textAlign: "center", padding: 20 }}>Loading heroes...</p>}
        {filtered.map(user => {
          const isActive = loggingIn === user.root_id;
          return (
            <div key={user.root_id} style={{
              padding: "14px 16px", borderRadius: 12, marginBottom: 8,
              background: isActive ? "rgba(245,158,11,0.08)" : SURFACE,
              border: `1px solid ${isActive ? "rgba(245,158,11,0.3)" : BORDER}`,
              display: "flex", alignItems: "center", gap: 14,
              transition: "all 0.2s",
            }}>
              {/* Avatar */}
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: `linear-gradient(135deg, ${alignColor(user.fate_alignment)}20, ${alignColor(user.fate_alignment)}08)`,
                border: `1px solid ${alignColor(user.fate_alignment)}30`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
              }}>{"\u2694\uFE0F"}</div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {user.hero_name || 'Unknown'}
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ color: alignColor(user.fate_alignment), fontWeight: 600 }}>{user.fate_alignment}</span>
                  <span>Lv {user.fate_level || 1}</span>
                  <span>{(user.fate_xp || 0).toLocaleString()} XP</span>
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", marginTop: 2, fontFamily: "monospace" }}>
                  {user.root_id}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => handleImpersonate(user)}
                  disabled={!!loggingIn}
                  style={{
                    padding: "6px 14px", borderRadius: 8,
                    background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
                    color: "#a78bfa", fontSize: 11, fontWeight: 600,
                    cursor: loggingIn ? "not-allowed" : "pointer", fontFamily: FONT_B,
                  }}
                >
                  {isActive ? "Entering..." : "View as User"}
                </button>
              </div>
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <p style={{ fontSize: 13, color: MUTED, textAlign: "center", padding: 20 }}>
            {search ? 'No heroes match your search' : 'No heroes enrolled yet'}
          </p>
        )}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════
// WEBAUTHN HELPERS
// ══════════════════════════════════════════════════════════

function base64UrlToBuffer(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

function bufferToBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}


// ══════════════════════════════════════════════════════════
// SHARED STYLES
// ══════════════════════════════════════════════════════════

const pageStyle = {
  width: "100%", maxWidth: 480, margin: "0 auto", minHeight: "100vh",
  background: BG, fontFamily: FONT_B, color: "#fff",
  display: "flex", flexDirection: "column", alignItems: "center",
  padding: "80px 24px 40px",
};

const socialBtnStyle = {
  flex: 1, padding: "12px 16px", borderRadius: 10,
  background: SURFACE2, border: `1px solid ${BORDER}`,
  color: DIM, fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: FONT_B,
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  transition: "all 0.2s",
};

const backBtnStyle = {
  position: "absolute", top: 20, left: 20,
  background: "none", border: "none",
  color: MUTED, fontSize: 12, cursor: "pointer", fontFamily: FONT_B,
};


// ══════════════════════════════════════════════════════════
// APP ROOT — SCREEN ROUTER
// ══════════════════════════════════════════════════════════

export default function App() {
  const [screen, setScreen] = useState('login'); // 'login' | 'admin' | 'onboarding' | 'portal'
  const [rootId, setRootId] = useState(null);

  useEffect(() => { api.setBaseUrl(API_BASE); }, []);

  // Portal
  if (screen === 'portal' && rootId) {
    return (
      <PIKPortal
        rootId={rootId}
        onLogout={() => {
          api.clearSession();
          setRootId(null);
          setScreen('login');
        }}
      />
    );
  }

  // Onboarding
  if (screen === 'onboarding') {
    return (
      <PIKOnboarding
        onComplete={() => setScreen('login')}
      />
    );
  }

  // Admin
  if (screen === 'admin') {
    return (
      <AdminPanel
        onImpersonate={(rid) => { setRootId(rid); setScreen('portal'); }}
        onBack={() => setScreen('login')}
      />
    );
  }

  // Player Login (default)
  return (
    <PlayerLogin
      onLogin={(rid) => { setRootId(rid); setScreen('portal'); }}
      onNewUser={() => setScreen('onboarding')}
      onAdminSwitch={() => setScreen('admin')}
    />
  );
}
