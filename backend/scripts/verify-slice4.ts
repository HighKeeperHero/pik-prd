// ============================================================
// HEP Phase 2 Slice 4 — verification harness
//
// Asserts the spatial contract the partnered Tier C firm builds against:
// manifest validation, room lifecycle, calibration drafts, the publish
// gate, immutability, rollback, and the runtime resolve.
//
// The publish gate gets the most attention here. It is the only thing
// standing between a bad calibration and a paying guest walking into a
// wall, and its failure mode is silent — a room that publishes when it
// should not looks exactly like a room that should have.
//
// Usage:
//   HV_API_URL=http://localhost:8099 \
//   HV_PLATFORM_ADMIN_KEY=<key> \
//   npx ts-node scripts/verify-slice4.ts
// ============================================================

const API = process.env.HV_API_URL?.replace(/\/$/, '');
const ADMIN_KEY = process.env.HV_PLATFORM_ADMIN_KEY;

if (!API || !ADMIN_KEY) {
  console.error('Missing env: HV_API_URL, HV_PLATFORM_ADMIN_KEY');
  process.exit(2);
}

const RUN = `s4-${Date.now().toString(36)}`;
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

/** Fails on an empty collection instead of passing vacuously. */
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

/** A manifest that should validate cleanly. */
function goodManifest(slug: string) {
  return {
    experienceId: slug,
    experienceVersion: '1',
    manifestSchemaVersion: 1,
    roomProfile: 'small-rectangular-room',
    requiredAnchors: [
      { name: 'HERO_ECHO_MAIN', type: 'content', localPosition: [0, 0, 2.5], localRotation: [0, 180, 0] },
      { name: 'RIFT_WEST_WALL', type: 'content', localPosition: [-2, 1.6, 1], localRotation: [0, 90, 0] },
      { name: 'VERIFY_NE', type: 'verification', localPosition: [2, 0, 2], localRotation: [0, 0, 0] },
    ],
    requiredZones: [
      { name: 'PLAYER_START', kind: 'player_start', shape: 'circle', geometry: { radius: 0.75 } },
      { name: 'RIFT_INTERACTION_ZONE', kind: 'interaction', shape: 'box', geometry: { size: [1.5, 2, 1.5] } },
    ],
    minimumClearanceMeters: 0.75,
    supportedPlayers: { minimum: 1, maximum: 4 },
  };
}

