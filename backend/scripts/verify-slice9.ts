// ============================================================
// HEP Phase 2 Slice 9 — certification verification
//
// Three things matter here and each is tested directly:
//
//   1. no_data BLOCKS certification. A venue certified because nothing
//      had been measured would be this project's recurring bug in the
//      worst possible place.
//   2. The OVERRIDE works. An escape hatch nobody has ever opened is not
//      known to work, and the moment you need it is an incident.
//   3. Certification goes STALE when its inputs move — recalibrating a
//      room must invalidate it without anyone remembering to.
//
// Usage:
//   HV_API_URL=http://localhost:8099 \
//   HV_PLATFORM_ADMIN_KEY=<key> \
//   npx ts-node scripts/verify-slice9.ts
// ============================================================

const API = process.env.HV_API_URL?.replace(/\/$/, '');
const ADMIN_KEY = process.env.HV_PLATFORM_ADMIN_KEY;

if (!API || !ADMIN_KEY) {
  console.error('Missing env: HV_API_URL, HV_PLATFORM_ADMIN_KEY');
  process.exit(2);
}

const RUN = `s9-${Date.now().toString(36)}`;
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
const apiKey = (k: string) => ({ 'X-PIK-API-Key': k });
const unwrap = (b: any) => b?.data ?? b;

function manifest(slug: string) {
  return {
    experienceId: slug, experienceVersion: '1', manifestSchemaVersion: 1,
    roomProfile: 'small-rectangular-room',
    requiredAnchors: [
      { name: 'MAIN', type: 'content', localPosition: [0, 0, 2], localRotation: [0, 0, 0] },
    ],
    requiredZones: [
      { name: 'PLAYER_START', kind: 'player_start', shape: 'circle', geometry: { radius: 0.75 } },
    ],
    minimumClearanceMeters: 0.75,
    supportedPlayers: { minimum: 1, maximum: 4 },
  };
}

const calibration = {
  supported_device_profiles: ['tier-b-standalone-headset'],
  anchors: [
    { name: 'ORIGIN', role: 'origin', provider: 'local_marker', marker_id: 'plate-1',
      local_position: [0, 0, 0], local_rotation: [0, 0, 0], tracking_confidence: 0.98 },
    { name: 'V1', role: 'verification', provider: 'local_marker', marker_id: 'v1',
      local_position: [2, 0, 2], local_rotation: [0, 0, 0], tracking_confidence: 0.95 },
    { name: 'V2', role: 'verification', provider: 'local_marker', marker_id: 'v2',
      local_position: [-2, 0, -2], local_rotation: [0, 0, 0], tracking_confidence: 0.94 },
  ],
  placements: [{ anchor_name: 'MAIN', local_position: [0, 0, 2], local_rotation: [0, 0, 0] }],
  zones: [{ name: 'PLAYER_START', kind: 'player_start', shape: 'circle', geometry: { radius: 0.75 } }],
};

