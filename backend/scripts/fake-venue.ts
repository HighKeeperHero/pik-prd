// ============================================================
// HEP Phase 2 Slice 1 — the fake venue
//
// A scripted partner client that drives a full Echoes of Kingvale run
// against a live deployment, then prints what each seat earned.
//
// This IS the partner demo. It runs on a laptop, needs no headset, and
// shows a prospective venue exactly what integrating looks like. It
// doubles as the reference implementation handed to their engineers.
//
// Usage:
//   HV_API_URL=https://pik-prd-staging.up.railway.app \
//   HV_PLATFORM_ADMIN_KEY=<staff key> \
//   HV_TEST_ROOT_ID=<a hero root_id> \
//   npx ts-node scripts/fake-venue.ts [--outcome victory|timeout|abandoned]
//                                     [--milestones N]
//
// It provisions a throwaway venue, seats the given hero plus one guest,
// runs the experience, and reports. The venue is suspended afterward.
// ============================================================

const API = process.env.HV_API_URL?.replace(/\/$/, '');
const ADMIN_KEY = process.env.HV_PLATFORM_ADMIN_KEY;
const ROOT_ID = process.env.HV_TEST_ROOT_ID;

if (!API || !ADMIN_KEY || !ROOT_ID) {
  console.error(
    'Missing env: HV_API_URL, HV_PLATFORM_ADMIN_KEY, HV_TEST_ROOT_ID',
  );
  process.exit(2);
}

const arg = (flag: string, fallback: string) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const OUTCOME = arg('--outcome', 'victory');
const MILESTONES = parseInt(arg('--milestones', '4'), 10);
const RUN = `venue-${Date.now()}`;

async function call(
  path: string,
  opts: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
) {
  const resp = await fetch(`${API}${path}`, {
    method: opts.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null;
  try {
    json = await resp.json();
  } catch {
    /* empty body */
  }
  return { status: resp.status, body: json };
}

const admin = () => ({ 'X-HV-Admin-Key': ADMIN_KEY! });
const venue = (key: string) => ({ 'X-PIK-API-Key': key });
const unwrap = (b: any) => b?.data ?? b;

async function heroXp() {
  const r = await call(`/api/users/${ROOT_ID}`, { headers: admin() });
  return unwrap(r.body)?.progression?.fate_xp as number;
}

function die(msg: string, detail?: unknown): never {
  console.error(`\n✗ ${msg}`);
  if (detail !== undefined) console.error(JSON.stringify(detail, null, 2));
  process.exit(1);
}

async function main() {
  console.log(`\n🏰  Fake venue → ${API}`);
  console.log(`    outcome=${OUTCOME} milestones=${MILESTONES}\n`);

  // ── Provision the venue (Heroes staff would do this in the Portal) ──
  const created = await call('/api/sources', {
    method: 'POST',
    headers: admin(),
    body: { source_id: RUN, source_name: `Fake Venue ${RUN}` },
  });
  const key = unwrap(created.body)?.api_key;
  if (!key) die('could not provision venue', created.body);
  console.log(`1. Venue provisioned         ${RUN}`);

  // A new source only gets the default progression scopes, so the run
  // capabilities must be licensed explicitly — that separation is the point.
  const scoped = await call(`/api/sources/${RUN}/scopes`, {
    method: 'POST',
    headers: admin(),
    body: { scopes: ['xp', 'titles', 'runs', 'rewards', 'guests'] },
  });
  if (scoped.status >= 400) die('scope grant failed', scoped.body);

  // The experience must also be assigned to this venue.
  const assigned = await call(`/api/sources/${RUN}/experiences`, {
    method: 'POST',
    headers: admin(),
    body: { experience_slug: 'echoes_of_kingvale', enabled: true },
  });
  if (assigned.status >= 400) die('experience assignment failed', assigned.body);
  console.log(`   scopes + experience assigned`);

  // The player consents at check-in (in production, from the Codex app).
  const consent = await call(`/api/users/${ROOT_ID}/links`, {
    method: 'POST',
    headers: admin(),
    body: {
      source_id: RUN,
      scope: 'xp titles runs rewards guests',
      granted_by: `operator:${RUN}`,
    },
  });
  if (consent.status >= 400) die('consent grant failed', consent.body);
  console.log(`2. Player consented          ${ROOT_ID.slice(0, 8)}…`);

  const before = await heroXp();

  // ── The venue's own runtime starts here ────────────────────────────
  const started = await call('/api/partner/v1/runs', {
    method: 'POST',
    headers: venue(key),
    body: {
      experience_slug: 'echoes_of_kingvale',
      partner_run_key: `${RUN}-run-1`,
      root_ids: [ROOT_ID],
      guests: [{ label: 'Player 2 (walk-in)' }],
    },
  });
  if (started.status >= 400) die('run start failed', started.body);
  const run = unwrap(started.body);
  console.log(`3. Run started               ${run.run_id}`);
  console.log(`   seats: ${run.participants.length} (1 identified, 1 guest)`);

  await call(`/api/partner/v1/runs/${run.run_id}/heartbeat`, {
    method: 'POST',
    headers: venue(key),
  });
  console.log(`4. Heartbeat                 ok`);

  // ── Settle ─────────────────────────────────────────────────────────
  const path =
    OUTCOME === 'victory'
      ? `/api/partner/v1/runs/${run.run_id}/complete`
      : `/api/partner/v1/runs/${run.run_id}/fail`;

  const settled = await call(path, {
    method: 'POST',
    headers: venue(key),
    body: {
      outcome: OUTCOME,
      milestones_hit: MILESTONES,
      duration_sec: 1140,
      reason: OUTCOME === 'timeout' ? 'timer expired at the boss' : undefined,
    },
  });
  if (settled.status >= 400) die('settle failed', settled.body);
  const result = unwrap(settled.body);

  console.log(`5. Run ${result.status.padEnd(10)}        x${result.payout_multiplier}`);

  const after = await heroXp();
  console.log(`\n   Hero XP  ${before} → ${after}  (+${after - before})`);

  console.log('\n   Seats:');
  for (const s of result.participants_settled ?? []) {
    if (s.root_id) {
      console.log(
        `     identified ${String(s.root_id).slice(0, 8)}…  ${s.reward_state}` +
          (s.applied ? `  +${s.applied.xp_granted} XP, ${s.applied.caches_granted.length} cache` : ''),
      );
    } else {
      console.log(`     guest "${s.guest_label}"  ${s.reward_state}`);
      if (s.claim_token) {
        console.log(`       claim link: ${API}/claim/${s.claim_token}`);
        console.log(`       expires:    ${s.claim_expires_at}`);
      }
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────
  await call(`/api/sources/${RUN}/status`, {
    method: 'POST',
    headers: admin(),
    body: { status: 'suspended' },
  });
  console.log(`\n6. Venue suspended (cleanup)\n`);
}

main().catch((e) => {
  console.error('\nFake venue crashed:', e);
  process.exit(1);
});
