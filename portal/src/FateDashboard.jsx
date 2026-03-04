import { useState, useEffect, useRef } from "react";

// ── Data (shared with onboarding) ──
const TIERS = [
  { name: "Bronze", color: "#cd7f32", level: "1-6", min: 1 },
  { name: "Copper", color: "#b87333", level: "7-13", min: 7 },
  { name: "Silver", color: "#c0c0c0", level: "14-21", min: 14 },
  { name: "Gold", color: "#ffd700", level: "22-29", min: 22 },
  { name: "Platinum", color: "#e5e4e2", level: "30-39", min: 30 },
  { name: "Adamantium", color: "#4ff0d0", level: "40+", min: 40 },
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

const roleBadge = (role) => {
  const c = { Tank: "#3b82f6", DPS: "#ef4444", Healer: "#22c55e", Support: "#a855f7" }[role] || "#888";
  return { padding: "2px 8px", borderRadius: 10, background: c + "20", color: c, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", display: "inline-block" };
};

function getTier(level) {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (level >= TIERS[i].min) return TIERS[i];
  }
  return TIERS[0];
}

// ── Shared Styles ──
const FONT = "'Crimson Pro', 'Georgia', serif";
const FONT_B = "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const BG = "#08080f";
const SURFACE = "rgba(255,255,255,0.025)";
const BORDER = "rgba(255,255,255,0.06)";
const MUTED = "rgba(255,255,255,0.35)";
const DIM = "rgba(255,255,255,0.5)";
const ACCENT = "#6366f1";

// ── Fade Animation ──
function Fade({ show, delay = 0, children, style: extra = {} }) {
  const [v, setV] = useState(false);
  useEffect(() => { if (show) { const t = setTimeout(() => setV(true), delay); return () => clearTimeout(t); } }, [show, delay]);
  return <div style={{ opacity: v ? 1 : 0, transform: v ? "translateY(0)" : "translateY(12px)", transition: "all 0.6s cubic-bezier(0.16,1,0.3,1)", ...extra }}>{children}</div>;
}

// ── Accordion ──
function Accordion({ icon, title, subtitle, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef(null);

  return (
    <div style={{ marginBottom: 8, borderRadius: 12, background: SURFACE, border: `1px solid ${BORDER}`, overflow: "hidden", transition: "border-color 0.3s ease" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", padding: "14px 16px", background: "none", border: "none",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 12, fontFamily: FONT_B,
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{subtitle}</div>}
        </div>
        <span style={{
          fontSize: 12, color: MUTED,
          transform: open ? "rotate(180deg)" : "none",
          transition: "transform 0.3s ease", display: "inline-block",
        }}>▼</span>
      </button>
      <div style={{
        maxHeight: open ? 600 : 0, overflow: "hidden",
        transition: "max-height 0.4s cubic-bezier(0.16,1,0.3,1)",
      }}>
        <div ref={contentRef} style={{ padding: "0 16px 16px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Hero Creation / Rename Modal ──
function HeroModal({ show, onClose, onSubmit, accountData, takenHeroNames = [], mode = "create", currentHeroName = "" }) {
  const [heroName, setHeroName] = useState("");
  const [title, setTitle] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);
  const isRename = mode === "rename";

  const nameLower = heroName.trim().toLowerCase();
  const isSameAsCurrent = isRename && nameLower === currentHeroName.toLowerCase();
  const isTaken = nameLower.length >= 2 && !isSameAsCurrent && takenHeroNames.some(n => n.toLowerCase() === nameLower);
  const isValid = heroName.trim().length >= 2 && !isTaken && !isSameAsCurrent;

  const suggestions = [];
  if (isTaken) {
    for (let i = 1; suggestions.length < 3; i++) {
      const candidate = `${heroName.trim()}${i}`;
      if (!takenHeroNames.some(n => n.toLowerCase() === candidate.toLowerCase())) {
        suggestions.push(candidate);
      }
      if (i > 99) break;
    }
  }

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    if (isRename) {
      await onSubmit({ heroName: heroName.trim() });
    } else {
      await onSubmit({ heroName: heroName.trim(), title, heroClass: "adventurer", tier: "bronze" });
    }
    setSubmitting(false);
  };

  // Reset on close
  useEffect(() => {
    if (!show) { setHeroName(""); setTitle(null); }
  }, [show]);

  if (!show) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: "absolute", inset: 0,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
      }} />

      {/* Modal */}
      <div style={{
        position: "relative", width: "100%", maxWidth: 420, maxHeight: "85vh",
        overflowY: "auto", borderRadius: 16,
        background: "linear-gradient(180deg, #12121e 0%, #0a0a14 100%)",
        border: `1px solid rgba(99,102,241,0.15)`,
        boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 40px rgba(99,102,241,0.08)",
        padding: "28px 24px",
      }}>
        {/* Close */}
        <button onClick={onClose} style={{
          position: "absolute", top: 16, right: 16,
          background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8,
          width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
          color: MUTED, fontSize: 16, cursor: "pointer",
        }}>✕</button>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>{isRename ? "✏️" : "⚔️"}</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, fontFamily: FONT, color: "#fff", margin: "0 0 4px" }}>
            {isRename ? "Rename Your Hero" : "Create Your Hero"}
          </h2>
          <p style={{ fontSize: 13, color: MUTED, margin: 0, fontFamily: FONT_B }}>
            {isRename
              ? `Current name: ${currentHeroName}`
              : "Your adventurer within Heroes' Veritas"}
          </p>
        </div>

        {/* Fate ID context — create mode only */}
        {!isRename && (
          <div style={{
            padding: "10px 14px", borderRadius: 8,
            background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.12)",
            marginBottom: 20, display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 13 }}>◈</span>
            <span style={{ fontSize: 12, color: DIM, fontFamily: FONT_B }}>
              Playing as <strong style={{ color: "rgba(167,139,250,0.9)" }}>{accountData?.displayName || accountData?.display_name || "Unknown"}</strong>
            </span>
          </div>
        )}

        {/* Name input */}
        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: "block", fontSize: 11, fontWeight: 600, color: DIM,
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, fontFamily: FONT_B,
          }}>Hero Name</label>
          <input
            type="text" value={heroName} onChange={e => setHeroName(e.target.value)}
            placeholder="Name your adventurer" maxLength={20}
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            style={{
              width: "100%", padding: "12px 16px",
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${focused ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 10, color: "#fff", fontSize: 15, outline: "none",
              transition: "all 0.3s ease", fontFamily: FONT_B,
              boxShadow: focused ? "0 0 20px rgba(99,102,241,0.15)" : "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Uniqueness feedback */}
        {heroName.trim().length >= 2 && (
          <div style={{
            marginBottom: 16, padding: "8px 12px", borderRadius: 8,
            background: isSameAsCurrent ? "rgba(234,179,8,0.08)" : isTaken ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)",
            border: `1px solid ${isSameAsCurrent ? "rgba(234,179,8,0.2)" : isTaken ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)"}`,
          }}>
            {isSameAsCurrent ? (
              <div style={{ fontSize: 12, color: "#eab308", fontWeight: 600, fontFamily: FONT_B }}>
                ⚠ That's already your current hero name
              </div>
            ) : isTaken ? (
              <div>
                <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 600, marginBottom: 6, fontFamily: FONT_B }}>
                  ✘ "{heroName.trim()}" is already taken
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginBottom: 6, fontFamily: FONT_B }}>Try one of these:</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {suggestions.map(s => (
                    <button key={s} onClick={() => setHeroName(s)} style={{
                      padding: "4px 10px", borderRadius: 6,
                      background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)",
                      color: "#a78bfa", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT_B,
                    }}>{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 600, fontFamily: FONT_B }}>
                ✔ "{heroName.trim()}" is available
              </div>
            )}
          </div>
        )}

        {/* Title selection — create mode only */}
        {!isRename && heroName.length > 0 && isValid && (
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: "block", fontSize: 11, fontWeight: 600, color: DIM,
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: FONT_B,
            }}>
              Title <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, opacity: 0.6 }}>(optional)</span>
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {TITLES.map(t => (
                <button key={t} onClick={() => setTitle(title === t ? null : t)} style={{
                  padding: "6px 12px", borderRadius: 20,
                  background: title === t ? "rgba(205,127,50,0.2)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${title === t ? "rgba(205,127,50,0.4)" : "rgba(255,255,255,0.08)"}`,
                  color: title === t ? "#cd7f32" : "rgba(255,255,255,0.4)",
                  fontSize: 12, cursor: "pointer", fontFamily: FONT_B, transition: "all 0.2s ease",
                }}>{t}</button>
              ))}
            </div>
          </div>
        )}

        {/* Hero preview */}
        {heroName && isValid && (
          <div style={{
            padding: 16, borderRadius: 12, textAlign: "center", marginBottom: 20,
            background: "linear-gradient(135deg, rgba(205,127,50,0.08), rgba(0,0,0,0.3))",
            border: "1px solid rgba(205,127,50,0.2)",
          }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>{isRename ? "✏️" : "⚔️"}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", fontFamily: FONT }}>
              {heroName.trim()}
              {!isRename && title && <span style={{ color: "#cd7f32", fontWeight: 500, fontSize: 14 }}> {title}</span>}
            </div>
            {!isRename && (
              <div style={{ fontSize: 12, color: "#cd7f32", fontWeight: 600, marginTop: 4, fontFamily: FONT_B }}>
                Level 1 • Bronze Adventurer
              </div>
            )}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit} disabled={!isValid || submitting}
          style={{
            width: "100%", padding: "14px 28px", borderRadius: 12,
            background: isValid && !submitting ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(255,255,255,0.04)",
            border: "none",
            color: isValid && !submitting ? "#fff" : "rgba(255,255,255,0.2)",
            fontSize: 15, fontWeight: 600, cursor: isValid && !submitting ? "pointer" : "not-allowed",
            fontFamily: FONT_B, letterSpacing: "0.02em",
            boxShadow: isValid ? "0 4px 24px rgba(99,102,241,0.4)" : "none",
            transition: "all 0.3s ease",
          }}
        >
          {submitting ? (isRename ? "Renaming..." : "Creating...") : (isRename ? "Confirm Rename" : "Begin Your Adventure")}
        </button>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════
// FATE DASHBOARD
// ══════════════════════════════════════════════════════════

export default function FateDashboard({ rootId, userData, onLogout, onEnterPortal, onUserDataRefresh }) {
  const [entered, setEntered] = useState(false);
  const [showHeroModal, setShowHeroModal] = useState(false);
  const [heroModalMode, setHeroModalMode] = useState("create"); // "create" | "rename"
  const [heroData, setHeroData] = useState(null);
  const [takenHeroNames, setTakenHeroNames] = useState([]);

  useEffect(() => { setTimeout(() => setEntered(true), 100); }, []);

  // Derive display values from userData (passed from App)
  // DEBUG: log to verify this code version is deployed
  useEffect(() => {
    if (userData) console.log('[FateDashboard v2] userData.sessions =', JSON.stringify(userData?.sessions), 'type =', typeof userData?.sessions);
  }, [userData]);

  const fateName = userData?.display_name || userData?.displayName || "Adventurer";
  const fateLevel = userData?.fate_level || 0;
  const fateXP = userData?.fate_xp || 0;
  const tier = getTier(Math.max(fateLevel, 1));
  const rawHeroName = userData?.hero_name || null;
  const heroTitle = userData?.hero_title || heroData?.title || null;
  const authMethod = userData?.auth_method || "passkey";
  const alignment = userData?.fate_alignment || null;
  const quests = userData?.quests_completed || 0;
  // Sessions: API may return number, object, array, or nested structure
  const rawSessions = userData?.sessions;
  let sessions = 0;
  if (typeof rawSessions === 'number') {
    sessions = rawSessions;
  } else if (Array.isArray(rawSessions)) {
    sessions = rawSessions.length;
  } else if (rawSessions && typeof rawSessions === 'object') {
    // Try all known property names for session count
    sessions = rawSessions.total_completed || rawSessions.total || rawSessions.count 
      || rawSessions.session_count || rawSessions.completed
      || (Array.isArray(rawSessions.recent) ? rawSessions.recent.length : 0)
      || (Array.isArray(rawSessions.active) ? rawSessions.active.length : 0)
      || 0;
    // Last resort: count numeric values
    if (sessions === 0) {
      const vals = Object.values(rawSessions).filter(v => typeof v === 'number');
      if (vals.length > 0) sessions = Math.max(...vals);
    }
  }

  // Hero exists only when explicitly created (hero_name differs from Fate Name)
  // At enrollment, hero_name = display_name (Fate Name). Hero creation changes hero_name.
  const hasDistinctHero = heroData != null || (rawHeroName && rawHeroName !== fateName);
  const heroName = heroData?.heroName || (hasDistinctHero ? rawHeroName : null);
  const heroDisplayTitle = heroData?.title || userData?.hero_title || null;

  // Hero rename tracking — from backend persona.hero_rename
  const renameData = userData?.persona?.hero_rename || userData?.hero_rename || null;
  const renamesRemaining = renameData?.renames_remaining ?? 1;

  // Fetch taken names for hero creation
  useEffect(() => {
    import('./api.js').then(mod => {
      const api = mod.default;
      api.listUsers().then(resp => {
        if (resp.ok && Array.isArray(resp.data)) {
          setTakenHeroNames(resp.data.map(u => u.hero_name).filter(Boolean));
        }
      }).catch(() => {});
    }).catch(() => {});
  }, []);

  const handleHeroSubmit = async (data) => {
    try {
      const apiMod = await import('./api.js');
      const apiClient = apiMod.default;
      const payload = { hero_name: data.heroName };
      if (data.title) payload.equipped_title = data.title;
      const resp = await apiClient.updateProfile(payload, rootId);
      if (resp.ok) {
        if (heroModalMode === "rename") {
          // Update existing hero data with new name
          setHeroData(prev => prev ? { ...prev, heroName: data.heroName } : { heroName: data.heroName });
        } else {
          setHeroData(data);
        }
        // Refresh userData from backend to stay in sync (includes updated rename count)
        const profileResp = await apiClient.getProfile(rootId);
        if (profileResp.ok && profileResp.data) {
          if (onUserDataRefresh) onUserDataRefresh(profileResp.data);
        }
      } else {
        console.error("Hero update failed:", resp.error);
        if (heroModalMode === "create") setHeroData(data);
      }
    } catch (err) {
      console.error("Hero update error:", err);
      if (heroModalMode === "create") setHeroData(data);
    }
    setShowHeroModal(false);
  };

  // XP progress within current tier
  // Compute cumulative XP required to reach each tier boundary using
  // the same exponential curve the backend uses (xpBaseThreshold=100, multiplier=1.18)
  const XP_BASE = 100, XP_MULT = 1.18;
  function xpToReachLevel(lv: number) {
    let total = 0;
    for (let i = 1; i < lv; i++) total += Math.floor(XP_BASE * Math.pow(XP_MULT, i - 1));
    return total;
  }
  const nextTierIdx = TIERS.findIndex(t => t.name === tier.name) + 1;
  const currentTierMinXp = xpToReachLevel(tier.min);
  const nextTierMinXp    = nextTierIdx < TIERS.length ? xpToReachLevel(TIERS[nextTierIdx].min) : null;
  const xpInTier         = fateXP - currentTierMinXp;
  const xpNeededForTier  = nextTierMinXp ? nextTierMinXp - currentTierMinXp : null;
  const xpProgress       = xpNeededForTier ? Math.min(xpInTier / xpNeededForTier, 1) : 1;

  const authIcon = { google: "🔵", apple: "⚫", passkey: "🔐", email: "✉️" }[authMethod] || "🔑";

  return (
    <div style={{
      width: "100%", maxWidth: 480, margin: "0 auto", minHeight: "100vh",
      background: BG, fontFamily: FONT_B, color: "#fff", position: "relative",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ── Header ── */}
      <div style={{
        padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, background: BG, zIndex: 50,
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            boxShadow: "0 2px 8px rgba(99,102,241,0.3)",
          }}>◈</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{fateName}</div>
            <div style={{ fontSize: 10, color: MUTED }}>Fate ID Active</div>
          </div>
        </div>
        <button onClick={onLogout} style={{
          background: "none", border: "none", color: MUTED,
          fontSize: 12, cursor: "pointer", fontFamily: FONT_B,
        }}>Sign Out</button>
      </div>

      <div style={{ padding: "20px 20px 40px" }}>

        {/* ── Fate ID Card ── */}
        <Fade show={entered} delay={0}>
          <div style={{
            padding: 20, borderRadius: 16, marginBottom: 16,
            background: `linear-gradient(135deg, ${tier.color}10, rgba(0,0,0,0.4))`,
            border: `1px solid ${tier.color}25`,
            position: "relative", overflow: "hidden",
          }}>
            {/* Decorative glow */}
            <div style={{
              position: "absolute", top: -40, right: -40, width: 120, height: 120,
              borderRadius: "50%", background: `radial-gradient(circle, ${tier.color}15, transparent 70%)`,
              pointerEvents: "none",
            }} />

            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: `linear-gradient(135deg, ${tier.color}30, ${tier.color}10)`,
                  border: `1px solid ${tier.color}40`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 24,
                }}>◈</div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: FONT, color: "#fff" }}>{fateName}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: tier.color }}>{tier.name}</span>
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)" }}>•</span>
                    <span style={{ fontSize: 12, color: MUTED }}>Level {fateLevel}</span>
                    {alignment && (
                      <>
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)" }}>•</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: alignment === "ORDER" ? "#3b82f6" : alignment === "CHAOS" ? "#ef4444" : "#a855f7" }}>{alignment}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* XP bar */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: tier.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{tier.name}</span>
                  <span style={{ fontSize: 10, color: MUTED }}>
                    {xpInTier.toLocaleString()} {xpNeededForTier ? `/ ${xpNeededForTier.toLocaleString()} XP` : "XP"}
                  </span>
                </div>
                <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    width: `${xpProgress * 100}%`, height: "100%",
                    background: `linear-gradient(90deg, ${tier.color}, ${tier.color}88)`,
                    borderRadius: 3, transition: "width 0.8s ease",
                  }} />
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display: "flex", gap: 0 }}>
                {[
                  ["XP", fateXP.toLocaleString()],
                  ["Quests", String(quests)],
                  ["Sessions", String(sessions)],
                ].map(([label, val], i) => (
                  <div key={label} style={{
                    flex: 1, textAlign: "center",
                    borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
                    padding: "8px 0",
                  }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{val}</div>
                    <div style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Fade>

        {/* ── Hero Section Header ── */}
        <Fade show={entered} delay={120}>
          <div style={{
            display: "flex", alignItems: "center", gap: 12, margin: "8px 0 12px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.12em", whiteSpace: "nowrap" }}>
              Your Heroes
            </div>
            <div style={{ flex: 1, height: 1, background: BORDER }} />
          </div>
        </Fade>

        {/* ── Hero Section ── */}
        <Fade show={entered} delay={150}>
          {hasDistinctHero ? (
            /* Existing hero card */
            <div style={{
              padding: 16, borderRadius: 14, marginBottom: 16,
              background: "linear-gradient(135deg, rgba(205,127,50,0.06), rgba(0,0,0,0.3))",
              border: "1px solid rgba(205,127,50,0.15)",
              display: "flex", alignItems: "center", gap: 14,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: "rgba(205,127,50,0.12)", border: "1px solid rgba(205,127,50,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
              }}>⚔️</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                  {heroName}
                  {heroDisplayTitle && <span style={{ color: "#cd7f32", fontWeight: 500, fontSize: 12 }}>{heroDisplayTitle}</span>}
                  {renamesRemaining > 0 && (
                    <button
                      onClick={() => { setHeroModalMode("rename"); setShowHeroModal(true); }}
                      title={`${renamesRemaining} free rename${renamesRemaining !== 1 ? "s" : ""} remaining`}
                      style={{
                        background: "none", border: "none", cursor: "pointer", padding: 2,
                        color: MUTED, fontSize: 12, lineHeight: 1, transition: "color 0.2s ease",
                      }}
                      onMouseEnter={e => e.target.style.color = "#a78bfa"}
                      onMouseLeave={e => e.target.style.color = MUTED}
                    >✎</button>
                  )}
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                  Level {fateLevel || 1} • Bronze Adventurer
                </div>
              </div>
              {onEnterPortal && (
                <button onClick={() => onEnterPortal(rootId)} style={{
                  padding: "8px 16px", borderRadius: 8,
                  background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none",
                  color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT_B,
                  boxShadow: "0 2px 12px rgba(99,102,241,0.3)",
                }}>Enter</button>
              )}
            </div>
          ) : (
            /* Create hero CTA */
            <button onClick={() => { setHeroModalMode("create"); setShowHeroModal(true); }} style={{
              width: "100%", padding: 20, borderRadius: 14, marginBottom: 16,
              background: "linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.04))",
              border: "1px dashed rgba(99,102,241,0.25)",
              cursor: "pointer", fontFamily: FONT_B, textAlign: "center",
              transition: "all 0.3s ease",
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⚔️</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(167,139,250,0.9)" }}>
                Create Your First Hero
              </div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
                Name your adventurer and enter the realms of Elysendar
              </div>
            </button>
          )}
        </Fade>

        {/* ── Connected Venues ── */}
        <Fade show={entered} delay={300}>
          <div style={{
            padding: 16, borderRadius: 14, marginBottom: 16,
            background: SURFACE, border: `1px solid ${BORDER}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>Connected Venues</div>
              <span style={{
                padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                background: "rgba(255,255,255,0.04)", color: MUTED,
              }}>0 linked</span>
            </div>
            <div style={{
              padding: 16, borderRadius: 10, textAlign: "center",
              border: `1px dashed rgba(255,255,255,0.08)`,
              background: "rgba(255,255,255,0.01)",
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📡</div>
              <div style={{ fontSize: 13, color: DIM, fontWeight: 500 }}>No venues linked yet</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
                Visit a connected venue and tap your wristband to link your first session
              </div>
            </div>
          </div>
        </Fade>

        {/* ── Auth Methods ── */}
        <Fade show={entered} delay={400}>
          <div style={{
            padding: 16, borderRadius: 14, marginBottom: 24,
            background: SURFACE, border: `1px solid ${BORDER}`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>
              Sign-In Methods
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 8,
              background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.12)",
            }}>
              <span style={{ fontSize: 16 }}>{authIcon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
                  {authMethod.charAt(0).toUpperCase() + authMethod.slice(1)}
                </div>
                <div style={{ fontSize: 10, color: MUTED }}>Primary</div>
              </div>
              <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 600 }}>Active</span>
            </div>
            <div style={{
              marginTop: 10, width: "100%", padding: "10px 14px", borderRadius: 8,
              background: "none", border: `1px dashed rgba(255,255,255,0.06)`,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.18)" }}>+ Link additional sign-in methods</span>
              <span style={{
                padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.2)",
                textTransform: "uppercase", letterSpacing: "0.06em",
              }}>Coming Soon</span>
            </div>
          </div>
        </Fade>

        {/* ── Discover Section (Accordions) ── */}
        <Fade show={entered} delay={500}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase",
            letterSpacing: "0.12em", marginBottom: 10, paddingLeft: 2,
          }}>
            Discover
          </div>

          {/* Tier Progression */}
          <Accordion icon="⭐" title="Adventurer Tiers" subtitle="Bronze through Adamantium">
            <p style={{ fontSize: 12, color: MUTED, margin: "0 0 14px", lineHeight: 1.6 }}>
              Earn XP across venues to climb the ranks. Your tier determines which quests you can accept and the challenges you'll face.
            </p>
            {/* Tier bar */}
            <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
              {TIERS.map((t, i) => (
                <div key={t.name} style={{
                  flex: 1, height: 8,
                  borderRadius: i === 0 ? "4px 0 0 4px" : i === TIERS.length - 1 ? "0 4px 4px 0" : 0,
                  background: `linear-gradient(90deg, ${t.color}dd, ${t.color}88)`,
                }} />
              ))}
            </div>
            {/* Tier labels */}
            <div style={{ display: "flex", gap: 3 }}>
              {TIERS.map((t) => (
                <div key={t.name} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: t.color, letterSpacing: "0.03em" }}>{t.name}</div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>Lv {t.level}</div>
                </div>
              ))}
            </div>
          </Accordion>

          {/* Class Specializations */}
          <Accordion icon="🔒" title="Class Specializations" subtitle="Unlocks at Level 40 via Class Quests">
            <p style={{ fontSize: 12, color: MUTED, margin: "0 0 12px", lineHeight: 1.6 }}>
              At Platinum tier, you'll unlock a special Class Quest. Complete it to specialize into one of these paths:
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {ADV_CLASSES.map(c => (
                <div key={c.name} style={{
                  padding: "10px 12px", borderRadius: 10,
                  background: `${c.color}08`, border: `1px solid ${c.color}18`, opacity: 0.7,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 16 }}>{c.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: c.color }}>{c.name}</span>
                  </div>
                  <div style={{ marginBottom: 3 }}><span style={roleBadge(c.role)}>{c.role}</span></div>
                  <div style={{ fontSize: 10, color: MUTED, lineHeight: 1.4 }}>{c.weapon}</div>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 10, padding: "8px 12px", borderRadius: 8,
              background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.1)",
            }}>
              <p style={{ fontSize: 11, color: MUTED, margin: 0, textAlign: "center" }}>
                ✨ Your tier and quest history will shape which Class Quests become available
              </p>
            </div>
          </Accordion>

          {/* Journey Ahead */}
          <Accordion icon="🗺️" title="Your Journey Ahead" subtitle="What comes next">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                ["📡", "Tap a venue wristband to link your first session"],
                ["⭐", "Earn XP to climb from Bronze through Adamantium"],
                ["📜", "Complete quests that unlock as your tier rises"],
                ["🔒", "Reach Level 40 to unlock your Class Specialization quest"],
              ].map(([icon, text], i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 14, lineHeight: "20px" }}>{icon}</span>
                  <span style={{ fontSize: 13, color: DIM, lineHeight: "20px" }}>{text}</span>
                </div>
              ))}
            </div>
          </Accordion>
        </Fade>
      </div>

      {/* Hero Creation Modal */}
      <HeroModal
        show={showHeroModal}
        onClose={() => setShowHeroModal(false)}
        onSubmit={handleHeroSubmit}
        accountData={{ displayName: fateName }}
        takenHeroNames={takenHeroNames}
        mode={heroModalMode}
        currentHeroName={heroName || rawHeroName || ""}
      />
    </div>
  );
}
