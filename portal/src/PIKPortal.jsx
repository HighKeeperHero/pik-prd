import { useState, useEffect, useCallback, useRef } from "react";
import api from './api.js';

/* ═══════════════════════════════════════════
   PIK PORTAL — HEROES' VERITAS USER PORTAL
   v2.0 — Live API integration with mock fallback
   ═══════════════════════════════════════════ */

// ── TIER CONFIG ──
const TIERS = [
  { name: "Bronze", color: "#cd7f32", min: 1, max: 6 },
  { name: "Copper", color: "#b87333", min: 7, max: 13 },
  { name: "Silver", color: "#c0c0c0", min: 14, max: 21 },
  { name: "Gold", color: "#ffd700", min: 22, max: 29 },
  { name: "Platinum", color: "#e5e4e2", min: 30, max: 39 },
  { name: "Adamantium", color: "#4ff0d0", min: 40, max: 99 },
];

function getTier(level) {
  const t = TIERS.find(t => level >= t.min && level <= t.max) || TIERS[0];
  return { name: t.name, color: t.color };
}

// XP thresholds per level (simplified curve)
function xpForLevel(lv) { return Math.floor(100 * Math.pow(lv, 1.5)); }
function tierXpRange(tier) {
  const t = TIERS.find(t2 => t2.name === tier.name);
  if (!t) return { min: 0, max: 10000 };
  let total = 0; for (let i = 1; i < t.min; i++) total += xpForLevel(i);
  const minXp = total;
  for (let i = t.min; i <= t.max; i++) total += xpForLevel(i);
  return { min: minXp, max: total };
}

// ── MOCK / FALLBACK DATA ──
const MOCK_PLAYER = {
  displayName: "Valcrest", title: "the Wanderer", heroName: "Kael",
  tier: "Silver", tierColor: "#c0c0c0", level: 17,
  xp: 3420, xpNext: 5000, xpTier: 8500, xpTierNext: 15000,
  sessions: 24, questsComplete: 11, bossKills: 3, gearScore: 142,
  pikId: "PIK#7X2M9K", equippedTitle: null, titles: [],
};

const EMPTY_GEAR = [
  { slot: "Weapon", slotKey: "weapon", item: null, rarity: null, icon: "\u2694\uFE0F" },
  { slot: "Helm",   slotKey: "helm",   item: null, rarity: null, icon: "\uD83D\uDC51" },
  { slot: "Chest",  slotKey: "chest",  item: null, rarity: null, icon: "\uD83D\uDEE1\uFE0F" },
  { slot: "Arms",   slotKey: "arms",   item: null, rarity: null, icon: "\uD83E\uDDE4" },
  { slot: "Legs",   slotKey: "legs",   item: null, rarity: null, icon: "\uD83D\uDC62" },
  { slot: "Rune",   slotKey: "rune",   item: null, rarity: null, icon: "\uD83D\uDD2E" },
];

const SLOT_ICONS = { head: "\uD83D\uDC51", chest: "\uD83D\uDEE1", hands: "\uD83E\uDDE4", weapon: "\u2694\uFE0F", "off-hand": "\uD83D\uDEE1", offhand: "\uD83D\uDEE1", trinket: "\uD83D\uDC8E", legs: "\uD83D\uDC62", feet: "\uD83D\uDC62", ring: "\uD83D\uDC8D", neck: "\uD83D\uDCFF" };

const MOCK_CODEX = [
  { id: 1, title: "The Great Tree", realm: "The Wylds", category: "Lore", unlocked: true, read: false, content: "The source of all life and magic on the continent. Overseen by the Dryad Druids, the Great Tree's roots stretch beneath every realm of Elysendar, binding them together in ways that few understand." },
  { id: 2, title: "Kingvale Keep", realm: "Kingvale", category: "Locations", unlocked: true, read: false, content: "The castle and its high walls protect the royal family and the market square. Sturdy, old-world architecture \u2014 deep golds, white stone, and vibrant banners. The heart of military and diplomatic power." },
  { id: 3, title: "The Necro Rot", realm: "The Wylds", category: "Threats", unlocked: true, read: false, content: "A creeping corruption spreading through the forest. Necrotic wildlife, poisonous terrain, and a hidden temple lie at its source. The Druids struggle to contain it." },
  { id: 4, title: "Lochmaw Harbor", realm: "Lochmaw", category: "Locations", unlocked: true, read: false, content: "Built from the reclaimed wood of wrecked ships and overturned hulls. Loud, colorful, crude \u2014 home to Corsairs, pirates, traders, and thespians." },
  { id: 5, title: "An'Haretti Ruins", realm: "Origin Sands", category: "Lore", unlocked: false, read: false },
  { id: 6, title: "The Dragon Pact", realm: "Desolate Peaks", category: "Lore", unlocked: false, read: false },
  { id: 7, title: "Order of the Drowned", realm: "Lochmaw", category: "Factions", unlocked: false, read: false },
  { id: 8, title: "The Rotten Bishop", realm: "Kingvale", category: "Characters", unlocked: false, read: false },
  { id: 9, title: "Bole of the Dryad", realm: "The Wylds", category: "Characters", unlocked: true, read: false, content: "The living spirit of the Great Tree made manifest. The Bole speaks in riddles, sees in seasons, and remembers every root and branch." },
  { id: 10, title: "Guardian Glaives", realm: "The Wylds", category: "Factions", unlocked: true, read: false, content: "Elite protectors of the Great Tree. They patrol the deep woods and answer only to the Tribunal. Few outsiders earn their trust." },
];

