import { useState, useEffect } from 'react';
import PIKOnboarding from './PIKOnboarding.jsx';
import PIKPortal from './PIKPortal.jsx';
import api from './api.js';

/**
 * PIK App Root
 * 
 * Modes:
 *   1. Demo mode: pick a user from the backend to impersonate
 *   2. Onboarding: new user registration flow
 *   3. Portal: authenticated player experience
 * 
 * The API base URL is configured here and passed down.
 */

// ── Configuration ──
// In production, this comes from env vars. For now, hardcoded.
const API_BASE = import.meta.env.VITE_PIK_API_URL || 'https://pik-prd-production.up.railway.app';

// ── Styles ──
const FONT_B = "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const BG = "#08080f";
const SURFACE = "rgba(255,255,255,0.025)";
const BORDER = "rgba(255,255,255,0.06)";
const MUTED = "rgba(255,255,255,0.35)";
const DIM = "rgba(255,255,255,0.5)";

function DemoLogin({ onLogin, onNewUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loggingIn, setLoggingIn] = useState(null);

  useEffect(() => {
    api.setBaseUrl(API_BASE);
    api.listUsers().then(resp => {
      setLoading(false);
      if (resp.ok && Array.isArray(resp.data)) {
        setUsers(resp.data);
      } else {
        setError('Could not reach PIK backend');
      }
    });
  }, []);

  const handleLogin = async (user) => {
    setLoggingIn(user.root_id);
    const resp = await api.impersonate(user.root_id);
    if (resp.ok) {
      onLogin(user.root_id);
    } else {
      setError(`Login failed: ${resp.error}`);
      setLoggingIn(null);
    }
  };

  return (
    <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: BG, fontFamily: FONT_B, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 24px" }}>
      <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      
      <div style={{ width: 56, height: 56, borderRadius: 14, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, marginBottom: 20 }}>{"\u25C8"}</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Crimson Pro', serif", margin: "0 0 6px", textAlign: "center" }}>Heroes' Veritas</h1>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 32px", textAlign: "center" }}>Select a hero to enter the realms</p>

      {loading && <p style={{ fontSize: 13, color: DIM }}>Connecting to PIK backend...</p>}
      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", marginBottom: 16, width: "100%" }}>
          <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>{error}</p>
        </div>
      )}

      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
        {users.map(user => {
          const isLoading = loggingIn === user.root_id;
          return (
            <button
              key={user.root_id}
              onClick={() => handleLogin(user)}
              disabled={!!loggingIn}
              style={{
                width: "100%", padding: "16px 20px", borderRadius: 12,
                background: isLoading ? "rgba(99,102,241,0.15)" : SURFACE,
                border: `1px solid ${isLoading ? "rgba(99,102,241,0.4)" : BORDER}`,
                cursor: loggingIn ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 14,
                fontFamily: FONT_B, textAlign: "left",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.1))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                {"\u2694\uFE0F"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{user.hero_name || 'Unknown Hero'}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                  {user.fate_alignment && <span style={{ color: user.fate_alignment === 'ORDER' ? '#3b82f6' : user.fate_alignment === 'CHAOS' ? '#ef4444' : '#a78bfa', marginRight: 8 }}>{user.fate_alignment}</span>}
                  Lv {user.fate_level || 1} {"\u2022"} {(user.fate_xp || 0).toLocaleString()} XP
                  {user.active_sources > 0 && <span> {"\u2022"} {user.active_sources} source{user.active_sources > 1 ? 's' : ''}</span>}
                </div>
              </div>
              {isLoading && <span style={{ fontSize: 12, color: "#a78bfa" }}>Entering...</span>}
            </button>
          );
        })}
      </div>

      {!loading && (
        <button
          onClick={onNewUser}
          style={{
            marginTop: 24, padding: "12px 28px", borderRadius: 10,
            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
            border: "none", color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: FONT_B,
          }}
        >
          + Create New Hero
        </button>
      )}

      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 32, textAlign: "center" }}>
        Connected to: {API_BASE}
      </p>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState('login'); // 'login' | 'onboarding' | 'portal'
  const [rootId, setRootId] = useState(null);

  // Initialize API
  useEffect(() => {
    api.setBaseUrl(API_BASE);
  }, []);

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

  if (screen === 'onboarding') {
    return (
      <PIKOnboarding
        onComplete={(data) => {
          // After onboarding, in production we'd have a real root_id
          // For now, go back to login to pick the new user
          setScreen('login');
        }}
      />
    );
  }

  return (
    <DemoLogin
      onLogin={(rid) => {
        setRootId(rid);
        setScreen('portal');
      }}
      onNewUser={() => setScreen('onboarding')}
    />
  );
}
