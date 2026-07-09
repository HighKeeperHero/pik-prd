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
  rewards: { xp?: number; essence?: number; cache_rarity?: string; title_id?: string };
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
    rewards: { xp: 300, cache_rarity: 'epic' },
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
    rewards: { xp: 150 },
  },

  // ── STORY — the Awakening Trail (post-Chapter-1 onboarding) ──
  {
    slug: 'story_first_seal', name: 'The First Mending',
    description: 'You have seen what the Veil does when it opens. Close one.',
    cadence: 'story', chainKey: 'awakening_trail', chainStep: 1, sortOrder: 10,
    objectives: [{ id: 'o1', type: 'seal_tears', label: 'Seal your first Veil tear', target: 1 }],
    rewards: { xp: 100 },
  },
  {
    slug: 'story_first_hearth', name: 'Smoke Rising',
    description: 'Your Sanctum stands, but it is cold. Light it.',
    cadence: 'story', chainKey: 'awakening_trail', chainStep: 2, sortOrder: 20,
    objectives: [{ id: 'o1', type: 'tend_hearth', label: 'Tend the Hearth for the first time', target: 1 }],
    rewards: { xp: 50, essence: 10 },
  },
  {
    slug: 'story_first_oath', name: 'The Words That Bind',
    description: 'Stand at the altar and choose what you serve today.',
    cadence: 'story', chainKey: 'awakening_trail', chainStep: 3, sortOrder: 30,
    objectives: [{ id: 'o1', type: 'swear_oath', label: 'Swear your first Oath', target: 1 }],
    rewards: { xp: 50 },
  },
  {
    slug: 'story_first_trial', name: 'The First Rite',
    description: 'The leylines dimmed overnight. Kneel at the Veilfire and restore them.',
    cadence: 'story', chainKey: 'awakening_trail', chainStep: 4, sortOrder: 40,
    objectives: [{ id: 'o1', type: 'complete_trial', label: 'Perform your first Rite of Purification', target: 1 }],
    rewards: { xp: 50 },
  },
  {
    slug: 'story_first_augury', name: 'Three Cards Turned',
    description: 'In the Library, the Oracular waits with the day’s spread.',
    cadence: 'story', chainKey: 'awakening_trail', chainStep: 5, sortOrder: 50,
    objectives: [{ id: 'o1', type: 'complete_augury', label: 'Complete your first Augury reading', target: 1 }],
    rewards: { xp: 50 },
  },
  {
    slug: 'story_first_cache', name: 'What the Veil Left',
    description: 'Sealed and humming. It belongs to you now — open it.',
    cadence: 'story', chainKey: 'awakening_trail', chainStep: 6, sortOrder: 60,
    objectives: [{ id: 'o1', type: 'open_caches', label: 'Open your first Fate Cache', target: 1 }],
    rewards: { xp: 75 },
  },
  {
    slug: 'story_reach_l3', name: 'A Thread Lengthens',
    description: 'The world is beginning to know your name. Reach Fate Level 3.',
    cadence: 'story', chainKey: 'awakening_trail', chainStep: 7, sortOrder: 70,
    objectives: [{ id: 'o1', type: 'reach_level', label: 'Reach Fate Level 3', target: 3 }],
    rewards: { xp: 100 },
  },
  {
    slug: 'story_first_upgrade', name: 'Stone Upon Stone',
    description: 'Enough rites are banked to raise the keep. Commit your first restoration upgrade.',
    cadence: 'story', chainKey: 'awakening_trail', chainStep: 8, sortOrder: 80,
    objectives: [{ id: 'o1', type: 'upgrade_wings', label: 'Commit a restoration upgrade', target: 1 }],
    rewards: { xp: 150, cache_rarity: 'uncommon' },
  },

  // ── STORY — Chapter II chain (activates when Ch.2 ships) ────
  {
    slug: 'story_ch2', name: 'Chapter II',
    description: 'The story continues. Read Chapter II of the Awakening.',
    cadence: 'story', chainKey: 'chapter_two', chainStep: 1, sortOrder: 110,
    objectives: [{ id: 'o1', type: 'complete_chapter', label: 'Complete Chapter II', target: 1, chapter: 2 }],
    rewards: { xp: 200 },
  },
  {
    slug: 'story_ch2_seals', name: 'Proof of Resolve',
    description: 'What the chapter asked of you, the world now demands. Five tears.',
    cadence: 'story', chainKey: 'chapter_two', chainStep: 2, sortOrder: 120,
    objectives: [{ id: 'o1', type: 'seal_tears', label: 'Seal 5 Veil tears', target: 5 }],
    rewards: { xp: 150 },
  },
  {
    slug: 'story_ch2_l5', name: 'The Forge Stirs',
    description: 'At the fifth level of Fate, something sealed in your Sanctum wakes.',
    cadence: 'story', chainKey: 'chapter_two', chainStep: 3, sortOrder: 130,
    objectives: [{ id: 'o1', type: 'reach_level', label: 'Reach Fate Level 5', target: 5 }],
    rewards: { xp: 200, cache_rarity: 'rare' },
  },

  // ── STORY — Chapter III chain (activates when Ch.3 ships) ───
  {
    slug: 'story_ch3', name: 'Chapter III',
    description: 'The story deepens. Read Chapter III of the Awakening.',
    cadence: 'story', chainKey: 'chapter_three', chainStep: 1, sortOrder: 210,
    objectives: [{ id: 'o1', type: 'complete_chapter', label: 'Complete Chapter III', target: 1, chapter: 3 }],
    rewards: { xp: 200 },
  },
  {
    slug: 'story_ch3_dormant', name: 'Where It Runs Deepest',
    description: 'Find a dormant tear — the old kind — and seal it.',
    cadence: 'story', chainKey: 'chapter_three', chainStep: 2, sortOrder: 220,
    objectives: [{ id: 'o1', type: 'seal_tears', label: 'Seal a Dormant or Double tear', target: 1, tier_min: 3 }],
    rewards: { xp: 250 },
  },
  {
    slug: 'story_ch3_l8', name: 'A Name Spoken Twice',
    description: 'Reach Fate Level 8. The barrow-keepers are starting to say it.',
    cadence: 'story', chainKey: 'chapter_three', chainStep: 3, sortOrder: 230,
    objectives: [{ id: 'o1', type: 'reach_level', label: 'Reach Fate Level 8', target: 8 }],
    rewards: { xp: 300, cache_rarity: 'rare' },
  },

  // ── FORGE WORKS — feed Forge restoration (tag: forge_work) ──
  // Two ACTIVE preparation works so the Forge can advance during
  // alpha (to L3) before Crafting/Smelting mechanics ship. The
  // real craft/smelt works are seeded as DRAFTS — flip to active
  // when those mechanics land.
  {
    slug: 'forge_prep_fuel', name: 'Feed the Forge',
    description: 'A cold forge wants fuel. Open three caches and set their residue aside.',
    cadence: 'story', chainKey: 'forge_works', chainStep: 1, tag: 'forge_work',
    minLevel: 5, sortOrder: 310,
    objectives: [{ id: 'o1', type: 'open_caches', label: 'Open 3 Fate Caches', target: 3 }],
    rewards: { xp: 100 },
  },
  {
    slug: 'forge_prep_coals', name: 'Stoke the Coals',
    description: 'The forge answers a kept house. Two perfect ritual days.',
    cadence: 'story', chainKey: 'forge_works', chainStep: 2, tag: 'forge_work',
    minLevel: 5, sortOrder: 320,
    objectives: [{ id: 'o1', type: 'ritual_days', label: 'Complete 2 perfect ritual days', target: 2 }],
    rewards: { xp: 150 },
  },
  {
    slug: 'forge_work_smelt_1', name: 'First Pour',
    description: 'Smelt raw Veil residue into a usable ingot.',
    cadence: 'story', chainKey: 'forge_works', chainStep: 3, tag: 'forge_work',
    status: 'draft', minLevel: 5, sortOrder: 330,
    objectives: [{ id: 'o1', type: 'smelt_works', label: 'Complete a smelting work', target: 1 }],
    rewards: { xp: 150 },
  },
  {
    slug: 'forge_work_craft_1', name: 'Maker’s Mark',
    description: 'Craft your first piece at the Veil Forge.',
    cadence: 'story', chainKey: 'forge_works', chainStep: 4, tag: 'forge_work',
    status: 'draft', minLevel: 5, sortOrder: 340,
    objectives: [{ id: 'o1', type: 'craft_works', label: 'Complete a crafting work', target: 1 }],
    rewards: { xp: 200, cache_rarity: 'rare' },
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
