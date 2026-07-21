// ============================================================
// HEP Phase 2 Slice 4 — spatial seed
//
// Seeds the calibration tolerances and the device capability profiles.
//
// ⚠ THE TOLERANCES MUST BE SEEDED. POST /api/config refuses to CREATE
// keys ("Only pre-existing keys can be updated"), so a tunable without a
// seed row is a dial welded shut. This has bitten twice — most recently
// venue.daily_xp_ceiling, where a run paid 720 XP against a "ceiling of
// 10" because the key silently fell back to its code default. The
// Workstream 9 thresholds are explicitly "initial targets to be tuned
// after testing", so they will need turning, probably in a venue, on a
// weekend.
//
// Idempotent. Run per environment:
//   npm run seed:spatial
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Must stay in step with TOLERANCE_DEFAULTS in src/spatial/spatial.service.ts. */
const TOLERANCES: Array<{ key: string; value: string; description: string }> = [
  {
    key: 'spatial.max_translation_error_m',
    value: '0.05',
    description: 'Max origin translation error to publish a room (metres). W9 target: 5cm.',
  },
  {
    key: 'spatial.max_rotation_error_deg',
    value: '2.0',
    description: 'Max origin rotation error to publish a room (degrees). W9 target: 2°.',
  },
  {
    key: 'spatial.max_floor_height_error_m',
    value: '0.03',
    description: 'Max floor-height error to publish a room (metres). W9 target: 3cm.',
  },
  {
    key: 'spatial.min_verification_points',
    value: '2',
    description: 'Verification points required to publish a room. Spec says two or three.',
  },
];

/**
 * Device tiers per Workstream 6.
 *
 * Heroes-authored and global, NOT per-venue: a partner choosing their own
 * performance budget is how an experience ships at 20fps and becomes a
 * support ticket.
 */
const PROFILES = [
  {
    slug: 'tier-a-mobile-ar',
    name: 'Tier A — Mobile AR',
    tier: 'A',
    supportsSharedAnchors: true, // ARCore Cloud Anchors
    supportsPersistentAnchors: true,
    supportsSceneMesh: false,
    supportsHandTracking: false,
    supportsOcclusion: true,
    budgets: {
      maxTriangles: 150_000,
      maxTextureMemoryMB: 128,
      maxDrawCalls: 80,
      maxParticles: 500,
      maxDynamicLights: 1,
      targetFps: 30,
    },
  },
  {
    slug: 'tier-b-standalone-headset',
    name: 'Tier B — Standalone Headset',
    tier: 'B',
    supportsSharedAnchors: true, // Meta shared spatial anchors
    supportsPersistentAnchors: true,
    supportsSceneMesh: true,
    supportsHandTracking: true,
    supportsOcclusion: true,
    budgets: {
      maxTriangles: 400_000,
      maxTextureMemoryMB: 512,
      maxDrawCalls: 200,
      maxParticles: 2_000,
      maxDynamicLights: 2,
      targetFps: 72,
    },
  },
  {
    slug: 'tier-c-high-end-spatial',
    name: 'Tier C — High-End Spatial',
    tier: 'C',
    supportsSharedAnchors: true,
    supportsPersistentAnchors: true,
    supportsSceneMesh: true,
    supportsHandTracking: true,
    supportsOcclusion: true,
    budgets: {
      maxTriangles: 1_200_000,
      maxTextureMemoryMB: 2_048,
      maxDrawCalls: 500,
      maxParticles: 8_000,
      maxDynamicLights: 4,
      targetFps: 90,
    },
  },
];

async function main() {
  console.log('\nHEP Slice 4 — spatial seed\n' + '─'.repeat(46));

  let created = 0;
  for (const t of TOLERANCES) {
    const existing = await prisma.config.findUnique({ where: { key: t.key } });
    if (existing) {
      console.log(`  · ${t.key} already set (${existing.value}) — left alone`);
      continue;
    }
    await prisma.config.create({ data: t });
    created++;
    console.log(`  ✓ ${t.key} = ${t.value}`);
  }

  let profiles = 0;
  for (const p of PROFILES) {
    await prisma.deviceCapabilityProfile.upsert({
      where: { slug: p.slug },
      // Budgets are ours to revise; a venue never edits these, so
      // overwriting on re-seed is safe and is how a retune ships.
      update: { ...p, budgets: p.budgets as never },
      create: { ...p, budgets: p.budgets as never },
    });
    profiles++;
    console.log(`  ✓ ${p.slug} (tier ${p.tier})`);
  }

  console.log('─'.repeat(46));
  console.log(`${created} tolerance key(s) created, ${profiles} device profile(s) upserted.`);
  if (created === 0) {
    console.log('Tolerances already existed — existing values were NOT overwritten,');
    console.log('because a tuned threshold must survive a re-seed.');
  }
  console.log();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
