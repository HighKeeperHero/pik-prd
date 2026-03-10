// src/screens/VeilTearsScreen.jsx
// Drop into: e:\pik_prd\portal\src\VeilTearsScreen.jsx
//
// Requires: npm install leaflet
// No additional @types needed — this is plain JSX

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

// ─── Tear type definitions ────────────────────────────────────────────────────

const TEAR_TYPES = {
  minor: {
    label: "MINOR THREAT",
    glyph: "✦",
    color: "#1A6ED4",
    bgColor: "rgba(26,110,212,0.15)",
    names: ["Ashfeld Rift", "Shadow Fracture", "Blue Seam", "Pale Breach", "Veil Thinning"],
    lore: [
      "A thin place in the Veil. Something small presses through from the dark mirror.",
      "The fabric of Elysendar strains here. A minor Shade has slipped through.",
      "Corruption seeps from this fracture. Seal it before it widens.",
      "The world is thinner here — a small wound, but wounds invite worse things.",
    ],
    tier: "T1", hp: 60, dur: "~2m",
    rewards: [
      { icon: "◆", label: "Veil Shards", val: "8–12",  color: "rgba(26,110,212,0.15)",  border: "rgba(26,110,212,0.3)" },
      { icon: "◇", label: "Lore Fragment", val: "+1",  color: "rgba(200,144,10,0.1)",   border: "rgba(200,144,10,0.25)" },
    ],
  },
  wander: {
    label: "WANDERING SHADE",
    glyph: "◉",
    color: "#8040C8",
    bgColor: "rgba(128,64,200,0.15)",
    names: ["Drifting Hollow", "Veil Wanderer", "Lost Shade", "Unmoored Specter", "Errant Hollow"],
    lore: [
      "This shade moves with purpose. It has not yet found its target.",
      "Torn from the dark mirror, this entity drifts without anchor.",
      "A wandering hollow — more dangerous than a fixed tear, less predictable.",
    ],
    tier: "T2", hp: 120, dur: "~4m",
    rewards: [
      { icon: "◆", label: "Veil Shards",    val: "15–20", color: "rgba(128,64,200,0.15)", border: "rgba(128,64,200,0.35)" },
      { icon: "◧", label: "Craft Material", val: "+2",    color: "rgba(128,64,200,0.12)", border: "rgba(128,64,200,0.3)" },
    ],
  },
  dormant: {
    label: "DORMANT RIFT",
    glyph: "⊛",
    color: "#E8820A",
    bgColor: "rgba(232,130,10,0.15)",
    names: ["The Gathering Dark", "Ancient Rupture", "Veil Wound", "Ember Scar", "Realm Fracture"],
    lore: [
      "This rift has been here longer than you. It will require three visits to seal.",
      "Something ancient holds this fracture open. It recognizes you now.",
      "The Veil wound runs deep. Approach it three times — it will not yield in one.",
    ],
    tier: "T3", hp: 240, dur: "~3 visits",
    rewards: [
      { icon: "◆", label: "Veil Shards",  val: "30–50", color: "rgba(232,130,10,0.15)", border: "rgba(232,130,10,0.35)" },
      { icon: "✦", label: "Rare Material", val: "+1",   color: "rgba(232,130,10,0.1)",  border: "rgba(232,130,10,0.25)" },
      { icon: "◇", label: "Deep Lore",    val: "+3",    color: "rgba(200,144,10,0.1)",  border: "rgba(200,144,10,0.25)" },
    ],
  },
  double: {
    label: "DOUBLE RIFT EVENT",
    glyph: "⚡",
    color: "#CC1020",
    bgColor: "rgba(204,16,32,0.18)",
    names: ["The Shattering", "Twin Veil Breach", "Convergence Wound", "Dual Fracture", "The Bleeding Point"],
    lore: [
      "Two rifts tearing simultaneously. The Veil is screaming.",
      "A convergence event. Two wounds feeding each other — seal both or neither holds.",
      "This has never happened this close to the Source. Something is orchestrating this.",
    ],
    tier: "T4", hp: 400, dur: "~8m",
    rewards: [
      { icon: "⚡", label: "Veil Shards",   val: "60–90", color: "rgba(204,16,32,0.15)", border: "rgba(204,16,32,0.4)" },
      { icon: "◆", label: "Epic Material", val: "+3",    color: "rgba(204,16,32,0.12)", border: "rgba(204,16,32,0.3)" },
      { icon: "✦", label: "Event Lore",    val: "+5",    color: "rgba(200,144,10,0.1)", border: "rgba(200,144,10,0.25)" },
    ],
  },
};

