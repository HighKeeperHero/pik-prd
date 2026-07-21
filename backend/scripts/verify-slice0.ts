// ============================================================
// HEP Phase 2 Slice 0 — verification harness
//
// Exercises the partner-facing contract against a RUNNING backend and
// asserts the Slice 0 guarantees:
//
//   1. Operator routes reject requests without the staff key
//   2. A partner API key cannot act on another venue's session
//   3. Ingest replays (same event_id) do not re-grant rewards
//   4. Scope enforcement rejects out-of-scope event types
//   5. Partner XP lands on the canonical Fate curve
//
// This is deliberately a black-box HTTP harness, not a unit test: the
// thing worth proving is the contract an external XR team will build
// against, and that contract is the wire format.
//
// Usage:
//   HV_API_URL=https://<host> \
//   HV_PLATFORM_ADMIN_KEY=<staff key> \
//   HV_TEST_ROOT_ID=<an existing hero root_id> \
//   npx ts-node scripts/verify-slice0.ts
//
// The script creates a throwaway Source, grants consent from the test
// hero to it, runs the checks, then suspends the Source. It never
// deletes the hero and never touches other venues.
// ============================================================

const API = process.env.HV_API_URL?.replace(/\/$/, '');
const ADMIN_KEY = process.env.HV_PLATFORM_ADMIN_KEY;
const ROOT_ID = process.env.HV_TEST_ROOT_ID;

if (!API || !ADMIN_KEY || !ROOT_ID) {
  console.error(
    'Missing required env: HV_API_URL, HV_PLATFORM_ADMIN_KEY, HV_TEST_ROOT_ID',
  );
  process.exit(2);
}

// A per-run suffix keeps repeat runs from colliding on the source id.
const RUN = `slice0-${Date.now()}`;

let failures = 0;

function check(name: string, passed: boolean, detail?: unknown) {
  if (passed) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}`);
    if (detail !== undefined) {
      console.log(`      got: ${JSON.stringify(detail)}`);
    }
  }
}

async function call(
  path: string,
  opts: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
) {
  const resp = await fetch(`${API}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null;
  try {
    json = await resp.json();
  } catch {
    /* some errors return an empty body */
  }
  return { status: resp.status, body: json };
}

const asAdmin = (headers: Record<string, string> = {}) => ({
  'X-HV-Admin-Key': ADMIN_KEY!,
  ...headers,
});

const asPartner = (key: string, headers: Record<string, string> = {}) => ({
  'X-PIK-API-Key': key,
  ...headers,
});

/** Unwrap the global response interceptor's { status, data } envelope. */
function unwrap(body: any) {
  return body?.data ?? body;
}

/**
 * GET /api/users/:id nests progression under data.progression — reading the
 * top level yields undefined, which makes the "no additional XP" assertion
 * pass by comparing undefined to undefined.
 */
async function heroState() {
  const r = await call(`/api/users/${ROOT_ID}`, { headers: asAdmin() });
  const p = unwrap(r.body)?.progression;
  if (typeof p?.fate_xp !== 'number' || typeof p?.fate_level !== 'number') {
    throw new Error(
      `Could not read hero progression for ${ROOT_ID} — got ${JSON.stringify(r.body)?.slice(0, 200)}`,
    );
  }
  return { xp: p.fate_xp, level: p.fate_level };
}

