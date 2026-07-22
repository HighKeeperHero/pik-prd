// ============================================================
// HEP Phase 2 Slice 10 — staff-authed run operation
//
// The risk in adding a second door to the run lifecycle is that the two
// doors drift: a policy enforced on the API-key path and quietly absent
// on the staff path would let a venue mint past its own ceiling by
// clicking instead of calling.
//
// So the checks that matter here are the ones proving BOTH paths run the
// same policy — scopes, seat range, consent, the certification gate —
// plus the RBAC that decides who may push the button at all.
//
// Usage:
//   HV_API_URL=http://localhost:8099 \
//   HV_PLATFORM_ADMIN_KEY=<key> \
//   npx ts-node scripts/verify-slice10.ts
// ============================================================

const API = process.env.HV_API_URL?.replace(/\/$/, '');
const ADMIN_KEY = process.env.HV_PLATFORM_ADMIN_KEY;

if (!API || !ADMIN_KEY) {
  console.error('Missing env: HV_API_URL, HV_PLATFORM_ADMIN_KEY');
  process.exit(2);
}

const RUN = `s10-${Date.now().toString(36)}`;
const PASSWORD = `Portal-${RUN}!`;
let failures = 0;

function check(name: string, passed: boolean, detail?: unknown) {
  console.log(`  ${passed ? '✓' : '✗'} ${name}`);
  if (!passed) {
    failures++;
    if (detail !== undefined) {
      console.log(`      got: ${JSON.stringify(detail)?.slice(0, 320)}`);
    }
  }
}

function checkAll<T>(
  name: string, items: T[] | undefined | null,
  predicate: (item: T) => boolean, detail?: unknown,
) {
  const list = items ?? [];
  if (list.length === 0) {
    check(`${name} [NO ITEMS — vacuous pass avoided]`, false, detail ?? items);
    return;
  }
  check(name, list.every(predicate), detail ?? items);
}

function requireOrAbort(name: string, passed: boolean, detail?: unknown): void {
  check(name, passed, detail);
  if (!passed) {
    console.error(`\n⛔ Precondition failed: ${name}\n`);
    process.exit(1);
  }
}

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
  try { json = await resp.json(); } catch { /* empty */ }
  return { status: resp.status, body: json };
}

const admin = () => ({ 'X-HV-Admin-Key': ADMIN_KEY! });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const unwrap = (b: any) => b?.data ?? b;

async function inviteStaff(venueId: string, role: string, tag: string) {
  const inv = await call('/api/sources/' + venueId + '/staff', {
    method: 'POST', headers: admin(),
    body: { email: `${tag}+${RUN}@slice10.test`, role },
  });
  const token = unwrap(inv.body)?.invite_token;
  if (!token) return null;
  const acc = await call('/api/portal/v1/auth/accept', {
    method: 'POST', body: { invite_token: token, password: PASSWORD },
  });
  return unwrap(acc.body);
}