async function main() {
  console.log(`\nHEP Slice 9 verification — ${API}\n${'─'.repeat(58)}`);

  // ── Setup ───────────────────────────────────────────────────
  console.log('\n0. A venue with a calibrated room and a spatial experience');

  const venueId = `slice9-${RUN}`;
  const created = await call('/api/sources', {
    method: 'POST', headers: admin(),
    body: { source_id: venueId, source_name: `Slice9 ${RUN}` },
  });
  const venueKey = unwrap(created.body)?.api_key;
  requireOrAbort('venue created', !!venueKey, created.body);

  await call(`/api/sources/${venueId}/scopes`, {
    method: 'POST', headers: admin(),
    body: { scopes: ['xp', 'titles', 'runs', 'guests', 'rewards'] },
  });

  const inv = await call(`/api/sources/${venueId}/staff`, {
    method: 'POST', headers: admin(),
    body: { email: `owner@${venueId}.test`, role: 'owner' },
  });
  const acc = await call('/api/portal/v1/auth/accept', {
    method: 'POST',
    body: { invite_token: unwrap(inv.body)?.invite_token, password: PASSWORD },
  });
  const owner = unwrap(acc.body)?.session_token;
  requireOrAbort('owner activated', !!owner, acc.body);

  const expSlug = `s9exp-${RUN}`;
  await call('/api/experiences', {
    method: 'POST', headers: admin(), body: { slug: expSlug, name: `S9 ${RUN}` },
  });
  await call(`/api/experiences/${expSlug}/manifest`, {
    method: 'PUT', headers: admin(), body: manifest(expSlug),
  });
  await call(`/api/sources/${venueId}/experiences`, {
    method: 'POST', headers: admin(), body: { experience_slug: expSlug },
  });

  const roomRes = await call('/api/portal/v1/rooms', {
    method: 'POST', headers: bearer(owner),
    body: { slug: 'chamber', name: 'Chamber' },
  });
  const roomId = unwrap(roomRes.body)?.room_id;
  requireOrAbort('room created', !!roomId, roomRes.body);

  // ── 1. The gate closes before anything is certified ─────────
  console.log('\n1. The gate, before certification');

  const blocked = await call('/api/partner/v1/runs', {
    method: 'POST', headers: apiKey(venueKey),
    body: { experience_slug: expSlug, partner_run_key: `blocked-${RUN}`, guests: [{ label: 'P1' }] },
  });
  check('an uncertified spatial experience cannot start a run',
    blocked.status === 403, blocked.status);
  check('and the refusal says WHY',
    /certif/i.test(JSON.stringify(blocked.body)), blocked.body);

  // ── 2. no_data blocks certification ─────────────────────────
  console.log('\n2. no_data BLOCKS — an unmeasured venue is not a certified one');

  const early = unwrap((await call(`/api/certification/${venueId}/evaluate`, {
    method: 'POST', headers: admin(),
    body: { experience_slug: expSlug, room_id: roomId },
  })).body);
  requireOrAbort('evaluate responds', Array.isArray(early?.checks), early);

  check('an uncalibrated room is not certifiable', early.certifiable === false, early.summary);
  check('the room check fails', early.checks.some(
    (c: any) => c.key === 'room.published' && c.status === 'fail'), early.checks);
  check('telemetry with no samples reports no_data, not pass',
    early.checks.find((c: any) => c.key === 'telemetry.reporting')?.status === 'no_data',
    early.checks);
  check('and no_data appears in the blocking list',
    (early.blocking ?? []).includes('telemetry.reporting'), early.blocking);
  checkAll('every check declares one of pass|fail|no_data', early.checks,
    (c: any) => ['pass', 'fail', 'no_data'].includes(c.status), early.checks);

  const refused = await call(`/api/certification/${venueId}/certify`, {
    method: 'POST', headers: admin(),
    body: { experience_slug: expSlug, room_id: roomId },
  });
  check('certifying an unready venue is REFUSED', refused.status === 400, refused.status);

  // ── 3. Make it certifiable ──────────────────────────────────
  console.log('\n3. Calibrate, measure, certify');

  const draft = await call(`/api/portal/v1/rooms/${roomId}/drafts`, {
    method: 'POST', headers: bearer(owner),
    body: { experience_slug: expSlug, origin_mode: 'fiducial' },
  });
  const configId = unwrap(draft.body)?.room_config_id;
  requireOrAbort('draft opened', !!configId, draft.body);

  await call(`/api/portal/v1/rooms/drafts/${configId}`, {
    method: 'PATCH', headers: bearer(owner), body: calibration,
  });
  const published = await call(`/api/portal/v1/rooms/configs/${configId}/publish`, {
    method: 'POST', headers: bearer(owner),
  });
  requireOrAbort('room published', published.status === 200, published.body);

  // Telemetry, so the measured checks have something to measure.
  await call('/api/partner/v1/telemetry', {
    method: 'POST', headers: apiKey(venueKey),
    body: {
      metrics: [
        { metric: 'anchor.translation_error_m', value: 0.02, unit: 'm', captured_at: new Date().toISOString() },
        { metric: 'anchor.rotation_error_deg', value: 0.9, unit: 'deg', captured_at: new Date().toISOString() },
      ],
    },
  });

  const ready = unwrap((await call(`/api/certification/${venueId}/evaluate`, {
    method: 'POST', headers: admin(),
    body: { experience_slug: expSlug, room_id: roomId },
  })).body);
  check('the room now passes its checks',
    ready.checks.find((c: any) => c.key === 'room.published')?.status === 'pass', ready.checks);
  check('telemetry is now reporting',
    ready.checks.find((c: any) => c.key === 'telemetry.reporting')?.status === 'pass',
    ready.checks);

  const certified = await call(`/api/certification/${venueId}/certify`, {
    method: 'POST', headers: admin(),
    body: { experience_slug: expSlug, room_id: roomId },
  });
  const certOk = certified.status === 200;
  check('certification succeeds once ready', certOk, certified.body);
  if (!certOk) {
    const evalNow = unwrap((await call(`/api/certification/${venueId}/evaluate`, {
      method: 'POST', headers: admin(),
      body: { experience_slug: expSlug, room_id: roomId },
    })).body);
    console.log(`      blocking: ${JSON.stringify(evalNow?.blocking)}`);
    console.log(`      not-passing: ${JSON.stringify(
      (evalNow?.checks ?? []).filter((c: any) => c.status !== 'pass'))?.slice(0, 400)}`);
  }
  check('and records a fingerprint of its inputs',
    !!unwrap(certified.body)?.fingerprint?.hash, certified.body);

  const nowRuns = await call('/api/partner/v1/runs', {
    method: 'POST', headers: apiKey(venueKey),
    body: { experience_slug: expSlug, partner_run_key: `ok-${RUN}`, guests: [{ label: 'P1' }] },
  });
  check('a certified venue CAN start a run',
    nowRuns.status === 200 || nowRuns.status === 201, {
      status: nowRuns.status, body: nowRuns.body,
    });

  // ── 4. Staleness ────────────────────────────────────────────
  console.log('\n4. Recalibrating INVALIDATES certification');

  const draft2 = await call(`/api/portal/v1/rooms/${roomId}/drafts`, {
    method: 'POST', headers: bearer(owner),
    body: { experience_slug: expSlug, origin_mode: 'fiducial' },
  });
  const config2 = unwrap(draft2.body)?.room_config_id;
  await call(`/api/portal/v1/rooms/drafts/${config2}`, {
    method: 'PATCH', headers: bearer(owner), body: calibration,
  });
  const republished = await call(`/api/portal/v1/rooms/configs/${config2}/publish`, {
    method: 'POST', headers: bearer(owner),
  });
  requireOrAbort('room recalibrated and republished', republished.status === 200,
    republished.body);

  const afterRecal = unwrap(
    (await call(`/api/certification/${venueId}`, { headers: admin() })).body,
  );
  const row = (afterRecal ?? []).find((r: any) => r.experience === expSlug);
  // Nobody told certification the room changed. It works it out by
  // comparing fingerprints, which is the entire design.
  check('certification is reported STALE after recalibration',
    row?.effective_status === 'stale', row);

  const blockedAgain = await call('/api/partner/v1/runs', {
    method: 'POST', headers: apiKey(venueKey),
    body: { experience_slug: expSlug, partner_run_key: `stale-${RUN}`, guests: [{ label: 'P1' }] },
  });
  check('and the gate closes again', blockedAgain.status === 403, blockedAgain.status);
  check('naming staleness as the reason',
    unwrap(blockedAgain.body)?.reason === 'stale_or_revoked' ||
    /stale/i.test(JSON.stringify(blockedAgain.body)), blockedAgain.body);

  // ── 5. The override ─────────────────────────────────────────
  console.log('\n5. The override — an escape hatch nobody has opened is not known to work');

  const noReason = await call(`/api/certification/${venueId}/override`, {
    method: 'POST', headers: admin(),
    body: { experience_slug: expSlug, room_id: roomId },
  });
  check('an override with no reason is refused', noReason.status === 400, noReason.status);

  const thinReason = await call(`/api/certification/${venueId}/override`, {
    method: 'POST', headers: admin(),
    body: { experience_slug: expSlug, room_id: roomId, reason: 'because' },
  });
  check('a token reason is refused', thinReason.status === 400, thinReason.status);

  const forever = await call(`/api/certification/${venueId}/override`, {
    method: 'POST', headers: admin(),
    body: {
      experience_slug: expSlug, room_id: roomId,
      reason: 'Pilot event tonight, recertifying tomorrow morning', days: 3650,
    },
  });
  check('a permanent override is refused', forever.status === 400, forever.status);

  const ovr = await call(`/api/certification/${venueId}/override`, {
    method: 'POST', headers: admin(),
    body: {
      experience_slug: expSlug, room_id: roomId,
      reason: 'Pilot event tonight, recertifying tomorrow morning', days: 1,
    },
  });
  check('a reasoned, time-boxed override is accepted', ovr.status === 200, ovr.body);
  check('and it expires', !!unwrap(ovr.body)?.expires_at, ovr.body);

  const ranUnderOverride = await call('/api/partner/v1/runs', {
    method: 'POST', headers: apiKey(venueKey),
    body: { experience_slug: expSlug, partner_run_key: `ovr-${RUN}`, guests: [{ label: 'P1' }] },
  });
  check('the override actually opens the gate',
    ranUnderOverride.status === 200 || ranUnderOverride.status === 201,
    { status: ranUnderOverride.status, body: ranUnderOverride.body });

  const audit = unwrap(
    (await call('/api/portal/v1/audit', { headers: bearer(owner) })).body,
  );
  const actions = (audit ?? []).map((a: any) => a.action);
  check('the override is written to the audit ledger',
    actions.includes('venue.certification_overridden'), actions);
  const entry = (audit ?? []).find(
    (a: any) => a.action === 'venue.certification_overridden',
  );
  check('and the recorded entry carries the reason',
    typeof entry?.metadata?.reason === 'string' && entry.metadata.reason.length > 10,
    entry?.metadata);

  // ── 6. Revocation and tenancy ───────────────────────────────
  console.log('\n6. Revocation, and the venue cannot certify itself');

  const selfCertify = await call(`/api/certification/${venueId}/certify`, {
    method: 'POST', headers: bearer(owner),
    body: { experience_slug: expSlug, room_id: roomId },
  });
  check('a venue staff token cannot certify',
    selfCertify.status === 403 || selfCertify.status === 401 || selfCertify.status === 503,
    selfCertify.status);

  const mine = await call('/api/portal/v1/certification', { headers: bearer(owner) });
  check('but the venue CAN read its own status', mine.status === 200, mine.status);

  const revokeNoReason = await call(`/api/certification/${venueId}/revoke`, {
    method: 'POST', headers: admin(),
    body: { experience_slug: expSlug, room_id: roomId },
  });
  check('revoking requires a reason', revokeNoReason.status === 400, revokeNoReason.status);

  const revoked = await call(`/api/certification/${venueId}/revoke`, {
    method: 'POST', headers: admin(),
    body: { experience_slug: expSlug, room_id: roomId, reason: 'Slice 9 harness cleanup' },
  });
  check('revocation succeeds', revoked.status === 200, revoked.body);

  const afterRevoke = await call('/api/partner/v1/runs', {
    method: 'POST', headers: apiKey(venueKey),
    body: { experience_slug: expSlug, partner_run_key: `rev-${RUN}`, guests: [{ label: 'P1' }] },
  });
  check('a revoked venue cannot run', afterRevoke.status === 403, afterRevoke.status);

  // ── 7. Non-spatial experiences are NOT gated ────────────────
  console.log('\n7. The gate does not bite experiences with no room');

  const plainSlug = `s9plain-${RUN}`;
  await call('/api/experiences', {
    method: 'POST', headers: admin(), body: { slug: plainSlug, name: `Plain ${RUN}` },
  });
  await call(`/api/sources/${venueId}/experiences`, {
    method: 'POST', headers: admin(), body: { experience_slug: plainSlug },
  });
  const plainRun = await call('/api/partner/v1/runs', {
    method: 'POST', headers: apiKey(venueKey),
    body: { experience_slug: plainSlug, partner_run_key: `plain-${RUN}`, guests: [{ label: 'P1' }] },
  });
  // This is what stops the gate breaking every live venue on deploy.
  check('a non-spatial experience runs WITHOUT certification',
    plainRun.status === 200 || plainRun.status === 201,
    { status: plainRun.status, body: plainRun.body });

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
