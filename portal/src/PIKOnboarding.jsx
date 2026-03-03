import { useState, useEffect, useRef, useCallback } from "react";

const TIERS = [
  { name: "Bronze", color: "#cd7f32", level: "1-6" },
  { name: "Copper", color: "#b87333", level: "7-13" },
  { name: "Silver", color: "#c0c0c0", level: "14-21" },
  { name: "Gold", color: "#ffd700", level: "22-29" },
  { name: "Platinum", color: "#e5e4e2", level: "30-39" },
  { name: "Adamantium", color: "#4ff0d0", level: "40+" },
];

const ADV_CLASSES = [
  { name: "Aegis", role: "Tank", weapon: "Sword / Shield", icon: "\uD83D\uDEE1\uFE0F", color: "#3b82f6" },
  { name: "Scalesworn", role: "DPS", weapon: "Spear", icon: "\uD83D\uDD31", color: "#ef4444" },
  { name: "Dryadic", role: "Healer", weapon: "Staff / Totem", icon: "\uD83C\uDF3F", color: "#22c55e" },
  { name: "Harvester", role: "Support", weapon: "Bow / Dagger", icon: "\uD83C\uDFF9", color: "#a855f7" },
  { name: "Corsair", role: "DPS", weapon: "Sabre / Runic Flintlock", icon: "\u2693", color: "#f97316" },
  { name: "Gambler", role: "Support", weapon: "Magic Cards / Dagger", icon: "\uD83C\uDCCF", color: "#ec4899" },
  { name: "Artificer", role: "Support", weapon: "Bandolier / Mini-Robot", icon: "\u2699\uFE0F", color: "#eab308" },
  { name: "Arcane Scholar", role: "DPS", weapon: "Arcane Tome / Wand", icon: "\uD83D\uDCD6", color: "#8b5cf6" },
];

const TITLES = ["the Unbroken","Shadowbane","of the Ashen Gate","the Wanderer","Dawnbringer","the Relentless","Voidwalker","of the Iron Covenant"];

const REALMS = [
  { name: "Kingvale", icon: "\uD83C\uDFF0", color: "#ffd700" },
  { name: "The Wylds", icon: "\uD83C\uDF3F", color: "#22c55e" },
  { name: "Lochmaw", icon: "\u2693", color: "#3b82f6" },
  { name: "Origin Sands", icon: "\u2600\uFE0F", color: "#f97316" },
  { name: "Desolate Peaks", icon: "\uD83C\uDFD4\uFE0F", color: "#94a3b8" },
];

