// backend/scripts/seed-test-event.ts
// Seeds (idempotently) one ACTIVE ConvergenceEvent for end-to-end
// testing of the live-event system. Deliberately NOT part of the main
// prisma seed so it can never accidentally create a fake event in prod.
//
//   npm run seed:test-event          # active for the next 24h
//   npm run seed:test-event -- --clear   # remove the test event
//
// Verify: GET /api/veil/events/active and /events/progress should show it;
// a won /api/veil/encounter on a matching tier returns multiplier +
// convergence_event and increments contribution_count.

import { PrismaClient } from '@prisma/client';

const TEST_EVENT_ID = 'test-convergence-event-001';

async function main() {
  const clear = process.argv.includes('--clear');
  const prisma = new PrismaClient();
  try {
    if (clear) {
      await prisma.convergenceEvent.deleteMany({ where: { id: TEST_EVENT_ID } });
      console.log(`[seed-test-event] removed ${TEST_EVENT_ID}`);
      return;
    }

    const now = Date.now();
    const startsAt = new Date(now - 60 * 60 * 1000);       // started 1h ago
    const endsAt = new Date(now + 24 * 60 * 60 * 1000);    // ends in 24h

    await prisma.convergenceEvent.upsert({
      where: { id: TEST_EVENT_ID },
      update: { startsAt, endsAt, status: 'active' },       // refresh the window on re-run
      create: {
        id: TEST_EVENT_ID,
        name: 'The Converging Tide',
        description: 'A rare alignment of the Veil tears draws near.',
        flavorText: 'The boundaries between worlds grow thin. Ready yourself.',
        affectedTiers: ['minor', 'wander', 'dormant', 'double'],
        shardMultiplier: 1.5,
        cacheBonus: true,
        targetCount: 10000,
        startsAt,
        endsAt,
        status: 'active',
      },
    });
    console.log(`[seed-test-event] ${TEST_EVENT_ID} active until ${endsAt.toISOString()}`);
    console.log('[seed-test-event] affectedTiers: minor/wander/dormant/double · x1.5 shards · cache bonus');
  } finally {
    await prisma.$disconnect();
  }
}

main();
