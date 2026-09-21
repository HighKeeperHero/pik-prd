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
//   npm run testers -- --detail      # per account: where each tester left off
//   npm run testers -- --detail --csv=testers.csv
//
//   POSTHOG_PERSONAL_API_KEY=phx_...   (read-only personal key, never commit)
//   POSTHOG_PROJECT_ID=409710          (default)
//   DATABASE_URL="$(railway variables --environment production \
//     --service pik-prd --json | jq -r .DATABASE_PUBLIC_URL)" \
//     npm run testers
// ============================================================

import { writeFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const arg  = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const DETAIL = process.argv.includes('--detail');
// --detail looks back further by default: "where did they leave off"
// has to find testers who went quiet weeks ago, not just this week's.
const DAYS = Math.max(1, Math.min(365, Number(arg('days') ?? (DETAIL ? 90 : 30)) || 30));

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
  if (DETAIL) return detailReport();

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

// ── --detail: where each tester left off ────────────────────────────

/** Route names → what a person would call the place. Unknown routes
 *  fall through as-is, so a new screen is never hidden. */
const PLACE: Record<string, string> = {
  Welcome: 'Awakening — welcome', CharacterCreation: 'Awakening — character creation',
  Confirm: 'Awakening — confirm hero', Chapter1Video: 'Awakening — opening video',
  SanctumHome: 'Sanctum', MapHome: 'Map', Profile: 'Codex (profile)',
  TearPreview: 'Rift preview', RiftRitual: 'Rift ritual', FaunaPreview: 'Fauna preview',
  FaunaChase: 'Fauna encounter', Battle: 'Battle', BattleResult: 'Battle result',
  Rite: 'Rite of Purification', Augury: 'Augury', OathAltar: 'Oath altar', Hearth: 'Hearth',
  Library: 'Library', ForgeHall: 'Forge', AltarHall: 'Altar', ArenaHall: 'Arena',
  Trials: 'Arena — trials', TrialRun: 'Arena — trial run', Ladder: 'Arena — ladder',
  Legacy: 'Legacy', Training: 'Legacy — training', QuestDetail: 'Quest detail',
  Settings: 'Settings', Feedback: 'Send Word (feedback)', CacheCeremony: 'Cache opening',
  Chronicle: 'Chronicle', Archive: 'Lore archive', Bestiary: 'Bestiary', VeilForge: 'Veil Forge (store)',
};
const place = (route: string | null) => (route ? PLACE[route] ?? route : '—');

interface Trail {
  os: string; build: string; version: string;
  lastSeen: Date; activeDays: number;
  lastScreen: string | null; lastAction: string | null;
}

async function posthogTrails(): Promise<Map<string, Trail>> {
  // Last screen from screen.viewed; last action = the last event that is
  // neither PostHog lifecycle ($…, Application …) nor navigation.
  const query = `
    SELECT
      person.properties.root_id                                           AS root_id,
      argMax(properties.$os_name, timestamp)                              AS os,
      argMax(properties.$app_build, timestamp)                            AS build,
      argMax(properties.$app_version, timestamp)                          AS version,
      max(timestamp)                                                      AS last_seen,
      uniq(toDate(timestamp))                                             AS active_days,
      argMaxIf(properties.screen, timestamp, event = 'screen.viewed')     AS last_screen,
      argMaxIf(event, timestamp,
        NOT startsWith(event, '$') AND NOT startsWith(event, 'Application ')
        AND event NOT IN ('screen.viewed', 'app.opened'))                 AS last_action
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
  if (!res.ok) throw new Error(`PostHog query failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as { results: unknown[][] };
  const out = new Map<string, Trail>();
  for (const r of data.results) {
    out.set(String(r[0]), {
      os: String(r[1] ?? '?'), build: String(r[2] ?? '?'), version: String(r[3] ?? '?'),
      lastSeen: new Date(String(r[4])), activeDays: Number(r[5]),
      lastScreen: (r[6] as string) || null, lastAction: (r[7] as string) || null,
    });
  }
  return out;
}

async function detailReport() {
  const [trails, accounts, chainTotals] = await Promise.all([
    posthogTrails(),
    prisma.fateAccount.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        email: true, createdAt: true,
        heroes: {
          select: {
            id: true, heroName: true, fateLevel: true,
            sanctumState: { select: { sanctumLevel: true } },
            quests: {
              where: { status: { in: ['active', 'completed', 'claimed'] }, quest: { cadence: 'story', status: 'active' } },
              select: { status: true, quest: { select: { name: true, chainKey: true, chainStep: true } } },
            },
          },
        },
      },
    }),
    prisma.questTemplate.groupBy({ by: ['chainKey'], where: { cadence: 'story', status: 'active' }, _count: { _all: true } }),
  ]);
  const chainSize = new Map(chainTotals.map(c => [c.chainKey, c._count._all]));

  /** The story step a hero is standing on: the furthest chapter chain
   *  with an unclaimed step. A completed-but-unclaimed step means the
   *  reward is waiting — worth knowing, it's a common stall. */
  const storyAt = (qs: { status: string; quest: { name: string; chainKey: string | null; chainStep: number | null } }[]) => {
    const all = qs.filter(q => q.quest.chainKey?.startsWith('chapter_'));
    const chapters = all.filter(q => q.status !== 'claimed')
      .sort((a, b) => (b.quest.chainKey ?? '').localeCompare(a.quest.chainKey ?? '') || (b.quest.chainStep ?? 0) - (a.quest.chainStep ?? 0));
    const q = chapters[0];
    if (!q) return all.length
      ? `All available chapters complete (${all.length} steps claimed)`
      : 'Story not started';
    const ch = (q.quest.chainKey ?? '').replace('chapter_', 'Chapter ').replace(/_/g, ' ');
    const label = ch.replace(/\b(\w)/g, m => m.toUpperCase());
    const waiting = q.status === 'completed' ? ' (done — reward unclaimed)' : '';
    return `${label}, step ${q.quest.chainStep}/${chainSize.get(q.quest.chainKey) ?? '?'}: ${q.quest.name}${waiting}`;
  };

  const rows: Record<string, string>[] = [];
  for (const a of accounts) {
    const test = isTestAddress(a.email ?? null) ? ' [test]' : '';
    if (!a.heroes.length) {
      rows.push({
        email: (a.email ?? '(no email)') + test, hero: '—', platform: '?', build: '?',
        last_seen: '—', days_active: '0', last_screen: '—', last_action: '—',
        fate: '—', sanctum: '—',
        story: '—', left_off: `Signed up ${day(a.createdAt)}; never finished creating a hero (left during Awakening)`,
      });
      continue;
    }
    for (const h of a.heroes) {
      const t = trails.get(h.id);
      rows.push({
        email: (a.email ?? '(no email)') + test,
        hero: h.heroName,
        platform: t?.os ?? 'no activity',
        build: t ? `${t.version} (${t.build})` : '—',
        last_seen: t ? `${day(t.lastSeen)} (${ago(t.lastSeen)})` : `none in ${DAYS}d`,
        days_active: t ? String(t.activeDays) : '0',
        last_screen: place(t?.lastScreen ?? null),
        last_action: t?.lastAction ?? '—',
        fate: String(h.fateLevel),
        sanctum: String(h.sanctumState?.sanctumLevel ?? 1),
        story: storyAt(h.quests),
        left_off: t ? `Last on ${place(t.lastScreen)}` : `No app activity in ${DAYS} days`,
      });
    }
  }

  const seenAt = (r: Record<string, string>) => {
    const t = Date.parse(r.last_seen.slice(0, 10));
    return Number.isNaN(t) ? -Infinity : t;
  };
  rows.sort((x, y) => seenAt(y) - seenAt(x));
  for (const r of rows) {
    console.log(`\n${r.email}  —  ${r.hero}`);
    console.log(`  ${r.platform} ${r.build} · last seen ${r.last_seen} · ${r.days_active} active day(s)`);
    console.log(`  Fate ${r.fate} · Sanctum ${r.sanctum} · ${r.story}`);
    console.log(`  Left off: ${r.left_off}${r.last_action !== '—' ? ` · last action: ${r.last_action}` : ''}`);
  }
  console.log(`\n${accounts.length} account(s), ${rows.length} row(s). Activity window: ${DAYS} days.`);
  console.log('Note: a brand-new player\'s FIRST session is not linked to their hero until they reopen the app,');
  console.log('so a tester in their first session can show as "no activity".\n');

  const csvPath = arg('csv');
  if (csvPath) {
    const cols = ['email', 'hero', 'platform', 'build', 'last_seen', 'days_active', 'last_screen', 'last_action', 'fate', 'sanctum', 'story', 'left_off'];
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    writeFileSync(csvPath, '﻿' + [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c] ?? '')).join(','))].join('\n') + '\n');
    console.log(`CSV written: ${csvPath}\n`);
  }
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); })
  .finally(() => prisma.$disconnect());
