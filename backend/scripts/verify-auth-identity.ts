// Verify the auth_identity backfill actually landed — every account
// reachable, every identity pointing somewhere real.
//
// READ-ONLY. Reads CENSUS_DATABASE_URL for the same reason the census
// does: Prisma pulls .env in on import, and verifying dev while
// believing you verified production is the failure this guards against.
//
//   CENSUS_DATABASE_URL='postgresql://…' npm run verify:auth-identity
//
// Exits non-zero if any invariant fails, so it can gate a promotion.
import { PrismaClient } from '@prisma/client';

const CENSUS_URL = process.env.CENSUS_DATABASE_URL ?? '';
if (!CENSUS_URL) {
  console.error(
    'CENSUS_DATABASE_URL is not set, and this refuses to fall back to\n' +
    'DATABASE_URL — verifying dev while believing you verified production is\n' +
    'the exact failure it exists to catch.\n\n' +
    'Against the local dev database (run from backend/):\n' +
    '  CENSUS_DATABASE_URL="$(grep -m1 \'^DATABASE_URL=\' .env | cut -d= -f2-)" \\\n' +
    '    npm run verify:auth-identity\n\n' +
    'Against staging or production, paste that environment\'s PUBLIC url:\n' +
    '  CENSUS_DATABASE_URL=\'postgresql://…\' npm run verify:auth-identity',
  );
  process.exit(1);
}
if (CENSUS_URL.includes('.railway.internal')) {
  console.error("That is Railway's INTERNAL url; use DATABASE_PUBLIC_URL from this machine.");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: CENSUS_URL } } });

/** Turn the three failures that actually happen into sentences instead
 *  of a wall of Prisma stack trace. */
function explain(err: any): string {
  const msg = String(err?.message ?? err);
  if (/auth_identities.*does not exist|relation "auth_identities"/i.test(msg)) {
    return (
      'The auth_identities table does not exist in THIS database.\n' +
      'The migration has not been applied here yet:\n' +
      '  DATABASE_URL=<this same url> npx prisma migrate deploy\n' +
      'Each environment migrates separately — dev, staging and production\n' +
      'are three databases, and running it on one does nothing for the others.'
    );
  }
  if (/ENOTFOUND|ECONNREFUSED|getaddrinfo|Can't reach database/i.test(msg)) {
    return (
      'Could not reach that database. If the host ends in .railway.internal it\n' +
      'is only reachable from inside Railway — use DATABASE_PUBLIC_URL instead.\n' +
      `Underlying error: ${msg.slice(0, 200)}`
    );
  }
  if (/authentication failed|password/i.test(msg)) {
    return `Credentials rejected by that database.\nUnderlying error: ${msg.slice(0, 200)}`;
  }
  return msg.slice(0, 500);
}

const q = (sql: string) => prisma.$queryRawUnsafe<any[]>(sql);

async function main() {
  const host = CENSUS_URL.replace(/^.*@/, '').replace(/\?.*$/, '');
  const failures: string[] = [];

  const rows = await q(`
    SELECT provider, count(*)::int AS identities,
           count(*) FILTER (WHERE email_verified)::int AS verified
      FROM auth_identities GROUP BY provider ORDER BY provider
  `);

  // 1. Every account that can sign in has at least one identity. This
  //    is the invariant that matters — an account with none is
  //    unreachable forever, and nothing in the app would notice.
  const unreachable = await q(`
    SELECT count(*)::int AS n
      FROM fate_accounts a
     WHERE NOT EXISTS (SELECT 1 FROM auth_identities i WHERE i.account_id = a.account_id)
       AND (a.password_hash IS NOT NULL OR a.provider_id IS NOT NULL)
  `);
  if (unreachable[0].n > 0) {
    failures.push(`${unreachable[0].n} account(s) have no identity row and cannot sign in`);
  }

  // 2. Columns, not just rows — ON CONFLICT DO NOTHING is silent about
  //    columns, so a re-run can leave a row present but hollow.
  const hollow = await q(`
    SELECT count(*)::int AS n FROM auth_identities
     WHERE provider IS NULL OR provider_id IS NULL OR provider_id = ''
  `);
  if (hollow[0].n > 0) failures.push(`${hollow[0].n} identity row(s) have an empty provider/provider_id`);

  // 3. Every legacy OAuth account is represented under its own subject.
  const missedOauth = await q(`
    SELECT count(*)::int AS n
      FROM fate_accounts a
     WHERE a.provider_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM auth_identities i
          WHERE i.provider = a.provider AND i.provider_id = a.provider_id
       )
  `);
  if (missedOauth[0].n > 0) failures.push(`${missedOauth[0].n} OAuth account(s) missing their identity`);

  // 4. Every password account has its 'email' identity keyed on itself.
  const missedEmail = await q(`
    SELECT count(*)::int AS n
      FROM fate_accounts a
     WHERE a.password_hash IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM auth_identities i
          WHERE i.provider = 'email' AND i.provider_id = a.account_id
       )
  `);
  if (missedEmail[0].n > 0) failures.push(`${missedEmail[0].n} password account(s) missing their identity`);

  // 5. No identity should claim an email address is verified when it
  //    came from register(), which has never verified one.
  const falselyVerified = await q(`
    SELECT count(*)::int AS n FROM auth_identities
     WHERE provider = 'email' AND email_verified = true
  `);
  if (falselyVerified[0].n > 0) {
    failures.push(`${falselyVerified[0].n} 'email' identity(s) marked verified — register() never verifies`);
  }

  console.log(JSON.stringify({ database: host, byProvider: rows, failures }, null, 1));
  if (failures.length) {
    console.error(`\n✗ ${failures.length} invariant(s) failed.`);
    process.exit(1);
  }
  console.log('\n✓ all invariants hold');
}

main()
  .catch((err) => {
    console.error(`\n✗ ${explain(err)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
