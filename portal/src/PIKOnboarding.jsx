import { useState, useEffect, useCallback } from "react";

/* ═══════ SHARED STYLES ═══════ */
const S = {
  page: { width: "100%", maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: "linear-gradient(180deg,#0a0a1a 0%,#0f0f2e 50%,#0a0a1a 100%)", fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", color: "#fff", position: "relative", overflow: "hidden" },
  orb1: { position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(99,102,241,0.08) 0%,transparent 70%)", top: -100, right: -100, pointerEvents: "none" },
  orb2: { position: "absolute", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle,rgba(139,92,246,0.06) 0%,transparent 70%)", bottom: -50, left: -50, pointerEvents: "none" },
  back: { background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 14, padding: 0, marginBottom: 24, textAlign: "left", fontFamily: "inherit" },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" },
  card: { background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: 16, marginBottom: 20, border: "1px solid rgba(255,255,255,0.05)" },
};

/* ═══════ SHARED COMPONENTS ═══════ */
function Btn({ children, onClick, disabled, variant = "primary", style: extra = {} }) {
  const [h, setH] = useState(false);
  const v = { primary: { bg: "linear-gradient(135deg,#6366f1,#8b5cf6)", sh: "0 4px 24px rgba(99,102,241,0.4)", hsh: "0 8px 32px rgba(99,102,241,0.6)", c: "#fff" }, secondary: { bg: "rgba(255,255,255,0.06)", sh: "none", hsh: "0 4px 16px rgba(255,255,255,0.1)", c: "#fff" }, google: { bg: "#fff", sh: "0 2px 8px rgba(0,0,0,0.2)", hsh: "0 4px 16px rgba(0,0,0,0.3)", c: "#333" }, apple: { bg: "#000", sh: "0 2px 8px rgba(0,0,0,0.3)", hsh: "0 4px 16px rgba(0,0,0,0.4)", c: "#fff" } }[variant];
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: disabled ? "rgba(255,255,255,0.04)" : v.bg, border: variant === "secondary" ? "1px solid rgba(255,255,255,0.1)" : "none", borderRadius: 12, padding: "14px 28px", color: disabled ? "rgba(255,255,255,0.2)" : v.c, fontSize: 15, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.3s ease", boxShadow: h && !disabled ? v.hsh : v.sh, transform: h && !disabled ? "translateY(-1px)" : "none", width: "100%", fontFamily: "inherit", letterSpacing: "0.02em", ...extra }}>
      {children}
    </button>
  );
}

function Input({ label, value, onChange, placeholder, type = "text", maxLength }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={S.label}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ width: "100%", padding: "12px 16px", background: "rgba(255,255,255,0.04)", border: `1px solid ${f ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)"}`, borderRadius: 10, color: "#fff", fontSize: 15, outline: "none", transition: "all 0.3s ease", fontFamily: "inherit", boxShadow: f ? "0 0 20px rgba(99,102,241,0.15)" : "none", boxSizing: "border-box" }} />
    </div>
  );
}

function Fade({ show, delay = 0, children, style: extra = {} }) {
  const [v, setV] = useState(false);
  useEffect(() => { if (show) { const t = setTimeout(() => setV(true), delay); return () => clearTimeout(t); } }, [show, delay]);
  return <div style={{ opacity: v ? 1 : 0, transform: v ? "translateY(0)" : "translateY(12px)", transition: "all 0.6s cubic-bezier(0.16,1,0.3,1)", ...extra }}>{children}</div>;
}

/* Minimal 2-dot progress indicator */
function Progress({ current }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 32 }}>
      {["Sign In", "Fate ID"].map((label, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 14px", borderRadius: 20,
            background: i <= current ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${i === current ? "rgba(99,102,241,0.3)" : i < current ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.06)"}`,
            transition: "all 0.4s ease",
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700,
              background: i <= current ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(255,255,255,0.06)",
              color: i <= current ? "#fff" : "rgba(255,255,255,0.25)",
              transition: "all 0.4s ease",
            }}>
              {i < current ? "✓" : i + 1}
            </div>
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: i <= current ? "rgba(167,139,250,0.9)" : "rgba(255,255,255,0.2)",
              transition: "color 0.4s ease",
            }}>{label}</span>
          </div>
          {i === 0 && <div style={{ width: 24, height: 1, background: current > 0 ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)", transition: "all 0.4s ease" }} />}
        </div>
      ))}
    </div>
  );
}


