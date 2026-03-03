import { useState, useEffect, useCallback, useRef } from "react";

/* ═══════════════════════════════════════════
   PIK PORTAL — HEROES' VERITAS USER PORTAL
   v1.1 — All state lifted to root, cross-tab persistence
   ═══════════════════════════════════════════ */

// ── INITIAL DATA ──
const INIT_PLAYER = {
  displayName: "Valcrest", title: "the Wanderer", heroName: "Kael",
  tier: "Silver", tierColor: "#c0c0c0", level: 17,
  xp: 3420, xpNext: 5000, xpTier: 8500, xpTierNext: 15000,
  sessions: 24, questsComplete: 11, bossKills: 3, gearScore: 142,
  pikId: "PIK#7X2M9K",
};

const INIT_RESOURCES = { emberstone: 34, wyldroot: 12, seaglass: 8, dustiron: 21 };

const TIERS = [
  { name: "Bronze", color: "#cd7f32", range: "1-6" },
  { name: "Copper", color: "#b87333", range: "7-13" },
  { name: "Silver", color: "#c0c0c0", range: "14-21" },
  { name: "Gold", color: "#ffd700", range: "22-29" },
  { name: "Platinum", color: "#e5e4e2", range: "30-39" },
  { name: "Adamantium", color: "#4ff0d0", range: "40+" },
];

const GEAR_SLOTS = [
  { slot: "Head", item: "Wyldguard Helm", rarity: "uncommon", icon: "\uD83D\uDC51" },
  { slot: "Chest", item: "Kingvale Brigandine", rarity: "rare", icon: "\uD83D\uDEE1" },
  { slot: "Hands", item: "Traveler's Wraps", rarity: "common", icon: "\uD83E\uDDE4" },
  { slot: "Weapon", item: "Forged Shortsword", rarity: "uncommon", icon: "\u2694\uFE0F" },
  { slot: "Off-Hand", item: null, rarity: null, icon: "\uD83D\uDEE1" },
  { slot: "Trinket", item: "Ember Sigil", rarity: "rare", icon: "\uD83D\uDC8E" },
];

const INIT_ACTIVE_QUESTS = [
  { id: 1, name: "The Wyrm Below", realm: "Kingvale", type: "story", tier: "Silver", progress: 2, total: 5, xp: 800, venue: true, desc: "Investigate tremors beneath Kingvale Keep." },
  { id: 2, name: "Gather Wyldroot", realm: "The Wylds", type: "gathering", tier: "Bronze", progress: 8, total: 12, xp: 200, venue: false, desc: "Collect wyldroot samples from the forest edge." },
  { id: 3, name: "The Corsair's Debt", realm: "Lochmaw", type: "story", tier: "Silver", progress: 0, total: 3, xp: 600, venue: true, desc: "A captain in Lochmaw needs help settling old scores." },
];

const INIT_AVAILABLE_QUESTS = [
  { id: 10, name: "Scorched Earth Survey", realm: "Origin Sands", type: "exploration", tier: "Silver", xp: 450, venue: true, desc: "Map the An'Haretti conduit lines in the southern wastes.", locked: false },
  { id: 11, name: "Desolation Watch", realm: "Desolate Peaks", type: "story", tier: "Gold", xp: 1200, venue: true, desc: "Join the watch post for signs of dragon movement.", locked: true, lockReason: "Requires Gold tier" },
  { id: 12, name: "Timber Count", realm: "The Wylds", type: "daily", tier: "Bronze", xp: 75, venue: false, desc: "Tally marked trees along the Druid patrol route.", locked: false },
  { id: 13, name: "Hull Inspection", realm: "Lochmaw", type: "daily", tier: "Bronze", xp: 75, venue: false, desc: "Check reclaimed hull integrity at the Eastern docks.", locked: false },
  { id: 14, name: "Burning Keep: Reconnaissance", realm: "Kingvale", type: "dungeon_prep", tier: "Silver", xp: 350, venue: false, desc: "Study the Keep's layout to prepare for the dragon assault.", locked: false },
];

