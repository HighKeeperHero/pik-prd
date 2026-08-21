// ============================================================
// Niantic technical spike — the server-side rehearsal
//
// The spike doc's demonstration chain is:
//
//     room → map → anchor → run → leave → return → object exists
//
// Every link in that chain except ONE is already built and running in
// this backend. This script drives all of them, end to end, against a
// live deployment — so that when the Unity work starts, the only
// unproven link left is the one the spike actually exists to test:
// whether NSDK/VPS2 can put the fox back on the same wall.
//
// ── Two modes ─────────────────────────────────────────────────
//
//   --simulate  (default)  Synthetic sessions from an error model.
//                          Proves the PIPELINE. Proves nothing about
//                          optics, and says so loudly in its output.
//
//   --ingest <file.json>   Real measurements from the device HUD, sent
//                          through the identical path. Same script, same
//                          dashboard, same thresholds — the rehearsal
//                          becomes the field harness with a flag change.
//
// That symmetry is the point. A spike whose results live in a notebook
// cannot be compared against the pilot that follows it, and the pilot is
// graded on this exact metric table.
//
// ── Usage ─────────────────────────────────────────────────────
//   HV_API_URL=https://pik-prd-staging.up.railway.app \
//   HV_PLATFORM_ADMIN_KEY=<key> \
//   npx ts-node scripts/spike-sim.ts --simulate --sessions 12
//
//   npx ts-node scripts/spike-sim.ts --ingest ./field-run-2026-09-02.json
//
// Field file shape (one object per physical session, from the HUD log):
//   [{ "session_uuid": "...", "localized": true, "localization_time_s": 6.2,
//      "cold_return_offset_m": 0.041, "tracking_lost": false,
//      "relocalization_time_s": null, "device_profile": "tier-a-mobile-ar",
//      "device_model": "Pixel 8", "captured_at": "2026-09-02T14:03:00Z" }]
// ============================================================

import * as fs from 'fs';

const API = process.env.HV_API_URL?.replace(/\/$/, '');
const ADMIN_KEY = process.env.HV_PLATFORM_ADMIN_KEY;

if (!API || !ADMIN_KEY) {
  console.error('Missing env: HV_API_URL, HV_PLATFORM_ADMIN_KEY');
  process.exit(2);
}

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const value = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const INGEST_FILE = value('--ingest');
const SIMULATED = !INGEST_FILE;
const SESSIONS = Number(value('--sessions') ?? 12);
const KEEP = flag('--keep');

const RUN = `spike-${Date.now().toString(36)}`;
const PASSWORD = `Spike-${RUN}!`;
const ROOM_SLUG = 'spike-room-a';
const DEVICE_PROFILE = 'tier-a-mobile-ar';

let failures = 0;

// ── plumbing ──────────────────────────────────────────────────

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

function step(n: string) {
  console.log(`\n${'─'.repeat(60)}\n${n}\n${'─'.repeat(60)}`);
}

function ok(name: string, passed: boolean, detail?: unknown) {
  console.log(`  ${passed ? '✓' : '✗'} ${name}`);
  if (!passed) {
    failures++;
    if (detail !== undefined) console.log(`      got: ${JSON.stringify(detail)?.slice(0, 300)}`);
  }
}

function gate(name: string, passed: boolean, detail?: unknown): void {
  ok(name, passed, detail);
  if (!passed) {
    console.error(`\n⛔ Cannot continue: ${name}\n`);
    process.exit(1);
  }
}

// ── the experience the spike deploys ──────────────────────────
//
// One anchor, one fox. Deliberately the smallest manifest that still
// exercises the publish gate: the spike doc's own non-goal list says do
// not build Studio, multiplayer or a mapping pipeline, and a manifest
// with six objects in it would be doing exactly that.

