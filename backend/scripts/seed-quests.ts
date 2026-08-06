// ============================================================
// Seed — Cadence Quest Catalog (Sprint 32)
//
// Idempotent: upserts by slug. Safe to re-run on any env; new
// quests and reward tweaks ship by editing this file and
// re-running `npm run seed:quests`.
//
// Coverage matrix — every shipped mechanic has a quest path:
//   Veil tears / battle   → daily_seal_tears, weekly_seals,
//                           weekly_deep_seals, story chains
//   Caches                → daily_cache, weekly_caches, forge prep
//   Hearth                → daily_hearth, story_first_hearth
//   Oath                  → daily_oath, story_first_oath
//   Veil Trial            → daily_trial, weekly_trials
//   Augury                → daily_augury, story_first_augury
//   Perfect ritual day    → daily_perfect, weekly_perfect_days
//   Lore Archive          → weekly_lore (plus tear/augury drops)
//   Restoration upgrades  → weekly_upgrade, story_first_upgrade
//   Fate leveling         → story_reach_l3 / _l5 / _l8
//   Chapters 1-3          → chapter_two / chapter_three chains
//   Forge works           → forge_works chain (tag: forge_work
//                           feeds Forge restoration levels)
//
// NOT yet incentivized (no backend event exists): gear equip,
// map travel distance, character customization. Add events
// first, then quests.
//
// XP values are alpha-tuning starting points, deliberately small
// next to activity XP (a tear pays 50-500, a chapter 1,000).
// ============================================================

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

type QuestSeed = {
  slug: string;
  name: string;
  description: string;
  cadence: 'daily' | 'weekly' | 'story';
  chainKey?: string;
  chainStep?: number;
  tag?: string;
  status?: 'active' | 'draft';
  minLevel?: number;
  sortOrder: number;
  objectives: Array<{
    id: string; type: string; label: string; target: number;
    tier_min?: number; rarity_min?: string; track?: string; chapter?: number;
  }>;
  rewards: {
    xp?: number; essence?: number; cache_rarity?: string; title_id?: string;
    materials?: Record<string, number>;   // 2026-07-10 restoration economy
  };
};