const INIT_CODEX = [
  { id: 1, title: "The Great Tree", realm: "The Wylds", category: "Lore", unlocked: true, read: false, content: "The source of all life and magic on the continent. Overseen by the Dryad Druids, the Great Tree's roots stretch beneath every realm of Elysendar, binding them together in ways that few understand." },
  { id: 2, title: "Kingvale Keep", realm: "Kingvale", category: "Locations", unlocked: true, read: false, content: "The castle and its high walls protect the royal family and the market square. Sturdy, old-world architecture \u2014 deep golds, white stone, and vibrant banners. The heart of military and diplomatic power." },
  { id: 3, title: "The Necro Rot", realm: "The Wylds", category: "Threats", unlocked: true, read: false, content: "A creeping corruption spreading through the forest. Necrotic wildlife, poisonous terrain, and a hidden temple lie at its source. The Druids struggle to contain it." },
  { id: 4, title: "Lochmaw Harbor", realm: "Lochmaw", category: "Locations", unlocked: true, read: false, content: "Built from the reclaimed wood of wrecked ships and overturned hulls. Loud, colorful, crude \u2014 home to Corsairs, pirates, traders, and thespians. The Serpent Slayers guild keeps the sea lanes safe." },
  { id: 5, title: "An'Haretti Ruins", realm: "Origin Sands", category: "Lore", unlocked: false, read: false },
  { id: 6, title: "The Dragon Pact", realm: "Desolate Peaks", category: "Lore", unlocked: false, read: false },
  { id: 7, title: "Order of the Drowned", realm: "Lochmaw", category: "Factions", unlocked: false, read: false },
  { id: 8, title: "The Rotten Bishop", realm: "Kingvale", category: "Characters", unlocked: false, read: false },
  { id: 9, title: "Bole of the Dryad", realm: "The Wylds", category: "Characters", unlocked: true, read: false, content: "The living spirit of the Great Tree made manifest. The Bole speaks in riddles, sees in seasons, and remembers every root and branch that has ever grown in Elysendar." },
  { id: 10, title: "Guardian Glaives", realm: "The Wylds", category: "Factions", unlocked: true, read: false, content: "Elite protectors of the Great Tree. They patrol the deep woods and answer only to the Tribunal. Few outsiders earn their trust." },
];

const INIT_SEALED_LOOT = [
  { id: 1, from: "Kingvale Keep \u2014 Session #22", date: "2 days ago", rarity: "rare" },
  { id: 2, from: "Wylds Patrol \u2014 Session #24", date: "Yesterday", rarity: "uncommon" },
];

const CRAFT_RECIPES = [
  { id: 1, name: "Minor Elixir", desc: "Restores a small amount during sessions", time: 15, cost: { wyldroot: 3 }, result: "consumable", icon: "\uD83E\uDDEA" },
  { id: 2, name: "Ember Ward", desc: "Temporary defense boost at LBE sessions", time: 30, cost: { emberstone: 5, dustiron: 2 }, result: "gear_mod", icon: "\uD83D\uDD25" },
  { id: 3, name: "Wayfinder Charm", desc: "+10% XP for your next venue session", time: 45, cost: { seaglass: 4, wyldroot: 2 }, result: "boost", icon: "\uD83E\uDDED" },
  { id: 4, name: "Sealed Crate Key", desc: "Opens sealed loot from LBE sessions", time: 10, cost: { dustiron: 3 }, result: "key", icon: "\uD83D\uDD11" },
];

const LOOT_REWARDS = {
  rare: [{ name: "Emberforged Gauntlets", rarity: "rare", type: "gear" }, { name: "Dragon Scale Fragment", rarity: "rare", type: "material" }],
  uncommon: [{ name: "Wyld-Touched Ring", rarity: "uncommon", type: "gear" }, { name: "Polished Seaglass", rarity: "uncommon", type: "material" }],
  common: [{ name: "Traveler's Rations", rarity: "common", type: "consumable" }],
};

// ── STYLE CONSTANTS ──
const FONT = "'Crimson Pro', 'Georgia', serif";
const FONT_B = "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const BG = "#08080f";
const SURFACE = "rgba(255,255,255,0.025)";
const BORDER = "rgba(255,255,255,0.06)";
const MUTED = "rgba(255,255,255,0.35)";
const DIM = "rgba(255,255,255,0.5)";

const rarCol = { common: "#9ca3af", uncommon: "#22c55e", rare: "#3b82f6", epic: "#a855f7", legendary: "#f59e0b" };
const rlmCol = { Kingvale: "#ffd700", "The Wylds": "#22c55e", Lochmaw: "#3b82f6", "Origin Sands": "#f97316", "Desolate Peaks": "#94a3b8" };
const rlmIcn = { Kingvale: "\uD83C\uDFF0", "The Wylds": "\uD83C\uDF3F", Lochmaw: "\u2693", "Origin Sands": "\u2600\uFE0F", "Desolate Peaks": "\uD83C\uDFD4\uFE0F" };
const typIcn = { story: "\uD83D\uDCDC", gathering: "\uD83C\uDF3F", daily: "\u2B50", exploration: "\uD83E\uDDED", dungeon_prep: "\uD83D\uDDE1\uFE0F" };
const resIcn = { emberstone: "\uD83D\uDD25", wyldroot: "\uD83C\uDF3F", seaglass: "\uD83C\uDF0A", dustiron: "\u2699\uFE0F" };
const resCol = { emberstone: "#f97316", wyldroot: "#22c55e", seaglass: "#3b82f6", dustiron: "#94a3b8" };

