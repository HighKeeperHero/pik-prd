// ============================================================
// PIK — Database Seed Script
// Replaces db/seed.py from the Python MVP
//
// Creates all reference data: config, titles, sources, and
// demo users with source links. Safe to re-run (uses upsert).
//
// Run with: npx prisma db seed
// Or directly: npx ts-node prisma/seed.ts
//
// Place at: prisma/seed.ts
// ============================================================

import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

async function main() {
  console.log('');
  console.log('PIK Seed → PostgreSQL');
  console.log('');

  // ── 1. Config values (same 11 keys as Python MVP) ────────

  const configs = [
    { key: 'fate.xp_per_session_normal', value: '100', description: 'Base Fate XP for a normal session completion' },
    { key: 'fate.xp_per_session_hard', value: '150', description: 'Base Fate XP for a hard session completion' },
    { key: 'fate.xp_level_multiplier', value: '1.2', description: 'XP threshold multiplier per level' },
    { key: 'fate.xp_base_threshold', value: '200', description: 'XP required to reach Fate Level 2' },
    { key: 'fate.xp_node_completion', value: '15', description: 'Fate XP per completed node' },
    { key: 'fate.xp_boss_tier_pct', value: '0.5', description: 'Boss damage pct bonus multiplier on session XP' },
    { key: 'fate.event_xp_multiplier', value: '1.0', description: 'Live-event XP multiplier (operator-tunable)' },
    { key: 'pik.api_port', value: '8080', description: 'PIK REST API port' },
    { key: 'pik.dashboard_port', value: '8090', description: 'PIK Dashboard port (informational)' },
    { key: 'pik.default_link_scope', value: 'xp fate_markers titles', description: 'Default consent scope for new source links' },
    { key: 'pik.session_token_ttl_secs', value: '3600', description: 'Auth session token TTL in seconds' },
    // Phase 2 Arc B slice 4 — procedural Veil generation (live-tunable).
    { key: 'veil.procedural_enabled', value: 'true', description: 'Use procedural population-weighted tear generation (false = legacy stored-row path)' },
    { key: 'veil.density_factor', value: '1.0', description: 'Global multiplier on pop_cell weight → tears per cell' },
    { key: 'veil.floor_tears', value: '3', description: 'Minimum tears for any cell that has a pop_cell row (blanket coverage)' },
    { key: 'veil.cell_deg', value: '0.05', description: 'Procedural grid cell size in degrees (~5.5 km). Must match the seeded pop_cell grid' },
    { key: 'veil.cooldown_hours', value: '6', description: 'Hours a sealed procedural tear stays gone before its slot regenerates' },
    { key: 'veil.rotation_hours', value: '24', description: 'Position-rotation window for procedural tears (id/tier stay fixed)' },
    // Proximity gate (2026-08-01). Seeded because the config API
    // refuses to CREATE keys — an unseeded tunable is a dial welded
    // shut. Ships measuring, not refusing: gate_enforced stays false
    // until we have real distance distributions from testers.
    { key: 'veil.gate_radius_m', value: '80', description: 'How close (metres) a player must be to act on a tear' },
    { key: 'veil.gate_enforced', value: 'false', description: 'Refuse out-of-range encounters. False = record the distance and allow' },
    { key: 'veil.sight_radius_m', value: '1200', description: 'How far the Veil parts — tears and fauna beyond this are hidden by fog' },
  ];

  for (const c of configs) {
    await prisma.config.upsert({
      where: { key: c.key },
      update: {},
      create: c,
    });
  }
  console.log(`[1/5] Config → ${configs.length} rows`);

  // ── 2. Reference titles (same 10 titles as Python MVP) ────

  const titles = [
    { id: 'title_fate_awakened', displayName: 'FATE AWAKENED', category: 'fate', description: 'Reached Fate Level 2' },
    { id: 'title_fate_burning', displayName: 'FATE BURNING', category: 'fate', description: 'Reached Fate Level 5' },
    { id: 'title_fate_ascendant', displayName: 'FATE ASCENDANT', category: 'fate', description: 'Reached Fate Level 10' },
    { id: 'title_veilbreaker_50', displayName: 'VEIL TOUCHED', category: 'boss', description: '50%+ boss damage in a single session' },
    { id: 'title_veilbreaker_75', displayName: 'VEIL SLAYER', category: 'boss', description: '75%+ boss damage in a single session' },
    { id: 'title_veilbreaker_100', displayName: 'VEIL SHATTERER', category: 'boss', description: '100% boss damage in a single session' },
    { id: 'title_first_session', displayName: 'INITIATED', category: 'session', description: 'Completed first session' },
    { id: 'title_five_sessions', displayName: 'PROVEN', category: 'session', description: 'Completed 5 sessions' },
    { id: 'title_node_master', displayName: 'NODE MASTER', category: 'session', description: 'Completed all nodes in a session' },
    { id: 'title_multi_source', displayName: 'REALM WALKER', category: 'meta', description: 'Progressed from 2+ sources' },
    // Veil encounter titles — granted by veil.service on seals. Without
    // these rows the _maybeGrantTitle calls silently no-op'd.
    { id: 'first_veil_seal', displayName: 'FIRST SEAL', category: 'veil', description: 'Sealed your first Veil tear' },
    { id: 'dormant_rift_sealed', displayName: 'DORMANT RIFT SEALED', category: 'veil', description: 'Sealed a dormant (T3) tear' },
    { id: 'convergence_survived', displayName: 'CONVERGENCE SURVIVED', category: 'veil', description: 'Survived a double (T4) convergence tear' },
    // Chapter campaign titles (Quest_Chpt1-5, 2026-07-10).
    { id: 'title_awakened', displayName: 'AWAKENED', category: 'story', description: 'Completed the Remembering — Chapter I' },
    { id: 'title_tearwarden', displayName: 'TEARWARDEN', category: 'story', description: 'Weathered the Gathering Storm — Chapter II' },
  ];

  for (const t of titles) {
    await prisma.title.upsert({
      where: { id: t.id },
      update: {},
      create: t,
    });
  }
  console.log(`[2/5] Titles → ${titles.length} rows`);

  // ── 3. Sources + demo API keys ────────────────────────────

  const hvKey = 'hv-demo-api-key-2025';
  const mockKey = 'mock-venue-api-key-2025';

  await prisma.source.upsert({
    where: { id: 'src-heroes-veritas-01' },
    update: {},
    create: {
      id: 'src-heroes-veritas-01',
      name: "Heroes' Veritas — Venue 01",
      apiKeyHash: hashKey(hvKey),
    },
  });

  await prisma.source.upsert({
    where: { id: 'src-mock-venue-01' },
    update: {},
    create: {
      id: 'src-mock-venue-01',
      name: 'Mock Partner Venue',
      apiKeyHash: hashKey(mockKey),
    },
  });

  console.log('[3/5] Sources → 2 rows');
  console.log('┌─ API Keys (save these — not stored in plain text) ────────');
  console.log(`│ Heroes' Veritas key : ${hvKey}`);
  console.log(`│ Mock Venue key      : ${mockKey}`);
  console.log('└─────────────────────────────────────────────────');


  console.log('');
  console.log('  Seeding loot tables...');

  // 2026-07-10 — level-ups must not generate XP (Tim): a level-up
  // cache paying xp_boost rewarded the reward, not the effort, and
  // fed the next level directly. Level-up XP rewards became Veil
  // Essence. Purge the retired xp_boost rows (their ids key off
  // rewardValue, so upserts alone would strand them in prod).
  await prisma.lootTable.deleteMany({
    where: { cacheType: 'level_up', rewardType: 'xp_boost' },
  });

  const lootEntries = [
    // ── Level Up Cache Pool ─────────────────────────────
    // XP-free by design (see deleteMany above): essence, markers,
    // titles, and the gear rows further down.
    { cacheType: 'level_up', rewardType: 'essence',   rewardValue: '15',   displayName: 'Minor Fate Spark',        weight: 200, rarityTier: 'common',    minLevel: 1 },
    { cacheType: 'level_up', rewardType: 'essence',   rewardValue: '35',   displayName: 'Fate Ember',              weight: 100, rarityTier: 'uncommon',  minLevel: 1 },
    { cacheType: 'level_up', rewardType: 'marker',    rewardValue: 'Felt the threads of fate shift and realign',   displayName: 'Fate Thread Marker',      weight: 80,  rarityTier: 'uncommon',  minLevel: 2 },
    { cacheType: 'level_up', rewardType: 'marker',    rewardValue: 'Glimpsed the weave between worlds',            displayName: 'Veil Sight Marker',       weight: 40,  rarityTier: 'rare',     minLevel: 3 },
    { cacheType: 'level_up', rewardType: 'essence',   rewardValue: '90',   displayName: 'Blazing Fate Core',       weight: 20,  rarityTier: 'epic',      minLevel: 5 },
    { cacheType: 'level_up', rewardType: 'title',     rewardValue: 'title_fortune_favored', displayName: 'Fortune Favored',  weight: 5,   rarityTier: 'legendary', minLevel: 5 },
    // Higher bands so a L10+ keeper stops rolling starter values.
    { cacheType: 'level_up', rewardType: 'essence',   rewardValue: '70',   displayName: 'Kindled Fate Spark',      weight: 40,  rarityTier: 'rare',      minLevel: 10 },
    { cacheType: 'level_up', rewardType: 'essence',   rewardValue: '150',  displayName: 'Fate Core, Awakened',     weight: 15,  rarityTier: 'epic',      minLevel: 20 },
    { cacheType: 'level_up', rewardType: 'essence',   rewardValue: '300',  displayName: 'Crown of the Threshold',  weight: 4,   rarityTier: 'legendary', minLevel: 40 },

    // ── Boss Kill Cache Pool ────────────────────────────
    // XP stays here: a boss kill is effort, not a reward loop.
    { cacheType: 'boss_kill', rewardType: 'xp_boost',  rewardValue: '100',  displayName: 'Veil Shard',              weight: 180, rarityTier: 'common',    minLevel: 1 },
    { cacheType: 'boss_kill', rewardType: 'marker',    rewardValue: 'Claimed a trophy from a fallen guardian',      displayName: 'Guardian Trophy Marker',  weight: 80,  rarityTier: 'uncommon',  minLevel: 1 },
    { cacheType: 'boss_kill', rewardType: 'xp_boost',  rewardValue: '250',  displayName: 'Veil Fragment',           weight: 60,  rarityTier: 'rare',      minLevel: 2 },
    { cacheType: 'boss_kill', rewardType: 'marker',    rewardValue: 'Tore a rift in the boundary between realms',   displayName: 'Rift Marker',            weight: 25,  rarityTier: 'epic',      minLevel: 3 },
    { cacheType: 'boss_kill', rewardType: 'title',     rewardValue: 'title_veil_touched',    displayName: 'Veil Touched',     weight: 10,  rarityTier: 'epic',      minLevel: 3 },
    { cacheType: 'boss_kill', rewardType: 'title',     rewardValue: 'title_fate_weaver',     displayName: 'Fate Weaver',      weight: 3,   rarityTier: 'legendary', minLevel: 7 },
    { cacheType: 'boss_kill', rewardType: 'essence',   rewardValue: '150',  displayName: 'Guardian Heartstone',     weight: 15,  rarityTier: 'epic',      minLevel: 10 },
    { cacheType: 'boss_kill', rewardType: 'essence',   rewardValue: '300',  displayName: 'Crownfall Relic',         weight: 3,   rarityTier: 'legendary', minLevel: 20 },

    // ── Milestone Cache Pool ────────────────────────────
    { cacheType: 'milestone', rewardType: 'essence',   rewardValue: '20',   displayName: 'Waymark Ember',           weight: 80,  rarityTier: 'common',    minLevel: 1 },
    { cacheType: 'milestone', rewardType: 'xp_boost',  rewardValue: '200',  displayName: 'Mythic Ember',            weight: 120, rarityTier: 'uncommon',  minLevel: 1 },
    { cacheType: 'milestone', rewardType: 'marker',    rewardValue: 'Crossed a threshold that echoes through time', displayName: 'Threshold Marker',        weight: 60,  rarityTier: 'rare',     minLevel: 1 },
    { cacheType: 'milestone', rewardType: 'title',     rewardValue: 'title_mythic_aspirant', displayName: 'Mythic Aspirant',  weight: 15,  rarityTier: 'epic',     minLevel: 3 },
    { cacheType: 'milestone', rewardType: 'title',     rewardValue: 'title_legend_forged',   displayName: 'Legend Forged',    weight: 3,   rarityTier: 'legendary', minLevel: 8 },

    // ── Quest Cache Pool (2026-07-10) ────────────────────
    // The cadence quest system grants cacheType 'quest'
    // (quest-log.service recordEvent → rewards.cache_rarity) but
    // no pool was ever seeded — every quest cache open threw
    // "No loot configured for cache type: quest". Full rarity
    // ladder + level bands so any granted rarity opens on-tier.
    { cacheType: 'quest', rewardType: 'essence',  rewardValue: '15',  displayName: 'Sealed Whisper',            weight: 160, rarityTier: 'common',    minLevel: 1 },
    { cacheType: 'quest', rewardType: 'marker',   rewardValue: "Answered the ledger's call",                    displayName: 'Ledger Marker',    weight: 60,  rarityTier: 'common',    minLevel: 1 },
    { cacheType: 'quest', rewardType: 'essence',  rewardValue: '35',  displayName: 'Oathbound Ember',           weight: 100, rarityTier: 'uncommon',  minLevel: 2 },
    { cacheType: 'quest', rewardType: 'essence',  rewardValue: '70',  displayName: 'Charge Fulfilled',          weight: 50,  rarityTier: 'rare',      minLevel: 4 },
    { cacheType: 'quest', rewardType: 'marker',   rewardValue: 'Kept a charge the Veil itself set',             displayName: 'Charge Marker',    weight: 30,  rarityTier: 'rare',      minLevel: 4 },
    { cacheType: 'quest', rewardType: 'essence',  rewardValue: '140', displayName: 'Veilbound Trove',           weight: 20,  rarityTier: 'epic',      minLevel: 7 },
    { cacheType: 'quest', rewardType: 'title',    rewardValue: 'title_mythic_aspirant', displayName: 'Mythic Aspirant',      weight: 8,   rarityTier: 'epic',      minLevel: 7 },
    { cacheType: 'quest', rewardType: 'essence',  rewardValue: '280', displayName: 'The Ledger Repaid',         weight: 5,   rarityTier: 'legendary', minLevel: 10 },
    { cacheType: 'quest', rewardType: 'title',    rewardValue: 'title_fate_weaver',     displayName: 'Fate Weaver',          weight: 2,   rarityTier: 'legendary', minLevel: 10 },
  ];

  for (const entry of lootEntries) {
    const id = `loot-${entry.cacheType}-${entry.rewardValue.replace(/\s+/g, '-').substring(0, 30)}`;
    await prisma.lootTable.upsert({
      where: { id },
      // Sync on re-seed — with the old `update: {}` a weight or
      // value retune never reached an environment that had the row.
      update: { ...entry },
      create: { id, ...entry },
    });
  }
  console.log(`  ✓ ${lootEntries.length} loot table entries`);

  // ── Extra titles for loot rewards ─────────────────────
  const lootTitles = [
    { id: 'title_fortune_favored', displayName: 'Fortune Favored',   category: 'fate' },
    { id: 'title_veil_touched',    displayName: 'Veil Touched',      category: 'boss' },
    { id: 'title_fate_weaver',     displayName: 'Fate Weaver',       category: 'fate' },
    { id: 'title_mythic_aspirant', displayName: 'Mythic Aspirant',   category: 'meta' },
    { id: 'title_legend_forged',   displayName: 'Legend Forged',     category: 'meta' },
  ];
  for (const t of lootTitles) {
    await prisma.title.upsert({
      where: { id: t.id },
      update: {},
      create: t,
    });
  }
  console.log(`  ✓ ${lootTitles.length} loot titles`);

  // ── 7. Gear Items Catalog ─────────────────────────────────

  console.log('');
  console.log('  Seeding gear items...');

  const gearItems = [
    // ── WEAPONS (damage, crit, boss) ────────────────────────
    { id: 'weapon_rusted_blade',       name: 'Rusted Blade',              slot: 'weapon', rarityTier: 'common',    icon: '🗡', minLevel: 1, description: 'A battered but serviceable weapon.',   loreText: 'Pulled from the mud of a forgotten battlefield.', modifiers: { crit_pct: 1, boss_damage_pct: 1 } },
    { id: 'weapon_ashbrand',           name: 'Ashbrand',                  slot: 'weapon', rarityTier: 'uncommon',  icon: '🗡', minLevel: 2, description: 'Blade forged in volcanic ash.',        loreText: 'The embers of Mount Verath still glow within the steel.', modifiers: { boss_damage_pct: 4, crit_pct: 2 } },
    { id: 'weapon_stormcallers_edge',  name: "Stormcaller's Edge",        slot: 'weapon', rarityTier: 'rare',      icon: '⚔', minLevel: 4, description: 'Crackles with bound lightning.',       loreText: 'Forged by the Sky Citadel smiths during the Eternal Storm.', modifiers: { crit_pct: 6, boss_damage_pct: 4, xp_bonus_pct: 2 } },
    { id: 'weapon_veilcleaver',        name: 'Veilcleaver',               slot: 'weapon', rarityTier: 'epic',      icon: '⚔', minLevel: 7, description: 'Cuts through the fabric between worlds.', loreText: 'The blade that severed the First Binding.', modifiers: { boss_damage_pct: 10, crit_pct: 7, fate_affinity: 3 } },
    { id: 'weapon_fateforged_blade',   name: 'Fate-Forged Blade',         slot: 'weapon', rarityTier: 'legendary', icon: '🔱', minLevel: 10, description: 'Resonates with the threads of destiny.', loreText: 'Only those who have touched the Weave may wield it.', modifiers: { boss_damage_pct: 15, crit_pct: 10, xp_bonus_pct: 5, fate_affinity: 5 } },
    { id: 'weapon_bonereaper',         name: 'Bonereaper',                slot: 'weapon', rarityTier: 'rare',      icon: '⚔', minLevel: 5, description: 'Harvests strength from the fallen.',   loreText: 'Risen from the Bone Gardens of Old Verath.', modifiers: { boss_damage_pct: 6, defense: 3 } },
    { id: 'weapon_ember_dirk',         name: 'Ember Dirk',                slot: 'weapon', rarityTier: 'uncommon',  icon: '🗡', minLevel: 3, description: 'A short blade that burns on contact.',  loreText: 'Tempered in the Forge of the Last Flame.', modifiers: { crit_pct: 4, cooldown_pct: 2 } },

    // ── HELMS (XP, wisdom, fate) ────────────────────────────
    { id: 'helm_leather_cap',          name: 'Leather Cap',               slot: 'helm',   rarityTier: 'common',    icon: '🪖', minLevel: 1, description: 'Basic head protection.',               loreText: 'Standard issue for recruits of every order.', modifiers: { defense: 2 } },
    { id: 'helm_seekers_circlet',      name: "Seeker's Circlet",          slot: 'helm',   rarityTier: 'uncommon',  icon: '👑', minLevel: 2, description: 'Sharpens the mind and senses.',        loreText: 'Worn by the scouts who first mapped the Deep Road.', modifiers: { xp_bonus_pct: 4, fate_affinity: 2 } },
    { id: 'helm_crown_bleeding_moon',  name: 'Crown of the Bleeding Moon',slot: 'helm',   rarityTier: 'rare',      icon: '👑', minLevel: 4, description: 'Pulses with a dark crimson light.',    loreText: "Forged under the Bleeding Moon of Khar'Duum.", modifiers: { xp_bonus_pct: 6, crit_pct: 3, fate_affinity: 3 } },
    { id: 'helm_duskwalkers_cowl',     name: "Duskwalker's Cowl",         slot: 'helm',   rarityTier: 'epic',      icon: '🎭', minLevel: 7, description: 'Sees into the spaces between.',       loreText: 'Woven from the shadows at the edge of the Veil.', modifiers: { xp_bonus_pct: 10, fate_affinity: 6, luck_pct: 4 } },
    { id: 'helm_visage_of_aethon',     name: 'Visage of Aethon',          slot: 'helm',   rarityTier: 'legendary', icon: '👑', minLevel: 10, description: 'The mask of the Dreaming God.',        loreText: 'Awakened from the Dreaming Vault of Aethon itself.', modifiers: { xp_bonus_pct: 15, fate_affinity: 8, luck_pct: 5, crit_pct: 5 } },
    { id: 'helm_iron_visor',           name: 'Iron Visor',                slot: 'helm',   rarityTier: 'common',    icon: '🪖', minLevel: 1, description: 'Protects the face at the cost of vision.', loreText: 'A simple but effective design.', modifiers: { defense: 3, xp_bonus_pct: 1 } },
    { id: 'helm_wardens_gaze',         name: "Warden's Gaze",             slot: 'helm',   rarityTier: 'rare',      icon: '🎭', minLevel: 5, description: 'Nothing escapes notice.',              loreText: 'Anointed by the Pale Warden of the Threshold.', modifiers: { xp_bonus_pct: 5, boss_damage_pct: 3, fate_affinity: 2 } },

    // ── CHEST (defense, XP, resilience) ─────────────────────
    { id: 'chest_hide_vest',           name: 'Hide Vest',                 slot: 'chest',  rarityTier: 'common',    icon: '🛡', minLevel: 1, description: 'Tough animal hide.',                   loreText: 'The first armor of every wanderer.', modifiers: { defense: 3 } },
    { id: 'chest_chainweave',          name: 'Chainweave Hauberk',        slot: 'chest',  rarityTier: 'uncommon',  icon: '🛡', minLevel: 2, description: 'Interlocking rings of tempered steel.', loreText: 'Smithed in the forges beneath the Obsidian Spire.', modifiers: { defense: 6, xp_bonus_pct: 2 } },
    { id: 'chest_crucible_plate',      name: 'Crucible Plate',            slot: 'chest',  rarityTier: 'rare',      icon: '🛡', minLevel: 4, description: 'Forged in the heart of a dying star.',  loreText: 'Shaped in the Crucible of Shattered Stars.', modifiers: { defense: 10, boss_damage_pct: 3, xp_bonus_pct: 3 } },
    { id: 'chest_veilshroud',          name: 'Veilshroud Mantle',         slot: 'chest',  rarityTier: 'epic',      icon: '🛡', minLevel: 7, description: 'Woven from threads of reality.',       loreText: 'Neither blade nor spell can find purchase upon it.', modifiers: { defense: 14, luck_pct: 5, cooldown_pct: 4 } },
    { id: 'chest_aegis_eternal',       name: 'Aegis of the Eternal',      slot: 'chest',  rarityTier: 'legendary', icon: '🛡', minLevel: 10, description: 'The armor of legends.',                loreText: 'Worn by the first champion who defied the Veil.', modifiers: { defense: 20, xp_bonus_pct: 8, boss_damage_pct: 5, fate_affinity: 5 } },
    { id: 'chest_ashcloak',            name: 'Ashcloak',                  slot: 'chest',  rarityTier: 'uncommon',  icon: '🛡', minLevel: 3, description: 'Smolders but never burns.',            loreText: 'Woven from the ashes of the Last Flame.', modifiers: { defense: 5, cooldown_pct: 3 } },
    { id: 'chest_stormguard',          name: 'Stormguard Cuirass',        slot: 'chest',  rarityTier: 'rare',      icon: '🛡', minLevel: 5, description: 'Lightning dances across its surface.',  loreText: 'Descended from the Sky Citadels of the Eternal Storm.', modifiers: { defense: 8, crit_pct: 4 } },

    // ── ARMS (boss damage, crit, attack) ────────────────────
    { id: 'arms_leather_wraps',        name: 'Leather Wraps',             slot: 'arms',   rarityTier: 'common',    icon: '🧤', minLevel: 1, description: 'Simple hand protection.',              loreText: 'Better than nothing.', modifiers: { boss_damage_pct: 1, crit_pct: 1 } },
    { id: 'arms_ironbound_gauntlets',  name: 'Ironbound Gauntlets',       slot: 'arms',   rarityTier: 'uncommon',  icon: '🧤', minLevel: 2, description: 'Heavy gauntlets that hit harder.',     loreText: 'The iron came from deep beneath the Obsidian Spire.', modifiers: { boss_damage_pct: 4, defense: 3 } },
    { id: 'arms_flameheart_vambraces', name: 'Flameheart Vambraces',      slot: 'arms',   rarityTier: 'rare',      icon: '🧤', minLevel: 4, description: 'Pulse with an inner fire.',            loreText: 'The heart of a flame elemental beats within.', modifiers: { boss_damage_pct: 6, crit_pct: 5, cooldown_pct: 2 } },
    { id: 'arms_shade_captains_grip',  name: "Shade Captain's Grip",      slot: 'arms',   rarityTier: 'epic',      icon: '🧤', minLevel: 7, description: 'Taken from a defeated champion of shadow.', loreText: 'Drew blood from a Shade Captain and claimed the prize.', modifiers: { boss_damage_pct: 10, crit_pct: 7, luck_pct: 3 } },
    { id: 'arms_hands_of_the_weave',   name: 'Hands of the Weave',        slot: 'arms',   rarityTier: 'legendary', icon: '🧤', minLevel: 10, description: 'Can reshape the threads of fate.',     loreText: 'The Weave itself bends to these fingers.', modifiers: { boss_damage_pct: 12, crit_pct: 10, fate_affinity: 6, xp_bonus_pct: 5 } },
    { id: 'arms_bone_garden_bracers',  name: 'Bone Garden Bracers',       slot: 'arms',   rarityTier: 'rare',      icon: '🧤', minLevel: 5, description: 'Grown from living bone.',              loreText: 'Risen from the Bone Gardens of Old Verath.', modifiers: { defense: 5, boss_damage_pct: 5 } },
    { id: 'arms_singing_stone_wraps',  name: 'Singing Stone Wraps',       slot: 'arms',   rarityTier: 'uncommon',  icon: '🧤', minLevel: 3, description: 'Hum with a faint resonance.',          loreText: 'Called by the Singing Stones of the Deep Road.', modifiers: { crit_pct: 3, fate_affinity: 2 } },

    // ── LEGS (cooldown, speed, mobility) ────────────────────
    { id: 'legs_travel_boots',         name: 'Travel Boots',              slot: 'legs',   rarityTier: 'common',    icon: '👢', minLevel: 1, description: 'Sturdy boots for the road.',           loreText: 'Every journey begins with a single step.', modifiers: { cooldown_pct: 2 } },
    { id: 'legs_windstride_greaves',   name: 'Windstride Greaves',        slot: 'legs',   rarityTier: 'uncommon',  icon: '👢', minLevel: 2, description: 'Lighter than they look.',              loreText: 'Enchanted by the windcallers of the Wastes.', modifiers: { cooldown_pct: 4, xp_bonus_pct: 2 } },
    { id: 'legs_voidwalker_treads',    name: 'Voidwalker Treads',         slot: 'legs',   rarityTier: 'rare',      icon: '👢', minLevel: 4, description: 'Leave no footprints.',                 loreText: 'Step between the spaces where reality thins.', modifiers: { cooldown_pct: 6, luck_pct: 4, crit_pct: 2 } },
    { id: 'legs_greaves_first_war',    name: 'Greaves of the First War',  slot: 'legs',   rarityTier: 'epic',      icon: '👢', minLevel: 7, description: 'Ancient beyond reckoning.',            loreText: 'Shaped by the Echoes of the First War.', modifiers: { cooldown_pct: 8, defense: 6, boss_damage_pct: 4 } },
    { id: 'legs_stride_of_eternity',   name: 'Stride of Eternity',        slot: 'legs',   rarityTier: 'legendary', icon: '👢', minLevel: 10, description: 'Walk between moments.',                loreText: 'The wearer exists in all times and none.', modifiers: { cooldown_pct: 12, xp_bonus_pct: 8, luck_pct: 6, fate_affinity: 4 } },
    { id: 'legs_deeproad_sabatons',    name: 'Deep Road Sabatons',        slot: 'legs',   rarityTier: 'rare',      icon: '👢', minLevel: 5, description: 'Echo with each step.',                 loreText: 'Forged deep beneath the world.', modifiers: { defense: 5, cooldown_pct: 5 } },
    { id: 'legs_wasteland_wrappings',  name: 'Wasteland Wrappings',       slot: 'legs',   rarityTier: 'uncommon',  icon: '👢', minLevel: 3, description: 'Wind-dried leather from the Wastes.',  loreText: 'Emerged from the Whispering Wastes of Solara.', modifiers: { cooldown_pct: 3, fate_affinity: 2 } },

    // ── RUNES (luck, fate, magic) ───────────────────────────
    { id: 'rune_faded_glyph',          name: 'Faded Glyph',               slot: 'rune',   rarityTier: 'common',    icon: '🔮', minLevel: 1, description: 'A dim but functional rune.',            loreText: 'The simplest form of inscribed power.', modifiers: { luck_pct: 2 } },
    { id: 'rune_ember_sigil',          name: 'Ember Sigil',               slot: 'rune',   rarityTier: 'uncommon',  icon: '🔮', minLevel: 2, description: 'Warm to the touch.',                   loreText: 'Inscribed with the mark of the Last Flame.', modifiers: { luck_pct: 3, xp_bonus_pct: 3 } },
    { id: 'rune_shattered_stars',      name: 'Rune of Shattered Stars',   slot: 'rune',   rarityTier: 'rare',      icon: '✨', minLevel: 4, description: 'Contains a fragment of a dead star.',   loreText: 'Forged in the Crucible of Shattered Stars.', modifiers: { luck_pct: 6, fate_affinity: 4, xp_bonus_pct: 3 } },
    { id: 'rune_veil_whisper',         name: 'Veil Whisper',              slot: 'rune',   rarityTier: 'epic',      icon: '✨', minLevel: 7, description: 'Speaks in a language older than words.', loreText: 'Heard the First Whisper of the Veil.', modifiers: { luck_pct: 8, fate_affinity: 7, crit_pct: 4 } },
    { id: 'rune_sigil_first_flame',    name: 'Sigil of the First Flame',  slot: 'rune',   rarityTier: 'legendary', icon: '🌟', minLevel: 10, description: 'The original fire that lit all worlds.', loreText: 'Before the Veil, before the War, there was the Flame.', modifiers: { luck_pct: 12, fate_affinity: 10, xp_bonus_pct: 8, boss_damage_pct: 5 } },
    { id: 'rune_threshold_mark',       name: 'Threshold Mark',            slot: 'rune',   rarityTier: 'rare',      icon: '✨', minLevel: 5, description: 'Marks the boundary between realms.',   loreText: 'Anointed by the Pale Warden of the Threshold.', modifiers: { fate_affinity: 5, luck_pct: 4 } },
    { id: 'rune_echo_stone',           name: 'Echo Stone',                slot: 'rune',   rarityTier: 'uncommon',  icon: '🔮', minLevel: 3, description: 'Resonates with distant events.',       loreText: 'Shaped by the Echoes of the First War.', modifiers: { fate_affinity: 3, cooldown_pct: 2 } },

    // ── T3 BAND (L11-15) — v4 expansion (2026-07-29) ─────────
    // Paradigm-leaning by design: each item's modifier mix votes for
    // a playstyle (canon §13.3). No 'rare+' or mythic — neither has
    // dismantle yields or client frames yet.
    { id: 'weapon_wyrmfang_saber',     name: 'Wyrmfang Saber',            slot: 'weapon', rarityTier: 'rare',      icon: '⚔', minLevel: 12, description: 'Carved from a wyrm\'s hollow fang.',    loreText: 'The fang remembers the throat it guarded.', modifiers: { crit_pct: 8, boss_damage_pct: 6 } },
    { id: 'helm_oracles_diadem',       name: "Oracle's Diadem",           slot: 'helm',   rarityTier: 'rare',      icon: '👑', minLevel: 12, description: 'Sees a heartbeat ahead.',               loreText: 'Worn by the Seer of Kingvale before the fall.', modifiers: { xp_bonus_pct: 8, luck_pct: 5 } },
    { id: 'chest_bastion_of_roots',    name: 'Bastion of Roots',          slot: 'chest',  rarityTier: 'rare',      icon: '🛡', minLevel: 13, description: 'Living wood that closes over wounds.',  loreText: 'Grown, not forged, in the Ancient Grove.', modifiers: { defense: 12, cooldown_pct: 4 } },
    { id: 'legs_wardens_greaves',      name: "Warden's Greaves",          slot: 'legs',   rarityTier: 'rare',      icon: '👢', minLevel: 13, description: 'Holds the line at the threshold.',      loreText: 'They have never once stepped backward.', modifiers: { defense: 9, xp_bonus_pct: 4 } },
    { id: 'arms_stormbinder_grips',    name: 'Stormbinder Grips',         slot: 'arms',   rarityTier: 'epic',      icon: '🧤', minLevel: 14, description: 'Lightning answers the closed fist.',    loreText: 'Bound during the Eternal Storm\'s last hour.', modifiers: { crit_pct: 9, boss_damage_pct: 7, cooldown_pct: 4 } },
    { id: 'rune_heartwood_core',       name: 'Heartwood Core',            slot: 'rune',   rarityTier: 'epic',      icon: '✨', minLevel: 14, description: 'A slow green pulse, like sap rising.',  loreText: 'Cut from the World Tree\'s first ring.', modifiers: { cooldown_pct: 7, luck_pct: 6, fate_affinity: 5 } },

    // ── T4 BAND (L16-20) — v4 expansion (2026-07-29) ─────────
    { id: 'weapon_sundering_maul',     name: 'Sundering Maul',            slot: 'weapon', rarityTier: 'epic',      icon: '🔨', minLevel: 17, description: 'What it strikes, stays struck.',        loreText: 'It has broken things that were promised unbreakable.', modifiers: { boss_damage_pct: 14, crit_pct: 8 } },
    { id: 'helm_crown_of_vigil',       name: 'Crown of Vigil',            slot: 'helm',   rarityTier: 'epic',      icon: '👑', minLevel: 17, description: 'The wearer does not blink first.',      loreText: 'Forged for the Watch that never ended.', modifiers: { defense: 8, xp_bonus_pct: 10, luck_pct: 6 } },
    { id: 'legs_pathfinders_stride',   name: "Pathfinder's Stride",       slot: 'legs',   rarityTier: 'epic',      icon: '👢', minLevel: 17, description: 'Every road shortens beneath them.',     loreText: 'Walked the Deep Road end to end, twice.', modifiers: { cooldown_pct: 8, xp_bonus_pct: 8 } },
    { id: 'arms_reapers_talons',       name: "Reaper's Talons",           slot: 'arms',   rarityTier: 'epic',      icon: '🧤', minLevel: 18, description: 'Nothing owed goes uncollected.',        loreText: 'The Gleaner\'s own harvest-hooks, re-tempered.', modifiers: { crit_pct: 11, luck_pct: 8 } },
    { id: 'chest_dragonscale_aegis',   name: 'Dragonscale Aegis',         slot: 'chest',  rarityTier: 'legendary', icon: '🛡', minLevel: 20, description: 'Scales that outlived their dragon.',    loreText: 'The Elder Wyrm shed once, and only once.', modifiers: { defense: 24, boss_damage_pct: 8, fate_affinity: 6 } },
    { id: 'rune_grandmasters_seal',    name: "Grandmaster's Seal",        slot: 'rune',   rarityTier: 'legendary', icon: '🌟', minLevel: 20, description: 'The mark of a finished path.',          loreText: 'Pressed only by hands that mastered a doctrine.', modifiers: { luck_pct: 10, xp_bonus_pct: 10, crit_pct: 6, fate_affinity: 8 } },
  ];

  // ── v4 adoption (canon §13.2, 2026-07-29): every catalog item
  // carries loot-engine-scale power so seeded and engine-dropped
  // gear live on ONE Resonance scale. Derived from the minLevel
  // band × rarity, mirroring loot-engine.service BASE_POWER /
  // RARITY_MULTIPLIER / SLOT_WEIGHT (lowercase slots; arms=Hands).
  const V4_BASE_POWER: Record<string, number> = {
    T1: 10, T2: 20, T3: 35, T4: 55, T5: 80, T6: 110, T7: 150, T8: 200,
  };
  const V4_RARITY_MULT: Record<string, number> = {
    common: 1.0, uncommon: 1.15, rare: 1.3, 'rare+': 1.45, epic: 1.65, legendary: 2.0,
  };
  const V4_SLOT_WEIGHT: Record<string, number> = {
    chest: 0.30, weapon: 0.25, legs: 0.20, helm: 0.15, arms: 0.10, rune: 0.60,
  };
  const v4Band = (minLevel: number) => `T${Math.min(8, Math.max(1, Math.ceil(minLevel / 5)))}`;
  const enrichGearItem = (item: (typeof gearItems)[number]) => {
    const levelBand  = v4Band(item.minLevel);
    const itemPower  = Math.round((V4_BASE_POWER[levelBand] ?? 10) * (V4_RARITY_MULT[item.rarityTier] ?? 1));
    const slotBudget = Math.round(itemPower * (V4_SLOT_WEIGHT[item.slot] ?? 0.15));
    return { ...item, levelBand, itemPower, slotBudget };
  };

  // ── Job rank titles (v4 tails, 2026-07-30) ────────────────
  // One per Job × rank crossing (Adept and up; Initiate is the
  // choice itself). Granted by LevelingService on JobRank crossings.
  const JOB_RANK_TITLES: Array<{ id: string; displayName: string; category: string; description: string }> = [];
  for (const job of ['aegis', 'scalesworn', 'dryadic', 'harvester']) {
    const jobName = job.charAt(0).toUpperCase() + job.slice(1);
    for (const rank of ['adept', 'veteran', 'elite', 'master', 'grandmaster']) {
      const rankName = rank.charAt(0).toUpperCase() + rank.slice(1);
      JOB_RANK_TITLES.push({
        id: `job_${job}_${rank}`,
        displayName: `${rankName.toUpperCase()} ${jobName.toUpperCase()}`,
        category: 'job',
        description: `Reached ${rankName} rank on the ${jobName} path`,
      });
    }
  }
  for (const t of JOB_RANK_TITLES) {
    await prisma.title.upsert({ where: { id: t.id }, update: { ...t }, create: t });
  }
  console.log(`  ✓ ${JOB_RANK_TITLES.length} job rank titles`);

  for (const item of gearItems) {
    const enriched = enrichGearItem(item);
    await prisma.gearItem.upsert({
      where: { id: item.id },
      // Sync on re-seed — with the old `update: {}`, rows already in
      // a deployed env would NEVER adopt itemPower/levelBand (the
      // same welded-shut trap the loot table hit; see § 7 above).
      update: enriched,
      create: enriched,
    });
  }
  console.log(`  ✓ ${gearItems.length} gear items (v4: itemPower/slotBudget/levelBand)`);

  // ── 8. Gear Loot Table Entries ────────────────────────────

  console.log('  Seeding gear loot entries...');

  const gearLoot = [
    // Level-up gear drops
    { cacheType: 'level_up', rewardType: 'gear', rewardValue: 'weapon_rusted_blade',      displayName: 'Rusted Blade',              weight: 60, rarityTier: 'common',    minLevel: 1 },
    { cacheType: 'level_up', rewardType: 'gear', rewardValue: 'helm_leather_cap',          displayName: 'Leather Cap',               weight: 60, rarityTier: 'common',    minLevel: 1 },
    { cacheType: 'level_up', rewardType: 'gear', rewardValue: 'chest_hide_vest',           displayName: 'Hide Vest',                 weight: 60, rarityTier: 'common',    minLevel: 1 },
    { cacheType: 'level_up', rewardType: 'gear', rewardValue: 'arms_leather_wraps',        displayName: 'Leather Wraps',             weight: 60, rarityTier: 'common',    minLevel: 1 },
    { cacheType: 'level_up', rewardType: 'gear', rewardValue: 'legs_travel_boots',         displayName: 'Travel Boots',              weight: 60, rarityTier: 'common',    minLevel: 1 },
    { cacheType: 'level_up', rewardType: 'gear', rewardValue: 'rune_faded_glyph',          displayName: 'Faded Glyph',               weight: 60, rarityTier: 'common',    minLevel: 1 },
    { cacheType: 'level_up', rewardType: 'gear', rewardValue: 'weapon_ashbrand',           displayName: 'Ashbrand',                  weight: 30, rarityTier: 'uncommon',  minLevel: 2 },
    { cacheType: 'level_up', rewardType: 'gear', rewardValue: 'helm_seekers_circlet',      displayName: "Seeker's Circlet",          weight: 30, rarityTier: 'uncommon',  minLevel: 2 },
    { cacheType: 'level_up', rewardType: 'gear', rewardValue: 'rune_shattered_stars',      displayName: 'Rune of Shattered Stars',   weight: 8,  rarityTier: 'rare',      minLevel: 4 },

    // Boss kill gear drops
    { cacheType: 'boss_kill', rewardType: 'gear', rewardValue: 'weapon_ember_dirk',         displayName: 'Ember Dirk',                weight: 40, rarityTier: 'uncommon',  minLevel: 3 },
    { cacheType: 'boss_kill', rewardType: 'gear', rewardValue: 'arms_ironbound_gauntlets',  displayName: 'Ironbound Gauntlets',       weight: 40, rarityTier: 'uncommon',  minLevel: 2 },
    { cacheType: 'boss_kill', rewardType: 'gear', rewardValue: 'chest_chainweave',          displayName: 'Chainweave Hauberk',        weight: 40, rarityTier: 'uncommon',  minLevel: 2 },
    { cacheType: 'boss_kill', rewardType: 'gear', rewardValue: 'weapon_stormcallers_edge',  displayName: "Stormcaller's Edge",        weight: 15, rarityTier: 'rare',      minLevel: 4 },
    { cacheType: 'boss_kill', rewardType: 'gear', rewardValue: 'arms_flameheart_vambraces', displayName: 'Flameheart Vambraces',      weight: 15, rarityTier: 'rare',      minLevel: 4 },
    { cacheType: 'boss_kill', rewardType: 'gear', rewardValue: 'chest_crucible_plate',      displayName: 'Crucible Plate',            weight: 15, rarityTier: 'rare',      minLevel: 4 },
    { cacheType: 'boss_kill', rewardType: 'gear', rewardValue: 'weapon_veilcleaver',        displayName: 'Veilcleaver',               weight: 5,  rarityTier: 'epic',      minLevel: 7 },
    { cacheType: 'boss_kill', rewardType: 'gear', rewardValue: 'arms_shade_captains_grip',  displayName: "Shade Captain's Grip",      weight: 5,  rarityTier: 'epic',      minLevel: 7 },
    { cacheType: 'boss_kill', rewardType: 'gear', rewardValue: 'weapon_fateforged_blade',   displayName: 'Fate-Forged Blade',         weight: 1,  rarityTier: 'legendary', minLevel: 10 },

    // Milestone gear drops
    { cacheType: 'milestone', rewardType: 'gear', rewardValue: 'helm_crown_bleeding_moon',  displayName: 'Crown of the Bleeding Moon', weight: 20, rarityTier: 'rare',     minLevel: 4 },
    { cacheType: 'milestone', rewardType: 'gear', rewardValue: 'legs_voidwalker_treads',    displayName: 'Voidwalker Treads',          weight: 20, rarityTier: 'rare',     minLevel: 4 },
    { cacheType: 'milestone', rewardType: 'gear', rewardValue: 'rune_veil_whisper',         displayName: 'Veil Whisper',               weight: 8,  rarityTier: 'epic',     minLevel: 7 },
    { cacheType: 'milestone', rewardType: 'gear', rewardValue: 'helm_duskwalkers_cowl',     displayName: "Duskwalker's Cowl",          weight: 8,  rarityTier: 'epic',     minLevel: 7 },
    { cacheType: 'milestone', rewardType: 'gear', rewardValue: 'chest_aegis_eternal',       displayName: 'Aegis of the Eternal',       weight: 2,  rarityTier: 'legendary', minLevel: 10 },
    { cacheType: 'milestone', rewardType: 'gear', rewardValue: 'rune_sigil_first_flame',    displayName: 'Sigil of the First Flame',   weight: 2,  rarityTier: 'legendary', minLevel: 10 },

    // ── T3/T4 expansion (v4, 2026-07-29) — the L11-20 tail. Entries
    // carry minLevel, so pre-11 heroes never see them roll.
    { cacheType: 'level_up',  rewardType: 'gear', rewardValue: 'weapon_wyrmfang_saber',     displayName: 'Wyrmfang Saber',             weight: 12, rarityTier: 'rare',      minLevel: 12 },
    { cacheType: 'level_up',  rewardType: 'gear', rewardValue: 'helm_oracles_diadem',       displayName: "Oracle's Diadem",            weight: 12, rarityTier: 'rare',      minLevel: 12 },
    { cacheType: 'level_up',  rewardType: 'gear', rewardValue: 'legs_wardens_greaves',      displayName: "Warden's Greaves",           weight: 12, rarityTier: 'rare',      minLevel: 13 },
    { cacheType: 'boss_kill', rewardType: 'gear', rewardValue: 'chest_bastion_of_roots',    displayName: 'Bastion of Roots',           weight: 15, rarityTier: 'rare',      minLevel: 13 },
    { cacheType: 'boss_kill', rewardType: 'gear', rewardValue: 'arms_stormbinder_grips',    displayName: 'Stormbinder Grips',          weight: 6,  rarityTier: 'epic',      minLevel: 14 },
    { cacheType: 'milestone', rewardType: 'gear', rewardValue: 'rune_heartwood_core',       displayName: 'Heartwood Core',             weight: 8,  rarityTier: 'epic',      minLevel: 14 },
    { cacheType: 'boss_kill', rewardType: 'gear', rewardValue: 'weapon_sundering_maul',     displayName: 'Sundering Maul',             weight: 5,  rarityTier: 'epic',      minLevel: 17 },
    { cacheType: 'milestone', rewardType: 'gear', rewardValue: 'helm_crown_of_vigil',       displayName: 'Crown of Vigil',             weight: 6,  rarityTier: 'epic',      minLevel: 17 },
    { cacheType: 'level_up',  rewardType: 'gear', rewardValue: 'legs_pathfinders_stride',   displayName: "Pathfinder's Stride",        weight: 5,  rarityTier: 'epic',      minLevel: 17 },
    { cacheType: 'boss_kill', rewardType: 'gear', rewardValue: 'arms_reapers_talons',       displayName: "Reaper's Talons",            weight: 5,  rarityTier: 'epic',      minLevel: 18 },
    { cacheType: 'milestone', rewardType: 'gear', rewardValue: 'chest_dragonscale_aegis',   displayName: 'Dragonscale Aegis',          weight: 2,  rarityTier: 'legendary', minLevel: 20 },
    { cacheType: 'milestone', rewardType: 'gear', rewardValue: 'rune_grandmasters_seal',    displayName: "Grandmaster's Seal",         weight: 1,  rarityTier: 'legendary', minLevel: 20 },
  ];

  for (const entry of gearLoot) {
    const id = `loot-${entry.cacheType}-gear-${entry.rewardValue}`;
    await prisma.lootTable.upsert({
      where: { id },
      // Sync on re-seed (same welded-shut trap as above — weights
      // and new entries must reach already-seeded envs).
      update: { ...entry },
      create: { id, ...entry },
    });
  }
  console.log(`  ✓ ${gearLoot.length} gear loot entries`);

  // ── Rite Templates ──────────────────────────────────────────────────────────

  console.log('');
  console.log('  Seeding rite templates...');

  const riteTemplates = [
    // ── FORGE (Physical) ───────────────────────────────────────────────────────
    {
      id: 'rite-forge-001', pillar: 'forge',
      title: 'Complete 20 minutes of cardio',
      description: 'Run, cycle, swim — move with intent.',
      loreText: 'The body that endures is the body that survives.',
      xpBase: 50, difficulty: 'standard',
    },
    {
      id: 'rite-forge-002', pillar: 'forge',
      title: 'Complete a strength training session',
      description: 'Push, pull, lift — forge the body.',
      loreText: 'Iron sharpens iron. The weak do not last.',
      xpBase: 50, difficulty: 'standard',
    },
    {
      id: 'rite-forge-003', pillar: 'forge',
      title: 'Play a sport or physical game',
      description: 'Compete, cooperate, or challenge yourself.',
      loreText: 'Combat is not always war. Sometimes it is play.',
      xpBase: 50, difficulty: 'standard',
    },
    {
      id: 'rite-forge-004', pillar: 'forge',
      title: 'Take a 30-minute walk with purpose',
      description: 'No screens. Walk as if the path matters.',
      loreText: 'Every road walked is a road remembered by the Veil.',
      xpBase: 50, difficulty: 'easy',
    },
    {
      id: 'rite-forge-005', pillar: 'forge',
      title: 'Complete 100 bodyweight repetitions',
      description: 'Push-ups, squats, lunges — any combination.',
      loreText: 'The Forge does not count reps. It counts resolve.',
      xpBase: 50, difficulty: 'standard',
    },
    {
      id: 'rite-forge-006', pillar: 'forge',
      title: 'Train for 45 minutes without stopping',
      description: 'Any physical discipline. Endurance is the lesson.',
      loreText: 'Duration reveals character. Anyone can start.',
      xpBase: 50, difficulty: 'hard',
    },
    {
      id: 'rite-forge-007', pillar: 'forge',
      title: 'Stretch and recover for 20 minutes',
      description: 'Restoration is part of the discipline.',
      loreText: 'The blade that is never sharpened will break.',
      xpBase: 50, difficulty: 'easy',
    },
    {
      id: 'rite-forge-008', pillar: 'forge',
      title: 'Complete a physical challenge you have been avoiding',
      description: 'The hard thing. You know what it is.',
      loreText: 'What you avoid owns you. What you face, you own.',
      xpBase: 50, difficulty: 'hard',
    },

    // ── LORE (Mental) ──────────────────────────────────────────────────────────
    {
      id: 'rite-lore-001', pillar: 'lore',
      title: 'Read for 30 minutes',
      description: 'A book, long-form article, or study material.',
      loreText: 'Every page turned is a door opened.',
      xpBase: 50, difficulty: 'standard',
    },
    {
      id: 'rite-lore-002', pillar: 'lore',
      title: 'Write freely for 20 minutes',
      description: 'Journal, story, ideas — just write.',
      loreText: 'The mind that cannot be expressed cannot be understood.',
      xpBase: 50, difficulty: 'standard',
    },
    {
      id: 'rite-lore-003', pillar: 'lore',
      title: 'Learn something completely new today',
      description: 'A skill, a concept, a language phrase.',
      loreText: 'The map of knowledge has no edge. Seek the boundary.',
      xpBase: 50, difficulty: 'standard',
    },
    {
      id: 'rite-lore-004', pillar: 'lore',
      title: 'Solve a puzzle or mental challenge',
      description: 'Chess, logic, crossword — engage the mind in combat.',
      loreText: 'The greatest battlefield is the one behind your eyes.',
      xpBase: 50, difficulty: 'easy',
    },
    {
      id: 'rite-lore-005', pillar: 'lore',
      title: 'Listen to an educational podcast or lecture',
      description: 'Learn from someone who has walked further.',
      loreText: 'A wise voice in the dark is worth ten swords.',
      xpBase: 50, difficulty: 'easy',
    },
    {
      id: 'rite-lore-006', pillar: 'lore',
      title: 'Study your craft for 45 minutes',
      description: 'Whatever you are building — go deeper.',
      loreText: 'Mastery is not claimed. It is excavated, slowly.',
      xpBase: 50, difficulty: 'hard',
    },
    {
      id: 'rite-lore-007', pillar: 'lore',
      title: 'Teach something to another person',
      description: 'The lesson that cements understanding.',
      loreText: 'What you can teach, you truly know.',
      xpBase: 50, difficulty: 'standard',
    },
    {
      id: 'rite-lore-008', pillar: 'lore',
      title: 'Review and reflect on past notes or writing',
      description: 'Mining the past for what you missed.',
      loreText: 'The Codex does not forget. Neither should you.',
      xpBase: 50, difficulty: 'easy',
    },

    // ── VEIL (Spiritual) ───────────────────────────────────────────────────────
    {
      id: 'rite-veil-001', pillar: 'veil',
      title: 'Meditate or sit in silence for 10 minutes',
      description: 'No distractions. Just presence.',
      loreText: 'The Veil is loudest in silence. Listen.',
      xpBase: 50, difficulty: 'easy',
    },
    {
      id: 'rite-veil-002', pillar: 'veil',
      title: 'Perform an act of service for another person',
      description: 'Give time, help, or support without expectation.',
      loreText: 'The hand that gives without taking opens the Veil.',
      xpBase: 50, difficulty: 'standard',
    },
    {
      id: 'rite-veil-003', pillar: 'veil',
      title: 'Spend 20 minutes in prayer or personal reflection',
      description: 'Speak to what you believe in. Or listen.',
      loreText: 'Every prayer is a thread cast into the unknown.',
      xpBase: 50, difficulty: 'easy',
    },
    {
      id: 'rite-veil-004', pillar: 'veil',
      title: 'Spend time in nature without a screen',
      description: 'Walk, sit, observe. Let the world speak.',
      loreText: 'The world beyond the walls has not forgotten you.',
      xpBase: 50, difficulty: 'easy',
    },
    {
      id: 'rite-veil-005', pillar: 'veil',
      title: 'Practice gratitude — write 5 things you are grateful for',
      description: 'Specificity matters. No generic answers.',
      loreText: 'What is named is held. What is held is not lost.',
      xpBase: 50, difficulty: 'easy',
    },
    {
      id: 'rite-veil-006', pillar: 'veil',
      title: 'Have a meaningful conversation with someone you trust',
      description: 'Not small talk. Real contact.',
      loreText: 'The bond between people is the oldest seal against the dark.',
      xpBase: 50, difficulty: 'standard',
    },
    {
      id: 'rite-veil-007', pillar: 'veil',
      title: 'Disconnect from all screens for 2 hours',
      description: 'The hardest rite for many. Sit with yourself.',
      loreText: 'The Veil cannot reach through the noise. Step outside it.',
      xpBase: 50, difficulty: 'hard',
    },
    {
      id: 'rite-veil-008', pillar: 'veil',
      title: 'Do something creative with no goal or audience',
      description: 'Draw, play music, build — for the act itself.',
      loreText: 'Creation without purpose is the purest form of attunement.',
      xpBase: 50, difficulty: 'standard',
    },
  ];

  for (const rt of riteTemplates) {
    await prisma.riteTemplate.upsert({
      where: { id: rt.id },
      update: {},
      create: rt,
    });
  }
  console.log(`  ✓ ${riteTemplates.length} rite templates`);

  // ── Pillar titles for title registry ──────────────────────────────────────

  const pillarTitles = [
    // Forge
    { id: 'title_forge_1', displayName: 'Forge Initiate',  category: 'training' },
    { id: 'title_forge_2', displayName: 'Forge Adept',     category: 'training' },
    { id: 'title_forge_3', displayName: 'Forge Hardened',  category: 'training' },
    { id: 'title_forge_4', displayName: 'Forge Master',    category: 'training' },
    { id: 'title_forge_5', displayName: 'Iron-Sworn',      category: 'training' },
    // Lore
    { id: 'title_lore_1',  displayName: 'Lore Seeker',     category: 'training' },
    { id: 'title_lore_2',  displayName: 'Lore Keeper',     category: 'training' },
    { id: 'title_lore_3',  displayName: 'Lore Warden',     category: 'training' },
    { id: 'title_lore_4',  displayName: 'Lore Sage',       category: 'training' },
    { id: 'title_lore_5',  displayName: 'Veil Scholar',    category: 'training' },
    // Veil
    { id: 'title_veil_1',  displayName: 'Veil Touched',    category: 'training' },
    { id: 'title_veil_2',  displayName: 'Veil Walker',     category: 'training' },
    { id: 'title_veil_3',  displayName: 'Veil Warden',     category: 'training' },
    { id: 'title_veil_4',  displayName: 'Veil Bound',      category: 'training' },
    { id: 'title_veil_5',  displayName: 'The Still Point', category: 'training' },
  ];

  for (const t of pillarTitles) {
    await prisma.title.upsert({
      where: { id: t.id },
      update: {},
      create: t,
    });
  }
  console.log(`  ✓ ${pillarTitles.length} pillar titles`);

  // ── Legacy milestone titles (Arena/Legacy slice, 2026-07-30) ──────────────
  // Granted on Legacy level crossings (floor of avg pillar levels).
  // Cosmetic-only per v4 rule 5 — Legacy never buys combat power.

  const legacyTitles = [
    { id: 'legacy_2',  displayName: 'Life-Tender',        description: 'Two lives kept in one week of days.',              category: 'legacy' },
    { id: 'legacy_3',  displayName: 'Threefold Keeper',   description: 'Body, mind, and stillness — none left untended.',  category: 'legacy' },
    { id: 'legacy_4',  displayName: 'Steadfast',          description: 'The practice held when no one was watching.',      category: 'legacy' },
    { id: 'legacy_5',  displayName: 'Well-Forged Soul',   description: 'Half the proving ground rebuilt by lived days.',   category: 'legacy' },
    { id: 'legacy_6',  displayName: 'Life-Sworn',         description: 'The record reads like an oath, kept daily.',       category: 'legacy' },
    { id: 'legacy_7',  displayName: 'The Balanced',       description: 'No pillar leans. No life goes hungry.',            category: 'legacy' },
    { id: 'legacy_8',  displayName: 'Paragon of Practice', description: 'What was discipline is now simply who you are.',  category: 'legacy' },
    { id: 'legacy_9',  displayName: 'Living Legend',      description: 'The Arena stands nearly whole around your name.',  category: 'legacy' },
    { id: 'legacy_10', displayName: 'Legacy Incarnate',   description: 'Adventure built your Hero. Life built this.',      category: 'legacy' },
  ];

  for (const t of legacyTitles) {
    await prisma.title.upsert({
      where: { id: t.id },
      update: {},
      create: t,
    });
  }
  console.log(`  ✓ ${legacyTitles.length} legacy titles`);

  console.log('');
  console.log('=== SEED COMPLETE ===');
  console.log('');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
