// ============================================================
// HEP Phase 2 Slice 1 — seed canonical experiences
//
// Partners configure experiences; Heroes authors them. This script is
// where the authoring lives until the Experience Studio (P4) exists.
//
// Idempotent — upserts by slug, safe to run on every deploy.
//
// Usage:
//   npx ts-node scripts/seed-experiences.ts
//   npx ts-node scripts/seed-experiences.ts --assign <source_id>
//
// The reward numbers here are a STARTING ANCHOR, not a decision. They
// live in the DB precisely so calibration never needs a deploy — edit
// the row, not this file, once live data exists.
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** The one MVP experience from the Phase 2 brief. */
const ECHOES_OF_KINGVALE = {
  slug: 'echoes_of_kingvale',
  name: 'Echoes of Kingvale',
  description:
    'A Hero Echo stirs beneath Kingvale. Seal the rift before the hour turns.',
  version: 1,
  minPlayers: 2,
  maxPlayers: 6,
  targetDurationSec: 20 * 60,
  rewards: {
    // ~half a day's committed income (~1,000 XP/day) for ~20 minutes.
    xp: 600,
    essence: 50,
    caches: [{ type: 'venue_run', rarity: 'uncommon' }],
    titles: ['title_kingvale_echo'],
    scaling: {
      milestoneBonusEach: 0.05,
      milestoneBonusCap: 0.2,
      timeoutMultiplier: 0.5,
      abandonedMultiplier: 0,
      discreteRewardMinMultiplier: 1.0,
    },
  },
};

/** Titles referenced by experience bundles must exist in the reference table. */
const TITLES = [
  {
    id: 'title_kingvale_echo',
    displayName: 'ECHO OF KINGVALE',
    category: 'venue',
    description: 'Completed Echoes of Kingvale at a Heroes partner venue',
  },
];

async function main() {
  // The config API refuses to create keys ("Only pre-existing keys can be
  // updated"), so the calibration dial must be seeded before anyone can turn
  // it. Without this, retuning payouts is impossible in a running
  // environment — which would defeat the whole point of keeping rewards in
  // data rather than code.
  await prisma.config.upsert({
    where: { key: 'venue.reward_multiplier' },
    create: {
      key: 'venue.reward_multiplier',
      value: '1',
      description:
        'Global multiplier applied to every venue experience payout. 1 = as authored.',
    },
    update: {}, // never clobber a live calibration on re-seed
  });
  console.log('  config ✓ venue.reward_multiplier');

  for (const t of TITLES) {
    await prisma.title.upsert({
      where: { id: t.id },
      create: t,
      update: { displayName: t.displayName, description: t.description },
    });
    console.log(`  title  ✓ ${t.id}`);
  }

  const exp = await prisma.experience.upsert({
    where: { slug: ECHOES_OF_KINGVALE.slug },
    create: ECHOES_OF_KINGVALE as never,
    // Reward tuning is intentionally NOT overwritten on re-seed — once an
    // experience is live, the DB row is the source of truth and a deploy
    // must never silently revert a calibration.
    update: {
      name: ECHOES_OF_KINGVALE.name,
      description: ECHOES_OF_KINGVALE.description,
      minPlayers: ECHOES_OF_KINGVALE.minPlayers,
      maxPlayers: ECHOES_OF_KINGVALE.maxPlayers,
      targetDurationSec: ECHOES_OF_KINGVALE.targetDurationSec,
    },
  });
  console.log(`  exp    ✓ ${exp.slug} v${exp.version} (${exp.id})`);

  const assignIdx = process.argv.indexOf('--assign');
  if (assignIdx !== -1) {
    const sourceId = process.argv[assignIdx + 1];
    if (!sourceId) {
      console.error('--assign requires a source_id');
      process.exit(2);
    }
    const source = await prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) {
      console.error(`Unknown source: ${sourceId}`);
      process.exit(1);
    }
    await prisma.venueExperience.upsert({
      where: {
        sourceId_experienceId: { sourceId, experienceId: exp.id },
      },
      create: { sourceId, experienceId: exp.id, enabled: true },
      update: { enabled: true },
    });
    console.log(`  assign ✓ ${exp.slug} → ${sourceId}`);
  }

  console.log('\nExperiences seeded.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
