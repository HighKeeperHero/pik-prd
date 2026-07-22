// ============================================================
// HEP Phase 2 Slice 8 — support console verification
//
// The console is the only surface in the platform that reads ACROSS
// tenants, which makes its guard the most important thing here and its
// read-only-ness the second. Both are tested directly rather than
// assumed from the absence of a mutation in the source.
//
// Usage:
//   HV_API_URL=http://localhost:8099 \
//   HV_PLATFORM_ADMIN_KEY=<key> \
//   npx ts-node scripts/verify-slice8.ts
// ============================================================

const API = process.env.HV_API_URL?.replace(/\/$/, '');
const ADMIN_KEY = process.env.HV_PLATFORM_ADMIN_KEY;

if (!API || !ADMIN_KEY) {
  console.error('Missing env: HV_API_URL, HV_PLATFORM_ADMIN_KEY');
  process.exit(2);
}

const RUN = `s8-${Date.now().toString(36)}`;
const PASSWORD = `Portal-${RUN}!`;
let failures = 0;

function check(name: string, passed: boolean, detail?: unknown) {
  console.log(`  ${passed ? '✓' : '✗'} ${name}`);
  if (!passed) {
    failures++;
    if (detail !== undefined) {
      console.log(`      got: ${JSON.stringify(detail)?.slice(0, 300)}`);
    }
  }
}

