// ============================================================
// HEP Phase 2 Slice 6 — telemetry verification
//
// Asserts ingestion, unit discipline, tenant isolation, and the
// threshold rollup.
//
// The rollup gets the most scrutiny. Its failure mode is the one this
// project keeps having to unlearn: a table of green ticks that is green
// because nothing was measured. `no_data` must never read as `pass`.
//
// Usage:
//   HV_API_URL=http://localhost:8099 \
//   HV_PLATFORM_ADMIN_KEY=<key> \
//   npx ts-node scripts/verify-slice6.ts
// ============================================================

const API = process.env.HV_API_URL?.replace(/\/$/, '');
const ADMIN_KEY = process.env.HV_PLATFORM_ADMIN_KEY;

if (!API || !ADMIN_KEY) {
  console.error('Missing env: HV_API_URL, HV_PLATFORM_ADMIN_KEY');
  process.exit(2);
}

const RUN = `s6-${Date.now().toString(36)}`;
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

const metric = (m: string, value: number, unit: string) => ({
  metric: m, value, unit, captured_at: new Date().toISOString(),
});

async function main() {
  console.log(`\nHEP Slice 6 verification — ${API}\n${'─'.repeat(58)}`);

  // ── Setup ───────────────────────────────────────────────────
  console.log('\n0. Setup');

  const venueId = `slice6-${RUN}`;
  const created = await call('/api/sources', {
    method: 'POST', headers: admin(),
    body: { source_id: venueId, source_name: `Slice6 ${RUN}` },
  });
  const venueKey = unwrap(created.body)?.api_key;
  requireOrAbort('venue created', !!venueKey, created.body);

  const invite = await call(`/api/sources/${venueId}/staff`, {
    method: 'POST', headers: admin(),
    body: { email: `owner@${venueId}.test`, role: 'owner' },
  });
  const accepted = await call('/api/portal/v1/auth/accept', {
    method: 'POST',
    body: { invite_token: unwrap(invite.body)?.invite_token, password: PASSWORD },
  });
  const owner = unwrap(accepted.body)?.session_token;
  requireOrAbort('owner activated', !!owner, accepted.body);

  // ── 1. An empty table must not look healthy ─────────────────
  console.log('\n1. No data is NOT a pass');

  const empty = unwrap(
    (await call('/api/portal/v1/spatial/metrics', { headers: bearer(owner) })).body,
  );
  requireOrAbort('metrics endpoint responds', !!empty?.thresholds, empty);
  check('a venue with no telemetry reports zero samples', empty?.total_samples === 0, empty);
  checkAll(
    'every threshold reports no_data rather than pass',
    empty?.thresholds,
    (t: any) => t.status === 'no_data',
    empty?.thresholds,
  );
  check('and none are counted as passing', empty?.summary?.pass === 0, empty?.summary);
  checkAll(
    'no_data thresholds report a null observation',
    empty?.thresholds,
    (t: any) => t.observed === null,
    empty?.thresholds,
  );

  // ── 2. Ingestion ────────────────────────────────────────────
  console.log('\n2. Ingestion');

  const noAuth = await call('/api/partner/v1/telemetry', {
    method: 'POST', body: { metrics: [metric('anchor.rotation_error_deg', 1, 'deg')] },
  });
  check('telemetry refuses an unauthenticated caller', noAuth.status === 403, noAuth.status);

  const emptyBatch = await call('/api/partner/v1/telemetry', {
    method: 'POST', headers: apiKey(venueKey), body: { metrics: [] },
  });
  check('an empty batch is rejected', emptyBatch.status === 400, emptyBatch.status);

  const good = await call('/api/partner/v1/telemetry', {
    method: 'POST', headers: apiKey(venueKey),
    body: {
      metrics: [
        metric('anchor.translation_error_m', 0.02, 'm'),
        metric('anchor.translation_error_m', 0.03, 'm'),
        metric('anchor.rotation_error_deg', 1.1, 'deg'),
        metric('anchor.localization_success', 1, 'ratio'),
      ],
    },
  });
  check('a valid batch is accepted', good.status === 202, good.body);
  check('and reports how many landed', unwrap(good.body)?.accepted === 4, good.body);

  // Partial acceptance: one bad sample must not cost the whole session.
  const mixed = await call('/api/partner/v1/telemetry', {
    method: 'POST', headers: apiKey(venueKey),
    body: {
      metrics: [
        metric('anchor.rotation_error_deg', 0.8, 'deg'),
        { metric: 'anchor.rotation_error_deg', value: 'not-a-number', unit: 'deg' },
        { value: 1, unit: 'm' },
        metric('anchor.rotation_error_deg', 999, 'deg'),
      ],
    },
  });
  const mixedBody = unwrap(mixed.body);
  check('a mixed batch accepts the good rows', mixedBody?.accepted === 2, mixedBody);
  check('and reports the bad ones', mixedBody?.rejected === 2, mixedBody);
  checkAll('each rejection says why', mixedBody?.issues,
    (i: any) => typeof i.reason === 'string' && i.reason.length > 0, mixedBody?.issues);

  // The unit check. A known metric in the wrong unit is worse than an
  // unknown one — centimetres judged against a metre threshold pass
  // every time and the room looks perfect while being 20cm out.
  const wrongUnit = await call('/api/partner/v1/telemetry', {
    method: 'POST', headers: apiKey(venueKey),
    body: { metrics: [metric('anchor.translation_error_m', 3, 'cm')] },
  });
  check('a known metric in the WRONG unit is rejected',
    unwrap(wrongUnit.body)?.rejected === 1, wrongUnit.body);
  check('and the reason names the expected unit',
    /'m'/.test(JSON.stringify(unwrap(wrongUnit.body)?.issues ?? [])), wrongUnit.body);

  const future = await call('/api/partner/v1/telemetry', {
    method: 'POST', headers: apiKey(venueKey),
    body: {
      metrics: [{
        metric: 'anchor.rotation_error_deg', value: 1, unit: 'deg',
        captured_at: new Date(Date.now() + 86400_000).toISOString(),
      }],
    },
  });
  check('a future timestamp is rejected', unwrap(future.body)?.rejected === 1, future.body);

  const badRun = await call('/api/partner/v1/telemetry', {
    method: 'POST', headers: apiKey(venueKey),
    body: { run_id: '00000000-0000-0000-0000-000000000000',
            metrics: [metric('anchor.rotation_error_deg', 1, 'deg')] },
  });
  check('an unknown run id is rejected', badRun.status === 400, badRun.status);

  // Unknown metrics are STORED, not refused — the partner must be able
  // to record something we did not think to ask for.
  const novel = await call('/api/partner/v1/telemetry', {
    method: 'POST', headers: apiKey(venueKey),
    body: { metrics: [metric('partner.thermal_throttle_events', 2, 'count')] },
  });
  check('an UNKNOWN metric is accepted, not refused',
    unwrap(novel.body)?.accepted === 1, novel.body);

  // ── 3. The rollup ───────────────────────────────────────────
  console.log('\n3. Threshold evaluation');

  const rollup = unwrap(
    (await call('/api/portal/v1/spatial/metrics', { headers: bearer(owner) })).body,
  );
  const byMetric = new Map<string, any>(
    (rollup?.thresholds ?? []).map((t: any) => [t.metric, t]),
  );

  check('samples are now counted', rollup?.total_samples > 0, rollup?.total_samples);

  const trans = byMetric.get('anchor.translation_error_m');
  check('a measured threshold leaves no_data', trans?.status !== 'no_data', trans);
  check('translation error passes at 2-3cm', trans?.status === 'pass', trans);
  check('and reports its target', trans?.target === 0.05, trans);
  check('lower-is-better uses p95, not mean', trans?.statistic === 'p95', trans);

  // The 999° outlier must drag p95 over the 2° threshold. This is the
  // reason for p95: a mean would bury it and report a healthy room.
  const rot = byMetric.get('anchor.rotation_error_deg');
  check('a bad outlier FAILS its threshold', rot?.status === 'fail', rot);
  check('and the observed value reflects the tail', (rot?.observed ?? 0) > 2, rot);

  checkAll(
    'unmeasured thresholds still report no_data',
    (rollup?.thresholds ?? []).filter((t: any) => t.samples === 0),
    (t: any) => t.status === 'no_data',
    rollup?.thresholds,
  );

  check('the unknown metric is surfaced as unmeasured',
    (rollup?.unmeasured_metrics ?? []).includes('partner.thermal_throttle_events'),
    rollup?.unmeasured_metrics);

  // ── 3b. Reward sync is DERIVED, not reported ────────────────
  console.log('\n3b. Reward synchronization (derived from our own ledger)');

  const rs = byMetric.get('rewards.sync_success');
  check('reward sync is marked as derived', rs?.derived === true, rs);
  // A venue with no settled runs has an EMPTY denominator. Reporting
  // 100% there would be the vacuous pass wearing a percentage sign.
  check('with no eligible seats it is no_data, NOT 100%',
    rs?.status === 'no_data' && rs?.observed === null, rs);

  // Now settle a real run so the metric has something to measure.
  const expSlug = `rs-${RUN}`;
  await call('/api/experiences', {
    method: 'POST', headers: admin(), body: { slug: expSlug, name: `RS ${RUN}` },
  });
  await call(`/api/sources/${venueId}/experiences`, {
    method: 'POST', headers: admin(), body: { experience_slug: expSlug },
  });
  await call(`/api/sources/${venueId}/scopes`, {
    method: 'POST', headers: admin(),
    body: { scopes: ['xp', 'titles', 'runs', 'guests', 'rewards'] },
  });

  const player = await call('/api/account/register', {
    method: 'POST',
    body: { email: `rs+${RUN}@slice6.test`, password: `Sl6ce-${RUN}!`, display_name: 'RS' },
  });
  let pTok = unwrap(player.body)?.session_token;
  const hero = await call('/api/account/heroes', {
    method: 'POST', headers: bearer(pTok),
    body: { hero_name: `RS${Date.now().toString(36).slice(-5)}`, alignment: 'ORDER' },
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
    body: {
      experience_slug: expSlug,
      partner_run_key: `rs-${RUN}`,
      root_ids: [rootId],
    },
  });
  const runId = unwrap(started.body)?.run_id;

  // Deliberately NOT a skip. The derived metric is the whole point of
  // this section, and a harness that quietly steps over its own subject
  // reports green while proving nothing — the same vacuous pass that has
  // now bitten this project three times, wearing a "skipped" label.
  requireOrAbort('a run could be started to measure', !!runId, {
    status: started.status, body: started.body,
  });

  {
    const done = await call(`/api/partner/v1/runs/${runId}/complete`, {
      method: 'POST', headers: apiKey(venueKey),
      body: { outcome: 'victory', milestones_hit: 2 },
    });
    check('the run settled', done.status === 200 || done.status === 201, done.body);

    const after = unwrap(
      (await call('/api/portal/v1/spatial/metrics', { headers: bearer(owner) })).body,
    );
    const rs2 = (after?.thresholds ?? []).find(
      (t: any) => t.metric === 'rewards.sync_success',
    );
    check('an identified seat that was paid counts as delivered',
      rs2?.observed === 1 && rs2?.status === 'pass', rs2);
    check('and the eligible count is now non-zero', (rs2?.samples ?? 0) > 0, rs2);
    check('the breakdown names what is stuck', rs2?.detail?.stuck_pending === 0, rs2?.detail);
    check('it needed NO client telemetry to compute',
      rs2?.derived === true && rs2?.statistic === 'derived', rs2);
  }

  // ── 4. Tenant isolation ─────────────────────────────────────
  console.log('\n4. Tenant isolation');

  const otherId = `slice6-other-${RUN}`;
  const other = await call('/api/sources', {
    method: 'POST', headers: admin(), body: { source_id: otherId, source_name: 'Other' },
  });
  const otherKey = unwrap(other.body)?.api_key;
  requireOrAbort('second venue created', !!otherKey, other.body);

  await call('/api/partner/v1/telemetry', {
    method: 'POST', headers: apiKey(otherKey),
    body: { metrics: [metric('anchor.translation_error_m', 0.9, 'm')] },
  });

  const mine = unwrap(
    (await call('/api/portal/v1/spatial/metrics', { headers: bearer(owner) })).body,
  );
  const myTrans = (mine?.thresholds ?? []).find(
    (t: any) => t.metric === 'anchor.translation_error_m',
  );
  // 0.9m from the other venue would blow p95 well past 5cm. Still
  // passing proves the rollup is scoped.
  check("another venue's telemetry does not appear in this rollup",
    myTrans?.status === 'pass', myTrans);
  check('and does not inflate the sample count',
    mine?.total_samples === rollup?.total_samples, {
      before: rollup?.total_samples, after: mine?.total_samples,
    });

  await call(`/api/sources/${venueId}/status`, {
    method: 'POST', headers: admin(), body: { status: 'suspended' },
  }).catch(() => undefined);
  await call(`/api/sources/${otherId}/status`, {
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