/* ═══════ STEP 1: AUTH (kept clean — minimal tweaks) ═══════ */
function Auth({ onNext, onBack }) {
  const [e, setE] = useState(false);
  const [method, setMethod] = useState(null);
  const [email, setEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => { setTimeout(() => setE(true), 100); }, []);

  const doAuth = (m) => {
    setMethod(m);
    setLoading(true);
    setTimeout(() => { setLoading(false); onNext({ method: m, email: m === "email" ? email : `user@${m}.com` }); }, 1800);
  };

  return (
    <div style={{ minHeight: "calc(100vh - 80px)", display: "flex", flexDirection: "column", padding: "0 24px 40px" }}>
      {onBack && <button onClick={onBack} style={S.back}>← Back</button>}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 380, margin: "0 auto", width: "100%" }}>
        <Fade show={e}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: "0 0 8px" }}>How Will You Sign In?</h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", margin: "0 0 32px", lineHeight: 1.6 }}>
            Choose how you'll access your account. You can link additional methods later.
          </p>
        </Fade>

        {loading ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div style={{ width: 48, height: 48, border: "3px solid rgba(99,102,241,0.2)", borderTopColor: "#6366f1", borderRadius: "50%", margin: "0 auto 20px", animation: "pikspin 0.8s linear infinite" }} />
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
              {method === "google" ? "Connecting to Google..." : method === "apple" ? "Connecting to Apple..." : method === "passkey" ? "Waiting for biometric..." : "Verifying email..."}
            </p>
            <style>{`@keyframes pikspin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <Fade show={e} delay={200}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Btn variant="google" onClick={() => doAuth("google")}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  <span>Continue with Google</span>
                </div>
              </Btn>
              <Btn variant="apple" onClick={() => doAuth("apple")}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                  <span>Continue with Apple</span>
                </div>
              </Btn>
              <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "8px 0" }}>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>or</span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
              </div>
              <Btn variant="secondary" onClick={() => doAuth("passkey")}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🔐</span><span>Use Passkey / Biometric</span>
                </div>
              </Btn>
              {!showEmail ? (
                <button onClick={() => setShowEmail(true)} style={{ background: "none", border: "none", color: "rgba(139,92,246,0.8)", fontSize: 13, cursor: "pointer", padding: "8px 0", fontFamily: "inherit", fontWeight: 500 }}>
                  Use email address instead
                </button>
              ) : (
                <div style={{ marginTop: 4 }}>
                  <Input label="Email Address" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
                  <Btn onClick={() => doAuth("email")} disabled={!email.includes("@")}>Continue with Email</Btn>
                </div>
              )}
            </div>
          </Fade>
        )}

        <Fade show={e} delay={400}>
          <div style={{ marginTop: 32, padding: 16, ...S.card }}>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", margin: 0, lineHeight: 1.7 }}>
              🔒 <strong style={{ color: "rgba(255,255,255,0.45)" }}>Privacy First.</strong> Your sign-in provider only confirms your identity — we never access your contacts, calendar, or other account data.
            </p>
          </div>
        </Fade>
      </div>
    </div>
  );
}


/* ═══════ STEP 2: FATE ID (stripped to essentials) ═══════ */
function FateIdStep({ authData, onNext, onBack, takenDisplayNames = [] }) {
  const [e, setE] = useState(false);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  useEffect(() => { setTimeout(() => setE(true), 100); }, []);

  const nameLower = name.trim().toLowerCase();
  const isTaken = nameLower.length >= 2 && takenDisplayNames.some(n => n.toLowerCase() === nameLower);
  const isValid = name.trim().length >= 2 && !isTaken;

  const suggestions = [];
  if (isTaken) {
    for (let i = 1; suggestions.length < 3; i++) {
      const candidate = `${name.trim()}${i}`;
      if (!takenDisplayNames.some(n => n.toLowerCase() === candidate.toLowerCase())) {
        suggestions.push(candidate);
      }
      if (i > 99) break;
    }
  }

  const ok = isValid && agreed;

  return (
    <div style={{ minHeight: "calc(100vh - 80px)", display: "flex", flexDirection: "column", padding: "0 24px 40px" }}>
      <button onClick={onBack} style={S.back}>← Back</button>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 380, margin: "0 auto", width: "100%" }}>

        <Fade show={e}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: "0 0 8px" }}>Choose Your Fate Name</h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", margin: "0 0 28px", lineHeight: 1.6 }}>
            This is your identity across all realms and experiences.
          </p>
        </Fade>

        <Fade show={e} delay={200}>
          <Input label="Fate Name" value={name} onChange={setName} placeholder="The name the realms will know you by" maxLength={24} />

          {/* Uniqueness feedback */}
          {name.trim().length >= 2 && (
            <div style={{
              marginTop: -12, marginBottom: 16, padding: "8px 12px", borderRadius: 8,
              background: isTaken ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)",
              border: `1px solid ${isTaken ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)"}`,
            }}>
              {isTaken ? (
                <div>
                  <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 600, marginBottom: 6 }}>
                    ✘ "{name.trim()}" is already claimed
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>Try one of these:</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {suggestions.map(s => (
                      <button key={s} onClick={() => setName(s)} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "#a78bfa", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{s}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>
                  ✔ "{name.trim()}" is available
                </div>
              )}
            </div>
          )}

          {/* Live preview — only when valid */}
          {name.length > 0 && isValid && (
            <div style={{ padding: "12px 16px", background: "rgba(99,102,241,0.06)", borderRadius: 10, marginBottom: 20, border: "1px solid rgba(99,102,241,0.1)" }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Preview</span>
              <p style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "4px 0 0" }}>
                {name}<span style={{ fontSize: 13, color: "rgba(167,139,250,0.6)", fontWeight: 400 }}> #FATE</span>
              </p>
            </div>
          )}

          {/* Consent */}
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", marginBottom: 24 }}>
            <div onClick={() => setAgreed(!agreed)} style={{
              width: 20, height: 20, minWidth: 20, borderRadius: 6,
              border: `2px solid ${agreed ? "#6366f1" : "rgba(255,255,255,0.15)"}`,
              background: agreed ? "#6366f1" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s ease", marginTop: 1, cursor: "pointer",
            }}>
              {agreed && <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>✓</span>}
            </div>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
              I agree to the{" "}
              <span style={{ color: "rgba(139,92,246,0.8)", textDecoration: "underline" }}>Terms</span> and{" "}
              <span style={{ color: "rgba(139,92,246,0.8)", textDecoration: "underline" }}>Privacy Policy</span>.
              Your data is stored securely and you can request deletion at any time.
            </span>
          </label>

          <Btn onClick={() => onNext({ displayName: name.trim() })} disabled={!ok}>Create Fate ID</Btn>
        </Fade>
      </div>
    </div>
  );
}