function checkAll<T>(
  name: string,
  items: T[] | undefined | null,
  predicate: (item: T) => boolean,
  detail?: unknown,
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
const apiKey = (k: string) => ({ 'X-PIK-API-Key': k });
const unwrap = (b: any) => b?.data ?? b;

async function main() {
  console.log(`\nHEP Slice 8 verification — ${API}\n${'─'.repeat(58)}`);

  // ── 1. The guard ────────────────────────────────────────────
  console.log('\n1. The guard — this is the only cross-tenant surface');

  const anon = await call('/api/support/venues');
  check('the index refuses an unauthenticated caller',
    anon.status === 403 || anon.status === 401 || anon.status === 503, anon.status);

  const wrongKey = await call('/api/support/venues', {
    headers: { 'X-HV-Admin-Key': 'not-the-key' },
  });
  check('and refuses a wrong admin key', wrongKey.status === 403, wrongKey.status);

  // ── Setup ───────────────────────────────────────────────────
  console.log('\n2. Setup — a venue with something wrong with it');

  const venueId = `slice8-${RUN}`;
  const created = await call('/api/sources', {
    method: 'POST', headers: admin(),
    body: { source_id: venueId, source_name: `Slice8 ${RUN}` },
  });
  const venueKey = unwrap(created.body)?.api_key;
  requireOrAbort('venue created', !!venueKey, created.body);

  await call(`/api/sources/${venueId}/scopes`, {
    method: 'POST', headers: admin(),
    body: { scopes: ['xp', 'titles', 'runs', 'guests', 'rewards'] },
  });

  // An owner who never accepts — the exact state that stranded
  // heroes-demo-venue and was invisible until someone read the database.
  const strandedInvite = await call(`/api/sources/${venueId}/staff`, {
    method: 'POST', headers: admin(),
    body: { email: `stranded@${venueId}.test`, role: 'owner' },
  });
  requireOrAbort('a stranded invite exists', !!unwrap(strandedInvite.body)?.invite_token,
    strandedInvite.body);

  // ── 3. The index flags it ───────────────────────────────────
  console.log('\n3. The index says what is wrong');

  const index = unwrap((await call('/api/support/venues', { headers: admin() })).body);
  requireOrAbort('index responds', Array.isArray(index?.venues), index);

  const mine = (index.venues ?? []).find((v: any) => v.source_id === venueId);
  requireOrAbort('the new venue appears', !!mine, index.venues?.slice(0, 3));

  check('it reports zero active staff', mine?.staff_active === 0, mine);
  check('and one pending invite', mine?.staff_invited === 1, mine);
  check('it is FLAGGED as having only invites',
    (mine?.flags ?? []).includes('no_active_staff_only_invites'), mine?.flags);
  check('and flagged as having no rooms', (mine?.flags ?? []).includes('no_rooms'), mine?.flags);
  check('the index counts venues needing attention', index.needing_attention >= 1, index);
  checkAll('every venue row carries a flags array', index.venues,
    (v: any) => Array.isArray(v.flags), index.venues?.slice(0, 3));

  // A venue with no rewards scope must be flagged, because "it paid
  // nothing" is the most common support question and this is usually why.
  const noMintId = `slice8-nomint-${RUN}`;
  await call('/api/sources', {
    method: 'POST', headers: admin(),
    body: { source_id: noMintId, source_name: 'No mint' },
  });
  await call(`/api/sources/${noMintId}/scopes`, {
    method: 'POST', headers: admin(), body: { scopes: ['xp', 'runs'] },
  });
  const index2 = unwrap((await call('/api/support/venues', { headers: admin() })).body);
  const noMint = (index2.venues ?? []).find((v: any) => v.source_id === noMintId);
  check('a venue that cannot mint is flagged',
    (noMint?.flags ?? []).includes('cannot_mint'), noMint?.flags);

  // ── 4. Detail view ──────────────────────────────────────────
  console.log('\n4. The detail view');

  const missing = await call('/api/support/venues/does-not-exist', { headers: admin() });
  check('an unknown venue is a 404', missing.status === 404, missing.status);

  const detail = unwrap(
    (await call(`/api/support/venues/${venueId}`, { headers: admin() })).body,
  );
  requireOrAbort('detail responds', !!detail?.venue, detail);

  check('it names the venue', detail.venue?.source_id === venueId, detail.venue);
  check('it states whether the venue can mint', detail.venue?.can_mint_rewards === true,
    detail.venue);
  checkAll('staff are listed with their state', detail.staff,
    (s: any) => !!s.email && !!s.status, detail.staff);
  check('a stranded invite is visibly an invite',
    (detail.staff ?? []).some((s: any) => s.status === 'invited'), detail.staff);
  check('the telemetry rollup is embedded', Array.isArray(detail.telemetry?.thresholds),
    Object.keys(detail.telemetry ?? {}));
  check('remediation routes are listed rather than implemented',
    !!detail.remediation?.reissue_invite, detail.remediation);

  // ── 5. Player data minimisation ─────────────────────────────
  console.log('\n5. Player data — root_id and reward state, nothing else');

  // Settle a real run so there is a seat to inspect.
  const expSlug = `s8exp-${RUN}`;
  await call('/api/experiences', {
    method: 'POST', headers: admin(), body: { slug: expSlug, name: `S8 ${RUN}` },
  });
  await call(`/api/sources/${venueId}/experiences`, {
    method: 'POST', headers: admin(), body: { experience_slug: expSlug },
  });

  const reg = await call('/api/account/register', {
    method: 'POST',
    body: { email: `s8+${RUN}@slice8.test`, password: `Sl8ce-${RUN}!`, display_name: 'S8' },
  });
  let pTok = unwrap(reg.body)?.session_token;
  const heroName = `S8H${Date.now().toString(36).slice(-5)}`;
  const hero = await call('/api/account/heroes', {
    method: 'POST', headers: bearer(pTok),
    body: { hero_name: heroName, alignment: 'ORDER' },
  });
  const rootId = unwrap(hero.body)?.root_id ?? unwrap(hero.body)?.hero?.root_id;
  requireOrAbort('test hero created', !!rootId, hero.body);
  const sel = await call(`/api/account/heroes/${rootId}/select`, {
    method: 'POST', headers: bearer(pTok),
  });
  pTok = unwrap(sel.body)?.session_token ?? pTok;
  await call(`/api/venues/${venueId}/check-in`, {
    method: 'POST', headers: bearer(pTok), body: {},
  });

  const started = await call('/api/partner/v1/runs', {
    method: 'POST', headers: apiKey(venueKey),
    body: { experience_slug: expSlug, partner_run_key: `s8-${RUN}`, root_ids: [rootId] },
  });
  const runId = unwrap(started.body)?.run_id;
  requireOrAbort('a run could be started', !!runId, {
    status: started.status, body: started.body,
  });
  await call(`/api/partner/v1/runs/${runId}/complete`, {
    method: 'POST', headers: apiKey(venueKey),
    body: { outcome: 'victory', milestones_hit: 1 },
  });

  const withRun = unwrap(
    (await call(`/api/support/venues/${venueId}`, { headers: admin() })).body,
  );
  const run = (withRun.runs ?? []).find((r: any) => r.run_id === runId);
  requireOrAbort('the run appears in support', !!run, withRun.runs?.slice(0, 2));

  checkAll('seats report root_id and reward state', run.seats,
    (s: any) => 'root_id' in s && 'reward_state' in s, run.seats);
  checkAll('and answer "is this stuck" directly', run.seats,
    (s: any) => typeof s.reward_stuck === 'boolean', run.seats);
  check('the paid seat is not stuck',
    run.seats?.some((s: any) => s.root_id === rootId && s.reward_stuck === false), run.seats);

  // The privacy property. The hero name must NOT appear anywhere in the
  // payload — a Heroes-internal screen reading across every venue should
  // not leak player identity on every page render.
  const serialized = JSON.stringify(withRun);
  check('the hero NAME does not appear anywhere in the payload',
    !serialized.includes(heroName), heroName);
  check('the player account email does not appear either',
    !serialized.includes(`s8+${RUN}@slice8.test`), 'player email leaked');

  // ── 6. Read-only ────────────────────────────────────────────
  console.log('\n6. Read-only by construction');

  for (const [verb, label] of [
    ['POST', 'POST'], ['PATCH', 'PATCH'], ['DELETE', 'DELETE'], ['PUT', 'PUT'],
  ] as const) {
    const res = await call(`/api/support/venues/${venueId}`, {
      method: verb, headers: admin(), body: { status: 'suspended' },
    });
    // 404/405 both mean "no such route" — what matters is that it is
    // not 2xx. A support console that can mutate across every tenant is
    // the largest blast radius in the platform.
    check(`${label} on a support route is not accepted`, res.status >= 400, res.status);
  }

  await call(`/api/sources/${venueId}/status`, {
    method: 'POST', headers: admin(), body: { status: 'suspended' },
  }).catch(() => undefined);
  await call(`/api/sources/${noMintId}/status`, {
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