const CRAFT_RECIPES = [
  { id: 1, name: "Minor Elixir", desc: "Restores a small amount during sessions", time: 15, cost: { wyldroot: 3 }, result: "consumable", icon: "\uD83E\uDDEA" },
  { id: 2, name: "Ember Ward", desc: "Temporary defense boost at LBE sessions", time: 30, cost: { emberstone: 5, dustiron: 2 }, result: "gear_mod", icon: "\uD83D\uDD25" },
  { id: 3, name: "Wayfinder Charm", desc: "+10% XP for your next venue session", time: 45, cost: { seaglass: 4, wyldroot: 2 }, result: "boost", icon: "\uD83E\uDDED" },
  { id: 4, name: "Sealed Crate Key", desc: "Opens sealed loot from LBE sessions", time: 10, cost: { dustiron: 3 }, result: "key", icon: "\uD83D\uDD11" },
];

const INIT_RESOURCES = { emberstone: 34, wyldroot: 12, seaglass: 8, dustiron: 21, nexus: 0 };

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
const typIcn = { story: "\uD83D\uDCDC", gathering: "\uD83C\uDF3F", daily: "\u2B50", exploration: "\uD83E\uDDED", dungeon_prep: "\uD83D\uDDE1\uFE0F", kill: "\uD83D\uDDE1\uFE0F", visit: "\uD83E\uDDED", collect: "\uD83C\uDF3F" };
const resIcn = { emberstone: "\uD83D\uDD25", wyldroot: "\uD83C\uDF3F", seaglass: "\uD83C\uDF0A", dustiron: "\u2699\uFE0F", nexus: "\uD83D\uDD2E" };
const resCol = { emberstone: "#f97316", wyldroot: "#22c55e", seaglass: "#3b82f6", dustiron: "#94a3b8", nexus: "#c084fc" };

// Nexus yield per rarity when dismantling
const NEXUS_YIELD = { common: 5, uncommon: 15, rare: 40, epic: 100, legendary: 250 };


// ══════════════════════════════════════════════════════════
// DATA NORMALIZATION — Maps API responses to portal shapes
// ══════════════════════════════════════════════════════════

function normalizeProfile(apiData, sessionCount = 0) {
  const level = apiData.fate_level || 1;
  const xp = apiData.fate_xp || 0;
  const tier = getTier(level);
  const xpNext = xpForLevel(level);
  const xpCurrent = xp % xpNext;
  const tRange = tierXpRange(tier);
  
  // Count boss kills from fate_markers
  const markers = apiData.fate_markers || [];
  const bossKills = markers.filter(m => 
    m.marker?.includes('boss') || m.marker?.includes('veil')
  ).length;

  // Titles
  const titles = (apiData.titles || []).map(t => ({
    id: t.title_id,
    name: (t.title_id || '').replace(/^title_/, '').replace(/_/g, ' ').toUpperCase(),
    equipped: apiData.equipped_title === t.title_id,
  }));

  return {
    displayName: apiData.hero_name || 'Unknown',
    title: apiData.equipped_title 
      ? titles.find(t => t.id === apiData.equipped_title)?.name || '' 
      : apiData.fate_alignment || '',
    heroName: apiData.hero_name || 'Unknown',
    tier: tier.name,
    tierColor: tier.color,
    level,
    xp: xpCurrent,
    xpNext,
    xpTotal: xp,
    xpTier: xp - tRange.min,
    xpTierNext: tRange.max - tRange.min,
    sessions: sessionCount,
    questsComplete: 0, // updated from quests
    bossKills,
    gearScore: 0, // updated from gear
    pikId: apiData.root_id || '',
    equippedTitle: apiData.equipped_title || null,
    titles,
    fateAlignment: apiData.fate_alignment || 'NONE',
  };
}

function normalizeEquipment(apiEquipment) {
  // Backend returns equipment as an object keyed by slot name:
  // { weapon: { item_name, rarity, ... }, helm: null, chest: {...}, arms: {...}, legs: {...}, rune: {...} }
  // OR as an array of items with a .slot field
  // OR wrapped in { equipment: {...} }
  
  const BACKEND_SLOTS = [
    { key: 'weapon', label: 'Weapon', icon: "\u2694\uFE0F" },
    { key: 'helm',   label: 'Helm',   icon: "\uD83D\uDC51" },
    { key: 'chest',  label: 'Chest',  icon: "\uD83D\uDEE1\uFE0F" },
    { key: 'arms',   label: 'Arms',   icon: "\uD83E\uDDE4" },
    { key: 'legs',   label: 'Legs',   icon: "\uD83D\uDC62" },
    { key: 'rune',   label: 'Rune',   icon: "\uD83D\uDD2E" },
  ];

  if (!apiEquipment) return BACKEND_SLOTS.map(s => ({ slot: s.label, slotKey: s.key, item: null, rarity: null, icon: s.icon, inventoryId: null }));

  // Handle object format: { weapon: {...}, helm: {...}, ... }
  if (!Array.isArray(apiEquipment) && typeof apiEquipment === 'object') {
    // Could be { equipment: {...} } wrapper
    const eq = apiEquipment.equipment || apiEquipment;
    return BACKEND_SLOTS.map(s => {
      const equipped = eq[s.key];
      if (!equipped) return { slot: s.label, slotKey: s.key, item: null, rarity: null, icon: s.icon, inventoryId: null };
      return {
        slot: s.label,
        slotKey: s.key,
        item: equipped.item_name || equipped.name || equipped.display_name || null,
        rarity: (equipped.rarity || '').toLowerCase() || null,
        icon: equipped.icon || s.icon,
        inventoryId: equipped.inventory_id || null,
      };
    });
  }

  // Handle array format: [{ slot: "weapon", item_name: "...", ... }]
  if (Array.isArray(apiEquipment)) {
    return BACKEND_SLOTS.map(s => {
      const equipped = apiEquipment.find(e =>
        (e.slot || '').toLowerCase() === s.key
      );
      if (!equipped) return { slot: s.label, slotKey: s.key, item: null, rarity: null, icon: s.icon, inventoryId: null };
      return {
        slot: s.label,
        slotKey: s.key,
        item: equipped.item_name || equipped.name || null,
        rarity: (equipped.rarity || '').toLowerCase() || null,
        icon: equipped.icon || s.icon,
        inventoryId: equipped.inventory_id || null,
      };
    });
  }

  return BACKEND_SLOTS.map(s => ({ slot: s.label, slotKey: s.key, item: null, rarity: null, icon: s.icon, inventoryId: null }));
}

