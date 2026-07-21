// ============================================================
// HEP Phase 2 Slice 1 — verification harness
//
// fake-venue.ts is the DEMO: it drives a run and prints what happened.
// This is the TEST: it asserts the guarantees, and exits non-zero when
// one fails to hold.
//
// Covers the slice's definition of done:
//   1. A run pays identified heroes on completion
//   2. Settling twice pays once (idempotent)
//   3. A guest seat yields a claim token; a NEW account redeems it
//   4. Redeeming twice pays once
//   5. Outcome weighting is real (timeout pays ~half, and no loot)
//   6. A venue without the `rewards` scope runs but does not pay
//   7. A venue cannot touch another venue's run (tenant isolation)
//   8. Retuning Experience.rewards changes payout WITHOUT a deploy
//
// Usage:
//   HV_API_URL=https://pik-prd-staging.up.railway.app \
//   HV_PLATFORM_ADMIN_KEY=<staff key> \
//   HV_TEST_ROOT_ID=<hero A> \
//   npx ts-node scripts/verify-slice1.ts
//
// Or without handling the secret:
//   railway run --environment Staging --service pik-prd -- npx ts-node scripts/verify-slice1.ts
// ============================================================

const API = process.env.HV_API_URL?.replace(/\/$/, '');
const ADMIN_KEY = process.env.HV_PLATFORM_ADMIN_KEY;
const ROOT_A = process.env.HV_TEST_ROOT_ID;

if (!API || !ADMIN_KEY || !ROOT_A) {
  console.error('Missing env: HV_API_URL, HV_PLATFORM_ADMIN_KEY, HV_TEST_ROOT_ID');
  process.exit(2);
}

const RUN = `s1-${Date.now()}`;
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

/**
 * Assert over a collection that must not be empty.
 *
 * `[].every(...)` is TRUE — vacuously. The first run of this harness reported
 * "seats skipped for lack of rewards scope ✓" against an empty seat list,
 * because the run it was inspecting had never started. A test that passes
 * when nothing happened is worse than one that fails: it manufactures
 * confidence. Anything asserting over seats or participants goes through here.
 */
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

