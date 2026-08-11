/**
 * backfill-oaths-sworn.ts — repair `sanctum_state.total_oaths_sworn`
 * from the Oath rows that actually exist.
 *
 *   npx tsx scripts/backfill-oaths-sworn.ts          # dry run
 *   npx tsx scripts/backfill-oaths-sworn.ts --apply  # write
 *
 * Why: Oath v1 (POST /api/sanctum/oath) was the only writer of this
 * counter, and no client has called it since Oath v2 shipped
 * 2026-07-31. v2 wrote Oath rows and left the counter at 0, so
 * `seedStoryProgress` — which backfills a `swear_oath` objective from
 * this number — saw zero oaths for every hero. `story_first_oath` is
 * chapter_one step 4, and a chapter chain only materializes once the
 * previous chapter is fully claimed, so the campaign was walled there.
 *
 * declareOath now increments the counter itself, but that only helps
 * the NEXT oath, and an oath is once per week. This credits everyone
 * for the vows they already swore.
 *
 * Idempotent: sets the counter to the row count, never adds to it.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

async function main() {
  const counts = await prisma.oath.groupBy({
    by:     ['rootId'],
    _count: { _all: true },
  });
  console.log(`${counts.length} heroes have sworn at least one oath.\n`);

  let changed = 0;
  for (const row of counts) {
    const real  = row._count._all;
    const state = await prisma.sanctumState.findUnique({
      where:  { rootId: row.rootId },
      select: { totalOathsSworn: true },
    });
    if (!state) {
      console.log(`  ${row.rootId}  no sanctum_state row — skipped`);
      continue;
    }
    if (state.totalOathsSworn === real) continue;

    changed++;
    console.log(`  ${row.rootId}  ${state.totalOathsSworn} → ${real}`);
    if (APPLY) {
      await prisma.sanctumState.update({
        where: { rootId: row.rootId },
        data:  { totalOathsSworn: real },
      });
    }
  }

  console.log(
    changed === 0
      ? '\nNothing to repair.'
      : `\n${changed} hero(es) ${APPLY ? 'repaired' : 'would be repaired — re-run with --apply'}.`,
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