function normalizeCaches(apiCaches) {
  if (!apiCaches || !Array.isArray(apiCaches)) return [];
  return apiCaches
    .filter(c => c.status === 'sealed' || c.status === 'SEALED')
    .map(c => ({
      id: c.id || c.cache_id,
      from: c.source_name || c.cache_type || 'Venue Session',
      date: c.granted_at ? timeAgo(c.granted_at) : 'Recently',
      rarity: (c.rarity || 'common').toLowerCase(),
      cacheType: c.cache_type,
    }));
}

function normalizeActiveQuests(apiQuests) {
  if (!apiQuests || !Array.isArray(apiQuests)) return [];
  return apiQuests
    .filter(q => q.status === 'active' || q.status === 'ACTIVE' || q.status === 'in_progress')
    .map(q => ({
      id: q.id || q.quest_id || q.player_quest_id,
      name: q.name || q.quest_name || q.template?.name || 'Unknown Quest',
      realm: q.realm || guessRealm(q),
      type: (q.quest_type || q.type || 'story').toLowerCase(),
      tier: q.tier || 'Bronze',
      progress: computeProgress(q).done,
      total: computeProgress(q).total,
      xp: q.rewards?.xp || q.xp_reward || 0,
      venue: q.requires_venue ?? true,
      desc: q.description || '',
    }));
}

function normalizeAvailableQuests(apiBoard) {
  if (!apiBoard || !Array.isArray(apiBoard)) return [];
  return apiBoard.map(q => ({
    id: q.id || q.quest_id || q.template_id,
    name: q.name || q.quest_name || 'Unknown Quest',
    realm: q.realm || guessRealm(q),
    type: (q.quest_type || q.type || 'story').toLowerCase(),
    tier: q.tier || q.min_level ? getTier(q.min_level || 1).name : 'Bronze',
    xp: q.rewards?.xp || q.xp_reward || 0,
    venue: q.requires_venue ?? true,
    desc: q.description || '',
    locked: false,
  }));
}

// Helpers
function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = Date.now();
  const diffH = Math.floor((now - d.getTime()) / 3600000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'Yesterday';
  return `${diffD} days ago`;
}

function guessRealm(q) {
  const name = (q.name || q.quest_name || '').toLowerCase();
  if (name.includes('king') || name.includes('keep')) return 'Kingvale';
  if (name.includes('wyld') || name.includes('druid') || name.includes('tree')) return 'The Wylds';
  if (name.includes('loch') || name.includes('harbor') || name.includes('corsair')) return 'Lochmaw';
  if (name.includes('sand') || name.includes('haretti')) return 'Origin Sands';
  if (name.includes('peak') || name.includes('dragon') || name.includes('desolat')) return 'Desolate Peaks';
  return 'Kingvale';
}

function computeProgress(q) {
  if (q.objectives && Array.isArray(q.objectives)) {
    const total = q.objectives.length;
    const done = q.objectives.filter(o => o.completed || o.current >= (o.target || o.required || 1)).length;
    return { done, total };
  }
  if (q.progress !== undefined && q.total !== undefined) return { done: q.progress, total: q.total };
  return { done: 0, total: 1 };
}


// ══════════════════════════════════════════════════════════
// SHARED UI COMPONENTS (unchanged from v1.1)
// ══════════════════════════════════════════════════════════

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


// ══════════════════════════════════════════════════════════
// HERO HUB
// ══════════════════════════════════════════════════════════