async function main() {
  console.log(`\nHEP Slice 0 verification against ${API}\n`);

  // ── 1. Operator routes are closed ──────────────────────────────────
  console.log('1. Operator routes reject unauthenticated callers');
  for (const [path, method] of [
    ['/api/sources', 'GET'],
    ['/api/sessions/live', 'GET'],
    ['/api/sessions/recent', 'GET'],
  ] as const) {
    const r = await call(path, { method });
    check(`${method} ${path} → 403`, r.status === 403, r.status);
  }

  const impersonate = await call(`/api/auth/impersonate/${ROOT_ID}`, {
    method: 'POST',
  });
  check(
    'POST /api/auth/impersonate/:id → 403 (was wide open)',
    impersonate.status === 403,
    impersonate.status,
  );

  const lootGrant = await call('/api/loot/grant', {
    method: 'POST',
    body: { root_id: ROOT_ID, cache_type: 'level_up' },
  });
  check(
    'POST /api/loot/grant → 403 (was wide open)',
    lootGrant.status === 403,
    lootGrant.status,
  );

  const withAdmin = await call('/api/sources', { headers: asAdmin() });
  check(
    'GET /api/sources with staff key → 200',
    withAdmin.status === 200,
    withAdmin.status,
  );

  // ── 2. Provision a throwaway partner ───────────────────────────────
  console.log('\n2. Provision a scoped test partner');
  const created = await call('/api/sources', {
    method: 'POST',
    headers: asAdmin(),
    body: { source_id: RUN, source_name: `Slice 0 Harness ${RUN}` },
  });
  const partnerKey = unwrap(created.body)?.api_key;
  check('source created with an api key', Boolean(partnerKey), created.status);
  if (!partnerKey) {
    console.error('\nCannot continue without a partner key.');
    process.exit(1);
  }

  const consent = await call(`/api/users/${ROOT_ID}/links`, {
    method: 'POST',
    headers: asAdmin(),
    body: { source_id: RUN, scope: 'xp', granted_by: `operator:${RUN}` },
  });
  check(
    'consent granted with narrow scope "xp"',
    consent.status === 200 || consent.status === 201,
    consent.status,
  );

  // ── 3. Scope enforcement ───────────────────────────────────────────
  console.log('\n3. Scope enforcement');
  const outOfScope = await call('/api/ingest', {
    method: 'POST',
    headers: asPartner(partnerKey),
    body: {
      event_id: `${RUN}-scope`,
      root_id: ROOT_ID,
      event_type: 'progression.title_granted',
      payload: { title_id: 'title_fate_awakened' },
    },
  });
  check(
    'title_granted with only "xp" scope → 403',
    outOfScope.status === 403,
    { status: outOfScope.status, body: outOfScope.body },
  );

  // ── 4. Idempotency ─────────────────────────────────────────────────
  console.log('\n4. Ingest idempotency');
  const before = await heroState();

  const eventId = `${RUN}-session-1`;
  const payload = {
    event_id: eventId,
    root_id: ROOT_ID,
    event_type: 'progression.session_completed',
    payload: { difficulty: 'normal', nodes_completed: 3, boss_damage_pct: 60 },
  };

  const first = await call('/api/ingest', {
    method: 'POST',
    headers: asPartner(partnerKey),
    body: payload,
  });
  check('first ingest accepted', first.status === 200 || first.status === 201, first.status);

  const afterFirst = await heroState();
  const gained = (afterFirst.xp ?? 0) - (before.xp ?? 0);
  check('first ingest granted XP', gained > 0, { before, afterFirst });

  const replay = await call('/api/ingest', {
    method: 'POST',
    headers: asPartner(partnerKey),
    body: payload,
  });
  const replayBody = unwrap(replay.body);
  check('replay flagged as replayed', replayBody?.replayed === true, replayBody);

  const afterReplay = await heroState();
  check(
    'replay granted NO additional XP',
    afterReplay.xp === afterFirst.xp,
    { afterFirst, afterReplay },
  );

  // ── 5. Canonical curve ─────────────────────────────────────────────
  console.log('\n5. Partner XP uses the canonical Fate curve');
  const { levelFromXp } = await import('../src/leveling/leveling.service');
  const expectedLevel = Math.max(before.level ?? 1, levelFromXp(afterReplay.xp ?? 0));
  check(
    `hero level matches levelFromXp(${afterReplay.xp}) = ${expectedLevel}`,
    afterReplay.level === expectedLevel,
    afterReplay,
  );

  // ── 6. Tenant isolation on sessions ────────────────────────────────
  console.log('\n6. Tenant isolation');
  const foreign = await call('/api/sessions/source/hv_first_party', {
    headers: asPartner(partnerKey),
  });
  check(
    "reading another venue's sessions → 403",
    foreign.status === 403,
    foreign.status,
  );

  // ── Cleanup ────────────────────────────────────────────────────────
  console.log('\n7. Cleanup');
  const suspended = await call(`/api/sources/${RUN}/status`, {
    method: 'POST',
    headers: asAdmin(),
    body: { status: 'suspended' },
  });
  check(
    'test source suspended',
    suspended.status === 200 || suspended.status === 201,
    suspended.status,
  );

  console.log(
    failures === 0
      ? '\n✅ Slice 0 verified — all checks passed\n'
      : `\n❌ ${failures} check(s) failed\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nHarness crashed:', err);
  process.exit(1);
});
