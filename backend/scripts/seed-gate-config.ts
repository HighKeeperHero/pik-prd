// ============================================================
// Seed the proximity-gate config rows.
//
// The config API refuses to CREATE keys — only to update ones that
// already exist (config.service.ts). So a tunable that was never
// seeded is a dial welded shut, and `npm run seed` is not run on
// deploy. This inserts just the two gate keys, touching nothing
// else, so it's safe to point at production.
//
// Idempotent: existing rows keep their current VALUE (someone may
// have already tuned them) and only refresh their description.
//
//   npx tsx scripts/seed-gate-config.ts                    # local .env
//   DATABASE_URL="$(railway variables --json | jq -r .DATABASE_PUBLIC_URL)" \
//     npx tsx scripts/seed-gate-config.ts                  # a Railway env
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROWS = [
  {
    key: 'veil.gate_radius_m',
    value: '80',
    description: 'How close (metres) a player must be to act on a tear',
  },
  {
    key: 'veil.gate_enforced',
    value: 'false',
    description: 'Refuse out-of-range encounters. False = record the distance and allow',
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  // Host only — never print credentials.
  console.log(`target: ${url.replace(/\/\/[^@]*@/, '//***@').split('?')[0] || '(unset)'}`);

  for (const row of ROWS) {
    const before = await prisma.config.findUnique({ where: { key: row.key } });
    await prisma.config.upsert({
      where:  { key: row.key },
      update: { description: row.description },
      create: row,
    });
    console.log(
      before
        ? `kept   ${row.key} = ${before.value} (already present)`
        : `create ${row.key} = ${row.value}`,
    );
  }

  const all = await prisma.config.findMany({
    where:   { key: { startsWith: 'veil.gate_' } },
    orderBy: { key: 'asc' },
  });
  console.log('\nnow live:');
  for (const r of all) console.log(`  ${r.key} = ${r.value}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