/** Stop the run when a precondition fails, instead of emitting doomed noise. */
function requireOrAbort(name: string, passed: boolean, detail?: unknown): void {
  check(name, passed, detail);
  if (!passed) {
    console.error(
      `\n⛔ Precondition failed: ${name}\n` +
        `   Remaining checks would fail for this reason alone and tell you nothing.\n`,
    );
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
  try {
    json = await resp.json();
  } catch {
    /* empty */
  }
  return { status: resp.status, body: json };
}

const admin = () => ({ 'X-HV-Admin-Key': ADMIN_KEY! });
const venue = (k: string) => ({ 'X-PIK-API-Key': k });
const unwrap = (b: any) => b?.data ?? b;

async function xpOf(rootId: string): Promise<number> {
  const r = await call(`/api/users/${rootId}`, { headers: admin() });
  const xp = unwrap(r.body)?.progression?.fate_xp;
  if (typeof xp !== 'number') {
    throw new Error(`Cannot read XP for ${rootId}: ${JSON.stringify(r.body)?.slice(0, 200)}`);
  }
  return xp;
}

/** Provision a venue with the given scopes and the Kingvale assignment. */
async function makeVenue(id: string, scopes: string[]) {
  const created = await call('/api/sources', {
    method: 'POST',
    headers: admin(),
    body: { source_id: id, source_name: `Slice1 ${id}` },
  });
  const key = unwrap(created.body)?.api_key;
  if (!key) throw new Error(`venue provision failed: ${JSON.stringify(created.body)}`);

  await call(`/api/sources/${id}/scopes`, {
    method: 'POST', headers: admin(), body: { scopes },
  });
  await call(`/api/sources/${id}/experiences`, {
    method: 'POST', headers: admin(), body: { experience_slug: 'echoes_of_kingvale' },
  });
  return key;
}

async function consent(rootId: string, sourceId: string) {
  return call(`/api/users/${rootId}/links`, {
    method: 'POST',
    headers: admin(),
    body: { source_id: sourceId, scope: 'xp titles runs rewards guests', granted_by: `operator:${RUN}` },
  });
}

/**
 * Create a throwaway account + hero, exactly as a walk-in would after
 * installing Codex. Returns an AccountSession bearer token — the auth the
 * claim route actually expects.
 */
async function registerWalkIn(): Promise<{ sessionToken: string; rootId: string } | null> {
  const stamp = Date.now().toString(36);
  const reg = await call('/api/account/register', {
    method: 'POST',
    body: {
      email: `walkin+${stamp}@slice1.test`,
      password: `Sl1ce-${stamp}!`,
      display_name: `Walkin ${stamp}`,
    },
  });
  let sessionToken = unwrap(reg.body)?.session_token;
  if (!sessionToken) return null;

  const hero = await call('/api/account/heroes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sessionToken}` },
    body: { hero_name: `Walkin${stamp}`, alignment: 'ORDER' },
  });
  const rootId = unwrap(hero.body)?.root_id ?? unwrap(hero.body)?.hero?.root_id;
  if (!rootId) return null;

  // Selecting the hero is what binds heroId onto the session, which the
  // claim route reads. It may also reissue the token.
  const sel = await call(`/api/account/heroes/${rootId}/select`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  sessionToken = unwrap(sel.body)?.session_token ?? sessionToken;

  return { sessionToken, rootId };
}

async function cleanup(ids: string[]) {
  for (const id of ids) {
    await call(`/api/sources/${id}/status`, {
      method: 'POST', headers: admin(), body: { status: 'suspended' },
    }).catch(() => undefined);
  }
}

async function main() {
  console.log(`\nHEP Slice 1 verification against ${API}\n`);
  const venues = [`${RUN}-a`, `${RUN}-b`, `${RUN}-nopay`];

  // ── Setup ────────────────────────────────────────────────────────
  console.log('0. Provision');
  const keyA = await makeVenue(venues[0], ['xp', 'titles', 'runs', 'rewards', 'guests']);
  const keyB = await makeVenue(venues[1], ['xp', 'titles', 'runs', 'rewards', 'guests']);
  // Differs from keyA by EXACTLY one scope — `rewards`. Isolating the
  // variable is the point: the first run failed here on the missing
  // `guests` scope instead, which told us nothing about reward gating.
  const keyNoPay = await makeVenue(venues[2], ['xp', 'titles', 'runs', 'guests']);
  await consent(ROOT_A!, venues[0]);
  await consent(ROOT_A!, venues[2]);
  requireOrAbort(
    'three venues provisioned with distinct scopes',
    Boolean(keyA && keyB && keyNoPay),
  );

  const status = await call('/api/partner/v1/venue', { headers: venue(keyA) });
  requireOrAbort(
    'venue status lists the assigned experience',
    unwrap(status.body)?.experiences?.some((e: any) => e.slug === 'echoes_of_kingvale'),
    // Almost always means the seed never ran. `railway run` injects the
    // INTERNAL database host (postgres.railway.internal), which does not
    // resolve from a laptop — the seed must override DATABASE_URL with
    // DATABASE_PUBLIC_URL. See scripts/README-slice1.md.
    status.body,
  );

  // ── 1. Victory pays ──────────────────────────────────────────────
  console.log('\n1. Victory pays identified heroes');
  const before = await xpOf(ROOT_A!);

  const started = await call('/api/partner/v1/runs', {
    method: 'POST', headers: venue(keyA),
    body: {
      experience_slug: 'echoes_of_kingvale',
      partner_run_key: `${RUN}-r1`,
      root_ids: [ROOT_A],
      guests: [{ label: 'Walk-in 1' }],
    },
  });
  const run = unwrap(started.body);
  requireOrAbort('run started', started.status < 400 && Boolean(run?.run_id), started.body);

  const done = await call(`/api/partner/v1/runs/${run.run_id}/complete`, {
    method: 'POST', headers: venue(keyA),
    body: { outcome: 'victory', milestones_hit: 4, duration_sec: 1100 },
  });
  const settled = unwrap(done.body);
  check('run completed', settled?.status === 'completed', done.body);
  check('payout multiplier is 1.20 at 4 milestones', settled?.payout_multiplier === 1.2, settled?.payout_multiplier);

  const afterVictory = await xpOf(ROOT_A!);
  const gained = afterVictory - before;
  check('hero gained XP', gained > 0, { before, afterVictory });

  const guestSeat = (settled?.participants_settled ?? []).find((s: any) => !s.root_id);
  check('guest seat is pending with a claim token', guestSeat?.reward_state === 'pending' && Boolean(guestSeat?.claim_token), guestSeat);
  check(
    'guest seat also carries a typable short code (XXXX-XXXX)',
    /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(guestSeat?.claim_code ?? ''),
    guestSeat?.claim_code,
  );

  // ── 2. Idempotent settle ─────────────────────────────────────────
  console.log('\n2. Settling twice pays once');
  const replay = await call(`/api/partner/v1/runs/${run.run_id}/complete`, {
    method: 'POST', headers: venue(keyA),
    body: { outcome: 'victory', milestones_hit: 4 },
  });
  check('replay flagged', unwrap(replay.body)?.replayed === true, replay.body);
  check('replay granted no further XP', (await xpOf(ROOT_A!)) === afterVictory);

  // ── 3/4. Guest claim ─────────────────────────────────────────────
  console.log('\n3. Guest claim redemption');
  const token = guestSeat?.claim_token;
  if (!token) {
    check('SKIPPED — no claim token to redeem', false);
  } else {
    const preview = await call(`/api/claims/${token}`);
    check('claim preview shows pending rewards', unwrap(preview.body)?.status === 'pending', preview.body);

    // The short code must resolve the same claim — it is the fallback path
    // for when the QR scan fails, which is when it matters most.
    const byCode = await call(`/api/claims/${encodeURIComponent(guestSeat.claim_code)}`);
    check('short code resolves the same claim', unwrap(byCode.body)?.status === 'pending', byCode.body);

    const lower = await call(`/api/claims/${encodeURIComponent(String(guestSeat.claim_code).toLowerCase().replace('-', ''))}`);
    check('short code tolerates lowercase and a missing dash', unwrap(lower.body)?.status === 'pending', lower.body);

    const bogus = await call('/api/claims/IOIO-IOIO');
    check('code with never-printed glyphs is rejected (400)', bogus.status === 400, bogus.status);

    // Redeem onto a BRAND NEW account and hero — the actual walk-in
    // journey. Impersonation was the wrong instrument here: it mints a
    // hero SessionToken, while /api/claims/:token/redeem is guarded by
    // AccountGuard, which wants an AccountSession. Those are two separate
    // auth systems in this codebase, and the 401 was the harness reaching
    // for the wrong one — not a product defect.
    const walkIn = await registerWalkIn();
    if (!walkIn) {
      check('could not create a walk-in account to redeem with', false);
    } else {
      const auth = { Authorization: `Bearer ${walkIn.sessionToken}` };
      const before = await xpOf(walkIn.rootId);

      const redeemed = await call(`/api/claims/${token}/redeem`, { method: 'POST', headers: auth });
      check('claim redeemed by a new account', redeemed.status < 400, redeemed.body);

      const after = await xpOf(walkIn.rootId);
      check('guest rewards landed on the new hero', after > before, { before, after });

      const again = await call(`/api/claims/${token}/redeem`, { method: 'POST', headers: auth });
      check('second redemption rejected (409)', again.status === 409, again.status);
      check(
        'second redemption paid nothing',
        after > before && (await xpOf(walkIn.rootId)) === after,
        { after },
      );
    }
  }

  // ── 5. Outcome weighting ─────────────────────────────────────────
  console.log('\n5. Outcome weighting');
  const preTimeout = await xpOf(ROOT_A!);
  const r2 = unwrap((await call('/api/partner/v1/runs', {
    method: 'POST', headers: venue(keyA),
    body: { experience_slug: 'echoes_of_kingvale', partner_run_key: `${RUN}-r2`, root_ids: [ROOT_A], guests: [{}] },
  })).body);
  const failed = unwrap((await call(`/api/partner/v1/runs/${r2.run_id}/fail`, {
    method: 'POST', headers: venue(keyA),
    body: { outcome: 'timeout', milestones_hit: 2, reason: 'timer expired' },
  })).body);

  check('failed run recorded as failed', failed?.status === 'failed', failed?.status);
  check('timeout multiplier is 0.50', failed?.payout_multiplier === 0.5, failed?.payout_multiplier);

  const timeoutGain = (await xpOf(ROOT_A!)) - preTimeout;
  check('timeout paid roughly half of victory', timeoutGain > 0 && timeoutGain < gained, { gained, timeoutGain });

  const seatT = (failed?.participants_settled ?? []).find((s: any) => s.root_id);
  check('timeout settled an identified seat', Boolean(seatT), failed?.participants_settled);
  check(
    'timeout granted no discrete loot',
    Boolean(seatT) && (seatT?.applied?.caches_granted?.length ?? 0) === 0,
    seatT?.applied,
  );

  // ── 6. rewards scope gates payout ────────────────────────────────
  console.log('\n6. A venue without `rewards` runs but does not pay');
  const preNoPay = await xpOf(ROOT_A!);
  const r3 = unwrap((await call('/api/partner/v1/runs', {
    method: 'POST', headers: venue(keyNoPay),
    body: { experience_slug: 'echoes_of_kingvale', partner_run_key: `${RUN}-r3`, root_ids: [ROOT_A], guests: [{}] },
  })).body);
  requireOrAbort('run started at unpaid venue', Boolean(r3?.run_id), r3);

  const r3done = unwrap((await call(`/api/partner/v1/runs/${r3.run_id}/complete`, {
    method: 'POST', headers: venue(keyNoPay), body: { outcome: 'victory', milestones_hit: 4 },
  })).body);
  // checkAll, not .every() — an empty seat list would pass vacuously and
  // report that scope gating works when no seat was ever evaluated.
  checkAll(
    'seats skipped for lack of rewards scope',
    r3done?.participants_settled,
    (s: any) => s.reward_state === 'skipped',
  );
  check('no XP granted by unpaid venue', (await xpOf(ROOT_A!)) === preNoPay);

  // ── 7. Tenant isolation ──────────────────────────────────────────
  console.log('\n7. Tenant isolation');
  const foreign = await call(`/api/partner/v1/runs/${run.run_id}/complete`, {
    method: 'POST', headers: venue(keyB), body: { outcome: 'victory' },
  });
  check("another venue cannot settle this run (404, not 403)", foreign.status === 404, foreign.status);

  // ── 8. Retune without deploy ─────────────────────────────────────
  console.log('\n8. Retuning pays differently with no deploy');
  const mult = await call('/api/config', {
    method: 'POST', headers: admin(),
    body: { config_key: 'venue.reward_multiplier', config_value: '2' },
  });
  check('venue.reward_multiplier set to 2', mult.status < 400, mult.body);

  const preRetune = await xpOf(ROOT_A!);
  const r4 = unwrap((await call('/api/partner/v1/runs', {
    method: 'POST', headers: venue(keyA),
    body: { experience_slug: 'echoes_of_kingvale', partner_run_key: `${RUN}-r4`, root_ids: [ROOT_A], guests: [{}] },
  })).body);
  const r4done = unwrap((await call(`/api/partner/v1/runs/${r4.run_id}/complete`, {
    method: 'POST', headers: venue(keyA), body: { outcome: 'victory', milestones_hit: 0 },
  })).body);
  const retuneGain = (await xpOf(ROOT_A!)) - preRetune;

  check('multiplier reached the payout', r4done?.payout_multiplier === 2, r4done?.payout_multiplier);
  check('retuned run paid more than the 1.20x victory', retuneGain > gained, { gained, retuneGain });

  // Restore, so a later run of this harness starts from a known state.
  // Verified by reading it back — asserting `true` here proved nothing, and
  // leaving staging on a 2x multiplier would silently corrupt every
  // subsequent run of this harness.
  await call('/api/config', {
    method: 'POST', headers: admin(),
    body: { config_key: 'venue.reward_multiplier', config_value: '1' },
  });
  const cfg = await call('/api/config', { headers: admin() });
  const restored = (unwrap(cfg.body) ?? []).find?.(
    (c: any) => c.config_key === 'venue.reward_multiplier' || c.key === 'venue.reward_multiplier',
  );
  check(
    'multiplier restored to 1',
    String(restored?.config_value ?? restored?.value) === '1',
    restored,
  );

  // ── Cleanup ──────────────────────────────────────────────────────
  console.log('\n9. Cleanup');
  await cleanup(venues);
  const gone = await call('/api/partner/v1/venue', { headers: venue(keyA) });
  check('suspended venue key no longer authenticates', gone.status === 403, gone.status);

  console.log(
    failures === 0
      ? '\n✅ Slice 1 verified — all checks passed\n'
      : `\n❌ ${failures} check(s) failed\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\nHarness crashed:', err);
  process.exit(1);
});