const TELEGRAPHS = {
  minor:   ["The shade lashes out with shadowed claws…", "A tendril of darkness reaches toward you…", "The rift pulses with dim energy…"],
  wander:  ["The wandering shade focuses its gaze on you…", "It draws power from the fracture behind it…", "The Shade prepares a Veil Surge…"],
  dormant: ["The rift thrums with ancient malice…", "Something vast stirs within the dormant wound…", "The darkness coalesces into a striking form…"],
  double:  ["BOTH rifts discharge simultaneously—", "The twin wounds arc electricity between them—", "A surge of raw Veil energy crackles toward you—"],
};

const BATTLE_LOGS = {
  strike:  ["You drive your blade through the fracture.", "The Veil shudders under your assault.", "Your strike lands true — the shade recoils."],
  ability: ["Resonance flows through you — the Shade buckles.", "You channel the Veil's own power against it.", "The ability tears through the shade's essence."],
  item:    ["You consume a Veil Shard Flask — vitality restored.", "The shard's energy mends what the dark has torn."],
  hit:     ["The shade's attack finds purchase — you stagger.", "Darkness claws at your resolve.", "You absorb the blow but feel the cost."],
  miss:    ["The shade's strike passes harmlessly.", "You evade — the dark finds nothing."],
};

const DAILY_QUESTS = [
  { id: "warden",       title: "The Warden's Signal",  desc: "Seal 3 Minor Tears before midnight.", reward: "15 Shards",    icon: "⚔", max: 3 },
  { id: "echoes",       title: "Echoes of the Source", desc: "Walk 1km near a Tear without engaging.", reward: "Attunement", icon: "◈", max: 1 },
  { id: "firstlight",   title: "First Light",          desc: "Open the app before 9am.",            reward: "Lore Fragment", icon: "◇", max: 1 },
  { id: "gatheringdark",title: "The Gathering Dark",   desc: "Locate a Dormant Rift near you.",      reward: "Rift Map",     icon: "⊛", max: 1 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEMO_LAT = 38.6773;
const DEMO_LON = -121.235;

function seededRand(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function pickRand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function spawnTears(lat, lon) {
  const day     = Math.floor(Date.now() / 86400000);
  const gridLat = Math.round(lat * 1000);
  const gridLon = Math.round(lon * 1000);
  const rand    = seededRand((gridLat * 73856093) ^ (gridLon * 19349663) ^ day);
  const spread  = 0.012;
  const defs    = ["minor", "minor", "minor", "wander", "wander", "dormant", "double"];

  return defs.map((type, i) => {
    const angle = rand() * Math.PI * 2;
    const dist  = (0.3 + rand() * 0.7) * spread;
    const tLat  = lat + Math.sin(angle) * dist;
    const tLon  = lon + Math.cos(angle) * dist / Math.cos((lat * Math.PI) / 180);
    const td    = TEAR_TYPES[type];
    return {
      id:     i,
      type,
      lat:    tLat,
      lon:    tLon,
      name:   td.names[Math.floor(rand() * td.names.length)],
      lore:   td.lore[Math.floor(rand() * td.lore.length)],
      sealed: false,
    };
  });
}

function tearMarkerHTML(type) {
  const td   = TEAR_TYPES[type];
  const dur  = type === "double" ? "0.5s" : type === "dormant" ? "0.9s" : type === "wander" ? "1.2s" : "2s";
  const extra = type === "double"
    ? `<div style="position:absolute;inset:-18px;border-radius:50%;border:1px solid ${td.color}40;animation:vtTearRing 0.5s ease-out infinite 0.25s;opacity:0"></div>`
    : "";
  return `
    <div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;cursor:pointer">
      <div class="vt-inner-${type}" style="
        width:28px;height:28px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        position:relative;
        background:radial-gradient(circle,${td.bgColor},transparent);
        border:1px solid ${td.color}99;
        box-shadow:0 0 14px ${td.color}88,inset 0 0 8px ${td.color}33;
        ${type === "dormant" ? "animation:vtUnstable 0.15s ease-in-out infinite;" : ""}
      ">
        <div style="position:absolute;inset:-6px;border-radius:50%;border:1px solid ${td.color}77;animation:vtTearRing ${dur} ease-out infinite;opacity:0"></div>
        <div style="position:absolute;inset:-12px;border-radius:50%;border:1px solid ${td.color}33;animation:vtTearRing ${dur} ease-out infinite 0.6s;opacity:0"></div>
        ${extra}
        <span style="font-size:13px;color:${td.color};text-shadow:0 0 10px ${td.color};z-index:1;position:relative">${td.glyph}</span>
      </div>
    </div>`;
}

function midnightCountdown() {
  const end  = new Date();
  end.setUTCHours(24, 0, 0, 0);
  const diff = end - Date.now();
  const h    = Math.floor(diff / 3600000);
  const m    = Math.floor((diff % 3600000) / 60000);
  const s    = Math.floor((diff % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function VeilTearsScreen({ userData }) {
  const mapRef     = useRef(null);
  const leafletRef = useRef(null);
  const tearsRef   = useRef([]);
  const battleTearRef = useRef(null);

  const [locationReady, setLocationReady] = useState(false);
  const [coords, setCoords]               = useState([DEMO_LAT, DEMO_LON]);
  const [activeTear, setActiveTear]       = useState(null);
  const [screenState, setScreenState]     = useState("map"); // map | battle | victory | defeat
  const [countdown, setCountdown]         = useState(midnightCountdown());

  // Battle state
  const [enemyHp,    setEnemyHp]    = useState(0);
  const [enemyMaxHp, setEnemyMaxHp] = useState(1);
  const [playerHp,   setPlayerHp]   = useState(100);
  const [battleLog,  setBattleLog]  = useState("The Veil tears open before you.");
  const [telegraph,  setTelegraph]  = useState("The shade gathers dark energy…");
  const [battleBusy, setBattleBusy] = useState(false);
  const [damageFlash, setDamageFlash] = useState(null);
  const [battleResult, setBattleResult] = useState(null);

  // Quest progress
  const [questProgress, setQuestProgress] = useState({
    warden: 0, echoes: 0,
    firstlight: new Date().getHours() < 9 ? 1 : 0,
    gatheringdark: 0,
  });

  // Derive stats from userData (PIK player data)
  const level = userData?.fate_level ?? 1;
  const stats = {
    power:     userData?.power     ?? userData?.attributes?.power     ?? 42,
    ward:      userData?.ward      ?? userData?.attributes?.ward      ?? 28,
    resonance: userData?.resonance ?? userData?.attributes?.resonance ?? 35,
    veilSense: Math.max(3, Math.floor(level * 0.4)),
  };

  // Countdown
  useEffect(() => {
    const t = setInterval(() => setCountdown(midnightCountdown()), 1000);
    return () => clearInterval(t);
  }, []);

  // Inject Leaflet keyframes once
  useEffect(() => {
    if (document.getElementById("vt-keyframes")) return;
    const style = document.createElement("style");
    style.id = "vt-keyframes";
    style.textContent = `
      @keyframes vtTearRing {
        0%   { transform:scale(0.8);opacity:0.8; }
        100% { transform:scale(1.7);opacity:0; }
      }
      @keyframes vtUnstable {
        0%,100%{ opacity:1;transform:scale(1); }
        25%    { opacity:0.85;transform:scale(1.04) rotate(2deg); }
        50%    { opacity:1;transform:scale(0.97) rotate(-1deg); }
        75%    { opacity:0.9;transform:scale(1.02) rotate(1deg); }
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  // Init Leaflet map
  const initMap = useCallback(async (lat, lon) => {
    if (!mapRef.current || leafletRef.current) return;

    // Dynamic import keeps Leaflet out of main bundle
    const L = (await import("leaflet")).default;
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const map = L.map(mapRef.current, { center: [lat, lon], zoom: 15, zoomControl: false });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap contributors © CARTO",
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    // Player dot
    const playerIcon = L.divIcon({
      className: "",
      html: `<div style="width:18px;height:18px;border-radius:50%;background:radial-gradient(circle,rgba(200,160,78,0.9),rgba(200,160,78,0.3));border:2px solid rgba(200,160,78,0.9);box-shadow:0 0 16px rgba(200,160,78,0.7)"></div>`,
      iconSize: [18, 18], iconAnchor: [9, 9],
    });
    L.marker([lat, lon], { icon: playerIcon, zIndexOffset: 1000 }).addTo(map);

    // Spawn tears
    const tears = spawnTears(lat, lon);
    tears.forEach(t => {
      const icon = L.divIcon({ className: "", html: tearMarkerHTML(t.type), iconSize: [44, 44], iconAnchor: [22, 22] });
      const marker = L.marker([t.lat, t.lon], { icon }).addTo(map);
      marker.on("click", () => {
        const full = { ...t, marker };
        setActiveTear(full);
        battleTearRef.current = full;
      });
      t.marker = marker;
    });

    tearsRef.current = tears;
    leafletRef.current = map;
  }, []);

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (leafletRef.current) {
        leafletRef.current.remove();
        leafletRef.current = null;
      }
    };
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) { startDemo(); return; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setCoords([lat, lon]);
        setLocationReady(true);
        initMap(lat, lon);
      },
      () => startDemo(),
      { timeout: 8000 }
    );
  }, [initMap]);

  const startDemo = useCallback(() => {
    setCoords([DEMO_LAT, DEMO_LON]);
    setLocationReady(true);
    initMap(DEMO_LAT, DEMO_LON);
  }, [initMap]);

  const recenter = useCallback(() => {
    leafletRef.current?.panTo(coords, { animate: true, duration: 0.8 });
  }, [coords]);

  // ── Battle logic ────────────────────────────────────────────────────────────

  const startBattle = useCallback((tear) => {
    const td = TEAR_TYPES[tear.type];
    battleTearRef.current = tear;
    setEnemyMaxHp(td.hp);
    setEnemyHp(td.hp);
    setPlayerHp(100);
    setBattleLog("The Veil tears open before you.");
    setTelegraph(pickRand(TELEGRAPHS[tear.type]));
    setBattleBusy(false);
    setBattleResult(null);
    setActiveTear(null);
    setScreenState("battle");
  }, []);

  const handleBattleAction = useCallback(async (action) => {
    if (battleBusy) return;
    const tear = battleTearRef.current;
    if (!tear) return;

    setBattleBusy(true);

    if (action === "item") {
      const heal = 20 + Math.floor(Math.random() * 10);
      setPlayerHp(hp => Math.min(100, hp + heal));
      setBattleLog(`${pickRand(BATTLE_LOGS.item)} (+${heal} HP)`);
      setBattleBusy(false);
      return;
    }

    const dmg = action === "strike"
      ? 12 + Math.floor(Math.random() * 10)
      : 20 + Math.floor(Math.random() * 15);

    setBattleLog(`${pickRand(BATTLE_LOGS[action])} (${dmg} dmg)`);

    setEnemyHp(prevHp => {
      const nextHp = Math.max(0, prevHp - dmg);

      if (nextHp <= 0) {
        // Victory
        setTimeout(() => {
          if (tear.marker && leafletRef.current) leafletRef.current.removeLayer(tear.marker);
          tearsRef.current = tearsRef.current.map(t => t.id === tear.id ? { ...t, sealed: true } : t);
          const shards = { minor: 10, wander: 17, dormant: 40, double: 75 }[tear.type] ?? 10;
          setBattleResult({ won: true, shards });
          if (tear.type === "minor")   setQuestProgress(q => ({ ...q, warden: Math.min(3, q.warden + 1) }));
          if (tear.type === "dormant") setQuestProgress(q => ({ ...q, gatheringdark: 1 }));
          setScreenState("victory");
          setBattleBusy(false);
        }, 300);
        return 0;
      }

      // Enemy counter
      setTimeout(() => {
        const isDouble = tear.type === "double";
        if (Math.random() > 0.25) {
          const eDmg = isDouble ? 18 + Math.floor(Math.random() * 16) : 8 + Math.floor(Math.random() * 12);
          setPlayerHp(php => {
            const next = Math.max(0, php - eDmg);
            setBattleLog(`${pickRand(BATTLE_LOGS.hit)} (${eDmg} dmg)`);
            if (next <= 0) {
              setBattleResult({ won: false, shards: 0 });
              setScreenState("defeat");
            }
            return next;
          });
          setDamageFlash(isDouble ? "#CC1020" : "#C84020");
          setTimeout(() => setDamageFlash(null), 350);
        } else {
          setBattleLog(pickRand(BATTLE_LOGS.miss));
        }
        setTelegraph(pickRand(TELEGRAPHS[tear.type]));
        setBattleBusy(false);
      }, 500);

      return nextHp;
    });
  }, [battleBusy]);

  // ── Derived display values ──────────────────────────────────────────────────

  const hpPct   = Math.max(0, (enemyHp / Math.max(1, enemyMaxHp)) * 100);
  const hpColor = hpPct > 60 ? "#C84020" : hpPct > 30 ? "#C8900A" : "#6030A0";

  const tearCounts = {
    minor:   tearsRef.current.filter(t => t.type === "minor"   && !t.sealed).length,
    wander:  tearsRef.current.filter(t => t.type === "wander"  && !t.sealed).length,
    dormant: tearsRef.current.filter(t => t.type === "dormant" && !t.sealed).length,
    double:  tearsRef.current.filter(t => t.type === "double"  && !t.sealed).length,
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const FONT_LORE = "'IM Fell English', serif";

  return (
    <div style={{ position: "absolute", inset: 0, background: "#080C14", fontFamily: "'Cinzel', serif", color: "#F0EDE6", overflow: "hidden" }}>
      {/* Google Fonts */}
      <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Cinzel+Decorative:wght@400;700&family=IM+Fell+English:ital@0;1&display=swap" rel="stylesheet" />

      {/* Map */}
      <div ref={mapRef} style={{ position: "absolute", inset: 0, filter: "saturate(0.15) brightness(0.55) hue-rotate(200deg)", zIndex: 0 }} />

      {/* Vignette + scanlines */}
      <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", background: "radial-gradient(ellipse 70% 60% at 50% 50%, transparent 0%, rgba(8,12,20,0.55) 60%, rgba(8,12,20,0.93) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none", background: "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)" }} />

      {/* ── Location prompt ── */}
      {!locationReady && (
        <div style={{ position: "absolute", inset: 0, zIndex: 90, background: "#080C14", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 48, color: "#8040C8", textShadow: "0 0 30px rgba(128,64,200,0.6)" }}>◈</div>
          <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 18, color: "#F0EDE6" }}>The Veil Calls</div>
          <p style={{ fontFamily: FONT_LORE, fontStyle: "italic", fontSize: 13, color: "#8FA8CC", lineHeight: 1.8, maxWidth: 280 }}>
            "The fractures are spreading. Your presence is required in the compromised realm."
            <br /><br />
            Allow location access to reveal nearby Veil Tears.
          </p>
          <button onClick={requestLocation} style={btnPrimary}>Allow Location</button>
          <button onClick={startDemo} style={btnGhost}>Demo Mode — Simulated Location</button>
        </div>
      )}

      {/* ── Top HUD ── */}
      {locationReady && screenState === "map" && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, padding: "14px 16px 12px", background: "linear-gradient(to bottom, rgba(8,12,20,0.95), transparent)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 11, letterSpacing: "0.35em", color: "#E8A820", textShadow: "0 0 20px rgba(200,144,10,0.6)" }}>Veil Tears</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", border: "1px solid rgba(200,64,32,0.4)", borderRadius: 20, background: "rgba(200,64,32,0.08)" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C84020" }} />
              <span style={{ fontSize: 8, letterSpacing: "0.15em", color: "#C84020", fontWeight: 700 }}>VEIL WEAKENING</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
            {[
              { val: stats.power,     label: "Power" },
              { val: stats.ward,      label: "Ward" },
              { val: stats.resonance, label: "Resonance" },
              { val: stats.veilSense, label: "Veil Sense", accent: true },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 4px", background: "rgba(15,21,32,0.85)", border: "1px solid #1E2E48", borderRadius: 8, backdropFilter: "blur(8px)" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: s.accent ? "#8040C8" : "#F0EDE6", lineHeight: 1, marginBottom: 3 }}>{s.val}</span>
                <span style={{ fontSize: 7, letterSpacing: "0.15em", color: "#485E7A", textTransform: "uppercase" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Bottom HUD ── */}
      {locationReady && screenState === "map" && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10, padding: "12px 16px 24px", background: "linear-gradient(to top, rgba(8,12,20,0.98) 60%, transparent)" }}>
          {/* Tear counts */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, paddingBottom: 10 }}>
            {[
              { type: "minor",   color: "#1A6ED4", label: "MINOR" },
              { type: "wander",  color: "#8040C8", label: "WANDER" },
              { type: "dormant", color: "#E8820A", label: "DORMANT" },
              { type: "double",  color: "#CC1020", label: "EVENT" },
            ].map(t => (
              <div key={t.type} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, boxShadow: `0 0 4px ${t.color}` }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: t.type === "double" ? "#CC1020" : "#F0EDE6" }}>{tearCounts[t.type]}</span>
                <span style={{ fontSize: 8, color: "#485E7A", letterSpacing: "0.1em" }}>{t.label}</span>
              </div>
            ))}
          </div>

          {/* Quest strip */}
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, scrollbarWidth: "none" }}>
            {DAILY_QUESTS.map(q => {
              const done = (questProgress[q.id] ?? 0) >= q.max;
              return (
                <div key={q.id} style={{ flexShrink: 0, width: 160, padding: "10px 12px", background: done ? "rgba(60,100,60,0.08)" : "rgba(15,21,32,0.9)", border: `1px solid ${done ? "rgba(80,140,80,0.4)" : "#1E2E48"}`, borderRadius: 10, backdropFilter: "blur(8px)", opacity: done ? 0.65 : 1 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "#C8900A", textTransform: "uppercase", marginBottom: 4 }}>{q.icon} {q.title}</div>
                  <div style={{ fontFamily: FONT_LORE, fontStyle: "italic", fontSize: 10, color: "#8FA8CC", lineHeight: 1.4, marginBottom: 6 }}>{q.desc}</div>
                  <div style={{ fontSize: 8, color: "#485E7A" }}>
                    Reward: <span style={{ color: "#C8900A" }}>{q.reward}</span>
                    {q.max > 1 && <span> · {questProgress[q.id] ?? 0}/{q.max}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "rgba(15,21,32,0.9)", border: "1px solid #1E2E48", borderRadius: 20 }}>
              <span style={{ fontSize: 8, color: "#485E7A", letterSpacing: "0.12em" }}>TEARS RESET</span>
              <span style={{ fontSize: 13, color: "#C8900A", fontFamily: "monospace", fontWeight: 700 }}>{countdown}</span>
            </div>
            <button onClick={recenter} style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(15,21,32,0.9)", border: "1px solid #1E2E48", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#8FA8CC", fontSize: 18 }}>◎</button>
          </div>
        </div>
      )}

      {/* ── Encounter modal ── */}
      {activeTear && screenState === "map" && createPortal(
        <div onClick={e => { if (e.target === e.currentTarget) setActiveTear(null); }} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(8,12,20,0.92)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 480, background: "#0F1520", border: "1px solid #2A4470", borderRadius: "24px 24px 0 0", padding: "24px 20px 40px" }}>
            <div style={{ width: 36, height: 3, borderRadius: 2, background: "#2A4470", margin: "0 auto 20px" }} />
            {(() => {
              const td = TEAR_TYPES[activeTear.type];
              return (
                <>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", background: td.bgColor, border: `1px solid ${td.color}55`, boxShadow: `0 0 16px ${td.color}33`, flexShrink: 0 }}>
                      <span style={{ fontSize: 24, color: td.color, textShadow: `0 0 12px ${td.color}` }}>{td.glyph}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, letterSpacing: "0.2em", fontWeight: 700, textTransform: "uppercase", color: td.color, marginBottom: 4 }}>{td.label}</div>
                      <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 18, fontWeight: 700, color: "#F0EDE6", marginBottom: 6, lineHeight: 1.2 }}>{activeTear.name}</div>
                      <div style={{ fontFamily: FONT_LORE, fontStyle: "italic", fontSize: 12, color: "#8FA8CC", lineHeight: 1.6 }}>{activeTear.lore}</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 20 }}>
                    {[{ val: td.tier, label: "Tier" }, { val: td.hp, label: "Enemy HP" }, { val: td.dur, label: "Duration" }].map(s => (
                      <div key={s.label} style={{ background: "#080C14", border: "1px solid #1E2E48", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#F0EDE6", marginBottom: 3 }}>{s.val}</div>
                        <div style={{ fontSize: 7, color: "#485E7A", letterSpacing: "0.15em" }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                    {td.rewards.map((r, i) => (
                      <div key={i} style={{ padding: "6px 12px", borderRadius: 20, fontSize: 10, display: "flex", alignItems: "center", gap: 5, background: r.color, border: `1px solid ${r.border}` }}>
                        <span>{r.icon}</span>
                        <span style={{ color: "#8FA8CC" }}>{r.label}</span>
                        <span style={{ color: "#E8A820", fontWeight: 700 }}>{r.val}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => startBattle(activeTear)} style={{ ...btnPrimary, flex: 1 }}>Enter the Veil</button>
                    <button onClick={() => setActiveTear(null)} style={{ width: 52, padding: 16, borderRadius: 12, border: "1px solid #1E2E48", background: "transparent", color: "#485E7A", cursor: "pointer", fontSize: 18 }}>✕</button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* ── Battle screen ── */}
      {screenState === "battle" && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "#080C14", display: "flex", flexDirection: "column", fontFamily: "'Cinzel', serif" }}>
          <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@400;700&family=IM+Fell+English:ital@0;1&display=swap" rel="stylesheet" />
          {/* Battle bg glow */}
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 40% at 50% 60%, rgba(96,48,160,0.15) 0%, transparent 70%)" }} />
          {/* Damage flash */}
          {damageFlash && <div style={{ position: "fixed", inset: 0, zIndex: 700, pointerEvents: "none", background: damageFlash, opacity: 0.35 }} />}

          <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", padding: "48px 20px 0" }}>
            {/* Enemy */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingBottom: 20 }}>
              {(() => {
                const tear = battleTearRef.current;
                if (!tear) return null;
                const td = TEAR_TYPES[tear.type];
                return (
                  <>
                    <div style={{ width: 100, height: 100, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, background: `radial-gradient(circle, ${td.color}22, transparent)`, border: `1px solid ${td.color}33` }}>
                      <span style={{ fontSize: 52, color: td.color, textShadow: `0 0 24px ${td.color}, 0 0 48px ${td.color}60` }}>{td.glyph}</span>
                    </div>
                    <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 16, color: "#F0EDE6", marginBottom: 4, textAlign: "center" }}>{tear.name}</div>
                    <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#485E7A", marginBottom: 12 }}>{td.tier} · {td.label}</div>
                    <div style={{ width: "100%", maxWidth: 280, height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                      <div style={{ height: "100%", borderRadius: 3, width: `${hpPct}%`, background: `linear-gradient(90deg,${hpColor}80,${hpColor})`, transition: "width 0.5s ease" }} />
                    </div>
                    <div style={{ fontSize: 10, color: "#485E7A", marginBottom: 12, letterSpacing: "0.1em" }}>{enemyHp} / {enemyMaxHp} HP</div>
                    <div style={{ padding: "8px 16px", borderRadius: 20, fontFamily: FONT_LORE, fontStyle: "italic", fontSize: 11, color: "#8FA8CC", textAlign: "center", maxWidth: 280, background: "rgba(200,64,32,0.08)", border: "1px solid rgba(200,64,32,0.2)" }}>{telegraph}</div>
                  </>
                );
              })()}
            </div>

            {/* Player HP */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
              <span style={{ fontSize: 8, letterSpacing: "0.1em", color: "#485E7A", whiteSpace: "nowrap" }}>YOUR RESOLVE</span>
              <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 2, width: `${playerHp}%`, background: playerHp > 50 ? "linear-gradient(90deg,#1A6ED4,#4A9EF4)" : playerHp > 25 ? "linear-gradient(90deg,#C8900A,#E8C040)" : "linear-gradient(90deg,#C84020,#E85030)", transition: "width 0.4s ease" }} />
              </div>
              <span style={{ fontSize: 8, color: "#8FA8CC" }}>{playerHp}</span>
            </div>

            {/* Battle log */}
            <div style={{ fontFamily: FONT_LORE, fontStyle: "italic", fontSize: 12, color: "#8FA8CC", textAlign: "center", padding: "8px 0 12px", minHeight: 36 }}>{battleLog}</div>
          </div>

          {/* Action buttons */}
          <div style={{ padding: "12px 20px 36px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { action: "strike",  icon: "⚔", label: "STRIKE",  sub: "Basic Attack",     color: "#C84020" },
              { action: "ability", icon: "◈", label: "ABILITY", sub: "Resonance Strike",  color: "#8040C8" },
              { action: "item",    icon: "⊕", label: "ITEM",    sub: "Veil Shard Flask",  color: "#C8900A" },
              { action: "retreat", icon: "↩", label: "RETREAT", sub: "Flee Encounter",    color: "#485E7A" },
            ].map(b => (
              <button
                key={b.action}
                disabled={battleBusy}
                onClick={() => b.action === "retreat" ? setScreenState("map") : handleBattleAction(b.action)}
                style={{ padding: "14px 10px", borderRadius: 12, border: `1px solid ${b.color}66`, background: "transparent", cursor: battleBusy ? "not-allowed" : "pointer", fontFamily: "'Cinzel', serif", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, opacity: battleBusy ? 0.5 : 1, color: b.color }}
              >
                <span style={{ fontSize: 22 }}>{b.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em" }}>{b.label}</span>
                <span style={{ fontSize: 8, color: "#485E7A", letterSpacing: "0.1em" }}>{b.sub}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* ── Result panels ── */}
      {(screenState === "victory" || screenState === "defeat") && battleResult && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(8,12,20,0.95)", backdropFilter: "blur(6px)", flexDirection: "column", gap: 16, padding: 40, textAlign: "center", fontFamily: "'Cinzel', serif" }}>
          {screenState === "victory" ? (
            <>
              <div style={{ fontSize: 64 }}>◈</div>
              <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 24, fontWeight: 700, color: "#E8A820" }}>Tear Sealed</div>
              <p style={{ fontFamily: "'IM Fell English', serif", fontStyle: "italic", fontSize: 14, color: "#8FA8CC", lineHeight: 1.7, maxWidth: 300 }}>
                "{battleTearRef.current?.name} has been driven back.<br />The Veil holds — for now."
              </p>
              <div style={{ display: "flex", gap: 12, padding: "16px 20px", background: "#0F1520", border: "1px solid #2A4470", borderRadius: 14 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#C8900A" }}>+{battleResult.shards}</div>
                  <div style={{ fontSize: 8, color: "#485E7A", letterSpacing: "0.12em", marginTop: 2 }}>VEIL SHARDS</div>
                </div>
                <div style={{ textAlign: "center", paddingLeft: 12, borderLeft: "1px solid #1E2E48" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#8FA8CC" }}>+1</div>
                  <div style={{ fontSize: 8, color: "#485E7A", letterSpacing: "0.12em", marginTop: 2 }}>LORE FRAGMENT</div>
                </div>
              </div>
              <button onClick={() => setScreenState("map")} style={btnPrimary}>Return to the World</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 64, color: "#C84020" }}>✦</div>
              <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 24, fontWeight: 700, color: "#C84020" }}>Forced Retreat</div>
              <p style={{ fontFamily: "'IM Fell English', serif", fontStyle: "italic", fontSize: 14, color: "#8FA8CC", lineHeight: 1.7, maxWidth: 300 }}>
                "The {battleTearRef.current?.name} endures.<br />The Veil remembers your weakness."
              </p>
              <button onClick={() => setScreenState("map")} style={{ ...btnPrimary, background: "#0F1520", color: "#8FA8CC", border: "1px solid #1E2E48" }}>Withdraw</button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// Shared button styles
const btnPrimary = {
  padding: "16px 32px", borderRadius: 12, border: "none",
  background: "#C8900A", color: "#080C14",
  fontFamily: "'Cinzel', serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.15em",
  cursor: "pointer", width: "100%", maxWidth: 280,
};
const btnGhost = {
  padding: "12px 30px", borderRadius: 12, border: "1px solid #1E2E48",
  background: "none", color: "#485E7A",
  fontFamily: "'Cinzel', serif", fontSize: 10, letterSpacing: "0.12em",
  cursor: "pointer",
};
