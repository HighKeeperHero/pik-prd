// ============================================================
// Seed the Arena Renown milestone titles.
//
// A title id that has no row grants nothing, silently — the grant
// path checks for the row and skips it. The legacy_<n> milestones
// shipped needing exactly this step, so it gets its own script
// rather than living only inside `npm run seed` (which is not run
// on deploy).
//
// Touches only these five rows; safe against production.
//
//   DATABASE_URL="$(railway variables --environment production \
//     --service pik-prd --json | jq -r .DATABASE_PUBLIC_URL)" \
//     npx tsx scripts/seed-arena-titles.ts
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TITLES = [
  { id: 'arena_proven',     displayName: 'PROVEN',     category: 'arena', description: 'Arena Renown 3 — the ground knows your name' },
  { id: 'arena_contender',  displayName: 'CONTENDER',  category: 'arena', description: 'Arena Renown 6 — you return, and you improve' },
  { id: 'arena_champion',   displayName: 'CHAMPION',   category: 'arena', description: 'Arena Renown 9 — the proving ground answers to you' },
  { id: 'arena_undefeated', displayName: 'UNDEFEATED', category: 'arena', description: 'Arena Renown 12 — few gauntlets are left to teach you' },
  { id: 'arena_flawless',   displayName: 'FLAWLESS',   category: 'arena', description: 'Arena Renown 15 — gold on every trial the Arena offers' },
];

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  console.log(`target: ${url.replace(/\/\/[^@]*@/, '//***@').split('?')[0] || '(unset)'}`);

  for (const t of TITLES) {
    const before = await prisma.title.findUnique({ where: { id: t.id } });
    await prisma.title.upsert({
      where:  { id: t.id },
      update: { displayName: t.displayName, description: t.description, category: t.category },
      create: t,
    });
    console.log(before ? `refreshed ${t.id}` : `created   ${t.id}`);
  }

  const all = await prisma.title.findMany({ where: { category: 'arena' }, orderBy: { id: 'asc' } });
  console.log(`\narena titles live: ${all.map(t => t.id).join(', ')}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