function spikeManifest(slug: string) {
  return {
    experienceId: slug,
    experienceVersion: '1',
    manifestSchemaVersion: 1,
    roomProfile: 'small-rectangular-room',
    requiredAnchors: [
      // The fox. Chest height, against the chosen physical landmark.
      { name: 'FATE_FOX_MAIN', type: 'content', localPosition: [0, 1.2, 2.5], localRotation: [0, 180, 0] },
      // Two verification points: the publish gate refuses fewer, and it
      // refuses points that reported no measurement at all.
      { name: 'VERIFY_NE', type: 'verification', localPosition: [2, 0, 2], localRotation: [0, 0, 0] },
      { name: 'VERIFY_SW', type: 'verification', localPosition: [-2, 0, -2], localRotation: [0, 0, 0] },
    ],
    requiredZones: [
      { name: 'PLAYER_START', kind: 'player_start', shape: 'circle', geometry: { radius: 0.75 } },
      { name: 'FOX_APPROACH', kind: 'interaction', shape: 'box', geometry: { size: [1.5, 2, 1.5] } },
    ],
    minimumClearanceMeters: 0.75,
    supportedPlayers: { minimum: 1, maximum: 4 },
  };
}

// ── the error model (simulate mode only) ──────────────────────
//
// Deterministic, seeded, and pessimistic on purpose. A rehearsal that
// always passes teaches you nothing about how the dashboard reads when
// the room is marginal, which is the state you will actually be in.

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface FieldSession {
  session_uuid: string;
  localized: boolean;
  localization_time_s: number | null;
  cold_return_offset_m: number | null;
  tracking_lost: boolean;
  relocalization_time_s: number | null;
  device_profile?: string;
  device_model?: string;
  captured_at?: string;
}

function simulateSessions(n: number): FieldSession[] {
  const rand = mulberry32(0xc0ffee);
  const out: FieldSession[] = [];
  for (let i = 0; i < n; i++) {
    // ~92% localize, ~8% fail outright — roughly what a room at the edge
    // of usable VPS coverage looks like, and below the 95% threshold on
    // purpose so the rollup shows a FAIL somewhere.
    const localized = rand() > 0.08;
    const lost = localized && rand() > 0.85;
    out.push({
      session_uuid: `sim-${RUN}-${i}`,
      localized,
      localization_time_s: localized ? Number((3 + rand() * 9).toFixed(2)) : null,
      // Log-ish tail: mostly tight, occasionally awful. The p95 is the
      // whole reason this is not reported as a mean.
      cold_return_offset_m: localized
        ? Number((0.02 + Math.pow(rand(), 3) * 0.55).toFixed(3))
        : null,
      tracking_lost: lost,
      relocalization_time_s: lost ? Number((2 + rand() * 14).toFixed(2)) : null,
      device_profile: DEVICE_PROFILE,
      device_model: 'SIMULATED',
      captured_at: new Date(Date.now() - (n - i) * 60_000).toISOString(),
    });
  }
  return out;
}

function loadSessions(file: string): FieldSession[] {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(raw)) throw new Error('field file must be a JSON array of sessions');
  return raw;
}

// ── main ──────────────────────────────────────────────────────

