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

import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { MANIFEST_SCHEMA_VERSION, validateManifest } from '../src/spatial/manifest';

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
      // Seeded explicitly even though resolveScaling() would default it:
      // a key absent from the JSON is a dial nobody knows they can turn.
      trackingLostBase: 0.75,
      discreteRewardMinMultiplier: 1.0,
    },
  },
};

/**
 * The Nov 1 Field Deploy demonstrator (Heroes Field Deploy Developer Kit).
 *
 * Deliberately NOT a second venue experience — it is the portable one an
 * operator deploys into an unfamiliar room in 5-15 minutes. Short, solo,
 * and it exists in this file for one reason: kit GATE 3 requires the
 * encounter to run "from template data, not hard-coded scene
 * coordinates", and a manifest in the database is the only version of
 * that claim nobody can quietly walk back inside a Unity scene.
 *
 * The manifest itself lives in docs/hep/manifests/ so the field team and
 * the seeded row cannot drift — it is read, not duplicated.
 */
const VEIL_BREACH_PORTABLE = {
  slug: 'veil_breach_portable',
  name: 'Veil Breach — Portable',
  description:
    'A tear opens in an unfamiliar room. Follow the Fate Fox, wake the rune, take the relic, seal the breach.',
  version: 1,
  minPlayers: 1,
  maxPlayers: 1,
  targetDurationSec: 4 * 60,
  rewards: {
    // A 2-4 minute demo, so a demo-sized payout. Sized against the
    // 20-minute Kingvale bundle rather than invented: same curve, less of
    // it. Retune in the DB, never here.
    xp: 120,
    essence: 10,
    caches: [],
    titles: [],
    scaling: {
      milestoneBonusEach: 0.05,
      milestoneBonusCap: 0.2,
      timeoutMultiplier: 0.5,
      abandonedMultiplier: 0,
      trackingLostBase: 0.75,
      discreteRewardMinMultiplier: 1.0,
    },
  },
};

/** Read the field manifest from its canonical file, refusing to seed a bad one. */
function loadVeilBreachManifest() {
  const path = join(
    __dirname,
    '..',
    '..',
    'docs',
    'hep',
    'manifests',
    'veil-breach-portable.v1.json',
  );
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  const issues = validateManifest(manifest);
  if (issues.length) {
    // Seeding an invalid manifest would put a room-publish failure weeks
    // downstream of the edit that caused it, in a venue, in front of a
    // prospect. Fail here instead.
    console.error('  manifest ✗ veil-breach-portable.v1.json is invalid:');
    for (const i of issues) console.error(`      ${i.path}: ${i.message}`);
    process.exit(1);
  }
  return manifest;
}

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

  // Same trap as the multiplier above: the config API refuses to CREATE
  // keys, so an unseeded ceiling cannot be lowered — it silently falls
  // back to the code default and the circuit breaker looks armed while
  // being untunable. Caught by testing the breaker rather than trusting it.
  await prisma.config.upsert({
    where: { key: 'venue.daily_xp_ceiling' },
    create: {
      key: 'venue.daily_xp_ceiling',
      value: '250000',
      description:
        'Max Fate XP one venue may grant in a rolling 24h. Circuit breaker against a leaked key or a looping integration.',
    },
    update: {}, // never clobber a live setting on re-seed
  });
  console.log('  config ✓ venue.daily_xp_ceiling');

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

  const veilManifest = loadVeilBreachManifest();
  const veil = await prisma.experience.upsert({
    where: { slug: VEIL_BREACH_PORTABLE.slug },
    create: {
      ...VEIL_BREACH_PORTABLE,
      manifest: veilManifest,
      manifestSchemaVersion: MANIFEST_SCHEMA_VERSION,
    } as never,
    // Rewards are left alone on re-seed for the same reason as Kingvale.
    // The MANIFEST is not: it is authored content under version control,
    // and the file is the source of truth for it.
    update: {
      name: VEIL_BREACH_PORTABLE.name,
      description: VEIL_BREACH_PORTABLE.description,
      minPlayers: VEIL_BREACH_PORTABLE.minPlayers,
      maxPlayers: VEIL_BREACH_PORTABLE.maxPlayers,
      targetDurationSec: VEIL_BREACH_PORTABLE.targetDurationSec,
      manifest: veilManifest,
      manifestSchemaVersion: MANIFEST_SCHEMA_VERSION,
    },
  });
  console.log(
    `  exp    ✓ ${veil.slug} v${veil.version} (${veil.id}) — ${veilManifest.requiredAnchors.length} anchors, ${veilManifest.requiredZones.length} zones`,
  );

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
    // Both, not just Kingvale: a field venue provisioned for a demo that
    // is not offered the demo experience is a 15-minute deployment that
    // ends on an empty experience list.
    for (const e of [exp, veil]) {
      await prisma.venueExperience.upsert({
        where: {
          sourceId_experienceId: { sourceId, experienceId: e.id },
        },
        create: { sourceId, experienceId: e.id, enabled: true },
        update: { enabled: true },
      });
      console.log(`  assign ✓ ${e.slug} → ${sourceId}`);
    }
  }

  console.log('\nExperiences seeded.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