// ── SHARED COMPONENTS ──
function PBar({ value, max, color = "#6366f1", height = 6 }) {
  return (
    <div style={{ height, background: "rgba(255,255,255,0.06)", borderRadius: height / 2, overflow: "hidden", width: "100%" }}>
      <div style={{ width: `${Math.min((value / max) * 100, 100)}%`, height: "100%", background: `linear-gradient(90deg, ${color}, ${color}aa)`, borderRadius: height / 2, transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)" }} />
    </div>
  );
}

function Bdg({ children, color = "#6366f1", style: ex = {} }) {
  return <span style={{ padding: "2px 8px", borderRadius: 10, background: color + "20", color, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: FONT_B, ...ex }}>{children}</span>;
}

function Crd({ children, style: ex = {}, onClick }) {
  return <div onClick={onClick} style={{ background: SURFACE, borderRadius: 12, padding: 16, border: `1px solid ${BORDER}`, ...ex }}>{children}</div>;
}

function SecTitle({ children, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: DIM, fontFamily: FONT_B, margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>{children}</h3>
      {right}
    </div>
  );
}

/* Toast notification */
function Toast({ message, color, onDone }) {
  const [vis, setVis] = useState(true);
  useEffect(() => { const t = setTimeout(() => { setVis(false); setTimeout(onDone, 300); }, 2500); return () => clearTimeout(t); }, []);
  return (
    <div style={{ position: "fixed", top: 60, left: "50%", transform: `translateX(-50%) translateY(${vis ? 0 : -20}px)`, opacity: vis ? 1 : 0, transition: "all 0.3s ease", zIndex: 200, padding: "10px 20px", borderRadius: 10, background: (color || "#6366f1") + "20", border: `1px solid ${color || "#6366f1"}40`, backdropFilter: "blur(12px)", maxWidth: 360 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: color || "#a78bfa", fontFamily: FONT_B }}>{message}</span>
    </div>
  );
}

function TabBar({ active, onChange }) {
  const tabs = [
    { id: "hero", icon: "\u2694\uFE0F", label: "Hero" },
    { id: "quests", icon: "\uD83D\uDCDC", label: "Quests" },
    { id: "codex", icon: "\uD83D\uDCD6", label: "Codex" },
    { id: "workshop", icon: "\u2699\uFE0F", label: "Workshop" },
  ];
  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: `linear-gradient(180deg, transparent 0%, ${BG} 30%)`, padding: "20px 0 10px", zIndex: 100 }}>
      <div style={{ display: "flex", justifyContent: "space-around", padding: "0 8px" }}>
        {tabs.map(t => {
          const on = active === t.id;
          return (
            <button key={t.id} onClick={() => onChange(t.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontFamily: FONT_B }}>
              <span style={{ fontSize: 20, filter: on ? "none" : "grayscale(1) opacity(0.4)", transition: "all 0.2s ease" }}>{t.icon}</span>
              <span style={{ fontSize: 10, fontWeight: on ? 700 : 500, color: on ? "#fff" : MUTED, letterSpacing: "0.04em", textTransform: "uppercase" }}>{t.label}</span>
              {on && <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#6366f1", marginTop: 2 }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════ HERO HUB ═══════ */
function HeroHub({ player, resources, daily, sealedLoot, activeQuests, onOpenLoot, onClaimDaily }) {
  const [showGear, setShowGear] = useState(false);
  const tierIdx = TIERS.findIndex(t => t.name === player.tier);
  const nextTier = TIERS[tierIdx + 1];

  return (
    <div style={{ padding: "0 20px 120px" }}>
      {/* Daily */}
      <Crd style={{ marginBottom: 16, background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.04))", border: "1px solid rgba(99,102,241,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>{"\u2B50"}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: FONT_B }}>{daily.name}</div>
              <div style={{ fontSize: 11, color: MUTED, fontFamily: FONT_B }}>{daily.desc}</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            {daily.progress >= daily.total && !daily.claimed ? (
              <button onClick={onClaimDaily} style={{ padding: "4px 12px", borderRadius: 8, background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT_B }}>Claim +{daily.xp} XP</button>
            ) : daily.claimed ? (
              <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600, fontFamily: FONT_B }}>{"\u2713"} Claimed</span>
            ) : (
              <>
                <div style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600, fontFamily: FONT_B }}>{daily.progress}/{daily.total}</div>
                <div style={{ fontSize: 10, color: MUTED, fontFamily: FONT_B }}>+{daily.xp} XP</div>
              </>
            )}
          </div>
        </div>
        <div style={{ marginTop: 8 }}><PBar value={daily.progress} max={daily.total} color={daily.claimed ? "#22c55e" : "#a78bfa"} height={4} /></div>
      </Crd>

      {/* Hero Card */}
      <div style={{ padding: 28, borderRadius: 16, background: `linear-gradient(180deg, ${player.tierColor}08 0%, rgba(0,0,0,0.4) 100%)`, border: `1px solid ${player.tierColor}25`, marginBottom: 20, textAlign: "center" }}>
        <div style={{ width: 96, height: 96, borderRadius: "50%", margin: "0 auto 16px", background: `conic-gradient(from 0deg, ${player.tierColor}40, ${player.tierColor}10, ${player.tierColor}40)`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          <div style={{ width: 84, height: 84, borderRadius: "50%", background: "#0d0d18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>{"\u2694\uFE0F"}</div>
          <div style={{ position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%)", background: player.tierColor, color: "#000", fontSize: 10, fontWeight: 800, padding: "2px 10px", borderRadius: 8, fontFamily: FONT_B, letterSpacing: "0.06em" }}>LV {player.level}</div>
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", fontFamily: FONT, lineHeight: 1.2 }}>
          {player.heroName}<span style={{ color: player.tierColor, fontWeight: 400, fontSize: 16, fontStyle: "italic" }}> {player.title}</span>
        </div>
        <div style={{ fontSize: 13, color: player.tierColor, fontWeight: 600, marginTop: 6, fontFamily: FONT_B }}>{player.tier} Adventurer</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 4, fontFamily: FONT_B }}>{player.displayName} {"\u2022"} {player.pikId}</div>
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: MUTED, fontFamily: FONT_B }}>Level {player.level}</span>
            <span style={{ fontSize: 10, color: MUTED, fontFamily: FONT_B }}>{player.xp.toLocaleString()} / {player.xpNext.toLocaleString()} XP</span>
          </div>
          <PBar value={player.xp} max={player.xpNext} color={player.tierColor} />
        </div>
        {nextTier && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: player.tierColor, fontFamily: FONT_B, fontWeight: 600 }}>{player.tier}</span>
              <span style={{ fontSize: 10, color: MUTED, fontFamily: FONT_B }}>{player.xpTier.toLocaleString()} / {player.xpTierNext.toLocaleString()} to {nextTier.name}</span>
            </div>
            <PBar value={player.xpTier} max={player.xpTierNext} color={nextTier.color} height={4} />
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
        {[["\uD83C\uDFAF", "Sessions", player.sessions], ["\uD83D\uDCDC", "Quests", player.questsComplete], ["\uD83D\uDC09", "Bosses", player.bossKills], ["\uD83D\uDEE1", "Gear", player.gearScore]].map(([icon, label, val]) => (
          <Crd key={label} style={{ textAlign: "center", padding: 12 }}>
            <div style={{ fontSize: 16, marginBottom: 4 }}>{icon}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: FONT_B }}>{val}</div>
            <div style={{ fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: FONT_B }}>{label}</div>
          </Crd>
        ))}
      </div>

      {/* Gear */}
      <SecTitle right={<button onClick={() => setShowGear(!showGear)} style={{ background: "none", border: "none", color: "#6366f1", fontSize: 11, cursor: "pointer", fontFamily: FONT_B, fontWeight: 600 }}>{showGear ? "Collapse" : "View Gear"}</button>}>Equipment</SecTitle>
      {showGear ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
          {GEAR_SLOTS.map(g => (
            <Crd key={g.slot} style={{ textAlign: "center", padding: 12, opacity: g.item ? 1 : 0.4 }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{g.icon}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: g.item ? (rarCol[g.rarity] || "#fff") : MUTED, fontFamily: FONT_B, lineHeight: 1.3 }}>{g.item || "Empty"}</div>
              <div style={{ fontSize: 9, color: MUTED, textTransform: "uppercase", fontFamily: FONT_B, marginTop: 2 }}>{g.slot}</div>
              {g.rarity && <Bdg color={rarCol[g.rarity]} style={{ fontSize: 8, marginTop: 4 }}>{g.rarity}</Bdg>}
            </Crd>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
          {GEAR_SLOTS.filter(g => g.item).map(g => (
            <div key={g.slot} style={{ padding: "8px 12px", background: SURFACE, borderRadius: 8, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 14 }}>{g.icon}</span>
              <span style={{ fontSize: 11, color: rarCol[g.rarity], fontWeight: 600, fontFamily: FONT_B, whiteSpace: "nowrap" }}>{g.item}</span>
            </div>
          ))}
        </div>
      )}

      {/* Sealed Loot */}
      {sealedLoot.length > 0 && (
        <>
          <SecTitle>Sealed Loot</SecTitle>
          {sealedLoot.map(l => (
            <Crd key={l.id} style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${rarCol[l.rarity]}12`, border: `1px solid ${rarCol[l.rarity]}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{"\uD83D\uDCE6"}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", fontFamily: FONT_B }}>{l.from}</div>
                  <div style={{ fontSize: 10, color: MUTED, fontFamily: FONT_B }}>{l.date} {"\u2022"} <span style={{ color: rarCol[l.rarity] }}>{l.rarity}</span></div>
                </div>
              </div>
              <button onClick={() => onOpenLoot(l.id)} style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a78bfa", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT_B }}>Open</button>
            </Crd>
          ))}
          <div style={{ marginBottom: 20 }} />
        </>
      )}

      {/* Active Quests */}
      <SecTitle right={<span style={{ fontSize: 11, color: MUTED, fontFamily: FONT_B }}>{activeQuests.length} active</span>}>Active Quests</SecTitle>
      {activeQuests.slice(0, 2).map(q => (
        <Crd key={q.id} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>{typIcn[q.type]}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: FONT_B }}>{q.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: 11, color: rlmCol[q.realm], fontFamily: FONT_B }}>{rlmIcn[q.realm]} {q.realm}</span>
                  {q.venue && <Bdg color="#f59e0b" style={{ fontSize: 8 }}>Venue</Bdg>}
                </div>
              </div>
            </div>
            <span style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600, fontFamily: FONT_B }}>+{q.xp} XP</span>
          </div>
          <PBar value={q.progress} max={q.total} color={rlmCol[q.realm]} height={4} />
          <div style={{ fontSize: 10, color: MUTED, marginTop: 4, fontFamily: FONT_B }}>{q.progress}/{q.total} objectives</div>
        </Crd>
      ))}

      {/* Resources */}
      <div style={{ marginTop: 12 }}>
        <SecTitle>Resources</SecTitle>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(resources).map(([key, ct]) => (
            <div key={key} style={{ padding: "8px 14px", background: `${resCol[key]}08`, borderRadius: 8, border: `1px solid ${resCol[key]}18`, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14 }}>{resIcn[key]}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: resCol[key], fontFamily: FONT_B }}>{ct}</span>
              <span style={{ fontSize: 10, color: MUTED, fontFamily: FONT_B, textTransform: "capitalize" }}>{key}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════ QUEST BOARD ═══════ */