/* ═══════ MAIN — 2-step flow: Auth → Fate ID → Dashboard ═══════ */
export default function PIKOnboarding({ onComplete, onBack }) {
  const [step, setStep] = useState(0);
  const [auth, setAuth] = useState(null);
  const [acct, setAcct] = useState(null);
  const [fade, setFade] = useState(false);
  const [takenDisplayNames, setTakenDisplayNames] = useState([]);

  const go = useCallback((n) => {
    setFade(true);
    setTimeout(() => { setStep(n); setFade(false); }, 300);
  }, []);

  // Fetch existing names for uniqueness validation
  useEffect(() => {
    import('./api.js').then(mod => {
      const api = mod.default;
      api.listUsers().then(resp => {
        if (resp.ok && Array.isArray(resp.data)) {
          setTakenDisplayNames(resp.data.map(u => u.display_name).filter(Boolean));
        }
      }).catch(() => {});
    }).catch(() => {});
  }, []);

  return (
    <div style={S.page}>
      <div style={S.orb1} /><div style={S.orb2} />

      {/* Progress dots — visible on both steps */}
      <div style={{ padding: "24px 24px 0", position: "relative", zIndex: 2 }}>
        <Progress current={step} />
      </div>

      <div style={{
        opacity: fade ? 0 : 1,
        transform: fade ? "translateY(8px)" : "none",
        transition: "all 0.3s ease",
        position: "relative", zIndex: 1,
      }}>
        {step === 0 && (
          <Auth
            onNext={d => { setAuth(d); go(1); }}
            onBack={onBack}
          />
        )}
        {step === 1 && (
          <FateIdStep
            authData={auth}
            onNext={d => {
              setAcct(d);
              // Fire completion — consumer (App router) lands user on Fate Dashboard
              onComplete && onComplete({ auth, acct: d });
            }}
            onBack={() => go(0)}
            takenDisplayNames={takenDisplayNames}
          />
        )}
      </div>
    </div>
  );
}