const QUESTS: QuestSeed[] = [
  // ── DAILY ─────────────────────────────────────────────────
  {
    slug: 'daily_seal_tears', name: 'Mend the Veil',
    description: 'The Veil frays every night. Walk out and seal two tears before it spreads.',
    cadence: 'daily', sortOrder: 10,
    objectives: [{ id: 'o1', type: 'seal_tears', label: 'Seal 2 Veil tears', target: 2 }],
    rewards: { xp: 40, essence: 5 },
  },
  {
    slug: 'daily_hearth', name: 'Keep the Flame',
    description: 'A Sanctum is built every day. Tend the hearth.',
    cadence: 'daily', sortOrder: 20,
    objectives: [{ id: 'o1', type: 'tend_hearth', label: 'Tend the Hearth', target: 1 }],
    rewards: { xp: 15 },
  },
  {
    slug: 'daily_oath', name: 'Word Given',
    description: 'Swear the day’s oath at the altar. The thread remembers what is promised.',
    cadence: 'daily', sortOrder: 30,
    objectives: [{ id: 'o1', type: 'swear_oath', label: 'Swear the daily Oath', target: 1 }],
    rewards: { xp: 15 },
  },
  {
    slug: 'daily_trial', name: 'The Rite of Purification',
    description: 'Corruption spread through the leylines overnight. Restore the flow before you ride out.',
    cadence: 'daily', sortOrder: 40,
    objectives: [{ id: 'o1', type: 'complete_trial', label: 'Perform the Rite of Purification', target: 1 }],
    rewards: { xp: 15 },
  },
  {
    slug: 'daily_augury', name: 'Consult the Cards',
    description: 'Three cards wait in the Library. Turn them and read what the day holds.',
    cadence: 'daily', sortOrder: 50,
    objectives: [{ id: 'o1', type: 'complete_augury', label: 'Complete an Augury reading', target: 1 }],
    rewards: { xp: 15 },
  },
  {
    slug: 'daily_cache', name: 'Unseal Fortune',
    description: 'A sealed cache is a question. Open one and have your answer.',
    cadence: 'daily', sortOrder: 60,
    objectives: [{ id: 'o1', type: 'open_caches', label: 'Open a Fate Cache', target: 1 }],
    rewards: { xp: 20 },
  },
  {
    slug: 'daily_perfect', name: 'A Perfect Day',
    description: 'Hearth, Oath, Trial, and Augury — all four rites in a single day.',
    cadence: 'daily', sortOrder: 70,
    objectives: [{ id: 'o1', type: 'ritual_days', label: 'Complete all four daily rituals', target: 1 }],
    rewards: { xp: 50, cache_rarity: 'uncommon' },
  },

  // ── FORGE WORKS (2026-08-04) ──────────────────────────────
  // The Forge restoration track counts CLAIMS of quests tagged
  // `forge_work` (sanctum.service validateNext). That plumbing has
  // existed since the track shipped and nothing ever fed it — no
  // tagged quest was ever written — so the Forge has been stuck at
  // level 1 for every hero since day one.
  //
  // ⚠ These are built on cache-opening, not crafting. The engine
  // knows a `craft_works` objective, but NOTHING emits a 'craft'
  // event yet, so a chain built on it would be just as dead. Caches
  // are the forge's raw stock (they drop veilglass/leywood/ore, which
  // restoration builds consume), so "prep the forge" is honest work
  // until the crafting mechanic lands. When it does, retarget these
  // to craft_works/smelt_works and keep the tag — the tag is the seam.
  //
  // Cadence sets the pace: a daily + a weekly is ~8 works a week, so
  // Forge 10 (36 works) lands in ~5 weeks, in step with the Library
  // and the Hearth rather than lagging them.
  {
    slug: 'daily_forge_work', name: 'Stock the Forge',
    description: 'The forge eats what the Veil gives up. Break open what you have carried home.',
    cadence: 'daily', sortOrder: 60, tag: 'forge_work',
    objectives: [{ id: 'o1', type: 'open_caches', label: 'Open 2 Fate Caches', target: 2 }],
    rewards: { xp: 40 },
  },
  {
    slug: 'weekly_forge_works', name: 'The Forge Remembers Work',
    description: 'A week of stock is what turns a cold forge warm.',
    cadence: 'weekly', sortOrder: 60, tag: 'forge_work',
    objectives: [{ id: 'o1', type: 'open_caches', label: 'Open 12 Fate Caches', target: 12 }],
    rewards: { xp: 220, materials: { ore: 1 } },
  },

  // ── WEEKLY ────────────────────────────────────────────────
  {
    slug: 'weekly_seals', name: 'Warden of the Weave',
    description: 'Hold your ground for a week — twelve tears sealed.',
    cadence: 'weekly', sortOrder: 10,
    objectives: [{ id: 'o1', type: 'seal_tears', label: 'Seal 12 Veil tears', target: 12 }],
    rewards: { xp: 200, cache_rarity: 'rare' },
  },
  {
    slug: 'weekly_deep_seals', name: 'Into the Deep Tears',
    description: 'The dormant ones run deeper and fight harder. Seal three of dormant strength or worse.',
    cadence: 'weekly', sortOrder: 20, minLevel: 6,
    objectives: [{ id: 'o1', type: 'seal_tears', label: 'Seal 3 Dormant or Double tears', target: 3, tier_min: 3 }],
    rewards: { xp: 250 },
  },
  {
    slug: 'weekly_lore', name: 'The Archive Grows',
    description: 'The Library restores itself one recovered page at a time.',
    cadence: 'weekly', sortOrder: 30,
    objectives: [{ id: 'o1', type: 'collect_lore', label: 'Recover 2 Lore Archive entries', target: 2 }],
    rewards: { xp: 150, essence: 20 },
  },
  {
    slug: 'weekly_trials', name: 'Steady Hands',
    description: 'Five rites, five dawns of practice. The leylines remember a careful hand.',
    cadence: 'weekly', sortOrder: 40,
    objectives: [{ id: 'o1', type: 'complete_trial', label: 'Perform 5 Rites of Purification', target: 5 }],
    rewards: { xp: 100 },
  },
  {
    slug: 'weekly_master_purifier', name: 'Master Purifier',
    description: 'Perfection is a habit. Earn five S-grade rites.',
    cadence: 'weekly', sortOrder: 42, minLevel: 4,
    objectives: [{ id: 'o1', type: 'rite_s_grades', label: 'Earn 5 S-grade Rites', target: 5 }],
    rewards: { xp: 300, cache_rarity: 'epic' },
  },
  {
    slug: 'weekly_perfect_harmony', name: 'Perfect Harmony',
    description: 'Total restoration — not a thread of corruption left. Three times.',
    cadence: 'weekly', sortOrder: 44, minLevel: 4,
    objectives: [{ id: 'o1', type: 'perfect_purity', label: 'Reach 100% Purity 3 times', target: 3 }],
    rewards: { xp: 350, essence: 40 },
  },
  {
    slug: 'weekly_leyline_guardian', name: 'Leyline Guardian',
    description: 'The network is long and the week is short. Walk all of it.',
    cadence: 'weekly', sortOrder: 46,
    objectives: [{ id: 'o1', type: 'purify_nodes', label: 'Purify 500 leyline nodes', target: 500 }],
    rewards: { xp: 200, essence: 25 },
  },
  {
    slug: 'weekly_cleanse_veil', name: 'Cleanse the Veil',
    description: 'What presses in by night, you burn away by day.',
    cadence: 'weekly', sortOrder: 48,
    objectives: [{ id: 'o1', type: 'cleanse_corruption', label: 'Remove 3,000 corruption', target: 3000 }],
    rewards: { xp: 250, cache_rarity: 'rare' },
  },
  {
    slug: 'weekly_perfect_days', name: 'Rhythm of the Keep',
    description: 'Four perfect ritual days in one week. This is what upkeep means.',
    cadence: 'weekly', sortOrder: 50,
    objectives: [{ id: 'o1', type: 'ritual_days', label: 'Complete 4 perfect ritual days', target: 4 }],
    rewards: { xp: 300, cache_rarity: 'epic', materials: { ore: 2 } },
  },
  {
    slug: 'weekly_caches', name: 'Seals Broken',
    description: 'Whatever the week brought you, open it.',
    cadence: 'weekly', sortOrder: 60,
    objectives: [{ id: 'o1', type: 'open_caches', label: 'Open 4 Fate Caches', target: 4 }],
    rewards: { xp: 120 },
  },
  {
    slug: 'weekly_upgrade', name: 'Restoration Work',
    description: 'Commit one restoration upgrade — the keep or any wing.',
    cadence: 'weekly', sortOrder: 70,
    objectives: [{ id: 'o1', type: 'upgrade_wings', label: 'Commit a restoration upgrade', target: 1 }],
    rewards: { xp: 150, materials: { ore: 2 } },
  },

  // ── STORY — Chapter I: The Remembering (Quest_Chpt1-5 v1.0) ──
  // The awakening trail IS Chapter I now (2026-07-10): one chain,
  // one story, matching the Sanctum's awakening beats. Old trail
  // slugs are reused so existing heroes keep their claimed steps.
  // Judgment calls vs the doc: Q6+Q7 merged into one seal quest;
  // 'Home Again' rests at the Hearth; the cache beat stays (loot
  // dopamine + forge-prep economy); titles deferred (no catalog).
  {
    slug: 'story_ch1_cinematic', name: 'The Remembering',
    description: 'Darkness. A hand reaching. You are known to me — remember.',
    cadence: 'story', chainKey: 'chapter_one', chainStep: 1, sortOrder: 5,
    objectives: [{ id: 'o1', type: 'complete_chapter', label: 'Witness the Remembering', target: 1, chapter: 1 }],
    rewards: { xp: 60 },
  },
  {
    slug: 'story_first_trial', name: 'An Ember Remains',
    description: 'The Sanctum remembers its Keeper. The Veilfire is cold — kneel, and light it.',
    cadence: 'story', chainKey: 'chapter_one', chainStep: 2, sortOrder: 10,
    objectives: [{ id: 'o1', type: 'complete_trial', label: 'Perform your first Rite of Purification', target: 1 }],
    rewards: { xp: 75, essence: 100 },
  },
  {
    slug: 'story_first_augury', name: 'Echoes of Memory',
    description: 'Knowledge alone cannot defend this world — but it is where defense begins. The cards wait in the Library.',
    cadence: 'story', chainKey: 'chapter_one', chainStep: 3, sortOrder: 20,
    objectives: [{ id: 'o1', type: 'complete_augury', label: 'Complete your first Augury reading', target: 1 }],
    rewards: { xp: 75, title_id: 'title_awakened' },
  },
  {
    slug: 'story_first_oath', name: 'The First Oath',
    description: 'Every Hero begins with an oath. Stand at the altar and choose what you serve.',
    cadence: 'story', chainKey: 'chapter_one', chainStep: 4, sortOrder: 30,
    objectives: [{ id: 'o1', type: 'swear_oath', label: 'Swear your first Oath', target: 1 }],
    rewards: { xp: 75 },
  },
  {
    slug: 'story_ch1_equip', name: 'Arms of the Covenant',
    description: 'Steel serves only those who carry purpose. Take up arms.',
    cadence: 'story', chainKey: 'chapter_one', chainStep: 5, sortOrder: 40,
    objectives: [{ id: 'o1', type: 'equip_gear', label: 'Equip your first piece of gear', target: 1 }],
    rewards: { xp: 100, materials: { veilglass: 2, leywood: 1 } },
  },
  {
    slug: 'story_first_seal', name: 'Into the Veil',
    description: 'A Tear has formed. Left unattended, more will follow — close it.',
    cadence: 'story', chainKey: 'chapter_one', chainStep: 6, sortOrder: 50,
    objectives: [{ id: 'o1', type: 'seal_tears', label: 'Seal your first Veil tear', target: 1 }],
    rewards: { xp: 150, essence: 25 },
  },
  {
    slug: 'story_first_cache', name: 'What the Veil Left',
    description: 'One Tear has closed. Something sealed and humming remains — it belongs to you now.',
    cadence: 'story', chainKey: 'chapter_one', chainStep: 7, sortOrder: 60,
    objectives: [{ id: 'o1', type: 'open_caches', label: 'Open your first Fate Cache', target: 1 }],
    rewards: { xp: 100 },
  },
  {
    slug: 'story_first_hearth', name: 'Home Again',
    description: 'The Sanctum endures because Heroes answer its call. Rest — tomorrow, the Veil will open again.',
    cadence: 'story', chainKey: 'chapter_one', chainStep: 8, sortOrder: 70,
    objectives: [{ id: 'o1', type: 'tend_hearth', label: 'Tend the Hearth', target: 1 }],
    rewards: { xp: 150, cache_rarity: 'uncommon' },
  },

  // ── STORY — Chapter II: The Gathering Storm ─────────────────
  // One Tear was never the danger. It was the warning. Doc's
  // stamina (Q4) and weapon-upgrade (Q5) reference unbuilt systems
  // — substituted with the restoration build (stewardship) and
  // lore recovery; revisit when those systems ship.
  {
    slug: 'story_reach_l3', name: 'The First Echo',
    description: 'Every victory leaves its mark. Heroes do not seek power — they become worthy of it.',
    cadence: 'story', chainKey: 'chapter_two', chainStep: 1, minLevel: 3, sortOrder: 110,
    // reach_level completes lazily: whatever gameplay event fires
    // next after the hero crosses L3 (a banish, a seal, a ritual)
    // carries the FULFILLED update — see matchEvent in
    // quest-log.service.ts.
    objectives: [{ id: 'o1', type: 'reach_level', label: 'Reach Fate Level 3', target: 3 }],
    rewards: { xp: 100 },
  },
  {
    slug: 'story_ch2_seals', name: 'Echoes Across the Realm',
    description: 'A road is safe again. A caravan reaches shelter. A family survives the night — because you walked out.',
    cadence: 'story', chainKey: 'chapter_two', chainStep: 2, minLevel: 3, sortOrder: 120,
    objectives: [{ id: 'o1', type: 'seal_tears', label: 'Seal 3 Veil tears', target: 3 }],
    rewards: { xp: 150, essence: 30 },
  },
  {
    slug: 'story_ch2_rarity', name: 'Veil Patterns',
    description: 'Not every wound in the world is equal. Some Tears are shallow. Others reach deeper.',
    cadence: 'story', chainKey: 'chapter_two', chainStep: 3, minLevel: 3, sortOrder: 130,
    objectives: [{ id: 'o1', type: 'seal_tears', label: 'Seal 2 Wander-or-deeper tears', target: 2, tier_min: 2 }],
    rewards: { xp: 150, materials: { veilglass: 3 } },
  },
  {
    slug: 'story_first_upgrade', name: 'Stone Upon Stone',
    description: 'The Sanctum does not stand because of stone. Still — raise the stone.',
    cadence: 'story', chainKey: 'chapter_two', chainStep: 4, minLevel: 3, sortOrder: 140,
    objectives: [{ id: 'o1', type: 'upgrade_wings', label: 'Complete a restoration build', target: 1 }],
    rewards: { xp: 150, materials: { ore: 1 } },
  },
  {
    slug: 'story_ch2_lore', name: 'A World Worth Saving',
    description: 'The roads hold. Farms endure. Lanterns burn again in village windows. Recover the record of it.',
    cadence: 'story', chainKey: 'chapter_two', chainStep: 5, minLevel: 3, sortOrder: 150,
    objectives: [{ id: 'o1', type: 'collect_lore', label: 'Recover a Lore Archive entry', target: 1 }],
    rewards: { xp: 100 },
  },
  {
    slug: 'story_ch2_elite', name: 'Darkness Responds',
    description: 'The Veil has felt your resistance. Now it answers.',
    cadence: 'story', chainKey: 'chapter_two', chainStep: 6, minLevel: 3, sortOrder: 160,
    objectives: [{ id: 'o1', type: 'seal_tears', label: 'Seal a Dormant-or-deeper tear', target: 1, tier_min: 3 }],
    rewards: { xp: 200, cache_rarity: 'rare' },
  },
  {
    slug: 'story_ch2', name: 'The Gathering Storm',
    description: 'One Tear was a warning. Three were a pattern. The Elite was an answer. The Veil is not merely breaking — it is listening.',
    cadence: 'story', chainKey: 'chapter_two', chainStep: 7, minLevel: 3, sortOrder: 170,
    objectives: [{ id: 'o1', type: 'complete_chapter', label: 'Read the closing Chronicle of Chapter II', target: 1, chapter: 2 }],
    rewards: { xp: 200, essence: 50, title_id: 'title_tearwarden' },
  },

  // ── STORY — Chapters III–V (DRAFT until their systems ship) ──
  // III Echoes of the Fallen → Hero Echo system (design now exists
  //     in Quest_Chpt1-5; HeroEchoScreen is a scaffold).
  // IV  The Hero's Path → Virtue tracks (unbuilt).
  // V   Chronicles of Elysendar → Library collections (partial).
  // Draft = invisible server-side; the client shows their locked
  // chapter headers. Flip each to active as its system lands.
  {
    slug: 'story_ch3', name: 'Voices Within the Codex',
    description: 'Not every Hero passed beyond remembrance. Some remain. Listen.',
    cadence: 'story', chainKey: 'chapter_three', chainStep: 1,
    status: 'draft', minLevel: 8, sortOrder: 210,
    objectives: [{ id: 'o1', type: 'hero_echo', label: 'Witness your first Hero Echo', target: 1 }],
    rewards: { xp: 250 },
  },
  {
    slug: 'story_ch3_hall', name: 'The Hall Remembers',
    description: 'Portraits. Names. Homelands. Deeds. The Hall of Heroes keeps what the Veil could not take.',
    cadence: 'story', chainKey: 'chapter_three', chainStep: 2,
    status: 'draft', minLevel: 8, sortOrder: 220,
    objectives: [{ id: 'o1', type: 'hero_echo', label: 'Recover 2 more Hero Echoes', target: 2 }],
    rewards: { xp: 250 },
  },
  {
    slug: 'story_ch3_legacy', name: 'Echoes of the Fallen',
    description: 'Kingdoms endure because Heroes stood. Heroes endure because they are remembered.',
    cadence: 'story', chainKey: 'chapter_three', chainStep: 3,
    status: 'draft', minLevel: 8, sortOrder: 230,
    objectives: [{ id: 'o1', type: 'complete_chapter', label: 'Read the restored Chronicle', target: 1, chapter: 3 }],
    rewards: { xp: 300, cache_rarity: 'rare' },
  },
  {
    slug: 'story_ch4_path', name: 'The Measure of a Hero',
    description: 'Steel wins battles. Character wins ages.',
    cadence: 'story', chainKey: 'chapter_four', chainStep: 1,
    status: 'draft', minLevel: 12, sortOrder: 310,
    objectives: [{ id: 'o1', type: 'virtue_focus', label: 'Choose your first Virtue Focus', target: 1 }],
    rewards: { xp: 300 },
  },
  {
    slug: 'story_ch4_final', name: 'The Hero\'s Path',
    description: 'Heroes are not remembered because destiny chose them — but because, day after day, they chose the harder path.',
    cadence: 'story', chainKey: 'chapter_four', chainStep: 2,
    status: 'draft', minLevel: 12, sortOrder: 320,
    objectives: [{ id: 'o1', type: 'complete_chapter', label: 'Read the closing Chronicle', target: 1, chapter: 4 }],
    rewards: { xp: 350, cache_rarity: 'epic' },
  },
  {
    slug: 'story_ch5_realms', name: 'The Four Great Realms',
    description: 'Kingvale. The Wylds. The Origin Sands. Lochmaw. To defend Elysendar, one must first know it.',
    cadence: 'story', chainKey: 'chapter_five', chainStep: 1,
    status: 'draft', minLevel: 16, sortOrder: 410,
    objectives: [{ id: 'o1', type: 'collect_lore', label: 'Recover 4 Regional Chronicles', target: 4 }],
    rewards: { xp: 400 },
  },
  {
    slug: 'story_ch5_final', name: 'The Ancient Name',
    description: 'Kingdoms rose. Kingdoms fell. Heroes came and passed. Yet throughout every age, one name endured.',
    cadence: 'story', chainKey: 'chapter_five', chainStep: 2,
    status: 'draft', minLevel: 16, sortOrder: 420,
    objectives: [{ id: 'o1', type: 'complete_chapter', label: 'Read the final Chronicle', target: 1, chapter: 5 }],
    rewards: { xp: 500, cache_rarity: 'epic', materials: { ore: 3 } },
  },

  // Tombstones — superseded pre-doc entries retire as drafts so
  // existing rows deactivate on reseed (upsert never deletes).
  {
    slug: 'story_reach_l5', name: 'The Forge Stirs',
    description: '(superseded by Chapter II)',
    cadence: 'story', chainKey: 'legacy_retired', chainStep: 1,
    status: 'draft', sortOrder: 900,
    objectives: [{ id: 'o1', type: 'reach_level', label: 'Reach Fate Level 5', target: 5 }],
    rewards: { xp: 150 },
  },
  {
    slug: 'story_ch2_l5', name: 'The Forge Stirs',
    description: '(superseded by Chapter II)',
    cadence: 'story', chainKey: 'legacy_retired', chainStep: 2,
    status: 'draft', sortOrder: 901,
    objectives: [{ id: 'o1', type: 'reach_level', label: 'Reach Fate Level 5', target: 5 }],
    rewards: { xp: 150 },
  },
  {
    slug: 'story_ch3_dormant', name: 'Where It Runs Deepest',
    description: '(superseded by Chapter II)',
    cadence: 'story', chainKey: 'legacy_retired', chainStep: 3,
    status: 'draft', sortOrder: 902,
    objectives: [{ id: 'o1', type: 'seal_tears', label: 'Seal 2 Dormant tears', target: 2, tier_min: 3 }],
    rewards: { xp: 200 },
  },
  {
    slug: 'story_ch3_l8', name: 'A Name Spoken Twice',
    description: '(superseded by Chapter II)',
    cadence: 'story', chainKey: 'legacy_retired', chainStep: 4,
    status: 'draft', sortOrder: 903,
    objectives: [{ id: 'o1', type: 'reach_level', label: 'Reach Fate Level 8', target: 8 }],
    rewards: { xp: 250 },
  },
  {
    slug: 'story_reach_l8', name: 'A Name Spoken Twice',
    description: '(superseded)',
    cadence: 'story', chainKey: 'legacy_retired', chainStep: 5,
    status: 'draft', sortOrder: 904,
    objectives: [{ id: 'o1', type: 'reach_level', label: 'Reach Fate Level 8', target: 8 }],
    rewards: { xp: 250 },
  },

  // ── STORY — The Silent Witness (Fate Fox, L50) ──────────────
  // No popup, no fanfare: at 50 the chain simply appears, and the
  // Sanctum is wrong. Beats fire from /api/fox endpoints; the
  // Calling and the bond are quests IV and V.
  {
    slug: 'fox_echoes', name: 'Echoes in the Dark',
    description: 'The Veilfire burned silent last night. Something crossed the courtyard without touching the ground.',
    cadence: 'story', chainKey: 'silent_witness', chainStep: 1,
    minLevel: 50, sortOrder: 410,
    objectives: [{ id: 'o1', type: 'fox_investigate', label: 'Investigate the presence in the Sanctum', target: 1 }],
    rewards: { xp: 300 },
  },
  {
    slug: 'fox_footsteps', name: 'Footsteps Unseen',
    description: 'Golden prints, gone when you kneel to them. They leave the Sanctum walking — patient, unhurried, certain you will follow.',
    cadence: 'story', chainKey: 'silent_witness', chainStep: 2,
    minLevel: 50, sortOrder: 420,
    objectives: [{ id: 'o1', type: 'fox_follow', label: 'Follow the golden footprints', target: 1 }],
    rewards: { xp: 300 },
  },
  {
    slug: 'fox_shrine', name: 'The Forgotten Shrine',
    description: 'Broken statues. Fox carvings older than the keep. A dormant altar that remembers being tended.',
    cadence: 'story', chainKey: 'silent_witness', chainStep: 3,
    minLevel: 50, sortOrder: 430,
    objectives: [{ id: 'o1', type: 'fox_shrine', label: 'Restore the Shrine of First Companions', target: 1 }],
    rewards: { xp: 400 },
  },
  {
    slug: 'fox_calling', name: 'The Calling',
    description: 'The shrine does not ask questions. It shows you memories — and simply watches what you do.',
    cadence: 'story', chainKey: 'silent_witness', chainStep: 4,
    minLevel: 50, sortOrder: 440,
    objectives: [{ id: 'o1', type: 'fox_calling', label: 'Answer the shrine’s memories', target: 1 }],
    rewards: { xp: 400 },
  },
  {
    slug: 'fox_bond', name: 'Into the Veil',
    description: 'No enemies. No sound. Just stars, fog, and the eyes that have watched since your first step.',
    cadence: 'story', chainKey: 'silent_witness', chainStep: 5,
    minLevel: 50, sortOrder: 450,
    objectives: [{ id: 'o1', type: 'fox_bond', label: 'Meet what has always walked beside you', target: 1 }],
    rewards: { xp: 500, cache_rarity: 'epic' },
  },

  // ── VEIL FAUNA (2026-07-10) — active since the chase client
  // shipped (2026-07-09). The ledger rows are visible to everyone;
  // the ENCOUNTER surface is what the veil_fauna flag gates, so a
  // flag-off channel sees the quest but walks to a map without
  // fauna. Flip the flag per channel, not these rows.
  {
    slug: 'daily_fauna', name: 'What Slipped Through',
    description: 'Escaped creatures wander near the tears. Send two back.',
    cadence: 'daily', status: 'active', sortOrder: 80,
    objectives: [{ id: 'o1', type: 'banish_fauna', label: 'Banish 2 escaped creatures', target: 2 }],
    rewards: { xp: 25 },
  },
  {
    slug: 'weekly_fauna', name: 'Warden of the Small Things',
    description: 'The rifts leak more than shadow. A week of diligence: ten creatures banished.',
    cadence: 'weekly', status: 'active', sortOrder: 80,
    objectives: [{ id: 'o1', type: 'banish_fauna', label: 'Banish 10 escaped creatures', target: 10 }],
    rewards: { xp: 150, materials: { veilglass: 3 } },
  },

  // ── LEGACY DEVELOPMENT (2026-07-30) — training feeds the ledger.
  // The rites/activities already pay discipline + attribute XP at
  // the source; these rows pay Fate XP for showing up. "The Hero
  // you become outside the game shapes the Hero you become within."
  {
    slug: 'daily_training', name: 'Tend the Lives',
    description: 'Body, mind, or stillness — complete two of the day\'s rites.',
    cadence: 'daily', status: 'active', sortOrder: 85,
    objectives: [{ id: 'o1', type: 'complete_rites', label: 'Complete 2 daily rites', target: 2 }],
    rewards: { xp: 30 },
  },
  {
    slug: 'weekly_training_rites', name: 'The Lived Week',
    description: 'Ten rites kept across the week. The record only means what you put into it.',
    cadence: 'weekly', status: 'active', sortOrder: 85,
    objectives: [{ id: 'o1', type: 'complete_rites', label: 'Complete 10 daily rites', target: 10 }],
    rewards: { xp: 200, cache_rarity: 'uncommon' },
  },
  {
    slug: 'weekly_training_logs', name: 'Field Notes',
    description: 'Beyond the rites: log five practices of your own choosing this week.',
    cadence: 'weekly', status: 'active', sortOrder: 86,
    objectives: [{ id: 'o1', type: 'log_training', label: 'Log 5 activities', target: 5 }],
    rewards: { xp: 150 },
  },
];

async function main() {
  let created = 0, updated = 0;
  for (const q of QUESTS) {
    const data = {
      name: q.name,
      description: q.description,
      questType: 'cadence', // never 'veil*' — that prefix auto-enrolls via the legacy veil board
      cadence: q.cadence,
      chainKey: q.chainKey ?? null,
      chainStep: q.chainStep ?? null,
      tag: q.tag ?? null,
      objectives: q.objectives as unknown as Prisma.InputJsonValue,
      rewards: q.rewards as unknown as Prisma.InputJsonValue,
      minLevel: q.minLevel ?? 1,
      sortOrder: q.sortOrder,
      status: q.status ?? 'active',
    };
    const existing = await prisma.questTemplate.findUnique({ where: { slug: q.slug } });
    if (existing) {
      await prisma.questTemplate.update({ where: { slug: q.slug }, data });
      updated++;
    } else {
      await prisma.questTemplate.create({ data: { slug: q.slug, ...data } });
      created++;
    }
  }
  console.log(`Quest catalog seeded: ${created} created, ${updated} updated, ${QUESTS.length} total.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
