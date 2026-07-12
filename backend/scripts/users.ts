// ============================================================
// Enrolled-users CLI — list accounts, prune everything except a
// keep-list. Built 2026-07-11 for the pre-alpha cleanup (dev/test
// accounts only in prod; real testers arrive after this runs).
//
//   npm run users                              → list everything
//   npm run users -- prune --keep a@x.com,b@y.com   → DRY RUN
//   npm run users -- prune --keep a@x.com,b@y.com --yes  → delete
//
// Against prod:
//   DATABASE_URL="$(railway variables --json | jq -r .DATABASE_PUBLIC_URL)" \
//     npm run users -- prune --keep tim@... --yes
//
// Deletion uses fateAccount.delete — the same cascade the
// DELETE /api/account endpoint relies on, so heroes, sessions,
// encounters, quests, sanctum state, etc. go with the account.
// Prune is a DRY RUN unless --yes is passed.
// ============================================================
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : 'never';
}

async function listAccounts() {
  return prisma.fateAccount.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, email: true, displayName: true, provider: true,
      status: true, createdAt: true, lastLoginAt: true,
      heroes: { select: { heroName: true, status: true } },
    },
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === 'prune') {
    const kIdx = args.indexOf('--keep');
    const keep = kIdx >= 0
      ? (args[kIdx + 1] ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      : [];
    const confirmed = args.includes('--yes');

    if (keep.length === 0) {
      console.error('usage: users prune --keep <email,email,...> [--yes]');
      console.error('Refusing to prune with an empty keep-list.');
      process.exit(1);
    }

    const accounts = await listAccounts();
    const doomed = accounts.filter(a => !keep.includes((a.email ?? '').toLowerCase()));
    const kept   = accounts.filter(a =>  keep.includes((a.email ?? '').toLowerCase()));

    // Keep-list entries that matched nothing are probably typos —
    // surface them loudly before anyone passes --yes.
    for (const k of keep) {
      if (!accounts.some(a => (a.email ?? '').toLowerCase() === k)) {
        console.warn(`⚠ keep entry matches no account: ${k}`);
      }
    }

    console.log(`\nKEEP (${kept.length}):`);
    for (const a of kept) console.log(`  ${a.email ?? '(no email)'} — ${a.heroes.length} hero(es)`);
    console.log(`\nDELETE (${doomed.length}):`);
    for (const a of doomed) {
      console.log(`  ${a.email ?? `(no email · ${a.provider} · ${a.id})`} — ${a.heroes.length} hero(es), created ${fmtDate(a.createdAt)}`);
    }

    if (!confirmed) {
      console.log('\nDRY RUN — nothing deleted. Re-run with --yes to execute.');
      return;
    }

    for (const a of doomed) {
      await prisma.fateAccount.delete({ where: { id: a.id } });
      console.log(`deleted ${a.email ?? a.id}`);
    }
    console.log(`\nPruned ${doomed.length} account(s); ${kept.length} kept.`);
    return;
  }

  // default: list
  const accounts = await listAccounts();
  for (const a of accounts) {
    const heroes = a.heroes.map(h => h.heroName).join(', ') || '—';
    console.log(
      [a.email ?? `(no email · ${a.provider})`, a.displayName ?? '-', a.status,
       `created ${fmtDate(a.createdAt)}`, `last login ${fmtDate(a.lastLoginAt)}`,
       `heroes: ${heroes}`].join(' | '),
    );
  }
  console.log(`TOTAL: ${accounts.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
