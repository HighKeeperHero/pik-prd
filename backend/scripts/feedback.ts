// ============================================================
// feedback.ts — read the testers' reports from the terminal.
//
// WHY THIS EXISTS: on 2026-08-11 testers said they had submitted bug
// reports and "we never received them". Every report had in fact
// arrived and was sitting in the feedback table, status `new`, since
// 2026-08-06 — the submit path was never broken. What was missing was
// any way to READ them: no notification, no dashboard, and a triage
// endpoint behind PlatformAdminGuard that nobody was going to curl by
// hand. A write-only inbox is the same as a broken one to the person
// who wrote in.
//
//   npm run feedback                  # everything still marked new
//   npm run feedback -- --all         # including triaged/closed
//   npm run feedback -- --kind=bug
//   npm run feedback -- --triage <id> # mark one triaged
//   npm run feedback -- --close  <id>
//
//   DATABASE_URL="$(railway variables --environment production \
//     --service pik-prd --json | jq -r .DATABASE_PUBLIC_URL)" \
//     npm run feedback
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const flagWith = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const has = (n: string) => process.argv.includes(`--${n}`);

const KIND_MARK: Record<string, string> = {
  bug: '!', idea: '+', praise: '*', other: '.',
};

async function main() {
  const triage = flagWith('triage');
  const close  = flagWith('close');
  if (triage || close) {
    const id = (triage ?? close)!;
    const status = triage ? 'triaged' : 'closed';
    const row = await prisma.feedback.update({ where: { id }, data: { status } });
    console.log(`${row.id} → ${row.status}`);
    return;
  }

  const where: Record<string, unknown> = {};
  if (!has('all')) where.status = arg('status') ?? 'new';
  else if (arg('status')) where.status = arg('status');
  if (arg('kind')) where.kind = arg('kind');

  const rows = await prisma.feedback.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { root: { select: { heroName: true, fateLevel: true } } },
  });

  if (!rows.length) { console.log('No reports match. The inbox is clear.'); return; }

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  console.log(
    `${rows.length} report${rows.length === 1 ? '' : 's'} — ` +
    Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ') + '\n',
  );

  for (const r of rows) {
    const c = (r.context ?? {}) as Record<string, string>;
    const who = r.root?.heroName ?? c.hero_name ?? 'unattributed';
    console.log('─'.repeat(74));
    console.log(
      `${KIND_MARK[r.kind] ?? '.'} ${r.kind.toUpperCase().padEnd(6)} ` +
      `${r.createdAt.toISOString().slice(0, 16).replace('T', ' ')}  ${who}` +
      `${r.root?.fateLevel ? ` · Fate ${r.root.fateLevel}` : ''}  [${r.status}]`,
    );
    console.log(
      `  ${c.platform ?? '?'} ${c.os_version ?? ''} · ${c.device ?? '?'} · ` +
      `${c.channel ?? '?'} v${c.app_version ?? '?'}`,
    );
    console.log(`  id ${r.id}`);
    console.log('');
    for (const line of String(r.message).split('\n')) console.log(`  ${line}`);
    console.log('');
  }
  console.log('─'.repeat(74));
  console.log('Mark one done:  npm run feedback -- --triage <id>   |   --close <id>');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