const roleBadge = (role) => {
  const c = { Tank: "#3b82f6", DPS: "#ef4444", Healer: "#22c55e", Support: "#a855f7" }[role] || "#888";
  return { padding: "2px 8px", borderRadius: 10, background: c + "20", color: c, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", display: "inline-block" };
};

const S = {
  page: { width: "100%", maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: "linear-gradient(180deg,#0a0a1a 0%,#0f0f2e 50%,#0a0a1a 100%)", fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", color: "#fff", position: "relative", overflow: "hidden" },
  orb1: { position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(99,102,241,0.08) 0%,transparent 70%)", top: -100, right: -100, pointerEvents: "none" },
  orb2: { position: "absolute", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle,rgba(139,92,246,0.06) 0%,transparent 70%)", bottom: -50, left: -50, pointerEvents: "none" },
  back: { background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 14, padding: 0, marginBottom: 24, textAlign: "left", fontFamily: "inherit" },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" },
  card: { background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: 16, marginBottom: 20, border: "1px solid rgba(255,255,255,0.05)" },
  pill: () => ({ padding: "6px 14px", borderRadius: 20, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", fontSize: 12, color: "rgba(167,139,250,0.9)", fontWeight: 500 }),
};

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

function Steps({ current, labels }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 32 }}>
      {labels.map((l, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, background: i <= current ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(255,255,255,0.06)", color: i <= current ? "#fff" : "rgba(255,255,255,0.3)", border: i === current ? "2px solid rgba(139,92,246,0.6)" : "2px solid transparent", transition: "all 0.4s ease", boxShadow: i === current ? "0 0 20px rgba(99,102,241,0.3)" : "none" }}>
            {i < current ? "\u2713" : i + 1}
          </div>
          {i < labels.length - 1 && <div style={{ width: 48, height: 2, background: i < current ? "linear-gradient(90deg,#6366f1,#8b5cf6)" : "rgba(255,255,255,0.08)", transition: "all 0.4s ease" }} />}
        </div>
      ))}
    </div>
  );
}

function Fade({ show, delay = 0, children, style: extra = {} }) {
  const [v, setV] = useState(false);
  useEffect(() => { if (show) { const t = setTimeout(() => setV(true), delay); return () => clearTimeout(t); } }, [show, delay]);
  return <div style={{ opacity: v ? 1 : 0, transform: v ? "translateY(0)" : "translateY(12px)", transition: "all 0.6s cubic-bezier(0.16,1,0.3,1)", ...extra }}>{children}</div>;
}

/* ═══════ STEP 0: WELCOME ═══════ */
function Welcome({ onNext, onBack }) {
  const [e, setE] = useState(false);
  useEffect(() => { setTimeout(() => setE(true), 100); }, []);
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center", position: "relative" }}>
      {onBack && <button onClick={onBack} style={{ position: "absolute", top: 24, left: 24, background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", zIndex: 10 }}>{"\u2190"} Back to Login</button>}
      <Fade show={e} delay={0} style={{ marginBottom: 24 }}>
        <div style={{ width: 80, height: 80, margin: "0 auto", borderRadius: 20, background: "linear-gradient(135deg,#6366f1,#8b5cf6,#a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, boxShadow: "0 8px 32px rgba(99,102,241,0.4)" }}>{"\u25C8"}</div>
      </Fade>
      <Fade show={e} delay={200}>
        <div style={{ fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>Persistent Identity Kernel</div>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginTop: 4 }}>PIK</div>
      </Fade>
      <Fade show={e} delay={500}>
        <p style={{ fontSize: 17, lineHeight: 1.7, color: "rgba(255,255,255,0.7)", margin: "32px 0 0", maxWidth: 360 }}>Your gaming identity, persistent across every venue and experience.</p>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.4)", marginTop: 16, maxWidth: 360 }}>Create your PIK account to track progression, earn achievements, and carry your hero across the realms of Elysendar.</p>
      </Fade>
      <Fade show={e} delay={700}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", margin: "28px 0 36px" }}>
          {["Cross-Venue XP", "Wristband Sync", "Live Leaderboards", "Quest Chains"].map(f => <span key={f} style={S.pill()}>{f}</span>)}
        </div>
      </Fade>
      <Fade show={e} delay={900} style={{ width: "100%", maxWidth: 340 }}>
        <Btn onClick={onNext}>Begin Registration</Btn>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 24, lineHeight: 1.6 }}>Your PIK identity is yours. We never sell your data.<br />You can delete your account at any time.</p>
      </Fade>
    </div>
  );
}

/* ═══════ STEP 1: AUTH ═══════ */
function Auth({ onNext, onBack }) {
  const [e, setE] = useState(false);
  const [method, setMethod] = useState(null);
  const [email, setEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => { setTimeout(() => setE(true), 100); }, []);
  const doAuth = (m) => { setMethod(m); setLoading(true); setTimeout(() => { setLoading(false); onNext({ method: m, email: m === "email" ? email : `user@${m}.com` }); }, 1800); };
  return (
    <div style={{ minHeight: "calc(100vh - 80px)", display: "flex", flexDirection: "column", padding: "0 24px 40px" }}>
      <button onClick={onBack} style={S.back}>{"\u2190"} Back</button>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 380, margin: "0 auto", width: "100%" }}>
        <Fade show={e}><h2 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: "0 0 8px" }}>Create Your Account</h2><p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", margin: "0 0 32px", lineHeight: 1.6 }}>Choose how you'd like to sign in. This becomes your authentication across all PIK-connected venues.</p></Fade>
        {loading ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div style={{ width: 48, height: 48, border: "3px solid rgba(99,102,241,0.2)", borderTopColor: "#6366f1", borderRadius: "50%", margin: "0 auto 20px", animation: "pikspin 0.8s linear infinite" }} />
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>{method === "google" ? "Connecting to Google..." : method === "apple" ? "Connecting to Apple..." : method === "passkey" ? "Waiting for biometric..." : "Verifying email..."}</p>
            <style>{`@keyframes pikspin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <Fade show={e} delay={200}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Btn variant="google" onClick={() => doAuth("google")}><div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}><svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg><span>Continue with Google</span></div></Btn>
              <Btn variant="apple" onClick={() => doAuth("apple")}><div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg><span>Continue with Apple</span></div></Btn>
              <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "8px 0" }}><div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} /><span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>or</span><div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} /></div>
              <Btn variant="secondary" onClick={() => doAuth("passkey")}><div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}><span style={{ fontSize: 18 }}>{"\uD83D\uDD10"}</span><span>Use Passkey / Biometric</span></div></Btn>
              {!showEmail ? (<button onClick={() => setShowEmail(true)} style={{ background: "none", border: "none", color: "rgba(139,92,246,0.8)", fontSize: 13, cursor: "pointer", padding: "8px 0", fontFamily: "inherit", fontWeight: 500 }}>Use email address instead</button>) : (<div style={{ marginTop: 4 }}><Input label="Email Address" value={email} onChange={setEmail} placeholder="you@example.com" type="email" /><Btn onClick={() => doAuth("email")} disabled={!email.includes("@")}>Continue with Email</Btn></div>)}
            </div>
          </Fade>
        )}
        <Fade show={e} delay={400}><div style={{ marginTop: 32, padding: 16, ...S.card }}><p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", margin: 0, lineHeight: 1.7 }}>{"\uD83D\uDD12"} <strong style={{ color: "rgba(255,255,255,0.45)" }}>Privacy First.</strong> Your auth provider only confirms your identity — PIK never accesses contacts, calendar, or other account data.</p></div></Fade>
      </div>
    </div>
  );
}

/* ═══════ STEP 2: ACCOUNT ═══════ */
function Account({ authData, onNext, onBack }) {
  const [e, setE] = useState(false);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  useEffect(() => { setTimeout(() => setE(true), 100); }, []);
  const ok = name.length >= 2 && agreed;
  const mi = { google: "\uD83D\uDD35", apple: "\u26AB", passkey: "\uD83D\uDD10", email: "\u2709\uFE0F" }[authData?.method] || "";
  return (
    <div style={{ minHeight: "calc(100vh - 80px)", display: "flex", flexDirection: "column", padding: "0 24px 40px" }}>
      <button onClick={onBack} style={S.back}>{"\u2190"} Back</button>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 380, margin: "0 auto", width: "100%" }}>
        <Fade show={e}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: "0 0 8px" }}>Your PIK Identity</h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", margin: "0 0 8px", lineHeight: 1.6 }}>This is your persistent identity across all connected venues. Your display name appears on leaderboards and in shared experiences.</p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "rgba(99,102,241,0.08)", borderRadius: 8, border: "1px solid rgba(99,102,241,0.15)", marginBottom: 28 }}>
            <span style={{ fontSize: 12 }}>{mi}</span><span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Authenticated via {authData?.method}</span><span style={{ fontSize: 11, color: "rgba(99,102,241,0.7)" }}>{"\u2713"}</span>
          </div>
        </Fade>
        <Fade show={e} delay={200}>
          <Input label="Display Name" value={name} onChange={setName} placeholder="How others will see you" maxLength={24} />
          {name.length > 0 && (<div style={{ padding: "12px 16px", background: "rgba(99,102,241,0.06)", borderRadius: 10, marginBottom: 20, border: "1px solid rgba(99,102,241,0.1)" }}><span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Preview</span><p style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "4px 0 0" }}>{name}<span style={{ fontSize: 13, color: "rgba(167,139,250,0.6)", fontWeight: 400 }}> #PIK</span></p></div>)}
          <div style={S.card}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", margin: "0 0 10px" }}>What your PIK account enables:</p>
            {[["\uD83C\uDFAE","Track XP, levels, and achievements across every connected venue"],["\uD83D\uDCE1","Sync instantly with venue wristbands \u2014 just tap to link"],["\uD83C\uDFC6","Compete on cross-venue leaderboards and complete quest chains"],["\uD83D\uDEE1\uFE0F","Your progress persists \u2014 even if a venue closes, your data stays"]].map(([icon, text], i) => (<div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}><span style={{ fontSize: 14, lineHeight: "20px" }}>{icon}</span><span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: "20px" }}>{text}</span></div>))}
          </div>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", marginBottom: 24 }}>
            <div onClick={() => setAgreed(!agreed)} style={{ width: 20, height: 20, minWidth: 20, borderRadius: 6, border: `2px solid ${agreed ? "#6366f1" : "rgba(255,255,255,0.15)"}`, background: agreed ? "#6366f1" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s ease", marginTop: 1, cursor: "pointer" }}>{agreed && <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>{"\u2713"}</span>}</div>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>I understand my PIK identity is persistent and my gameplay data will be stored securely. I can request deletion at any time. I agree to the <span style={{ color: "rgba(139,92,246,0.8)", textDecoration: "underline" }}>Terms</span> and <span style={{ color: "rgba(139,92,246,0.8)", textDecoration: "underline" }}>Privacy Policy</span>.</span>
          </label>
          <Btn onClick={() => onNext({ displayName: name })} disabled={!ok}>Create PIK Account</Btn>
        </Fade>
      </div>
    </div>
  );
}

/* ═══════ STEP 3: HERO (Adventurer System) ═══════ */
function HeroStep({ accountData, onNext, onSkip }) {
  const [e, setE] = useState(false);
  const [heroName, setHeroName] = useState("");
  const [title, setTitle] = useState(null);
  const [showClasses, setShowClasses] = useState(false);
  useEffect(() => { setTimeout(() => setE(true), 100); }, []);

  return (
    <div style={{ minHeight: "calc(100vh - 80px)", display: "flex", flexDirection: "column", padding: "0 24px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <Fade show={e}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: 0 }}>Name Your Adventurer</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "4px 0 0" }}>Every hero begins the same journey</p>
        </Fade>
        <button onClick={onSkip} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 14px", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Skip {"\u2192"}</button>
      </div>

      <div style={{ flex: 1, maxWidth: 420, margin: "0 auto", width: "100%" }}>
        <Fade show={e} delay={150}>
          <div style={{ padding: 16, background: "linear-gradient(135deg, rgba(205,127,50,0.08), rgba(205,127,50,0.02))", borderRadius: 12, border: "1px solid rgba(205,127,50,0.2)", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 24 }}>{"\u2694\uFE0F"}</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#cd7f32" }}>Bronze Adventurer</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>All heroes begin here at Level 1</div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: 0, lineHeight: 1.7 }}>
              You'll start as a Bronze Adventurer in the realms of Elysendar. As you gain XP across venues, you'll rise through the ranks. Your tier determines which quests you can accept and the challenges you'll face.
            </p>
          </div>
        </Fade>

        <Fade show={e} delay={300}>
          <label style={S.label}>Adventurer Tiers</label>
          <div style={{ display: "flex", gap: 4, marginBottom: 6, padding: "0 2px" }}>
            {TIERS.map((t, i) => (
              <div key={t.name} style={{ flex: 1 }}>
                <div style={{ width: "100%", height: 6, borderRadius: i === 0 ? "3px 0 0 3px" : i === TIERS.length - 1 ? "0 3px 3px 0" : 0, background: i === 0 ? `linear-gradient(90deg, ${t.color}, ${t.color}88)` : `${t.color}25` }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 24, padding: "0 2px" }}>
            {TIERS.map((t, i) => (
              <div key={t.name} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: i === 0 ? t.color : "rgba(255,255,255,0.2)", marginTop: 6 }}>{t.name}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.15)", marginTop: 2 }}>Lv {t.level}</div>
              </div>
            ))}
          </div>
        </Fade>

        <Fade show={e} delay={400}>
          <Input label="Hero Name" value={heroName} onChange={setHeroName} placeholder="Name your adventurer" maxLength={20} />
        </Fade>

        {heroName.length > 0 && (
          <Fade show={true} delay={0}>
            <div style={{ marginBottom: 24 }}>
              <label style={{ ...S.label, marginBottom: 8 }}>Choose a Title <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, opacity: 0.6 }}>(optional)</span></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {TITLES.map(t => (
                  <button key={t} onClick={() => setTitle(title === t ? null : t)} style={{ padding: "6px 12px", borderRadius: 20, background: title === t ? "rgba(205,127,50,0.2)" : "rgba(255,255,255,0.04)", border: `1px solid ${title === t ? "rgba(205,127,50,0.4)" : "rgba(255,255,255,0.08)"}`, color: title === t ? "#cd7f32" : "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s ease" }}>{t}</button>
                ))}
              </div>
            </div>
          </Fade>
        )}

        {heroName && (
          <Fade show={true} delay={0}>
            <div style={{ padding: 20, borderRadius: 14, background: "linear-gradient(135deg, rgba(205,127,50,0.08), rgba(0,0,0,0.3))", border: "1px solid rgba(205,127,50,0.2)", marginBottom: 24, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>{"\u2694\uFE0F"}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>
                {heroName}
                {title && <span style={{ color: "#cd7f32", fontWeight: 500, fontSize: 15 }}> {title}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 13, color: "#cd7f32", fontWeight: 600 }}>Level 1</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{"\u2022"}</span>
                <span style={{ fontSize: 13, color: "rgba(205,127,50,0.7)", fontWeight: 500 }}>Bronze Adventurer</span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>{accountData?.displayName} {"\u2022"} PIK #{Math.random().toString(36).slice(2,8).toUpperCase()}</div>
              <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                {[["XP","0"],["Tier","Bronze"],["Quests","0"]].map(([l,v]) => (
                  <div key={l} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{v}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </Fade>
        )}

        <Fade show={e} delay={500}>
          <div style={{ marginBottom: 24 }}>
            <button onClick={() => setShowClasses(!showClasses)} style={{ width: "100%", padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "inherit" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16 }}>{"\uD83D\uDD12"}</span>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>Class Specialization</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Unlocks at Level 40 via Class Quests</div>
                </div>
              </div>
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)", transform: showClasses ? "rotate(180deg)" : "none", transition: "transform 0.3s ease", display: "inline-block" }}>{"\u25BC"}</span>
            </button>
            {showClasses && (
              <div style={{ marginTop: 8, padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "0 0 12px", lineHeight: 1.6 }}>
                  At Platinum tier (Level 40), you'll unlock a special Class Quest. Complete it to specialize into one of these paths:
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {ADV_CLASSES.map(c => (
                    <div key={c.name} style={{ padding: "10px 12px", borderRadius: 10, background: `${c.color}08`, border: `1px solid ${c.color}18`, opacity: 0.7 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 16 }}>{c.icon}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: c.color }}>{c.name}</span>
                      </div>
                      <div style={{ marginBottom: 3 }}><span style={roleBadge(c.role)}>{c.role}</span></div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", lineHeight: 1.4 }}>{c.weapon}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(99,102,241,0.06)", borderRadius: 8, border: "1px solid rgba(99,102,241,0.1)" }}>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: 0, textAlign: "center" }}>{"\u2728"} Your Adventurer tier and quest history will shape which Class Quests become available</p>
                </div>
              </div>
            )}
          </div>
        </Fade>

        <Fade show={e} delay={600}>
          <Btn onClick={() => onNext({ heroName, title, heroClass: "adventurer", tier: "bronze" })} disabled={!heroName}>Begin Your Adventure</Btn>
        </Fade>
      </div>
    </div>
  );
}

/* ═══════ STEP 4: COMPLETION ═══════ */
function Done({ accountData, heroData, onFinish }) {
  const [e, setE] = useState(false);
  useEffect(() => { setTimeout(() => setE(true), 200); }, []);
  const hasHero = heroData?.heroName;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
      {/* Great Tree emblem instead of generic checkmark */}
      <Fade show={e} delay={0}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", margin: "0 auto 24px", background: "linear-gradient(135deg, #22c55e, #059669, #10b981)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, boxShadow: "0 8px 32px rgba(34,197,94,0.35), 0 0 60px rgba(34,197,94,0.1)" }}>{"\uD83C\uDF3F"}</div>
      </Fade>

      <Fade show={e} delay={300}>
        <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>The Realms of Elysendar Await</h2>
        <p style={{ fontSize: 14, fontWeight: 500, color: "rgba(34,197,94,0.7)", margin: "0 0 12px", fontStyle: "italic", letterSpacing: "0.02em" }}>Blessed by the Great Tree, your story begins.</p>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, margin: "0 0 28px", maxWidth: 340 }}>Your PIK identity is bound to the realms. Visit any connected venue, tap your wristband, and step into Elysendar.</p>
      </Fade>

      {hasHero && (
        <Fade show={e} delay={500}>
          <div style={{ padding: 24, borderRadius: 16, background: "linear-gradient(135deg, rgba(205,127,50,0.08), rgba(0,0,0,0.3))", border: "1px solid rgba(205,127,50,0.2)", marginBottom: 20, maxWidth: 360, width: "100%" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{"\u2694\uFE0F"}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>
              {heroData.heroName}
              {heroData.title && <span style={{ color: "#cd7f32", fontWeight: 500, fontSize: 15 }}> {heroData.title}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 14, color: "#cd7f32", fontWeight: 600 }}>Level 1</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{"\u2022"}</span>
              <span style={{ fontSize: 13, color: "rgba(205,127,50,0.7)", fontWeight: 500 }}>Bronze Adventurer</span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>{accountData?.displayName} {"\u2022"} PIK Identity Active</div>

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#cd7f32", textTransform: "uppercase", letterSpacing: "0.06em" }}>Bronze</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>0 / 500 XP to Copper</span>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: "0%", height: "100%", background: "linear-gradient(90deg, #cd7f32, #b87333)", borderRadius: 3 }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 16 }}>
              {[["XP","0"],["Quests","0"],["Sessions","0"]].map(([l,v]) => (
                <div key={l} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{v}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </Fade>
      )}

      {/* Realms preview */}
      <Fade show={e} delay={600} style={{ maxWidth: 360, width: "100%" }}>
        <div style={{ ...S.card, marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", margin: "0 0 10px" }}>The Five Realms</p>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
            {REALMS.map(r => (
              <div key={r.name} style={{ padding: "6px 12px", borderRadius: 8, background: `${r.color}10`, border: `1px solid ${r.color}20`, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13 }}>{r.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: r.color }}>{r.name}</span>
              </div>
            ))}
          </div>
        </div>
      </Fade>

      <Fade show={e} delay={700} style={{ maxWidth: 360, width: "100%" }}>
        <div style={{ ...S.card, textAlign: "left", marginBottom: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", margin: "0 0 10px" }}>Your Journey Ahead</p>
          {[
            ["\uD83D\uDCE1", "Tap a venue wristband to link your first session"],
            ["\u2B50", "Earn XP to climb from Bronze through Adamantium"],
            ["\uD83D\uDCDC", "Complete quests that unlock as your tier rises"],
            ["\uD83D\uDD12", "Reach Level 40 to unlock your Class Specialization quest"],
          ].map(([icon, text], i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 14, lineHeight: "20px" }}>{icon}</span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: "20px" }}>{text}</span>
            </div>
          ))}
        </div>
        <Btn onClick={onFinish}>Enter the Realms</Btn>
      </Fade>
    </div>
  );
}

/* ═══════ MAIN ═══════ */
export default function PIKOnboarding({ onComplete, onBack }) {
  const [step, setStep] = useState(0);
  const [auth, setAuth] = useState(null);
  const [acct, setAcct] = useState(null);
  const [hero, setHero] = useState(null);
  const [fade, setFade] = useState(false);
  const go = useCallback((n) => { setFade(true); setTimeout(() => { setStep(n); setFade(false); }, 300); }, []);

  return (
    <div style={S.page}>
      <div style={S.orb1} /><div style={S.orb2} />
      {step > 0 && <div style={{ padding: "24px 24px 0", position: "relative", zIndex: 2 }}><Steps current={step - 1} labels={["Sign In","Identity","Hero"]} /></div>}
      <div style={{ opacity: fade ? 0 : 1, transform: fade ? "translateY(8px)" : "none", transition: "all 0.3s ease", position: "relative", zIndex: 1 }}>
        {step === 0 && <Welcome onNext={() => go(1)} onBack={onBack} />}
        {step === 1 && <Auth onNext={d => { setAuth(d); go(2); }} onBack={() => go(0)} />}
        {step === 2 && <Account authData={auth} onNext={d => { setAcct(d); go(3); }} onBack={() => go(1)} />}
        {step === 3 && <HeroStep accountData={acct} onNext={d => { setHero(d); go(4); }} onSkip={() => go(4)} />}
        {step === 4 && <Done accountData={acct} heroData={hero} onFinish={() => onComplete && onComplete({ auth, acct, hero })} />}
      </div>
    </div>
  );
}