function QuestBoard({ activeQuests, availableQuests, onAcceptQuest }) {
  const [filter, setFilter] = useState("active");
  const quests = filter === "active" ? activeQuests : availableQuests;

  return (
    <div style={{ padding: "0 20px 120px" }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: FONT, margin: "0 0 4px" }}>Quest Board</h2>
      <p style={{ fontSize: 12, color: MUTED, fontFamily: FONT_B, margin: "0 0 16px" }}>Accept quests, prepare for sessions, track your progress.</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["active", `Active (${activeQuests.length})`], ["available", `Available (${availableQuests.length})`]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} style={{ padding: "8px 16px", borderRadius: 20, background: filter === id ? "rgba(99,102,241,0.2)" : SURFACE, border: `1px solid ${filter === id ? "rgba(99,102,241,0.4)" : BORDER}`, color: filter === id ? "#a78bfa" : MUTED, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT_B }}>{label}</button>
        ))}
      </div>
      {quests.map(q => {
        const locked = q.locked;
        return (
          <Crd key={q.id} style={{ marginBottom: 10, opacity: locked ? 0.45 : 1 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: `${rlmCol[q.realm]}12`, border: `1px solid ${rlmCol[q.realm]}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                {locked ? "\uD83D\uDD12" : typIcn[q.type]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: FONT_B }}>{q.name}</span>
                  <span style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600, fontFamily: FONT_B }}>+{q.xp} XP</span>
                </div>
                <p style={{ fontSize: 11, color: DIM, fontFamily: FONT_B, margin: "4px 0 8px", lineHeight: 1.5 }}>{q.desc}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: rlmCol[q.realm], fontFamily: FONT_B }}>{rlmIcn[q.realm]} {q.realm}</span>
                  <Bdg color={TIERS.find(t => t.name === q.tier)?.color || "#888"}>{q.tier}</Bdg>
                  {q.venue !== undefined && <Bdg color={q.venue ? "#f59e0b" : "#22c55e"}>{q.venue ? "Venue Required" : "In-App"}</Bdg>}
                </div>
                {q.progress !== undefined && (
                  <div style={{ marginTop: 8 }}>
                    <PBar value={q.progress} max={q.total} color={rlmCol[q.realm]} height={4} />
                    <span style={{ fontSize: 10, color: MUTED, fontFamily: FONT_B }}>{q.progress}/{q.total}</span>
                  </div>
                )}
                {locked && <div style={{ fontSize: 10, color: "#ef4444", fontFamily: FONT_B, marginTop: 6 }}>{"\uD83D\uDD12"} {q.lockReason}</div>}
                {!locked && filter === "available" && (
                  <button onClick={() => onAcceptQuest(q.id)} style={{ marginTop: 8, padding: "6px 16px", borderRadius: 8, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a78bfa", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT_B }}>Accept Quest</button>
                )}
              </div>
            </div>
          </Crd>
        );
      })}
    </div>
  );
}

/* ═══════ LORE CODEX ═══════ */
function LoreCodex({ codex, daily, onReadEntry }) {
  const [selected, setSelected] = useState(null);
  const [catFilter, setCatFilter] = useState("All");
  const categories = ["All", ...new Set(codex.map(e => e.category))];
  const filtered = catFilter === "All" ? codex : codex.filter(e => e.category === catFilter);
  const unlocked = codex.filter(e => e.unlocked).length;

  const handleSelect = (entry) => {
    if (!entry.unlocked) return;
    setSelected(entry);
    if (!entry.read) onReadEntry(entry.id);
  };

  return (
    <div style={{ padding: "0 20px 120px" }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: FONT, margin: "0 0 4px" }}>Lore Codex</h2>
      <p style={{ fontSize: 12, color: MUTED, fontFamily: FONT_B, margin: "0 0 4px" }}>The collected knowledge of Elysendar.</p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: DIM, fontFamily: FONT_B }}>{unlocked}/{codex.length} entries discovered</span>
        {!daily.claimed && <span style={{ fontSize: 11, color: "#a78bfa", fontFamily: FONT_B }}>Daily: {daily.progress}/{daily.total} read</span>}
      </div>
      <PBar value={unlocked} max={codex.length} color="#22c55e" height={4} />
      <div style={{ marginBottom: 16 }} />

      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
        {categories.map(c => (
          <button key={c} onClick={() => { setCatFilter(c); setSelected(null); }} style={{ padding: "6px 14px", borderRadius: 16, background: catFilter === c ? "rgba(34,197,94,0.15)" : SURFACE, border: `1px solid ${catFilter === c ? "rgba(34,197,94,0.3)" : BORDER}`, color: catFilter === c ? "#22c55e" : MUTED, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT_B, whiteSpace: "nowrap", flexShrink: 0 }}>{c}</button>
        ))}
      </div>

      {selected && selected.unlocked && (
        <Crd style={{ marginBottom: 16, background: "linear-gradient(135deg, rgba(34,197,94,0.06), rgba(0,0,0,0.2))", border: "1px solid rgba(34,197,94,0.15)" }}>
          <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: MUTED, fontSize: 12, cursor: "pointer", fontFamily: FONT_B, padding: 0, marginBottom: 8 }}>{"\u2190"} Back</button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 18 }}>{rlmIcn[selected.realm]}</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: FONT }}>{selected.title}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                <Bdg color={rlmCol[selected.realm]}>{selected.realm}</Bdg>
                <Bdg color="#22c55e">{selected.category}</Bdg>
              </div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: DIM, fontFamily: FONT_B, lineHeight: 1.8, margin: 0 }}>{selected.content}</p>
        </Crd>
      )}

      {!selected && filtered.map(entry => (
        <Crd key={entry.id} onClick={() => handleSelect(entry)} style={{ marginBottom: 8, cursor: entry.unlocked ? "pointer" : "default", opacity: entry.unlocked ? 1 : 0.4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: entry.unlocked ? `${rlmCol[entry.realm]}12` : "rgba(255,255,255,0.03)", border: `1px solid ${entry.unlocked ? rlmCol[entry.realm] + "25" : BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
              {entry.unlocked ? rlmIcn[entry.realm] : "\uD83D\uDD12"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: entry.unlocked ? "#fff" : MUTED, fontFamily: FONT_B }}>
                {entry.unlocked ? entry.title : "???"}
                {entry.read && <span style={{ fontSize: 10, color: "#22c55e", marginLeft: 6 }}>{"\u2713"}</span>}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                <Bdg color={rlmCol[entry.realm]}>{entry.realm}</Bdg>
                <Bdg color={MUTED}>{entry.category}</Bdg>
              </div>
            </div>
            {entry.unlocked && <span style={{ fontSize: 12, color: MUTED }}>{"\u203A"}</span>}
          </div>
        </Crd>
      ))}
    </div>
  );
}

/* ═══════ WORKSHOP ═══════ */
function Workshop({ resources, timers, onStartCraft, onCollectCraft }) {
  const [, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(iv); }, []);

  const fmtTime = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`; };
  const canAfford = (cost) => Object.entries(cost).every(([k, v]) => (resources[k] || 0) >= v);

  return (
    <div style={{ padding: "0 20px 120px" }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: FONT, margin: "0 0 4px" }}>Workshop</h2>
      <p style={{ fontSize: 12, color: MUTED, fontFamily: FONT_B, margin: "0 0 16px" }}>Craft consumables, gear mods, and session boosts between adventures.</p>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, padding: "10px 14px", background: SURFACE, borderRadius: 10, border: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
        {Object.entries(resources).map(([key, ct]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 14 }}>{resIcn[key]}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: resCol[key], fontFamily: FONT_B }}>{ct}</span>
          </div>
        ))}
      </div>

      {Object.entries(timers).length > 0 && (
        <>
          <SecTitle>In Progress</SecTitle>
          {Object.entries(timers).map(([id, timer]) => {
            const recipe = CRAFT_RECIPES.find(r => r.id === parseInt(id));
            const elSec = Math.floor((Date.now() - timer.started) / 1000);
            const rem = Math.max(0, timer.duration - elSec);
            const done = rem === 0;
            return (
              <Crd key={id} style={{ marginBottom: 10, background: done ? "rgba(34,197,94,0.06)" : SURFACE, border: `1px solid ${done ? "rgba(34,197,94,0.2)" : BORDER}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 28 }}>{recipe.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: FONT_B }}>{recipe.name}</div>
                    <div style={{ fontSize: 11, color: MUTED, fontFamily: FONT_B, marginBottom: 6 }}>{recipe.desc}</div>
                    <PBar value={timer.duration - rem} max={timer.duration} color={done ? "#22c55e" : "#f59e0b"} height={4} />
                    <div style={{ fontSize: 10, color: done ? "#22c55e" : "#f59e0b", fontWeight: 600, fontFamily: FONT_B, marginTop: 4 }}>{done ? "Ready to collect!" : `${fmtTime(rem)} remaining`}</div>
                  </div>
                  {done && <button onClick={() => onCollectCraft(parseInt(id))} style={{ padding: "8px 14px", borderRadius: 8, background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT_B }}>Collect</button>}
                </div>
              </Crd>
            );
          })}
          <div style={{ marginBottom: 8 }} />
        </>
      )}

      <SecTitle>Recipes</SecTitle>
      {CRAFT_RECIPES.map(r => {
        const active = !!timers[r.id];
        const afford = canAfford(r.cost);
        return (
          <Crd key={r.id} style={{ marginBottom: 10, opacity: active ? 0.5 : 1 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>{r.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: FONT_B }}>{r.name}</div>
                <div style={{ fontSize: 11, color: DIM, fontFamily: FONT_B, marginTop: 2, marginBottom: 8 }}>{r.desc}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, color: MUTED, fontFamily: FONT_B }}>Cost:</span>
                  {Object.entries(r.cost).map(([res, amt]) => (
                    <span key={res} style={{ fontSize: 11, color: (resources[res] || 0) >= amt ? resCol[res] : "#ef4444", fontWeight: 600, fontFamily: FONT_B }}>{resIcn[res]} {amt}</span>
                  ))}
                  <span style={{ fontSize: 10, color: MUTED, fontFamily: FONT_B }}>{"\u2022"} {fmtTime(r.time)}</span>
                </div>
                <button onClick={() => !active && afford && onStartCraft(r)} disabled={active || !afford} style={{ padding: "6px 16px", borderRadius: 8, background: active ? "rgba(255,255,255,0.03)" : afford ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)", border: `1px solid ${active ? BORDER : afford ? "rgba(99,102,241,0.3)" : BORDER}`, color: active ? MUTED : afford ? "#a78bfa" : MUTED, fontSize: 11, fontWeight: 600, cursor: active || !afford ? "not-allowed" : "pointer", fontFamily: FONT_B }}>
                  {active ? "Crafting..." : afford ? "Start Craft" : "Not enough resources"}
                </button>
              </div>
            </div>
          </Crd>
        );
      })}

      <Crd style={{ marginTop: 8, background: "linear-gradient(135deg, rgba(249,115,22,0.06), rgba(0,0,0,0.2))", border: "1px solid rgba(249,115,22,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>{"\uD83D\uDCE1"}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#f97316", fontFamily: FONT_B }}>Need more resources?</div>
            <div style={{ fontSize: 11, color: MUTED, fontFamily: FONT_B, lineHeight: 1.5 }}>Resources drop from venue sessions. Tap your wristband at any connected location to start earning.</div>
          </div>
        </div>
      </Crd>
    </div>
  );
}

