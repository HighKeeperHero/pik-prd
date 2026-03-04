import { useState, useEffect } from 'react';
import PIKOnboarding from './PIKOnboarding.jsx';
import PIKPortal from './PIKPortal.jsx';
import FateDashboard from './FateDashboard.jsx';
import api from './api.js';

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


// ══════════════════════════════════════════════════════════
// PLAYER LOGIN — hero name + passkey/social options
// ══════════════════════════════════════════════════════════

function PlayerLogin({ onLogin, onNewUser, onAdminSwitch }) {
  const [heroName, setHeroName] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [matchedUser, setMatchedUser] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [focused, setFocused] = useState(false);

  // Background fetch of users for name matching
  useEffect(() => {
    api.setBaseUrl(API_BASE);
    api.listUsers().then(resp => {
      if (resp.ok && Array.isArray(resp.data)) setAllUsers(resp.data);
    });
  }, []);

  // Autocomplete as user types
  useEffect(() => {
    if (heroName.length < 2) { setSuggestions([]); setMatchedUser(null); return; }
    const q = heroName.toLowerCase();
    const matches = allUsers.filter(u =>
      (u.hero_name || '').toLowerCase().includes(q) ||
      (u.display_name || '').toLowerCase().includes(q)
    ).slice(0, 5);
    setSuggestions(matches);
    const exact = allUsers.find(u => (u.hero_name || '').toLowerCase() === q || (u.display_name || '').toLowerCase() === q);
    setMatchedUser(exact || null);
  }, [heroName, allUsers]);

  const selectUser = (user) => {
    setHeroName(user.display_name || user.hero_name);
    setMatchedUser(user);
    setSuggestions([]);
    setFocused(false);
  };

  // Sign in via impersonate (demo) — production would trigger passkey per-user
  const handleSignIn = async () => {
    if (!matchedUser) {
      setError('Account not found. Check the spelling or create a new account.');
      return;
    }
    setLoading(true);
    setError(null);
    const resp = await api.impersonate(matchedUser.root_id);
    if (resp.ok) {
      onLogin(matchedUser.root_id, matchedUser);
    } else {
      setError('Sign-in failed. Please try again.');
    }
    setLoading(false);
  };

  // Passkey login
  const handlePasskeyLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!window.PublicKeyCredential) {
        setError('Passkeys not supported on this device.');
        setLoading(false);
        return;
      }
      const optResp = await api.post('/api/auth/authenticate/options', {});
      if (!optResp.ok) {
        setError('Could not start passkey authentication.');
        setLoading(false);
        return;
      }
      const options = optResp.data;
      const pkOpts = {
        challenge: b64ToBuffer(options.challenge),
        timeout: options.timeout || 60000,
        rpId: options.rpId || window.location.hostname,
        allowCredentials: (options.allowCredentials || []).map(c => ({
          ...c, id: b64ToBuffer(c.id),
        })),
        userVerification: options.userVerification || 'preferred',
      };
      const assertion = await navigator.credentials.get({ publicKey: pkOpts });
      const verifyResp = await api.post('/api/auth/authenticate/verify', {
        assertion: {
          id: assertion.id,
          rawId: bufferToB64(assertion.rawId),
          response: {
            authenticatorData: bufferToB64(assertion.response.authenticatorData),
            clientDataJSON: bufferToB64(assertion.response.clientDataJSON),
            signature: bufferToB64(assertion.response.signature),
          },
          type: assertion.type,
          clientExtensionResults: assertion.getClientExtensionResults(),
        },
      });
      if (verifyResp.ok && verifyResp.data) {
        const token = verifyResp.data.session_token || verifyResp.data.token;
        const rootId = verifyResp.data.root_id;
        if (token && rootId) { api.setSession(token, rootId); onLogin(rootId, null); }
        else setError('Auth succeeded but no session returned.');
      } else {
        setError('Passkey verification failed.');
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') setError('Authentication cancelled.');
      else { console.error('Passkey error:', err); setError('Passkey authentication failed.'); }
    } finally { setLoading(false); }
  };

  const handleSocialLogin = (provider) => {
    setError(`${provider} login coming soon.`);
  };

  const alignColor = (a) => a === 'ORDER' ? '#3b82f6' : a === 'CHAOS' ? '#ef4444' : a === 'VEIL' ? '#a855f7' : '#a78bfa';

  return (
    <div style={pageStyle}>
      <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Logo */}
      <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, marginBottom: 24, boxShadow: "0 8px 32px rgba(99,102,241,0.3)" }}>{"\u25C8"}</div>
      <h1 style={{ fontSize: 28, fontWeight: 700, fontFamily: FONT, margin: "0 0 6px", textAlign: "center", color: "#fff" }}>Heroes' Veritas</h1>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 36px", textAlign: "center", fontFamily: FONT_B }}>Enter the Realms of Elysendar</p>

      {error && (
        <div style={{ ...errBoxStyle, marginBottom: 16, width: "100%", maxWidth: 340 }}>
          <p style={errTextStyle}>{error}</p>
        </div>
      )}

      {/* Hero Name Input */}
      <div style={{ width: "100%", maxWidth: 340, position: "relative" }}>
        <label style={labelStyle}>Fate Name</label>
        <div style={{ position: "relative" }}>
          <input
            type="text"
            value={heroName}
            onChange={e => { setHeroName(e.target.value); setError(null); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            onKeyDown={e => e.key === 'Enter' && handleSignIn()}
            placeholder="Enter your fate name..."
            autoComplete="off"
            style={{
              width: "100%", padding: "14px 16px", paddingRight: matchedUser ? 80 : 16,
              borderRadius: 12,
              background: SURFACE2,
              border: `1px solid ${matchedUser ? "rgba(34,197,94,0.4)" : focused ? "rgba(99,102,241,0.4)" : BORDER}`,
              color: "#fff", fontSize: 15, fontFamily: FONT_B,
              outline: "none", boxSizing: "border-box",
              transition: "border-color 0.2s",
            }}
          />
          {matchedUser && (
            <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
              <span style={{ fontSize: 11, color: "#22c55e", fontFamily: FONT_B, fontWeight: 600 }}>Found</span>
            </div>
          )}
        </div>

        {/* Autocomplete dropdown */}
        {focused && suggestions.length > 0 && !matchedUser && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
            background: "#14141f", border: `1px solid rgba(99,102,241,0.2)`, borderRadius: 10,
            overflow: "hidden", zIndex: 20, boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
          }}>
            {suggestions.map((u, i) => (
              <button
                key={u.root_id}
                onMouseDown={() => selectUser(u)}
                style={{
                  width: "100%", padding: "11px 14px",
                  background: "none", border: "none",
                  borderBottom: i < suggestions.length - 1 ? `1px solid ${BORDER}` : "none",
                  color: "#fff", fontSize: 13, fontFamily: FONT_B,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 14 }}>{"\u2694\uFE0F"}</span>
                <span style={{ fontWeight: 600, flex: 1 }}>{u.display_name || u.hero_name}</span>
                {u.hero_name && u.display_name && <span style={{ fontSize: 11, color: MUTED, fontStyle: "italic" }}>{u.hero_name}</span>}
                <span style={{ color: alignColor(u.fate_alignment), fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>{u.fate_alignment}</span>
                <span style={{ fontSize: 11, color: MUTED }}>Lv {u.fate_level || 1}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sign In Button */}
      <button
        onClick={handleSignIn}
        disabled={loading || !matchedUser}
        style={{
          width: "100%", maxWidth: 340, marginTop: 14, padding: "14px 20px", borderRadius: 12,
          background: matchedUser ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : SURFACE2,
          border: matchedUser ? "none" : `1px solid ${BORDER}`,
          color: matchedUser ? "#fff" : MUTED,
          fontSize: 15, fontWeight: 600,
          cursor: loading || !matchedUser ? "default" : "pointer",
          fontFamily: FONT_B, transition: "all 0.3s ease",
          boxShadow: matchedUser ? "0 4px 20px rgba(99,102,241,0.25)" : "none",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "Entering the Realms..." : matchedUser ? `Enter as ${matchedUser.display_name || matchedUser.hero_name}` : "Sign In"}
      </button>

      {/* Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", maxWidth: 340, margin: "22px 0" }}>
        <div style={{ flex: 1, height: 1, background: BORDER }} />
        <span style={{ fontSize: 11, color: MUTED, fontFamily: FONT_B, textTransform: "uppercase", letterSpacing: "0.08em" }}>or</span>
        <div style={{ flex: 1, height: 1, background: BORDER }} />
      </div>

      {/* Alt auth row */}
      <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 340 }}>
        <button onClick={handlePasskeyLogin} disabled={loading} style={altBtnStyle}>
          <span style={{ fontSize: 15 }}>{"\uD83D\uDD11"}</span>
          <span>Passkey</span>
        </button>
        <button onClick={() => handleSocialLogin('Google')} style={altBtnStyle}>
          <svg width="15" height="15" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          <span>Google</span>
        </button>
        <button onClick={() => handleSocialLogin('Apple')} style={altBtnStyle}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.32 2.32-2.12 4.54-3.74 4.25z"/></svg>
          <span>Apple</span>
        </button>
      </div>

      {/* Create New Hero */}
      <button onClick={onNewUser} style={{ marginTop: 28, width: "100%", maxWidth: 340, padding: "12px 20px", borderRadius: 12, background: SURFACE2, border: `1px solid ${BORDER}`, color: DIM, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT_B, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <span style={{ fontSize: 15 }}>{"\u2728"}</span>
        Create New Account
      </button>

      {/* Operator link */}
      <button
        onClick={onAdminSwitch}
        style={{ marginTop: 32, background: "none", border: "none", color: "rgba(255,255,255,0.12)", fontSize: 11, cursor: "pointer", fontFamily: FONT_B, padding: "8px 16px" }}
        onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.35)"}
        onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.12)"}
      >
        Operator Access
      </button>
    </div>
  );
}


// ══════════════════════════════════════════════════════════
// ADMIN PANEL
// ══════════════════════════════════════════════════════════

function AdminPanel({ onImpersonate, onBack }) {
  const [step, setStep] = useState('login');
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [loggingIn, setLoggingIn] = useState(null);

  const OPERATOR_PASS = 'heroesveritas2025';

  const handleAdminLogin = () => {
    if (passphrase === OPERATOR_PASS) { setStep('panel'); setError(null); loadUsers(); }
    else setError('Invalid operator passphrase');
  };

  const loadUsers = async () => {
    setLoading(true);
    const resp = await api.listUsers();
    if (resp.ok && Array.isArray(resp.data)) setUsers(resp.data);
    else setError('Failed to load users');
    setLoading(false);
  };

  const handleImpersonate = async (user) => {
    setLoggingIn(user.root_id);
    const resp = await api.impersonate(user.root_id);
    if (resp.ok) onImpersonate(user.root_id, user);
    else { setError(`Failed: ${resp.error}`); setLoggingIn(null); }
  };

  const filtered = users.filter(u => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (u.hero_name || '').toLowerCase().includes(s) || (u.root_id || '').toLowerCase().includes(s) || (u.fate_alignment || '').toLowerCase().includes(s);
  });

  const alignColor = (a) => a === 'ORDER' ? '#3b82f6' : a === 'CHAOS' ? '#ef4444' : a === 'VEIL' ? '#a855f7' : '#a78bfa';

  // ── Admin Login ──
  if (step === 'login') {
    return (
      <div style={pageStyle}>
        <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <button onClick={onBack} style={backBtnStyle}>{"\u2190"} Back to Login</button>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: "linear-gradient(135deg, #f59e0b, #d97706)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 20 }}>{"\u2699\uFE0F"}</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, fontFamily: FONT, margin: "0 0 6px", color: "#fff" }}>Operator Access</h2>
        <p style={{ fontSize: 12, color: MUTED, margin: "0 0 28px", fontFamily: FONT_B }}>Admin panel for user management</p>
        {error && <div style={{ ...errBoxStyle, width: "100%", maxWidth: 320 }}><p style={errTextStyle}>{error}</p></div>}
        <div style={{ width: "100%", maxWidth: 320 }}>
          <label style={labelStyle}>Operator Passphrase</label>
          <input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdminLogin()} placeholder="Enter passphrase" style={{ ...inputStyle, width: "100%" }} />
          <button onClick={handleAdminLogin} style={{ width: "100%", marginTop: 12, padding: "12px 20px", borderRadius: 10, background: "linear-gradient(135deg, #f59e0b, #d97706)", border: "none", color: "#000", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT_B }}>
            Sign In as Operator
          </button>
        </div>
      </div>
    );
  }

  // ── Admin User List ──
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
      {/* Stats */}
      <div style={{ padding: "12px 20px", display: "flex", gap: 16, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 11, color: DIM }}><span style={{ fontWeight: 700, color: "#fff", fontSize: 16, marginRight: 4 }}>{users.length}</span> Heroes</div>
        <div style={{ fontSize: 11, color: DIM }}><span style={{ color: "#22c55e", marginRight: 4 }}>{"\u2022"}</span> Connected</div>
      </div>
      {/* Search */}
      <div style={{ padding: "12px 20px" }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, ID, alignment..." style={{ ...inputStyle, width: "100%" }} />
      </div>
      {error && <div style={{ margin: "0 20px 12px", ...errBoxStyle }}><p style={errTextStyle}>{error}</p></div>}
      {/* User list */}
      <div style={{ padding: "4px 20px 40px" }}>
        {loading && <p style={{ fontSize: 13, color: DIM, textAlign: "center", padding: 20 }}>Loading...</p>}
        {filtered.map(user => {
          const active = loggingIn === user.root_id;
          return (
            <div key={user.root_id} style={{ padding: "14px 16px", borderRadius: 12, marginBottom: 8, background: active ? "rgba(245,158,11,0.08)" : SURFACE, border: `1px solid ${active ? "rgba(245,158,11,0.3)" : BORDER}`, display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: `${alignColor(user.fate_alignment)}15`, border: `1px solid ${alignColor(user.fate_alignment)}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{"\u2694\uFE0F"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.hero_name || 'Unknown'}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2, display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: alignColor(user.fate_alignment), fontWeight: 600 }}>{user.fate_alignment}</span>
                  <span>Lv {user.fate_level || 1}</span>
                  <span>{(user.fate_xp || 0).toLocaleString()} XP</span>
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", marginTop: 2, fontFamily: "monospace" }}>{user.root_id}</div>
              </div>
              <button onClick={() => handleImpersonate(user)} disabled={!!loggingIn} style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a78bfa", fontSize: 11, fontWeight: 600, cursor: loggingIn ? "not-allowed" : "pointer", fontFamily: FONT_B }}>
                {active ? "Entering..." : "View as User"}
              </button>
            </div>
          );
        })}
        {!loading && filtered.length === 0 && <p style={{ fontSize: 13, color: MUTED, textAlign: "center", padding: 20 }}>{search ? 'No match' : 'No heroes enrolled'}</p>}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════
// WEBAUTHN HELPERS
// ══════════════════════════════════════════════════════════

function b64ToBuffer(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

function bufferToB64(buf) {
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
  padding: "80px 24px 40px", position: "relative",
};

const altBtnStyle = {
  flex: 1, padding: "11px 10px", borderRadius: 10,
  background: SURFACE2, border: `1px solid ${BORDER}`,
  color: DIM, fontSize: 12, fontWeight: 600,
  cursor: "pointer", fontFamily: FONT_B,
  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
};

const backBtnStyle = {
  position: "absolute", top: 20, left: 20,
  background: "none", border: "none",
  color: MUTED, fontSize: 12, cursor: "pointer", fontFamily: FONT_B,
};

const inputStyle = {
  padding: "12px 16px", borderRadius: 10,
  background: SURFACE2, border: `1px solid ${BORDER}`,
  color: "#fff", fontSize: 14, fontFamily: FONT_B,
  outline: "none", boxSizing: "border-box",
};

const labelStyle = {
  fontSize: 11, color: DIM, fontFamily: FONT_B,
  textTransform: "uppercase", letterSpacing: "0.06em",
  marginBottom: 6, display: "block",
};

const errBoxStyle = {
  padding: "10px 16px", borderRadius: 8,
  background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
  marginBottom: 16,
};

const errTextStyle = { fontSize: 12, color: "#ef4444", margin: 0, fontFamily: FONT_B, textAlign: "center" };


// ══════════════════════════════════════════════════════════
// APP ROOT
// ══════════════════════════════════════════════════════════

export default function App() {
  const [screen, setScreen] = useState('login');
  const [rootId, setRootId] = useState(null);
  const [userData, setUserData] = useState(null);

  useEffect(() => { api.setBaseUrl(API_BASE); }, []);

  // Admin handoff: check URL params for ?admin_token=...&root_id=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const adminToken = params.get('admin_token');
    const adminRootId = params.get('root_id');
    if (adminToken && adminRootId) {
      // Clear URL params so refresh doesn't re-trigger
      window.history.replaceState({}, '', window.location.pathname);
      // Set session and go to dashboard
      api.setBaseUrl(API_BASE);
      api.impersonate(adminRootId).then(resp => {
        if (resp.ok) {
          setRootId(adminRootId);
          setScreen('dashboard');
        }
      }).catch(() => {});
    }
  }, []);

  // Fetch full user data when rootId is set but userData is incomplete (e.g. passkey login)
  useEffect(() => {
    if (!rootId || (userData && userData.display_name)) return;
    api.getProfile(rootId).then(resp => {
      if (resp.ok && resp.data) {
        const profile = resp.data;
        // Extract Fate Name from persona displayName
        const fateName = profile.personas?.[0]?.display_name || profile.hero_name;
        setUserData(prev => ({
          ...(prev || {}),
          ...profile,
          root_id: rootId,
          display_name: fateName,
        }));
      }
    }).catch(() => {});
  }, [rootId, userData]);

  const handleLogout = () => {
    api.clearSession();
    setRootId(null);
    setUserData(null);
    setScreen('login');
  };

  if (screen === 'portal' && rootId) {
    return <PIKPortal rootId={rootId} onLogout={handleLogout} onBackToDashboard={() => setScreen('dashboard')} />;
  }
  if (screen === 'dashboard' && rootId) {
    return (
      <FateDashboard
        rootId={rootId}
        userData={userData}
        onLogout={handleLogout}
        onEnterPortal={(rid) => setScreen('portal')}
        onUserDataRefresh={(newData) => {
          // Preserve Fate Name from persona, don't let it get overwritten by hero_name
          const fateName = newData.personas?.[0]?.display_name || userData?.display_name || newData.hero_name;
          setUserData(prev => ({ ...prev, ...newData, display_name: fateName }));
        }}
      />
    );
  }
  if (screen === 'onboarding') {
    return <PIKOnboarding onComplete={async ({ auth, acct }) => {
      // Enroll user via backend
      try {
        const resp = await api.enrollUser({
          hero_name: acct.displayName,
          fate_alignment: 'NONE',
          enrolled_by: 'portal',
        });
        if (resp.ok && resp.data?.root_id) {
          const newRootId = resp.data.root_id;
          // Auto-login: impersonate to get a session token
          const loginResp = await api.impersonate(newRootId);
          if (loginResp.ok) {
            setRootId(newRootId);
            setUserData({
              root_id: newRootId,
              hero_name: resp.data.hero_name,
              display_name: acct.displayName, // Fate Name — permanent
              fate_alignment: resp.data.fate_alignment,
              fate_level: 1,
              fate_xp: 0,
            });
            setScreen('dashboard');
            return;
          }
        }
      } catch (err) {
        console.error('Enrollment/auto-login failed:', err);
      }
      // Fallback: send to login
      setScreen('login');
    }} onBack={() => setScreen('login')} />;
  }
  if (screen === 'admin') {
    return <AdminPanel onImpersonate={(rid, user) => { setRootId(rid); setUserData(user); setScreen('dashboard'); }} onBack={() => setScreen('login')} />;
  }
  return <PlayerLogin onLogin={(rid, user) => { setRootId(rid); setUserData(user); setScreen('dashboard'); }} onNewUser={() => setScreen('onboarding')} onAdminSwitch={() => setScreen('admin')} />;
}
