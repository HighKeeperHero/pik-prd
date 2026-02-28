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

  // ── 4. Demo users ─────────────────────────────────────────

  const demo1 = await prisma.rootIdentity.upsert({
    where: { id: 'pik-root-demo-operator-001' },
    update: {},
    create: {
      id: 'pik-root-demo-operator-001',
      heroName: 'Aelindra Voss',
      fateAlignment: 'Order',
      origin: 'Tower Sentinel',
      enrolledBy: 'operator:demo',
    },
  });

  const demo2 = await prisma.rootIdentity.upsert({
    where: { id: 'pik-root-demo-self-001' },
    update: {},
    create: {
      id: 'pik-root-demo-self-001',
      heroName: 'Korrath the Grey',
      fateAlignment: 'Chaos',
      origin: 'Ashlands Wanderer',
      enrolledBy: 'self',
    },
  });

  // Personas
  await prisma.persona.upsert({
    where: { id: 'persona-demo-operator-001' },
    update: {},
    create: {
      id: 'persona-demo-operator-001',
      rootId: demo1.id,
      displayName: 'Aelindra Voss',
    },
  });

  await prisma.persona.upsert({
    where: { id: 'persona-demo-self-001' },
    update: {},
    create: {
      id: 'persona-demo-self-001',
      rootId: demo2.id,
      displayName: 'Korrath the Grey',
    },
  });

  console.log('[4/5] Demo users → 2 rows');

  // ── 5. Source links for demo users ────────────────────────

  // Aelindra → HV
  await prisma.sourceLink.upsert({
    where: { id: 'link-demo-op-hv' },
    update: {},
    create: {
      id: 'link-demo-op-hv',
      rootId: demo1.id,
      sourceId: 'src-heroes-veritas-01',
      grantedBy: 'operator:demo',
    },
  });

  // Korrath → HV
  await prisma.sourceLink.upsert({
    where: { id: 'link-demo-self-hv' },
    update: {},
    create: {
      id: 'link-demo-self-hv',
      rootId: demo2.id,
      sourceId: 'src-heroes-veritas-01',
      grantedBy: 'self',
    },
  });

  // Korrath → Mock Venue
  await prisma.sourceLink.upsert({
    where: { id: 'link-demo-self-mock' },
    update: {},
    create: {
      id: 'link-demo-self-mock',
      rootId: demo2.id,
      sourceId: 'src-mock-venue-01',
      grantedBy: 'self',
    },
  });

  console.log('[5/5] Source links → 3 rows');

  // ── Enrollment events ─────────────────────────────────────
  // Use createMany with skipDuplicates so re-runs are safe.

  await prisma.identityEvent.createMany({
    data: [
      {
        rootId: demo1.id,
        eventType: 'identity.enrolled',
        payload: { enrolled_by: 'operator:demo', hero_name: 'Aelindra Voss' },
      },
      {
        rootId: demo2.id,
        eventType: 'identity.enrolled',
        payload: { enrolled_by: 'self', hero_name: 'Korrath the Grey' },
      },
      {
        rootId: demo1.id,
        eventType: 'source.link_granted',
        sourceId: 'src-heroes-veritas-01',
        payload: { link_id: 'link-demo-op-hv', source_id: 'src-heroes-veritas-01', granted_by: 'operator:demo' },
      },
      {
        rootId: demo2.id,
        eventType: 'source.link_granted',
        sourceId: 'src-heroes-veritas-01',
        payload: { link_id: 'link-demo-self-hv', source_id: 'src-heroes-veritas-01', granted_by: 'self' },
      },
      {
        rootId: demo2.id,
        eventType: 'source.link_granted',
        sourceId: 'src-mock-venue-01',
        payload: { link_id: 'link-demo-self-mock', source_id: 'src-mock-venue-01', granted_by: 'self' },
      },
    ],
    skipDuplicates: true,
  });

  console.log('');
  console.log('  Seeding loot tables...');

  const lootEntries = [
    // ── Level Up Cache Pool ─────────────────────────────
    { cacheType: 'level_up', rewardType: 'xp_boost',  rewardValue: '50',   displayName: 'Minor Fate Spark',        weight: 200, rarityTier: 'common',    minLevel: 1 },
    { cacheType: 'level_up', rewardType: 'xp_boost',  rewardValue: '150',  displayName: 'Fate Ember',              weight: 100, rarityTier: 'uncommon',  minLevel: 1 },
    { cacheType: 'level_up', rewardType: 'marker',    rewardValue: 'Felt the threads of fate shift and realign',   displayName: 'Fate Thread Marker',      weight: 80,  rarityTier: 'uncommon',  minLevel: 2 },
    { cacheType: 'level_up', rewardType: 'marker',    rewardValue: 'Glimpsed the weave between worlds',            displayName: 'Veil Sight Marker',       weight: 40,  rarityTier: 'rare',     minLevel: 3 },
    { cacheType: 'level_up', rewardType: 'xp_boost',  rewardValue: '400',  displayName: 'Blazing Fate Core',       weight: 20,  rarityTier: 'epic',      minLevel: 5 },
    { cacheType: 'level_up', rewardType: 'title',     rewardValue: 'title_fortune_favored', displayName: 'Fortune Favored',  weight: 5,   rarityTier: 'legendary', minLevel: 5 },

    // ── Boss Kill Cache Pool ────────────────────────────
    { cacheType: 'boss_kill', rewardType: 'xp_boost',  rewardValue: '100',  displayName: 'Veil Shard',              weight: 180, rarityTier: 'common',    minLevel: 1 },
    { cacheType: 'boss_kill', rewardType: 'marker',    rewardValue: 'Claimed a trophy from a fallen guardian',      displayName: 'Guardian Trophy Marker',  weight: 80,  rarityTier: 'uncommon',  minLevel: 1 },
    { cacheType: 'boss_kill', rewardType: 'xp_boost',  rewardValue: '250',  displayName: 'Veil Fragment',           weight: 60,  rarityTier: 'rare',      minLevel: 2 },
    { cacheType: 'boss_kill', rewardType: 'marker',    rewardValue: 'Tore a rift in the boundary between realms',   displayName: 'Rift Marker',            weight: 25,  rarityTier: 'epic',      minLevel: 3 },
    { cacheType: 'boss_kill', rewardType: 'title',     rewardValue: 'title_veil_touched',    displayName: 'Veil Touched',     weight: 10,  rarityTier: 'epic',      minLevel: 3 },
    { cacheType: 'boss_kill', rewardType: 'title',     rewardValue: 'title_fate_weaver',     displayName: 'Fate Weaver',      weight: 3,   rarityTier: 'legendary', minLevel: 7 },

    // ── Milestone Cache Pool ────────────────────────────
    { cacheType: 'milestone', rewardType: 'xp_boost',  rewardValue: '200',  displayName: 'Mythic Ember',            weight: 120, rarityTier: 'uncommon',  minLevel: 1 },
    { cacheType: 'milestone', rewardType: 'marker',    rewardValue: 'Crossed a threshold that echoes through time', displayName: 'Threshold Marker',        weight: 60,  rarityTier: 'rare',     minLevel: 1 },
    { cacheType: 'milestone', rewardType: 'title',     rewardValue: 'title_mythic_aspirant', displayName: 'Mythic Aspirant',  weight: 15,  rarityTier: 'epic',     minLevel: 3 },
    { cacheType: 'milestone', rewardType: 'title',     rewardValue: 'title_legend_forged',   displayName: 'Legend Forged',    weight: 3,   rarityTier: 'legendary', minLevel: 8 },
  ];

  for (const entry of lootEntries) {
    await prisma.lootTable.upsert({
      where: { id: `loot-${entry.cacheType}-${entry.rewardValue.replace(/\s+/g, '-').substring(0, 30)}` },
      update: {},
      create: {
        id: `loot-${entry.cacheType}-${entry.rewardValue.replace(/\s+/g, '-').substring(0, 30)}`,
        ...entry,
      },
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
  ];

  for (const item of gearItems) {
    await prisma.gearItem.upsert({
      where: { id: item.id },
      update: {},
      create: item,
    });
  }
  console.log(`  ✓ ${gearItems.length} gear items`);

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
  ];

  for (const entry of gearLoot) {
    const id = `loot-${entry.cacheType}-gear-${entry.rewardValue}`;
    await prisma.lootTable.upsert({
      where: { id },
      update: {},
      create: { id, ...entry },
    });
  }
  console.log(`  ✓ ${gearLoot.length} gear loot entries`);

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