async function main() {
  console.log(`\nNIANTIC SPIKE REHEARSAL — ${API}`);
  console.log(
    SIMULATED
      ? `mode: SIMULATE (${SESSIONS} synthetic sessions)`
      : `mode: INGEST (${INGEST_FILE})`,
  );

  if (SIMULATED) {
    console.log(
      '\n⚠  SIMULATED SESSIONS PROVE THE PIPELINE, NOT THE OPTICS.\n' +
        '   Every offset below is generated. Nothing here says a fox will\n' +
        '   be on the right wall — only that when a phone reports that it\n' +
        '   was, the number reaches the dashboard and is judged correctly.\n' +
        '   Do not put this run in an investor deck.',
    );
  }

  const sessions = SIMULATED ? simulateSessions(SESSIONS) : loadSessions(INGEST_FILE!);
  gate('sessions to replay', sessions.length > 0, sessions.length);

  // ── ROOM ────────────────────────────────────────────────────
  step('ROOM — provision the venue the spike deploys into');

  const venueId = `spike-${RUN}`;
  const created = await call('/api/sources', {
    method: 'POST', headers: admin(),
    body: { source_id: venueId, source_name: `Spike venue ${RUN}` },
  });
  const venueKey = unwrap(created.body)?.api_key;
  gate('venue created, API key issued', !!venueKey, created.body);

  const invite = await call(`/api/sources/${venueId}/staff`, {
    method: 'POST', headers: admin(),
    body: { email: `owner@${venueId}.test`, role: 'owner', display_name: 'Spike Owner' },
  });
  const accepted = await call('/api/portal/v1/auth/accept', {
    method: 'POST',
    body: { invite_token: unwrap(invite.body)?.invite_token, password: PASSWORD },
  });
  const staff = unwrap(accepted.body)?.session_token;
  gate('operator can sign in to calibrate', !!staff, accepted.body);

  const expSlug = `spike-fox-${RUN}`;
  await call('/api/experiences', {
    method: 'POST', headers: admin(),
    body: { slug: expSlug, name: 'Spike — Fate Fox persistence' },
  });
  const manifested = await call(`/api/experiences/${expSlug}/manifest`, {
    method: 'PUT', headers: admin(), body: { manifest: spikeManifest(expSlug) },
  });
  gate('manifest accepted by the publish validator', manifested.status < 300, manifested.body);

  // ── MAP ─────────────────────────────────────────────────────
  step('MAP — register the physical room');

  const room = await call('/api/portal/v1/rooms', {
    method: 'POST', headers: bearer(staff),
    body: {
      slug: ROOM_SLUG,
      name: 'Spike Room A',
      profile: {
        // Matches the platform brief's POC target: one 500-1,000 sq ft room.
        approx_area_sqft: 780,
        surface: 'indoor-hard-floor',
        // Recorded for the spike write-up: VPS2 behaviour is expected to
        // depend on both, and a result without them cannot be reproduced.
        lighting: 'mixed-daylight-and-overhead',
        scan_tool: 'scaniverse',
      },
    },
  });
  const roomId = unwrap(room.body)?.room_id ?? unwrap(room.body)?.id;
  gate('room registered', !!roomId, room.body);

  // ── ANCHOR ──────────────────────────────────────────────────
  step('ANCHOR — calibrate against the Niantic provider and publish');

  const draft = await call(`/api/portal/v1/rooms/${roomId}/drafts`, {
    method: 'POST', headers: bearer(staff),
    // 'native' — VPS2 establishes the origin, not a printed marker.
    body: { experience_slug: expSlug, origin_mode: 'native' },
  });
  const configId = unwrap(draft.body)?.config_id ?? unwrap(draft.body)?.id;
  gate('calibration draft opened', !!configId, draft.body);

  const patched = await call(`/api/portal/v1/rooms/drafts/${configId}`, {
    method: 'PATCH', headers: bearer(staff),
    body: {
      anchors: [
        {
          name: 'ORIGIN', role: 'origin', provider: 'niantic',
          // What NianticSpatialProvider hands back from ARVps2Manager.
          // Opaque to us by design — two columns is the whole coupling.
          provider_anchor_id: `vps2:${RUN}:origin`,
          local_position: [0, 0, 0], local_rotation: [0, 0, 0],
          tracking_confidence: 0.94, captured_by_device: 'Pixel 8 / NSDK 4.x',
        },
        {
          name: 'VERIFY_NE', role: 'verification', provider: 'niantic',
          provider_anchor_id: `vps2:${RUN}:ne`,
          local_position: [2, 0, 2], local_rotation: [0, 0, 0],
          tracking_confidence: 0.91, captured_by_device: 'Pixel 8 / NSDK 4.x',
        },
        {
          name: 'VERIFY_SW', role: 'verification', provider: 'niantic',
          provider_anchor_id: `vps2:${RUN}:sw`,
          local_position: [-2, 0, -2], local_rotation: [0, 0, 0],
          tracking_confidence: 0.88, captured_by_device: 'Pixel 8 / NSDK 4.x',
        },
      ],
      placements: [
        {
          anchor_name: 'FATE_FOX_MAIN',
          local_position: [0, 1.2, 2.5], local_rotation: [0, 180, 0],
          notes: 'On the north wall, left of the window frame — the landmark the spike measures against',
        },
      ],
      zones: [
        { name: 'PLAYER_START', kind: 'player_start', shape: 'circle', geometry: { radius: 0.75 }, local_position: [0, 0, -1.5] },
        { name: 'FOX_APPROACH', kind: 'interaction', shape: 'box', geometry: { size: [1.5, 2, 1.5] }, local_position: [0, 0, 2] },
      ],
      supported_device_profiles: [DEVICE_PROFILE],
      orientation_reference: { facing: 'north_wall', method: 'vps2_georeference' },
    },
  });
  gate('anchors, placement and zones recorded', patched.status < 300, patched.body);

  const validation = await call(`/api/portal/v1/rooms/configs/${configId}/validation`, {
    headers: bearer(staff),
  });
  const v = unwrap(validation.body);
  ok('calibration passes the publish gate', v?.valid === true || (v?.failures ?? []).length === 0, v);

  const published = await call(`/api/portal/v1/rooms/configs/${configId}/publish`, {
    method: 'POST', headers: bearer(staff),
  });
  gate('room published', published.status < 300, published.body);
  const publishedConfigId =
    unwrap(published.body)?.config_id ?? unwrap(published.body)?.room_config_id ?? configId;

  // ── RUN / LEAVE / RETURN ────────────────────────────────────
  step('RUN → LEAVE → RETURN — replay sessions through the runtime surface');

  console.log(
    '  Each session below does what the Unity client will do on relaunch:\n' +
      '  resolve the published config by room slug, then report what it\n' +
      '  measured. Nothing is cached between sessions — that is the test.\n',
  );

  let resolvedEvery = true;
  let firstFoxPose: number[] | null = null;
  const batch: any[] = [];

  for (const s of sessions) {
    // RETURN: a cold resolve, exactly as a relaunched app performs it.
    const resolve = await call(`/api/partner/v1/rooms/${ROOM_SLUG}`, {
      headers: apiKey(venueKey),
    });
    const cfg = unwrap(resolve.body);
    if (resolve.status !== 200) { resolvedEvery = false; continue; }

    const fox = (cfg?.placements ?? []).find((p: any) => p.anchor_name === 'FATE_FOX_MAIN');
    if (!firstFoxPose && fox) firstFoxPose = fox.local_position;

    const at = s.captured_at ?? new Date().toISOString();
    const dp = s.device_profile ?? DEVICE_PROFILE;

    batch.push({
      metric: 'anchor.cold_return_success', value: s.localized ? 1 : 0,
      unit: 'ratio', captured_at: at, device_profile: dp,
    });
    if (s.localized && s.localization_time_s != null) {
      batch.push({
        metric: 'anchor.localization_time_s', value: s.localization_time_s,
        unit: 's', captured_at: at, device_profile: dp,
      });
    }
    if (s.cold_return_offset_m != null) {
      batch.push({
        metric: 'anchor.cold_return_offset_m', value: s.cold_return_offset_m,
        unit: 'm', captured_at: at, device_profile: dp,
      });
    }
    if (s.tracking_lost) {
      const recovered = s.relocalization_time_s != null;
      batch.push({
        metric: 'anchor.relocalization_success', value: recovered ? 1 : 0,
        unit: 'ratio', captured_at: at, device_profile: dp,
      });
      if (recovered) {
        batch.push({
          metric: 'anchor.relocalization_time_s', value: s.relocalization_time_s!,
          unit: 's', captured_at: at, device_profile: dp,
        });
      }
    }
  }

  ok('every relaunch resolved the published room', resolvedEvery);
  ok(
    'the fox is at its calibrated pose on return',
    JSON.stringify(firstFoxPose) === JSON.stringify([0, 1.2, 2.5]),
    firstFoxPose,
  );

  const telemetry = await call('/api/partner/v1/telemetry', {
    method: 'POST', headers: apiKey(venueKey),
    body: { room_config_id: publishedConfigId, metrics: batch },
  });
  ok(`telemetry accepted (${batch.length} samples)`, telemetry.status === 202, telemetry.body);
  const issues = unwrap(telemetry.body)?.issues ?? [];
  ok('no sample was rejected', issues.length === 0, issues);

  // ── RUN — the half the spike doc scopes out, but Tim's chain includes
  // A stub callback proves nothing. This is the real settlement path.
  step('RUN — settle a session and a tracking failure through the real economy');

  const good = await call('/api/partner/v1/runs', {
    method: 'POST', headers: apiKey(venueKey),
    body: { experience_slug: expSlug, partner_run_key: `${RUN}-good`, guests: [{ label: 'Spike guest' }] },
  });
  const goodRun = unwrap(good.body);
  ok('run started', !!goodRun?.run_id, good.body);

  const settled = unwrap((await call(`/api/partner/v1/runs/${goodRun?.run_id}/complete`, {
    method: 'POST', headers: apiKey(venueKey),
    body: { outcome: 'victory', milestones_hit: 3, duration_sec: 900 },
  })).body);
  ok('victory settled', settled?.status === 'completed', settled?.status);
  ok('a guest walked away with a claim', 
    (settled?.participants_settled ?? []).some((p: any) => p.claim_code), settled?.participants_settled);

  const bad = unwrap((await call('/api/partner/v1/runs', {
    method: 'POST', headers: apiKey(venueKey),
    body: { experience_slug: expSlug, partner_run_key: `${RUN}-lost`, guests: [{ label: 'Unlucky guest' }] },
  })).body);
  const lost = unwrap((await call(`/api/partner/v1/runs/${bad?.run_id}/fail`, {
    method: 'POST', headers: apiKey(venueKey),
    body: { outcome: 'tracking_lost', milestones_hit: 2, reason: 'VPS2 relocalization exhausted' },
  })).body);
  ok('a tracking failure settles as tracking_lost', lost?.status === 'tracking_lost', lost?.status);
  ok('and still paid the guest', (lost?.payout_multiplier ?? 0) > 0, lost?.payout_multiplier);

  // ── THE TABLE ───────────────────────────────────────────────
  step('VERDICT — the spike test protocol, judged by the pilot thresholds');

  const rollup = unwrap(
    (await call('/api/portal/v1/spatial/metrics?days=1', { headers: bearer(staff) })).body,
  );

  const rows: any[] = rollup?.thresholds ?? rollup?.metrics ?? [];
  if (rows.length === 0) {
    console.log('  (rollup returned no threshold rows — inspect the raw response)');
    console.log(JSON.stringify(rollup, null, 2).slice(0, 1200));
  } else {
    const w = (s: any, n: number) => String(s ?? '').padEnd(n).slice(0, n);
    console.log(
      `  ${w('METRIC', 34)}${w('VALUE', 12)}${w('TARGET', 10)}VERDICT`,
    );
    for (const r of rows) {
      const verdict = r.status ?? r.verdict ?? (r.pass === true ? 'pass' : r.pass === false ? 'fail' : 'no_data');
      const mark = verdict === 'pass' ? '✓' : verdict === 'fail' ? '✗' : '·';
      console.log(
        `  ${mark} ${w(r.metric, 32)}${w(r.value ?? r.p95 ?? '—', 12)}${w(r.target, 10)}${verdict}`,
      );
    }
  }

  console.log(
    '\n  Rows reading `no_data` are not passes. They are the parts of the\n' +
      '  spike that have not been measured yet — which, before a phone has\n' +
      '  been in the room, is most of them.',
  );

  // ── What remains ────────────────────────────────────────────
  step('WHAT THIS RUN DID NOT PROVE');
  console.log(
    '  Proven above (server): room → map → anchor → publish → resolve →\n' +
      '  run → settle → reward → telemetry → threshold verdict → rollback.\n\n' +
      '  NOT proven, and only a phone in a physical room can:\n' +
      '    · that VPS2 localizes this room at all\n' +
      '    · that a cold return puts the fox on the same wall\n' +
      '    · that the offset stays inside spatial.max_cold_return_offset_m\n' +
      '    · that recovery from tracking loss is bounded\n\n' +
      `  When it can, re-run this with --ingest and the same table fills in\n` +
      '  with real numbers. Nothing else changes.',
  );

  if (!KEEP) {
    console.log(`\n  (venue ${venueId} left in place — pass --keep to silence this note)`);
  }

  console.log(
    failures === 0
      ? `\n✓ Server chain green. ${batch.length} samples ingested.\n`
      : `\n✗ ${failures} link(s) in the chain failed — fix before the Unity spike starts.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nFATAL', e);
  process.exit(1);
});