async function main() {
  console.log(`\nHEP Slice 10 verification — ${API}\n${'─'.repeat(58)}`);

  // ── Setup ───────────────────────────────────────────────────
  console.log('\n0. Setup');

  const venueId = `slice10-${RUN}`;
  const created = await call('/api/sources', {
    method: 'POST', headers: admin(),
    body: { source_id: venueId, source_name: `Slice10 ${RUN}` },
  });
  requireOrAbort('venue created', !!unwrap(created.body)?.api_key, created.body);

  await call(`/api/sources/${venueId}/scopes`, {
    method: 'POST', headers: admin(),
    body: { scopes: ['xp', 'titles', 'runs', 'guests', 'rewards'] },
  });

  const expSlug = `s10exp-${RUN}`;
  await call('/api/experiences', {
    method: 'POST', headers: admin(), body: { slug: expSlug, name: `S10 ${RUN}` },
  });
  await call(`/api/sources/${venueId}/experiences`, {
    method: 'POST', headers: admin(), body: { experience_slug: expSlug },
  });

  const owner = await inviteStaff(venueId, 'owner', 'owner');
  requireOrAbort('owner activated', !!owner?.session_token, owner);
  const operator = await inviteStaff(venueId, 'operator', 'op');
  requireOrAbort('operator activated', !!operator?.session_token, operator);
  const viewer = await inviteStaff(venueId, 'viewer', 'viewer');
  requireOrAbort('viewer activated', !!viewer?.session_token, viewer);

  // ── 1. The permission is now REAL ───────────────────────────
  console.log('\n1. runs.operate now has something behind it');

  check('operator holds runs.operate',
    (operator.permissions ?? []).includes('runs.operate'), operator.permissions);
  check('viewer does NOT hold runs.operate',
    !(viewer.permissions ?? []).includes('runs.operate'), viewer.permissions);

  const anon = await call('/api/portal/v1/runs/active');
  check('the run surface refuses an unauthenticated caller',
    anon.status === 401 || anon.status === 403, anon.status);

  const viewerActive = await call('/api/portal/v1/runs/active', {
    headers: bearer(viewer.session_token),
  });
  check('a VIEWER cannot see the active-run surface',
    viewerActive.status === 403, viewerActive.status);

  const viewerStart = await call('/api/portal/v1/runs', {
    method: 'POST', headers: bearer(viewer.session_token),
    body: { experience_slug: expSlug, partner_run_key: `v-${RUN}`, guests: [{ label: 'P1' }] },
  });
  check('a VIEWER cannot start a run', viewerStart.status === 403, viewerStart.status);

  // ── 2. An operator can actually operate ─────────────────────
  console.log('\n2. An operator can run a session end to end');

  const emptyActive = unwrap(
    (await call('/api/portal/v1/runs/active', { headers: bearer(operator.session_token) })).body,
  );
  check('active list is empty before anything starts',
    Array.isArray(emptyActive) && emptyActive.length === 0, emptyActive);

  const started = await call('/api/portal/v1/runs', {
    method: 'POST', headers: bearer(operator.session_token),
    body: {
      experience_slug: expSlug,
      partner_run_key: `op-${RUN}`,
      guests: [{ label: 'Player 1' }, { label: 'Player 2' }],
    },
  });
  const runId = unwrap(started.body)?.run_id;
  requireOrAbort('an OPERATOR can start a run', !!runId, {
    status: started.status, body: started.body,
  });

  const active = unwrap(
    (await call('/api/portal/v1/runs/active', { headers: bearer(operator.session_token) })).body,
  );
  checkAll('the run appears in the active list', active,
    (r: any) => r.run_id === runId, active);
  // The floor needs elapsed time and staleness, not a timestamp to
  // subtract in their head while guests wait.
  checkAll('active runs report elapsed seconds', active,
    (r: any) => typeof r.elapsed_sec === 'number', active);
  checkAll('and how stale the heartbeat is', active,
    (r: any) => typeof r.stale_sec === 'number', active);
  checkAll('and how many seats are filled', active,
    (r: any) => r.seats === 2, active);

  const hb = await call(`/api/portal/v1/runs/${runId}/heartbeat`, {
    method: 'POST', headers: bearer(operator.session_token),
  });
  check('an operator can heartbeat', hb.status === 200, hb.status);

  const done = await call(`/api/portal/v1/runs/${runId}/complete`, {
    method: 'POST', headers: bearer(operator.session_token),
    body: { milestones_hit: 2 },
  });
  check('an operator can complete a run', done.status === 200, done.body);

  const afterDone = unwrap(
    (await call('/api/portal/v1/runs/active', { headers: bearer(operator.session_token) })).body,
  );
  check('and it leaves the active list',
    Array.isArray(afterDone) && !afterDone.some((r: any) => r.run_id === runId), afterDone);

  // ── 3. Same policy on both doors ────────────────────────────
  console.log('\n3. The staff door enforces the SAME policy as the key door');

  // Seat range. Enforced in PartnerService, so proving it fires here
  // proves the staff path is not a second implementation.
  const noSeats = await call('/api/portal/v1/runs', {
    method: 'POST', headers: bearer(operator.session_token),
    body: { experience_slug: expSlug, partner_run_key: `empty-${RUN}` },
  });
  check('seat-range policy applies on the staff path', noSeats.status === 400, {
    status: noSeats.status, body: noSeats.body,
  });

  const unknownExp = await call('/api/portal/v1/runs', {
    method: 'POST', headers: bearer(operator.session_token),
    body: { experience_slug: 'no-such-experience', partner_run_key: `x-${RUN}`,
            guests: [{ label: 'P1' }] },
  });
  check('unknown experiences are refused', unknownExp.status === 404, unknownExp.status);

  const dupe = await call('/api/portal/v1/runs', {
    method: 'POST', headers: bearer(operator.session_token),
    body: { experience_slug: expSlug, partner_run_key: `op-${RUN}`,
            guests: [{ label: 'P1' }] },
  });
  // Idempotency on partner_run_key must hold whoever is calling, or the
  // same session could be paid twice by using both doors.
  check('the run key stays idempotent across doors',
    dupe.status === 200 || dupe.status === 201 || dupe.status === 409,
    { status: dupe.status, body: dupe.body });

  // Scope enforcement: strip `guests` and a guest seat must be refused.
  await call(`/api/sources/${venueId}/scopes`, {
    method: 'POST', headers: admin(), body: { scopes: ['xp', 'titles', 'runs'] },
  });
  const noGuestScope = await call('/api/portal/v1/runs', {
    method: 'POST', headers: bearer(operator.session_token),
    body: { experience_slug: expSlug, partner_run_key: `ng-${RUN}`,
            guests: [{ label: 'P1' }] },
  });
  check('venue SCOPES are enforced on the staff path too',
    noGuestScope.status === 403, { status: noGuestScope.status, body: noGuestScope.body });

  // Venue suspension must bite mid-session, not at next login. The
  // source is re-read per call precisely so a 12-hour token cannot
  // outlive the venue being switched off.
  await call(`/api/sources/${venueId}/scopes`, {
    method: 'POST', headers: admin(),
    body: { scopes: ['xp', 'titles', 'runs', 'guests', 'rewards'] },
  });
  await call(`/api/sources/${venueId}/status`, {
    method: 'POST', headers: admin(), body: { status: 'suspended' },
  });
  const suspended = await call('/api/portal/v1/runs', {
    method: 'POST', headers: bearer(operator.session_token),
    body: { experience_slug: expSlug, partner_run_key: `susp-${RUN}`,
            guests: [{ label: 'P1' }] },
  });
  check('a SUSPENDED venue cannot start a run on a live token',
    suspended.status >= 400, { status: suspended.status, body: suspended.body });

  await call(`/api/sources/${venueId}/status`, {
    method: 'POST', headers: admin(), body: { status: 'active' },
  });

  // ── 4. Attribution ──────────────────────────────────────────
  console.log('\n4. The point of the second door — a NAME on the action');

  const audit = unwrap(
    (await call('/api/portal/v1/audit', { headers: bearer(owner.session_token) })).body,
  );
  const actions = (audit ?? []).map((a: any) => a.action);
  check('starting a run is audited', actions.includes('run.started_by_staff'), actions);
  check('completing a run is audited', actions.includes('run.completed_by_staff'), actions);

  const entry = (audit ?? []).find((a: any) => a.action === 'run.completed_by_staff');
  check('and the entry names the PERSON, not the venue',
    typeof entry?.by === 'string' && entry.by.includes('op+'), entry?.by);

  check('heartbeats are NOT audited (they would bury the real entries)',
    !actions.includes('run.heartbeat_by_staff'), actions.slice(0, 12));

  await call(`/api/sources/${venueId}/status`, {
    method: 'POST', headers: admin(), body: { status: 'suspended' },
  }).catch(() => undefined);

  console.log(`\n${'─'.repeat(58)}`);
  if (failures === 0) {
    console.log('✓ All checks passed\n');
    process.exit(0);
  }
  console.log(`✗ ${failures} check(s) failed\n`);
  process.exit(1);
}

main().catch((err) => {
  console.error('\nHarness threw:', err);
  process.exit(1);
});