function HeroHub({ player, gear, inventory, resources, daily, sealedLoot, activeQuests, onOpenLoot, onClaimDaily, onEquipTitle, onEquipItem, onUnequipSlot, onDismantle }) {
  const [showGear, setShowGear] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
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
          {player.heroName}
        </div>
        {player.title && <div style={{ fontSize: 14, color: DIM, fontStyle: "italic", fontFamily: FONT, marginTop: 4 }}>{player.title}</div>}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
          <Bdg color={player.fateAlignment === 'ORDER' ? '#3b82f6' : player.fateAlignment === 'CHAOS' ? '#ef4444' : '#a78bfa'}>{player.fateAlignment || 'NEUTRAL'}</Bdg>
          <Bdg color={player.tierColor}>{player.tier} Adventurer</Bdg>
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 8, fontFamily: FONT_B }}>{player.pikId}</div>
        
        {/* XP bars */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: MUTED, fontFamily: FONT_B }}>Level {player.level}</span>
            <span style={{ fontSize: 10, color: MUTED, fontFamily: FONT_B }}>{player.xpTotal?.toLocaleString() || player.xp.toLocaleString()} Total XP</span>
          </div>
          <PBar value={player.xp} max={player.xpNext} color={player.tierColor} />
        </div>
        {nextTier && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: player.tierColor, fontFamily: FONT_B, fontWeight: 600 }}>{player.tier}</span>
              <span style={{ fontSize: 10, color: MUTED, fontFamily: FONT_B }}>Next: {nextTier.name}</span>
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

      {/* Titles */}
      {player.titles && player.titles.length > 0 && (
        <>
          <SecTitle right={<span style={{ fontSize: 10, color: "#a78bfa", fontFamily: FONT_B }}>Tap to equip</span>}>Titles Earned</SecTitle>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
            {player.titles.map(t => (
              <button key={t.id} onClick={() => onEquipTitle(t.equipped ? null : t.id)} style={{
                padding: "6px 12px", borderRadius: 8,
                background: t.equipped ? "rgba(99,102,241,0.2)" : SURFACE,
                border: `1px solid ${t.equipped ? "rgba(99,102,241,0.4)" : BORDER}`,
                color: t.equipped ? "#a78bfa" : DIM,
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT_B,
              }}>{t.equipped ? "\u2605 " : "\u2726 "}{t.name}</button>
            ))}
          </div>
        </>
      )}

      {/* Gear */}
      <SecTitle right={<button onClick={() => setShowGear(!showGear)} style={{ background: "none", border: "none", color: "#6366f1", fontSize: 11, cursor: "pointer", fontFamily: FONT_B, fontWeight: 600 }}>{showGear ? "Collapse" : "View Gear"}</button>}>Equipment</SecTitle>
      {showGear ? (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            {gear.map(g => (
              <Crd key={g.slot} style={{ textAlign: "center", padding: 12, opacity: g.item ? 1 : 0.4, position: "relative" }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{g.icon}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: g.item ? (rarCol[g.rarity] || "#fff") : MUTED, fontFamily: FONT_B, lineHeight: 1.3 }}>{g.item || "Empty"}</div>
                <div style={{ fontSize: 9, color: MUTED, textTransform: "uppercase", fontFamily: FONT_B, marginTop: 2 }}>{g.slot}</div>
                {g.rarity && <Bdg color={rarCol[g.rarity]} style={{ fontSize: 8, marginTop: 4 }}>{g.rarity}</Bdg>}
                {g.item && onUnequipSlot && (
                  <button onClick={() => onUnequipSlot(g.slotKey || g.slot.toLowerCase())} style={{
                    marginTop: 6, padding: "3px 8px", borderRadius: 6, fontSize: 9, fontWeight: 600,
                    background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
                    color: "#ef4444", cursor: "pointer", fontFamily: FONT_B, letterSpacing: "0.03em",
                  }}>Unequip</button>
                )}
              </Crd>
            ))}
          </div>
          {/* Inventory */}
          {inventory && inventory.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <button onClick={() => setShowInventory(!showInventory)} style={{
                  background: "none", border: "none", color: "#a78bfa", fontSize: 11, cursor: "pointer",
                  fontFamily: FONT_B, fontWeight: 600, padding: 0, display: "flex", alignItems: "center", gap: 4,
                }}>
                  {showInventory ? "\u25BC" : "\u25B6"} Inventory ({inventory.length} items)
                </button>
              </div>
              {showInventory && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {inventory.map(item => {
                    const rarity = (item.rarity || '').toLowerCase();
                    return (
                      <Crd key={item.inventory_id || item.id} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                      }}>
                        <span style={{ fontSize: 18 }}>{item.icon || SLOT_ICONS[(item.slot || '').toLowerCase()] || "\uD83D\uDEE1"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: rarCol[rarity] || "#fff", fontFamily: FONT_B }}>{item.item_name || item.name}</div>
                          <div style={{ fontSize: 9, color: MUTED, fontFamily: FONT_B }}>
                            {item.slot || "—"} {"\u2022"} <span style={{ color: rarCol[rarity] }}>{rarity || "common"}</span>
                            {item.is_equipped && <span style={{ color: "#22c55e", marginLeft: 6 }}>{"\u2605"} Equipped</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          {!item.is_equipped && onEquipItem && (
                            <button onClick={() => onEquipItem(item.inventory_id || item.id)} style={{
                              padding: "4px 10px", borderRadius: 6, fontSize: 9, fontWeight: 600,
                              background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)",
                              color: "#a78bfa", cursor: "pointer", fontFamily: FONT_B,
                            }}>Equip</button>
                          )}
                          {!item.is_equipped && onDismantle && (
                            <button onClick={() => onDismantle(item.inventory_id || item.id, item.item_name || item.name, item.rarity)} style={{
                              padding: "4px 10px", borderRadius: 6, fontSize: 9, fontWeight: 600,
                              background: "rgba(192,132,252,0.08)", border: "1px solid rgba(192,132,252,0.25)",
                              color: "#c084fc", cursor: "pointer", fontFamily: FONT_B,
                            }}>{"\uD83D\uDD2E"} Dismantle</button>
                          )}
                        </div>
                      </Crd>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
          {gear.filter(g => g.item).map(g => (
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

      {/* Active Quests Preview */}
      {activeQuests.length > 0 && (
        <>
          <SecTitle right={<span style={{ fontSize: 11, color: MUTED, fontFamily: FONT_B }}>{activeQuests.length} active</span>}>Active Quests</SecTitle>
          {activeQuests.slice(0, 2).map(q => (
            <Crd key={q.id} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{typIcn[q.type] || "\uD83D\uDCDC"}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: FONT_B }}>{q.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: rlmCol[q.realm] || DIM, fontFamily: FONT_B }}>{rlmIcn[q.realm] || ""} {q.realm}</span>
                      {q.venue && <Bdg color="#f59e0b" style={{ fontSize: 8 }}>Venue</Bdg>}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600, fontFamily: FONT_B }}>+{q.xp} XP</span>
              </div>
              <PBar value={q.progress} max={q.total} color={rlmCol[q.realm] || "#6366f1"} height={4} />
              <div style={{ fontSize: 10, color: MUTED, marginTop: 4, fontFamily: FONT_B }}>{q.progress}/{q.total} objectives</div>
            </Crd>
          ))}
        </>
      )}

      {/* Resources */}
      <div style={{ marginTop: 12 }}>
        <SecTitle>Resources</SecTitle>
        {/* Nexus currency — prominent display */}
        <div style={{
          padding: "10px 16px", marginBottom: 10, borderRadius: 10,
          background: "linear-gradient(135deg, rgba(192,132,252,0.08), rgba(139,92,246,0.04))",
          border: "1px solid rgba(192,132,252,0.2)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>{"\uD83D\uDD2E"}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#c084fc", fontFamily: FONT_B }}>{resources.nexus || 0}</div>
              <div style={{ fontSize: 9, color: MUTED, fontFamily: FONT_B, textTransform: "uppercase", letterSpacing: "0.06em" }}>Nexus</div>
            </div>
          </div>
          <span style={{ fontSize: 9, color: "rgba(192,132,252,0.5)", fontFamily: FONT_B }}>Dismantle items to earn</span>
        </div>
        {/* Materials */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(resources).filter(([key]) => key !== 'nexus').map(([key, ct]) => (
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


// ══════════════════════════════════════════════════════════
// QUEST BOARD
// ══════════════════════════════════════════════════════════

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
      {quests.length === 0 && (
        <Crd style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{filter === "active" ? "\uD83D\uDCDC" : "\uD83E\uDDED"}</div>
          <p style={{ fontSize: 13, color: MUTED, fontFamily: FONT_B }}>
            {filter === "active" ? "No active quests. Check the Available tab!" : "No quests available right now. Check back later!"}
          </p>
        </Crd>
      )}
      {quests.map(q => {
        const locked = q.locked;
        return (
          <Crd key={q.id} style={{ marginBottom: 10, opacity: locked ? 0.45 : 1 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: `${(rlmCol[q.realm] || "#6366f1")}12`, border: `1px solid ${(rlmCol[q.realm] || "#6366f1")}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                {locked ? "\uD83D\uDD12" : (typIcn[q.type] || "\uD83D\uDCDC")}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: FONT_B }}>{q.name}</span>
                  <span style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600, fontFamily: FONT_B }}>+{q.xp} XP</span>
                </div>
                <p style={{ fontSize: 11, color: DIM, fontFamily: FONT_B, margin: "4px 0 8px", lineHeight: 1.5 }}>{q.desc}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: rlmCol[q.realm] || DIM, fontFamily: FONT_B }}>{rlmIcn[q.realm] || ""} {q.realm}</span>
                  <Bdg color={getTier(1).color}>{q.tier}</Bdg>
                  {q.venue !== undefined && <Bdg color={q.venue ? "#f59e0b" : "#22c55e"}>{q.venue ? "Venue Required" : "In-App"}</Bdg>}
                </div>
                {q.progress !== undefined && (
                  <div style={{ marginTop: 8 }}>
                    <PBar value={q.progress} max={q.total} color={rlmCol[q.realm] || "#6366f1"} height={4} />
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


// ══════════════════════════════════════════════════════════
// LORE CODEX (client-side only — no backend endpoint yet)
// ══════════════════════════════════════════════════════════

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
            <span style={{ fontSize: 18 }}>{rlmIcn[selected.realm] || ""}</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: FONT }}>{selected.title}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                <Bdg color={rlmCol[selected.realm] || DIM}>{selected.realm}</Bdg>
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
            <div style={{ width: 36, height: 36, borderRadius: 8, background: entry.unlocked ? `${(rlmCol[entry.realm] || "#6366f1")}12` : "rgba(255,255,255,0.03)", border: `1px solid ${entry.unlocked ? (rlmCol[entry.realm] || "#6366f1") + "25" : BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
              {entry.unlocked ? (rlmIcn[entry.realm] || "\uD83D\uDCD6") : "\uD83D\uDD12"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: entry.unlocked ? "#fff" : MUTED, fontFamily: FONT_B }}>
                {entry.unlocked ? entry.title : "???"}
                {entry.read && <span style={{ fontSize: 10, color: "#22c55e", marginLeft: 6 }}>{"\u2713"}</span>}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                <Bdg color={rlmCol[entry.realm] || DIM}>{entry.realm}</Bdg>
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


// ══════════════════════════════════════════════════════════
// WORKSHOP (client-side only — no backend endpoint yet)
// ══════════════════════════════════════════════════════════

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
        {Object.entries(resources).filter(([key]) => key !== 'nexus').map(([key, ct]) => (
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
            if (!recipe) return null;
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


// ══════════════════════════════════════════════════════════
// LOADING SCREEN
// ══════════════════════════════════════════════════════════

function LoadingScreen() {
  return (
    <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: BG, fontFamily: FONT_B, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, animation: "pulse 1.5s ease infinite" }}>{"\u25C8"}</div>
      <p style={{ fontSize: 13, color: MUTED }}>Loading your adventure...</p>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(0.95); } }`}</style>
    </div>
  );
}


// ══════════════════════════════════════════════════════════
// MAIN PORTAL — ALL STATE + API INTEGRATION
// ══════════════════════════════════════════════════════════

export default function PIKPortal({ rootId, onLogout, onBackToDashboard }) {
  const [tab, setTab] = useState("hero");
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState("loading"); // "api" | "mock" | "loading"

  // ── Lifted state ──
  const [player, setPlayer] = useState(MOCK_PLAYER);
  const [gear, setGear] = useState(EMPTY_GEAR);
  const [resources, setResources] = useState(INIT_RESOURCES);
  const [activeQuests, setActiveQuests] = useState([]);
  const [availableQuests, setAvailableQuests] = useState([]);
  const [codex, setCodex] = useState(MOCK_CODEX);
  const [sealedLoot, setSealedLoot] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [craftTimers, setCraftTimers] = useState({});
  const [daily, setDaily] = useState({ name: "Study the Codex", desc: "Read 2 lore entries to prepare for the realms.", progress: 0, total: 2, xp: 50, claimed: false });

  const notify = (msg, color) => setToast({ msg, color, key: Date.now() });

  // ── FETCH ALL DATA ON MOUNT ──
  useEffect(() => {
    if (!rootId) {
      setLoading(false);
      setDataSource("mock");
      return;
    }

    let cancelled = false;

    async function fetchAll() {
      try {
        // Parallel fetch all data
        const [profileResp, equipResp, cachesResp, questsResp, boardResp, sessionsResp, inventoryResp] = await Promise.all([
          api.getProfile(rootId),
          api.getEquipment(rootId),
          api.getCaches('sealed', rootId),
          api.getPlayerQuests(rootId),
          api.getQuestBoard(rootId),
          api.getPlayerSessions(rootId),
          api.getInventory(rootId),
        ]);

        if (cancelled) return;

        const isLive = profileResp.ok;
        setDataSource(isLive ? "api" : "mock");

        if (profileResp.ok) {
          const sessions = Array.isArray(sessionsResp.data) ? sessionsResp.data : [];
          const p = normalizeProfile(profileResp.data, sessions.length);

          // Compute quest completions from player quests
          if (questsResp.ok && Array.isArray(questsResp.data)) {
            p.questsComplete = questsResp.data.filter(q => 
              q.status === 'completed' || q.status === 'COMPLETED'
            ).length;
          }

          setPlayer(p);
        }

        if (equipResp.ok) {
          // DEBUG: log raw equipment response to verify data shape
          console.log('[PIKPortal v2] equipResp.data =', JSON.stringify(equipResp.data));
          const normalizedGear = normalizeEquipment(equipResp.data);
          console.log('[PIKPortal v2] normalizedGear =', JSON.stringify(normalizedGear));
          setGear(normalizedGear);
          // Compute gear score from equipped items
          const equippedCount = normalizedGear.filter(g => g.item).length;
          const rarityScore = { common: 10, uncommon: 25, rare: 50, epic: 100, legendary: 200 };
          const gScore = normalizedGear.reduce((sum, g) => sum + (g.item ? (rarityScore[g.rarity] || 10) : 0), 0);
          setPlayer(prev => ({ ...prev, gearScore: gScore }));
        }

        if (inventoryResp?.ok) {
          console.log('[PIKPortal v2] inventoryResp.data =', JSON.stringify(inventoryResp.data));
          const inv = Array.isArray(inventoryResp.data) ? inventoryResp.data : [];
          setInventory(inv);
        }

        if (cachesResp.ok) {
          setSealedLoot(normalizeCaches(
            Array.isArray(cachesResp.data) ? cachesResp.data : []
          ));
        }

        if (questsResp.ok) {
          setActiveQuests(normalizeActiveQuests(
            Array.isArray(questsResp.data) ? questsResp.data : []
          ));
        }

        if (boardResp.ok) {
          setAvailableQuests(normalizeAvailableQuests(
            Array.isArray(boardResp.data) ? boardResp.data : []
          ));
        }

      } catch (err) {
        console.error('Data fetch error:', err);
        if (!cancelled) setDataSource("mock");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [rootId]);


  // ── ACTIONS (API-connected where possible) ──

  const handleAcceptQuest = async (questId) => {
    if (dataSource === "api") {
      const resp = await api.acceptQuest(questId, rootId);
      if (resp.ok) {
        // Re-fetch quests to get updated state
        const [qResp, bResp] = await Promise.all([
          api.getPlayerQuests(rootId),
          api.getQuestBoard(rootId),
        ]);
        if (qResp.ok) setActiveQuests(normalizeActiveQuests(Array.isArray(qResp.data) ? qResp.data : []));
        if (bResp.ok) setAvailableQuests(normalizeAvailableQuests(Array.isArray(bResp.data) ? bResp.data : []));
        notify("Quest accepted!", "#22c55e");
      } else {
        notify(`Failed: ${resp.error}`, "#ef4444");
      }
    } else {
      // Mock fallback
      const quest = availableQuests.find(q => q.id === questId);
      if (!quest || quest.locked) return;
      setAvailableQuests(prev => prev.filter(q => q.id !== questId));
      setActiveQuests(prev => [...prev, { ...quest, progress: 0, total: 3 }]);
      notify(`Quest accepted: ${quest.name}`, rlmCol[quest.realm] || "#22c55e");
    }
  };

  const handleOpenLoot = async (lootId) => {
    if (dataSource === "api") {
      const resp = await api.openCache(lootId, rootId);
      console.log('[PIKPortal v2] openCache resp.data =', JSON.stringify(resp.data));
      if (resp.ok) {
        // Re-fetch caches, profile, equipment, and inventory
        const [cResp, pResp, eResp, iResp] = await Promise.all([
          api.getCaches('sealed', rootId),
          api.getProfile(rootId),
          api.getEquipment(rootId),
          api.getInventory(rootId),
        ]);
        if (cResp.ok) setSealedLoot(normalizeCaches(Array.isArray(cResp.data) ? cResp.data : []));
        if (pResp.ok) {
          const sessions = player.sessions;
          const p = normalizeProfile(pResp.data, sessions);
          setPlayer(prev => ({ ...prev, ...p }));
        }
        if (eResp.ok) {
          const normalizedGear = normalizeEquipment(eResp.data);
          setGear(normalizedGear);
          const rarityScore = { common: 10, uncommon: 25, rare: 50, epic: 100, legendary: 200 };
          const gScore = normalizedGear.reduce((sum, g) => sum + (g.item ? (rarityScore[g.rarity] || 10) : 0), 0);
          setPlayer(prev => ({ ...prev, gearScore: gScore }));
        }
        if (iResp.ok) setInventory(Array.isArray(iResp.data) ? iResp.data : []);
        const reward = resp.data;
        // Backend may return reward info at various nesting levels
        const rewardName = reward?.reward_name 
          || reward?.reward?.item_name || reward?.reward?.name || reward?.reward?.display_name
          || reward?.item_name || reward?.name || reward?.display_name
          || 'a mysterious item';
        const rewardRarity = reward?.reward_rarity || reward?.reward?.rarity || reward?.rarity || '';
        notify(`Opened: ${rewardName}${rewardRarity ? ` (${rewardRarity})` : ''}!`, "#f59e0b");
      } else {
        notify(`Failed to open: ${resp.error}`, "#ef4444");
      }
    } else {
      // Mock fallback
      setSealedLoot(prev => prev.filter(l => l.id !== lootId));
      setPlayer(prev => ({ ...prev, gearScore: prev.gearScore + 8 }));
      notify("Cache opened! Received a new item.", "#f59e0b");
    }
  };

  const handleEquipTitle = async (titleId) => {
    if (dataSource === "api") {
      const resp = await api.equipTitle(titleId, rootId);
      if (resp.ok) {
        // Re-fetch profile
        const pResp = await api.getProfile(rootId);
        if (pResp.ok) {
          const p = normalizeProfile(pResp.data, player.sessions);
          setPlayer(prev => ({ ...prev, ...p }));
        }
        notify(titleId ? "Title equipped!" : "Title unequipped", "#a78bfa");
      }
    } else {
      setPlayer(prev => ({
        ...prev,
        equippedTitle: titleId,
        titles: prev.titles.map(t => ({ ...t, equipped: t.id === titleId })),
      }));
      notify(titleId ? "Title equipped!" : "Title unequipped", "#a78bfa");
    }
  };

  const handleEquipItem = async (inventoryId) => {
    if (dataSource === "api") {
      const resp = await api.equipItem(inventoryId, rootId);
      if (resp.ok) {
        // Re-fetch equipment and inventory
        const [eResp, iResp] = await Promise.all([
          api.getEquipment(rootId),
          api.getInventory(rootId),
        ]);
        if (eResp.ok) {
          const normalizedGear = normalizeEquipment(eResp.data);
          setGear(normalizedGear);
          const rarityScore = { common: 10, uncommon: 25, rare: 50, epic: 100, legendary: 200 };
          const gScore = normalizedGear.reduce((sum, g) => sum + (g.item ? (rarityScore[g.rarity] || 10) : 0), 0);
          setPlayer(prev => ({ ...prev, gearScore: gScore }));
        }
        if (iResp.ok) setInventory(Array.isArray(iResp.data) ? iResp.data : []);
        notify("Item equipped!", "#22c55e");
      } else {
        notify(`Equip failed: ${resp.error}`, "#ef4444");
      }
    }
  };

  const handleUnequipSlot = async (slot) => {
    if (dataSource === "api") {
      const resp = await api.unequipSlot(slot, rootId);
      if (resp.ok) {
        const [eResp, iResp] = await Promise.all([
          api.getEquipment(rootId),
          api.getInventory(rootId),
        ]);
        if (eResp.ok) {
          const normalizedGear = normalizeEquipment(eResp.data);
          setGear(normalizedGear);
          const rarityScore = { common: 10, uncommon: 25, rare: 50, epic: 100, legendary: 200 };
          const gScore = normalizedGear.reduce((sum, g) => sum + (g.item ? (rarityScore[g.rarity] || 10) : 0), 0);
          setPlayer(prev => ({ ...prev, gearScore: gScore }));
        }
        if (iResp.ok) setInventory(Array.isArray(iResp.data) ? iResp.data : []);
        notify("Item unequipped", "#f59e0b");
      } else {
        notify(`Unequip failed: ${resp.error}`, "#ef4444");
      }
    }
  };

  const handleDismantle = async (inventoryId, itemName, rarity) => {
    if (dataSource === "api") {
      const resp = await api.dismantleItem(inventoryId, rootId);
      if (resp.ok) {
        // Backend returns nexus gained; fall back to client-side yield table
        const nexusGained = resp.data?.nexus_gained || resp.data?.nexus || NEXUS_YIELD[(rarity || '').toLowerCase()] || 5;
        // Re-fetch inventory and resources
        const iResp = await api.getInventory(rootId);
        if (iResp.ok) setInventory(Array.isArray(iResp.data) ? iResp.data : []);
        // Update local nexus count (will also be refreshed from profile on next load)
        setResources(prev => ({ ...prev, nexus: (prev.nexus || 0) + nexusGained }));
        notify(`Dismantled ${itemName || 'item'} → +${nexusGained} Nexus`, "#c084fc");
      } else {
        notify(`Dismantle failed: ${resp.error}`, "#ef4444");
      }
    } else {
      // Mock fallback
      const nexusGained = NEXUS_YIELD[(rarity || '').toLowerCase()] || 5;
      setInventory(prev => prev.filter(i => (i.inventory_id || i.id) !== inventoryId));
      setResources(prev => ({ ...prev, nexus: (prev.nexus || 0) + nexusGained }));
      notify(`Dismantled ${itemName || 'item'} → +${nexusGained} Nexus`, "#c084fc");
    }
  };

  const handleReadEntry = (entryId) => {
    setCodex(prev => prev.map(e => e.id === entryId ? { ...e, read: true } : e));
    setDaily(prev => {
      if (prev.claimed) return prev;
      const newProgress = Math.min(prev.progress + 1, prev.total);
      if (newProgress > prev.progress && newProgress >= prev.total) {
        notify("Daily complete! Claim your XP on the Hero tab.", "#22c55e");
      }
      return { ...prev, progress: newProgress };
    });
  };

  const handleClaimDaily = () => {
    setDaily(prev => ({ ...prev, claimed: true }));
    setPlayer(prev => ({ ...prev, xp: prev.xp + daily.xp, xpTier: prev.xpTier + daily.xp }));
    notify(`+${daily.xp} XP claimed!`, "#22c55e");
  };

  const handleStartCraft = (recipe) => {
    const newRes = { ...resources };
    for (const [k, v] of Object.entries(recipe.cost)) {
      newRes[k] = (newRes[k] || 0) - v;
      if (newRes[k] < 0) return;
    }
    setResources(newRes);
    setCraftTimers(prev => ({ ...prev, [recipe.id]: { started: Date.now(), duration: recipe.time } }));
    notify(`Crafting ${recipe.name}...`, "#f59e0b");
  };

  const handleCollectCraft = (recipeId) => {
    const recipe = CRAFT_RECIPES.find(r => r.id === recipeId);
    setCraftTimers(prev => { const n = { ...prev }; delete n[recipeId]; return n; });
    notify(`${recipe?.name || 'Item'} collected!`, "#22c55e");
  };


  // ── RENDER ──

  if (loading) return <LoadingScreen />;

  return (
    <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: BG, fontFamily: FONT_B, color: "#fff", position: "relative" }}>
      <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {toast && <Toast key={toast.key} message={toast.msg} color={toast.color} onDone={() => setToast(null)} />}

      {/* Top bar */}
      <div style={{ padding: "16px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: `linear-gradient(180deg, ${BG} 60%, transparent)`, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {onBackToDashboard && (
            <button onClick={onBackToDashboard} style={{ background: "none", border: "none", color: MUTED, fontSize: 16, cursor: "pointer", padding: "0 4px", lineHeight: 1 }} title="Back to Dashboard">{"\u2190"}</button>
          )}
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{"\u25C8"}</div>
          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: FONT_B, color: DIM }}>Heroes' Veritas</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {dataSource === "api" && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} title="Live data" />}
          <div style={{ padding: "4px 10px", borderRadius: 6, background: SURFACE, border: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: player.tierColor, fontFamily: FONT_B }}>{player.tier} {"\u2022"} Lv {player.level}</span>
          </div>
          {onLogout && (
            <button onClick={onLogout} style={{ background: "none", border: "none", color: MUTED, fontSize: 11, cursor: "pointer", fontFamily: FONT_B, padding: "4px 8px" }}>Sign Out</button>
          )}
        </div>
      </div>

      <div style={{ paddingTop: 8 }}>
        {tab === "hero" && <HeroHub player={player} gear={gear} inventory={inventory} resources={resources} daily={daily} sealedLoot={sealedLoot} activeQuests={activeQuests} onOpenLoot={handleOpenLoot} onClaimDaily={handleClaimDaily} onEquipTitle={handleEquipTitle} onEquipItem={handleEquipItem} onUnequipSlot={handleUnequipSlot} onDismantle={handleDismantle} />}
        {tab === "quests" && <QuestBoard activeQuests={activeQuests} availableQuests={availableQuests} onAcceptQuest={handleAcceptQuest} />}
        {tab === "codex" && <LoreCodex codex={codex} daily={daily} onReadEntry={handleReadEntry} />}
        {tab === "workshop" && <Workshop resources={resources} timers={craftTimers} onStartCraft={handleStartCraft} onCollectCraft={handleCollectCraft} />}
      </div>

      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
