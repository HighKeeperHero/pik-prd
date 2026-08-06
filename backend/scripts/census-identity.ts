// Identity census — sizes the AuthIdentity migration before it is written.
// See docs/google-launch-plan.md § 0 in the heroes-veritas-native repo.
//
// READ-ONLY. Every statement here is a SELECT; the script opens no
// transaction and writes nothing. Safe to run against production, which
// is the point — staging's row counts say nothing about the data that
// actually has to migrate.
//
// Deliberately reads CENSUS_DATABASE_URL, *not* DATABASE_URL. Prisma
// pulls .env in on import, so a plain DATABASE_URL can be silently
// overwritten by the local dev value — you would census dev while
// believing you were looking at production, which is the exact mistake
// this census exists to prevent. A name nothing else defines cannot
// collide. The connected host is echoed in the output; check it.
//
// Usage:
//   CENSUS_DATABASE_URL='postgresql://…' npm run census:identity
//
// Get the production URL from Railway (do not paste it into a file):
//   railway variables --environment production | grep DATABASE_URL
import { PrismaClient } from '@prisma/client';

const CENSUS_URL = process.env.CENSUS_DATABASE_URL ?? '';
if (!CENSUS_URL) {
  console.error(
    'CENSUS_DATABASE_URL is not set.\n' +
    'Refusing to fall back to DATABASE_URL — that is how you audit dev by accident.\n' +
    "  CENSUS_DATABASE_URL='postgresql://…' npm run census:identity",
  );
  process.exit(1);
}

// Railway's DATABASE_URL points at *.railway.internal, which resolves
// only from inside their private network. This script runs on a laptop,
// so it needs DATABASE_PUBLIC_URL. Say that plainly rather than letting
// it surface as a bare DNS failure.
if (CENSUS_URL.includes('.railway.internal')) {
  console.error(
    'That is Railway\'s INTERNAL database URL — it resolves only from inside\n' +
    'their network, never from this machine. Use the public one instead:\n' +
    '  railway variables --environment production | grep DATABASE_PUBLIC_URL',
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: CENSUS_URL } } });

const q = (sql: string) =>
  prisma
    .$queryRawUnsafe<any[]>(sql)
    .catch((e) => [{ error: String(e.message).slice(0, 160) }]);

async function main() {
  // Which database are we actually looking at? Host only — never log
  // the credentials. Read this line before trusting anything below it.
  const host = CENSUS_URL.replace(/^.*@/, '').replace(/\?.*$/, '');

  // 1. The shape of the account base. `with_password` is what tells us
  //    how many rows need a synthetic 'email' identity in the backfill.
  const byProvider = await q(`
    SELECT provider,
           count(*)::int                                    AS accounts,
           count(password_hash)::int                        AS with_password,
           count(provider_id)::int                          AS with_provider_id
      FROM fate_accounts
     GROUP BY provider
     ORDER BY provider
  `);

  // 2. Already-split players: one address, several accounts. Linking
  //    does NOT help these — they have two hero sets and need a merge.
  //    This count decides whether § 1.7 gets built or done by hand.
  const splitPlayers = await q(`
    SELECT lower(email)                                     AS email,
           count(*)::int                                    AS accounts,
           string_agg(DISTINCT provider, ',' ORDER BY provider) AS providers
      FROM fate_accounts
     WHERE email IS NOT NULL
     GROUP BY lower(email)
    HAVING count(*) > 1
     ORDER BY count(*) DESC
     LIMIT 50
  `);

  // 3. Case collisions. `email` is unique but Postgres is case-sensitive,
  //    so 'Tim@x.com' and 'tim@x.com' are two rows that the lowercasing
  //    lookups in fate-account.service treat as one.
  const caseCollisions = await q(`
    SELECT lower(email) AS email, count(*)::int AS variants
      FROM fate_accounts
     WHERE email IS NOT NULL
     GROUP BY lower(email)
    HAVING count(DISTINCT email) > 1
     LIMIT 50
  `);

  // 4. Heroes with no account at all. The FK is nullable "for legacy",
  //    so these may exist — and they have no sign-in route whatsoever.
  const orphanHeroes = await q(`
    SELECT count(*)::int AS orphan_heroes
      FROM root_identities
     WHERE fate_account_id IS NULL
  `);

  // 5. Accounts carrying BOTH a password and an OAuth provider id —
  //    the ones the old code silently promoted from 'email'. Each yields
  //    two AuthIdentity rows in the backfill, and the count is a
  //    sanity check on that migration afterwards.
  const promoted = await q(`
    SELECT provider, count(*)::int AS promoted_accounts
      FROM fate_accounts
     WHERE password_hash IS NOT NULL
       AND provider_id IS NOT NULL
     GROUP BY provider
     ORDER BY provider
  `);

  // 6. What a merge would actually cost, if § 1.7 is needed.
  const heroesPerAccount = await q(`
    SELECT heroes::text AS heroes_held, count(*)::int AS accounts
      FROM (
        SELECT fate_account_id, count(*)::int AS heroes
          FROM root_identities
         WHERE fate_account_id IS NOT NULL
         GROUP BY fate_account_id
      ) t
     GROUP BY heroes
     ORDER BY heroes
  `);

  console.log(
    JSON.stringify(
      {
        database: host,
        byProvider,
        splitPlayers,
        caseCollisions,
        orphanHeroes,
        promoted,
        heroesPerAccount,
      },
      null,
      1,
    ),
  );
}

main().finally(() => prisma.$disconnect());
