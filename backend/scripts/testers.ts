// ============================================================
// testers.ts — who is actually testing, on what, and how lately.
//
// WHY THIS EXISTS: on 2026-09-16 there was no way to answer "who has
// started testing". The database knows who SIGNED UP, but not their
// platform or app version, and its lastLoginAt is misleading both ways:
// a new OAuth account has none until its second sign-in, and the app
// keeps players signed in, so an old date does not mean someone quit.
// Android installs come from an EAS link, which records no downloads.
//
// PostHog has the missing half — every event carries $os_name,
// $app_version and $app_build, bound to the hero's root_id by
// identify(). This joins that to hero names and accounts here.
//
//   npm run testers                  # last 30 days
//   npm run testers -- --days=7
//
//   POSTHOG_PERSONAL_API_KEY=phx_...   (read-only personal key, never commit)
//   POSTHOG_PROJECT_ID=409710          (default)
//   DATABASE_URL="$(railway variables --environment production \
//     --service pik-prd --json | jq -r .DATABASE_PUBLIC_URL)" \
//     npm run testers
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const arg  = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const DAYS = Math.max(1, Math.min(365, Number(arg('days') ?? 30) || 30));

const KEY     = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
const PROJECT = process.env.POSTHOG_PROJECT_ID?.trim() || '409710';
const HOST    = (process.env.POSTHOG_API_HOST?.trim() || 'https://us.posthog.com').replace(/\/$/, '');

interface Activity {
  rootId: string;
  os: string;
  platforms: string[];
  version: string;
  build: string;
  firstSeen: Date;
  lastSeen: Date;
  activeDays: number;
  events: number;
}

async function posthogActivity(): Promise<Map<string, Activity>> {
  // Latest platform/version per hero, plus every platform they've used —
  // a tester on both an iPhone and an Android shows as both.
  const query = `
    SELECT
      person.properties.root_id                   AS root_id,
      argMax(properties.$os_name, timestamp)      AS os,
      groupUniqArray(properties.$os_name)         AS platforms,
      argMax(properties.$app_version, timestamp)  AS version,
      argMax(properties.$app_build, timestamp)    AS build,
      min(timestamp)                              AS first_seen,
      max(timestamp)                              AS last_seen,
      uniq(toDate(timestamp))                     AS active_days,
      count()                                     AS events
    FROM events
    WHERE timestamp > now() - INTERVAL ${DAYS} DAY
      AND person.properties.root_id IS NOT NULL
    GROUP BY root_id
  `;

  const res = await fetch(`${HOST}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PostHog query failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json() as { results: unknown[][] };

  const out = new Map<string, Activity>();
  for (const r of data.results) {
    const rootId = String(r[0]);
    out.set(rootId, {
      rootId,
      os:         String(r[1] ?? '?'),
      platforms:  (r[2] as string[] | null)?.filter(Boolean) ?? [],
      version:    String(r[3] ?? '?'),
      build:      String(r[4] ?? '?'),
      firstSeen:  new Date(String(r[5])),
      lastSeen:   new Date(String(r[6])),
      activeDays: Number(r[7]),
      events:     Number(r[8]),
    });
  }
  return out;
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const ago = (d: Date) => {
  const h = (Date.now() - d.getTime()) / 36e5;
  return h < 1 ? 'just now' : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
};
const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
const isTestAddress = (email: string | null) => !!email && /@(test\.com|heroesveritas\.dev)$/i.test(email);

async function main() {
  if (!KEY) {
    console.error('POSTHOG_PERSONAL_API_KEY is not set. Create a read-only personal key in PostHog → Settings → Personal API keys.');
    process.exit(1);
  }

  const [activity, heroes] = await Promise.all([
    posthogActivity(),
    prisma.rootIdentity.findMany({
      select: {
        id: true, heroName: true, fateLevel: true,
        fateAccount: { select: { email: true, createdAt: true } },
      },
    }),
  ]);

  const rows = heroes.map(h => ({ h, a: activity.get(h.id) }));
  rows.sort((x, y) => (y.a?.lastSeen.getTime() ?? 0) - (x.a?.lastSeen.getTime() ?? 0));

  const playing = rows.filter(r => r.a);
  const idle    = rows.filter(r => !r.a);

  console.log(`\nActive in the last ${DAYS} days — ${playing.length} hero(es)\n`);
  console.log(`${pad('HERO', 26)} ${pad('PLATFORM', 13)} ${pad('VERSION', 13)} ${pad('LAST SEEN', 11)} ${'DAYS'.padStart(4)} ${'EVENTS'.padStart(6)}  ACCOUNT`);
  console.log('─'.repeat(112));
  for (const { h, a } of playing) {
    const plat = a!.platforms.length > 1 ? a!.platforms.join('+') : a!.os;
    const tag  = isTestAddress(h.fateAccount?.email ?? null) ? ' [test]' : '';
    console.log(
      `${pad(h.heroName, 26)} ${pad(plat, 13)} ${pad(`${a!.version} (${a!.build})`, 13)} ` +
      `${pad(ago(a!.lastSeen), 11)} ${String(a!.activeDays).padStart(4)} ${String(a!.events).padStart(6)}  ` +
      `${h.fateAccount?.email ?? '(no account)'}${tag}`,
    );
  }

  const byPlatform = new Map<string, number>();
  const byVersion  = new Map<string, number>();
  for (const { a } of playing) {
    byPlatform.set(a!.os, (byPlatform.get(a!.os) ?? 0) + 1);
    const v = `${a!.os} ${a!.version} (${a!.build})`;
    byVersion.set(v, (byVersion.get(v) ?? 0) + 1);
  }
  console.log('\nBy platform:  ' + [...byPlatform].map(([k, n]) => `${k} ${n}`).join(' · '));
  console.log('By build:');
  for (const [v, n] of [...byVersion].sort()) console.log(`  ${String(n).padStart(3)}  ${v}`);

  if (idle.length) {
    console.log(`\nNo app activity in ${DAYS} days — ${idle.length} hero(es)`);
    for (const { h } of idle) {
      const tag = isTestAddress(h.fateAccount?.email ?? null) ? ' [test]' : '';
      console.log(`  ${pad(h.heroName, 26)} signed up ${h.fateAccount ? day(h.fateAccount.createdAt) : '?'}  ${h.fateAccount?.email ?? '(no account)'}${tag}`);
    }
  }

  // Activity PostHog saw for a root_id that no longer exists here —
  // a deleted test hero, or events from staging's database.
  const known   = new Set(heroes.map(h => h.id));
  const orphans = [...activity.keys()].filter(id => !known.has(id));
  if (orphans.length) console.log(`\n${orphans.length} active root_id(s) not in this database (deleted heroes, or the wrong DATABASE_URL).`);
  console.log();
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); })
  .finally(() => prisma.$disconnect());
