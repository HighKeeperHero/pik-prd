// One-shot environment audit for the loot/quest seed state.
// Usage: DATABASE_URL=... npx ts-node scripts/db-audit.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const loot = await prisma.$queryRawUnsafe<any[]>(
    `SELECT cache_type, count(*)::int AS rows FROM loot_table GROUP BY cache_type ORDER BY cache_type`,
  ).catch((e) => [{ error: String(e.message).slice(0, 120) }]);

  const questDefs = await prisma.$queryRawUnsafe<any[]>(
    `SELECT cadence, count(*)::int AS defs FROM quest_templates GROUP BY cadence ORDER BY cadence`,
  ).catch((e) => [{ error: String(e.message).slice(0, 120) }]);

  const titles = await prisma.$queryRawUnsafe<any[]>(
    `SELECT count(*)::int AS titles FROM titles`,
  ).catch((e) => [{ error: String(e.message).slice(0, 120) }]);

  const baseItems = await prisma.$queryRawUnsafe<any[]>(
    `SELECT count(*)::int AS base_items FROM base_items`,
  ).catch((e) => [{ error: String(e.message).slice(0, 120) }]);

  const sealedByType = await prisma.$queryRawUnsafe<any[]>(
    `SELECT cache_type, status, count(*)::int AS n FROM fate_caches GROUP BY cache_type, status ORDER BY cache_type, status`,
  ).catch((e) => [{ error: String(e.message).slice(0, 120) }]);

  const sources = await prisma.$queryRawUnsafe<any[]>(
    `SELECT source_id FROM sources`,
  ).catch((e) => [{ error: String(e.message).slice(0, 120) }]);

  console.log(JSON.stringify({ loot, questDefs, titles, baseItems, sealedByType, sources }, null, 1));
}

main().finally(() => prisma.$disconnect());