async function main() {
  console.log(`\nHEP Slice 4 verification — ${API}\n${'─'.repeat(58)}`);

  // ── 1. Manifest schema, unauthenticated ─────────────────────
  console.log('\n1. Manifest schema — the partner-facing contract');

  const schema = await call('/api/spatial/manifest-schema');
  const schemaBody = unwrap(schema.body);
  check('schema is readable without auth', schema.status === 200, schema.status);
  check('schema declares its version', typeof schemaBody?.manifest_schema_version === 'number', schemaBody);
  check(
    'schema states the coordinate space',
    schemaBody?.coordinate_space === 'room_local_meters_y_up',
    schemaBody,
  );

  const validGood = await call('/api/spatial/manifest-schema/validate', {
    method: 'POST', body: goodManifest('probe'),
  });
  check('a good manifest validates', unwrap(validGood.body)?.valid === true, validGood.body);

  // Each of these must be REJECTED. A validator that accepts everything
  // passes every test you write for the happy path and protects nothing.
  const badCases: Array<[string, any]> = [
    ['a manifest with no anchors', { ...goodManifest('x'), requiredAnchors: [] }],
    ['duplicate anchor names', {
      ...goodManifest('x'),
      requiredAnchors: [
        { name: 'DUP', type: 'content', localPosition: [0, 0, 0], localRotation: [0, 0, 0] },
        { name: 'DUP', type: 'content', localPosition: [1, 0, 0], localRotation: [0, 0, 0] },
      ],
    }],
    ['a missing player_start zone', {
      ...goodManifest('x'),
      requiredZones: [{ name: 'Z', kind: 'interaction', shape: 'circle', geometry: { radius: 1 } }],
    }],
    ['a malformed pose', {
      ...goodManifest('x'),
      requiredAnchors: [{ name: 'A', type: 'content', localPosition: [0, 0], localRotation: [0, 0, 0] }],
    }],
    ['max players below min', {
      ...goodManifest('x'), supportedPlayers: { minimum: 4, maximum: 1 },
    }],
    ['a circle with no radius', {
      ...goodManifest('x'),
      requiredZones: [{ name: 'PLAYER_START', kind: 'player_start', shape: 'circle', geometry: {} }],
    }],
    ['a future schema version', { ...goodManifest('x'), manifestSchemaVersion: 99 }],
  ];

  for (const [label, body] of badCases) {
    const res = await call('/api/spatial/manifest-schema/validate', { method: 'POST', body });
    check(`rejects ${label}`, unwrap(res.body)?.valid === false, unwrap(res.body));
  }

  // ── 2. Setup ────────────────────────────────────────────────
  console.log('\n2. Setup — venue, staff, spatial experience');

  const venueId = `slice4-${RUN}`;
  const created = await call('/api/sources', {
    method: 'POST', headers: admin(),
    body: { source_id: venueId, source_name: `Slice4 ${RUN}` },
  });
  const venueKey = unwrap(created.body)?.api_key;
  requireOrAbort('venue created', !!venueKey, created.body);

  const ownerInvite = await call(`/api/sources/${venueId}/staff`, {
    method: 'POST', headers: admin(),
    body: { email: `owner@${venueId}.test`, role: 'owner', display_name: 'Owner' },
  });
  const ownerAccept = await call('/api/portal/v1/auth/accept', {
    method: 'POST',
    body: { invite_token: unwrap(ownerInvite.body)?.invite_token, password: PASSWORD },
  });
  const owner = unwrap(ownerAccept.body)?.session_token;
  requireOrAbort('owner activated', !!owner, ownerAccept.body);

  const perms = unwrap(ownerAccept.body)?.permissions ?? [];
  check('owner holds rooms.calibrate', perms.includes('rooms.calibrate'), perms);
  check('owner holds rooms.publish', perms.includes('rooms.publish'), perms);

  // An operator: may calibrate, must NOT publish.
  const opInvite = await call('/api/portal/v1/staff/invite', {
    method: 'POST', headers: bearer(owner),
    body: { email: `op+${RUN}@slice4.test`, role: 'operator' },
  });
  const opAccept = await call('/api/portal/v1/auth/accept', {
    method: 'POST',
    body: { invite_token: unwrap(opInvite.body)?.invite_token, password: PASSWORD },
  });
  const operator = unwrap(opAccept.body)?.session_token;
  requireOrAbort('operator activated', !!operator, opAccept.body);
  const opPerms = unwrap(opAccept.body)?.permissions ?? [];
  check('operator holds rooms.calibrate', opPerms.includes('rooms.calibrate'), opPerms);
  check('operator does NOT hold rooms.publish', !opPerms.includes('rooms.publish'), opPerms);

  const expSlug = `spatial-${RUN}`;
  const expCreated = await call('/api/experiences', {
    method: 'POST', headers: admin(),
    body: { slug: expSlug, name: `Spatial ${RUN}` },
  });
  requireOrAbort('canonical experience created', !!unwrap(expCreated.body)?.slug, expCreated.body);

  // A malformed manifest must be refused HERE, not discovered by an XR
  // client standing in a room.
  const badManifest = await call(`/api/experiences/${expSlug}/manifest`, {
    method: 'PUT', headers: admin(),
    body: { ...goodManifest(expSlug), requiredAnchors: [] },
  });
  check('an invalid manifest is refused at publish', badManifest.status === 400, badManifest.status);

  const manifestPut = await call(`/api/experiences/${expSlug}/manifest`, {
    method: 'PUT', headers: admin(), body: goodManifest(expSlug),
  });
  requireOrAbort('manifest published', manifestPut.status === 200, manifestPut.body);
  check('manifest records its schema version',
    unwrap(manifestPut.body)?.manifest_schema_version === 1, manifestPut.body);

  const manifestNoAuth = await call(`/api/experiences/${expSlug}/manifest`, {
    method: 'PUT', body: goodManifest(expSlug),
  });
  check('a venue cannot author a manifest (platform admin only)',
    manifestNoAuth.status === 403 || manifestNoAuth.status === 503, manifestNoAuth.status);

  // ── 3. Rooms ────────────────────────────────────────────────
  console.log('\n3. Room lifecycle');

  const roomRes = await call('/api/portal/v1/rooms', {
    method: 'POST', headers: bearer(owner),
    body: { slug: 'trial-chamber-a', name: 'Trial Chamber A', profile: { widthM: 5, depthM: 4 } },
  });
  const roomId = unwrap(roomRes.body)?.room_id;
  requireOrAbort('room created', !!roomId, roomRes.body);

  const dupRoom = await call('/api/portal/v1/rooms', {
    method: 'POST', headers: bearer(owner),
    body: { slug: 'trial-chamber-a', name: 'Duplicate' },
  });
  check('duplicate room slug is a conflict', dupRoom.status === 409, dupRoom.status);

  const badSlug = await call('/api/portal/v1/rooms', {
    method: 'POST', headers: bearer(owner),
    body: { slug: 'Trial Chamber A!', name: 'Bad' },
  });
  check('an invalid slug is rejected', badSlug.status === 400, badSlug.status);

  const rooms = unwrap((await call('/api/portal/v1/rooms', { headers: bearer(owner) })).body);
  checkAll('every room reports an active_config field', rooms, (r: any) => 'active_config' in r, rooms);
  check('a fresh room has no active config',
    (rooms ?? []).find((r: any) => r.room_id === roomId)?.active_config === null, rooms);

  // Unpublished rooms must not resolve at runtime.
  const earlyResolve = await call(`/api/partner/v1/rooms/trial-chamber-a`, { headers: apiKey(venueKey) });
  check('an uncalibrated room does not resolve', earlyResolve.status === 404, earlyResolve.status);

  // ── 4. Calibration draft ────────────────────────────────────
  console.log('\n4. Calibration');

  const draftRes = await call(`/api/portal/v1/rooms/${roomId}/drafts`, {
    method: 'POST', headers: bearer(operator),
    body: { experience_slug: expSlug, origin_mode: 'fiducial' },
  });
  const configId = unwrap(draftRes.body)?.room_config_id;
  requireOrAbort('operator opened a draft', !!configId, draftRes.body);
  check('first draft is version 1', unwrap(draftRes.body)?.version === 1, draftRes.body);

  const secondDraft = await call(`/api/portal/v1/rooms/${roomId}/drafts`, {
    method: 'POST', headers: bearer(operator), body: {},
  });
  check('a second concurrent draft is refused', secondDraft.status === 409, secondDraft.status);

  // Publish an EMPTY draft: must fail. This is the gate's whole job.
  const emptyPublish = await call(`/api/portal/v1/rooms/configs/${configId}/publish`, {
    method: 'POST', headers: bearer(owner),
  });
  check('an empty calibration CANNOT be published', emptyPublish.status === 400, emptyPublish.status);

  const emptyValidation = unwrap(
    (await call(`/api/portal/v1/rooms/configs/${configId}/validation`, { headers: bearer(operator) })).body,
  );
  check('validation reports it as failed', emptyValidation?.passed === false, emptyValidation);
  checkAll('and gives reasons', emptyValidation?.failures, (f: any) => typeof f === 'string', emptyValidation);
  check('missing origin is named as a reason',
    (emptyValidation?.failures ?? []).some((f: string) => /origin/i.test(f)), emptyValidation?.failures);

  const badPose = await call(`/api/portal/v1/rooms/drafts/${configId}`, {
    method: 'PATCH', headers: bearer(operator),
    body: { anchors: [{ name: 'ORIGIN', role: 'origin', provider: 'local_marker', local_position: [0, 0], local_rotation: [0, 0, 0] }] },
  });
  check('a malformed pose is rejected', badPose.status === 400, badPose.status);

  // A fiducial origin with NO marker id — the operator would have no
  // recovery target, which is the entire advantage of Mode A.
  await call(`/api/portal/v1/rooms/drafts/${configId}`, {
    method: 'PATCH', headers: bearer(operator),
    body: {
      anchors: [{ name: 'ORIGIN', role: 'origin', provider: 'local_marker', local_position: [0, 0, 0], local_rotation: [0, 0, 0] }],
    },
  });
  const noMarker = unwrap(
    (await call(`/api/portal/v1/rooms/configs/${configId}/validation`, { headers: bearer(operator) })).body,
  );
  check('a fiducial origin with no marker_id fails validation',
    (noMarker?.failures ?? []).some((f: string) => /marker/i.test(f)), noMarker?.failures);

  // Now a complete, well-formed calibration.
  const fullDraft = await call(`/api/portal/v1/rooms/drafts/${configId}`, {
    method: 'PATCH', headers: bearer(operator),
    body: {
      orientation_reference: { kind: 'wall', bearingDeg: 0 },
      supported_device_profiles: ['tier-b-standalone-headset'],
      anchors: [
        { name: 'ORIGIN', role: 'origin', provider: 'local_marker', marker_id: 'crest-plate-01',
          local_position: [0, 0, 0], local_rotation: [0, 0, 0], tracking_confidence: 0.97 },
        { name: 'VERIFY_NE', role: 'verification', provider: 'local_marker', marker_id: 'v-ne',
          local_position: [2, 0, 2], local_rotation: [0, 0, 0], tracking_confidence: 0.95 },
        { name: 'VERIFY_SW', role: 'verification', provider: 'local_marker', marker_id: 'v-sw',
          local_position: [-2, 0, -2], local_rotation: [0, 0, 0], tracking_confidence: 0.93 },
      ],
      placements: [
        { anchor_name: 'HERO_ECHO_MAIN', local_position: [0, 0, 2.5], local_rotation: [0, 180, 0] },
        { anchor_name: 'RIFT_WEST_WALL', local_position: [-2, 1.6, 1], local_rotation: [0, 90, 0] },
      ],
      zones: [
        { name: 'PLAYER_START', kind: 'player_start', shape: 'circle', geometry: { radius: 0.75 }, local_position: [0, 0, 0] },
        { name: 'RIFT_INTERACTION_ZONE', kind: 'interaction', shape: 'box', geometry: { size: [1.5, 2, 1.5] }, local_position: [-2, 0, 1] },
      ],
    },
  });
  check('a complete calibration is accepted', fullDraft.status === 200, fullDraft.body);

  const goodValidation = unwrap(
    (await call(`/api/portal/v1/rooms/configs/${configId}/validation`, { headers: bearer(operator) })).body,
  );
  check('the complete calibration passes validation', goodValidation?.passed === true, goodValidation);
  check('tolerances are reported with the verdict',
    typeof goodValidation?.tolerances?.['spatial.max_translation_error_m'] === 'number',
    goodValidation?.tolerances);

  // ── 5. The publish gate ─────────────────────────────────────
  console.log('\n5. Publish, immutability, rollback');

  const opPublish = await call(`/api/portal/v1/rooms/configs/${configId}/publish`, {
    method: 'POST', headers: bearer(operator),
  });
  check('an OPERATOR cannot publish', opPublish.status === 403, opPublish.status);

  const published = await call(`/api/portal/v1/rooms/configs/${configId}/publish`, {
    method: 'POST', headers: bearer(owner),
  });
  check('an owner CAN publish', published.status === 200, published.body);
  check('the config is now published', unwrap(published.body)?.status === 'published', published.body);
  check('publication is attributed to a person', !!unwrap(published.body)?.published_by, published.body);

  // Immutability — the property every drift measurement depends on.
  const mutate = await call(`/api/portal/v1/rooms/drafts/${configId}`, {
    method: 'PATCH', headers: bearer(operator), body: { zones: [] },
  });
  check('a PUBLISHED config cannot be mutated', mutate.status === 409, mutate.status);

  const republish = await call(`/api/portal/v1/rooms/configs/${configId}/publish`, {
    method: 'POST', headers: bearer(owner),
  });
  check('and cannot be re-published', republish.status === 409, republish.status);

  // ── 6. Runtime resolve ──────────────────────────────────────
  console.log('\n6. Runtime resolve — what the XR client reads');

  const resolved = await call('/api/partner/v1/rooms/trial-chamber-a', { headers: apiKey(venueKey) });
  const r = unwrap(resolved.body);
  check('a published room resolves', resolved.status === 200, resolved.status);
  check('resolve states its coordinate space', r?.coordinate_space === 'room_local_meters_y_up', r);
  checkAll('anchors carry a provider', r?.anchors, (a: any) => !!a.provider, r?.anchors);
  checkAll('placements carry a pose', r?.placements,
    (p: any) => Array.isArray(p.local_position) && p.local_position.length === 3, r?.placements);
  check('the player_start zone survives to the client',
    (r?.zones ?? []).some((z: any) => z.kind === 'player_start'), r?.zones);

  const noKey = await call('/api/partner/v1/rooms/trial-chamber-a');
  check('resolve refuses an unauthenticated caller', noKey.status === 403, noKey.status);

  // Tenant isolation: another venue's key must not read this room.
  const otherId = `slice4-other-${RUN}`;
  const other = await call('/api/sources', {
    method: 'POST', headers: admin(), body: { source_id: otherId, source_name: 'Other' },
  });
  const otherKey = unwrap(other.body)?.api_key;
  if (otherKey) {
    const crossRead = await call('/api/partner/v1/rooms/trial-chamber-a', { headers: apiKey(otherKey) });
    check("another venue's key cannot resolve this room", crossRead.status === 404, crossRead.status);
  }

  // ── 7. Recalibration and rollback ───────────────────────────
  console.log('\n7. Recalibration');

  const v2 = await call(`/api/portal/v1/rooms/${roomId}/drafts`, {
    method: 'POST', headers: bearer(operator), body: { origin_mode: 'native' },
  });
  const v2Id = unwrap(v2.body)?.room_config_id;
  check('a new draft opens after publication', !!v2Id, v2.body);
  check('and is version 2', unwrap(v2.body)?.version === 2, v2.body);

  const rollbackEarly = await call(`/api/portal/v1/rooms/${roomId}/rollback`, {
    method: 'POST', headers: bearer(owner), body: { version: 2 },
  });
  check('cannot roll back to an unpublished draft', rollbackEarly.status === 400, rollbackEarly.status);

  const rollbackSelf = await call(`/api/portal/v1/rooms/${roomId}/rollback`, {
    method: 'POST', headers: bearer(owner), body: { version: 1 },
  });
  check('rolling back to the already-active version is a conflict',
    rollbackSelf.status === 409, rollbackSelf.status);

  // The manifest <-> room join, which is the whole point of separating
  // "what the experience needs" from "how it fits here". A room missing
  // a placement is content the runtime will look for and not find, and
  // it must fail at publish rather than in front of a guest.
  //
  // v2 was opened with no experience binding, so bind a fresh draft.
  await call(`/api/portal/v1/rooms/drafts/${v2Id}`, {
    method: 'PATCH', headers: bearer(operator),
    body: {
      anchors: [
        { name: 'ORIGIN', role: 'origin', provider: 'meta', provider_anchor_id: 'meta-uuid-1',
          local_position: [0, 0, 0], local_rotation: [0, 0, 0], tracking_confidence: 0.99 },
        { name: 'VERIFY_NE', role: 'verification', provider: 'meta', provider_anchor_id: 'meta-uuid-2',
          local_position: [2, 0, 2], local_rotation: [0, 0, 0], tracking_confidence: 0.96 },
        { name: 'VERIFY_SW', role: 'verification', provider: 'meta', provider_anchor_id: 'meta-uuid-3',
          local_position: [-2, 0, -2], local_rotation: [0, 0, 0], tracking_confidence: 0.94 },
      ],
      zones: [
        { name: 'PLAYER_START', kind: 'player_start', shape: 'circle', geometry: { radius: 0.75 } },
      ],
      // Deliberately only ONE of the manifest's two content anchors.
      placements: [
        { anchor_name: 'HERO_ECHO_MAIN', local_position: [0, 0, 2.5], local_rotation: [0, 180, 0] },
      ],
    },
  });
  const v2NoExp = unwrap(
    (await call(`/api/portal/v1/rooms/configs/${v2Id}/validation`, { headers: bearer(operator) })).body,
  );
  // v2 was opened WITHOUT an experience, so placements cannot be checked
  // against anything — and the harness must say so rather than read a
  // pass here as proof the join works.
  check('an unbound draft warns that placements are unvalidated',
    (v2NoExp?.warnings ?? []).some((w: string) => /not bound to an experience/i.test(w)),
    v2NoExp);

  // Now the real join test: a draft BOUND to the experience, missing a
  // required placement.
  const v3 = await call(`/api/portal/v1/rooms/${roomId}/drafts`, {
    method: 'POST', headers: bearer(operator), body: {},
  });
  check('cannot open a third draft while v2 is open', v3.status === 409, v3.status);

  const room2Res = await call('/api/portal/v1/rooms', {
    method: 'POST', headers: bearer(owner),
    body: { slug: 'trial-chamber-b', name: 'Trial Chamber B' },
  });
  const room2Id = unwrap(room2Res.body)?.room_id;
  requireOrAbort('second room created', !!room2Id, room2Res.body);

  const boundDraft = await call(`/api/portal/v1/rooms/${room2Id}/drafts`, {
    method: 'POST', headers: bearer(operator),
    body: { experience_slug: expSlug, origin_mode: 'native' },
  });
  const boundId = unwrap(boundDraft.body)?.room_config_id;
  requireOrAbort('bound draft opened', !!boundId, boundDraft.body);

  await call(`/api/portal/v1/rooms/drafts/${boundId}`, {
    method: 'PATCH', headers: bearer(operator),
    body: {
      anchors: [
        { name: 'ORIGIN', role: 'origin', provider: 'meta', provider_anchor_id: 'm-1',
          local_position: [0, 0, 0], local_rotation: [0, 0, 0], tracking_confidence: 0.99 },
        { name: 'VERIFY_NE', role: 'verification', provider: 'meta', provider_anchor_id: 'm-2',
          local_position: [2, 0, 2], local_rotation: [0, 0, 0], tracking_confidence: 0.96 },
        { name: 'VERIFY_SW', role: 'verification', provider: 'meta', provider_anchor_id: 'm-3',
          local_position: [-2, 0, -2], local_rotation: [0, 0, 0], tracking_confidence: 0.94 },
      ],
      zones: [{ name: 'PLAYER_START', kind: 'player_start', shape: 'circle', geometry: { radius: 0.75 } }],
      placements: [
        { anchor_name: 'HERO_ECHO_MAIN', local_position: [0, 0, 2.5], local_rotation: [0, 180, 0] },
        { anchor_name: 'GHOST_ANCHOR', local_position: [0, 0, 0], local_rotation: [0, 0, 0] },
      ],
    },
  });
  const joinVerdict = unwrap(
    (await call(`/api/portal/v1/rooms/configs/${boundId}/validation`, { headers: bearer(operator) })).body,
  );
  check('a MISSING placement fails validation',
    (joinVerdict?.failures ?? []).some((f: string) => /RIFT_WEST_WALL/.test(f)), joinVerdict);
  check('and the failure names the manifest anchor',
    joinVerdict?.passed === false, joinVerdict);
  check('a placement matching no manifest anchor warns',
    (joinVerdict?.warnings ?? []).some((w: string) => /GHOST_ANCHOR/.test(w)), joinVerdict?.warnings);

  const blockedPublish = await call(`/api/portal/v1/rooms/configs/${boundId}/publish`, {
    method: 'POST', headers: bearer(owner),
  });
  check('and it cannot be published', blockedPublish.status === 400, blockedPublish.status);

  // ── 8. Audit ────────────────────────────────────────────────
  console.log('\n8. Audit');

  const audit = unwrap((await call('/api/portal/v1/audit', { headers: bearer(owner) })).body);
  const actions = (audit ?? []).map((a: any) => a.action);
  check('room creation is audited', actions.includes('room.created'), actions);
  check('draft opening is audited', actions.includes('room.draft_opened'), actions);
  check('publication is audited', actions.includes('room.published'), actions);

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