/* ═══════ MAIN PORTAL — ALL STATE LIVES HERE ═══════ */
export default function PIKPortal() {
  const [tab, setTab] = useState("hero");
  const [toast, setToast] = useState(null);

  // ── Lifted state ──
  const [player, setPlayer] = useState(INIT_PLAYER);
  const [resources, setResources] = useState(INIT_RESOURCES);
  const [activeQuests, setActiveQuests] = useState(INIT_ACTIVE_QUESTS);
  const [availableQuests, setAvailableQuests] = useState(INIT_AVAILABLE_QUESTS);
  const [codex, setCodex] = useState(INIT_CODEX);
  const [sealedLoot, setSealedLoot] = useState(INIT_SEALED_LOOT);
  const [craftTimers, setCraftTimers] = useState({});
  const [daily, setDaily] = useState({ name: "Study the Codex", desc: "Read 2 lore entries to prepare for the realms.", progress: 0, total: 2, xp: 50, claimed: false });

  const notify = (msg, color) => setToast({ msg, color, key: Date.now() });

  // ── Accept Quest ──
  const handleAcceptQuest = (questId) => {
    const quest = availableQuests.find(q => q.id === questId);
    if (!quest || quest.locked) return;
    setAvailableQuests(prev => prev.filter(q => q.id !== questId));
    setActiveQuests(prev => [...prev, { ...quest, progress: 0, total: quest.type === "daily" ? 1 : 3 }]);
    notify(`Quest accepted: ${quest.name}`, rlmCol[quest.realm]);
  };

  // ── Open Sealed Loot ──
  const handleOpenLoot = (lootId) => {
    const loot = sealedLoot.find(l => l.id === lootId);
    if (!loot) return;
    const rewards = LOOT_REWARDS[loot.rarity] || LOOT_REWARDS.common;
    const reward = rewards[Math.floor(Math.random() * rewards.length)];
    setSealedLoot(prev => prev.filter(l => l.id !== lootId));
    setPlayer(prev => ({ ...prev, gearScore: prev.gearScore + (loot.rarity === "rare" ? 8 : 4) }));
    notify(`Opened: ${reward.name} (${reward.rarity})`, rarCol[reward.rarity]);
  };

  // ── Read Codex Entry (advances daily) ──
  const handleReadEntry = (entryId) => {
    setCodex(prev => prev.map(e => e.id === entryId ? { ...e, read: true } : e));
    setDaily(prev => {
      if (prev.claimed) return prev;
      const newProgress = Math.min(prev.progress + 1, prev.total);
      if (newProgress > prev.progress) {
        if (newProgress >= prev.total) notify("Daily complete! Claim your XP on the Hero tab.", "#22c55e");
      }
      return { ...prev, progress: newProgress };
    });
  };

  // ── Claim Daily ──
  const handleClaimDaily = () => {
    setDaily(prev => ({ ...prev, claimed: true }));
    setPlayer(prev => ({ ...prev, xp: prev.xp + daily.xp, xpTier: prev.xpTier + daily.xp }));
    notify(`+${daily.xp} XP claimed!`, "#22c55e");
  };

  // ── Start Craft (deducts resources, starts timer) ──
  const handleStartCraft = (recipe) => {
    const newRes = { ...resources };
    for (const [k, v] of Object.entries(recipe.cost)) {
      newRes[k] = (newRes[k] || 0) - v;
      if (newRes[k] < 0) return; // safety
    }
    setResources(newRes);
    setCraftTimers(prev => ({ ...prev, [recipe.id]: { started: Date.now(), duration: recipe.time } }));
    notify(`Crafting ${recipe.name}...`, "#f59e0b");
  };

  // ── Collect Finished Craft ──
  const handleCollectCraft = (recipeId) => {
    const recipe = CRAFT_RECIPES.find(r => r.id === recipeId);
    setCraftTimers(prev => { const n = { ...prev }; delete n[recipeId]; return n; });
    if (recipe.result === "key") {
      notify(`${recipe.name} crafted! Use it to open sealed loot.`, "#22c55e");
    } else {
      notify(`${recipe.name} collected!`, "#22c55e");
    }
  };

  return (
    <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: BG, fontFamily: FONT_B, color: "#fff", position: "relative" }}>
      <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {toast && <Toast key={toast.key} message={toast.msg} color={toast.color} onDone={() => setToast(null)} />}

      <div style={{ padding: "16px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: `linear-gradient(180deg, ${BG} 60%, transparent)`, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{"\u25C8"}</div>
          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: FONT_B, color: DIM }}>Heroes' Veritas</span>
        </div>
        <div style={{ padding: "4px 10px", borderRadius: 6, background: SURFACE, border: `1px solid ${BORDER}` }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: player.tierColor, fontFamily: FONT_B }}>{player.tier} {"\u2022"} Lv {player.level}</span>
        </div>
      </div>

      <div style={{ paddingTop: 8 }}>
        {tab === "hero" && <HeroHub player={player} resources={resources} daily={daily} sealedLoot={sealedLoot} activeQuests={activeQuests} onOpenLoot={handleOpenLoot} onClaimDaily={handleClaimDaily} />}
        {tab === "quests" && <QuestBoard activeQuests={activeQuests} availableQuests={availableQuests} onAcceptQuest={handleAcceptQuest} />}
        {tab === "codex" && <LoreCodex codex={codex} daily={daily} onReadEntry={handleReadEntry} />}
        {tab === "workshop" && <Workshop resources={resources} timers={craftTimers} onStartCraft={handleStartCraft} onCollectCraft={handleCollectCraft} />}
      </div>

      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
