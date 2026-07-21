// ============================================================
// HEP Phase 2 Slice 2 — verification harness
//
// Asserts venue staff identity, the RBAC matrix, tenant isolation,
// audit, analytics — and the HARD BOUNDARY between the Partner Portal
// and Heroes' Codex.
//
// That boundary is the reason several of these checks exist. The portal
// is connective tissue into the platform, never a screen inside the
// game, and a future refactor that quietly merges the guards must fail
// a test rather than ship.
//
// Usage:
//   HV_API_URL=https://pik-prd-staging.up.railway.app \
//   HV_PLATFORM_ADMIN_KEY=<staff key> \
//   npx ts-node scripts/verify-slice2.ts
//
// Or without handling the secret:
//   railway run --environment Staging --service pik-prd -- npx ts-node scripts/verify-slice2.ts
// ============================================================

const API = process.env.HV_API_URL?.replace(/\/$/, '');
const ADMIN_KEY = process.env.HV_PLATFORM_ADMIN_KEY;

if (!API || !ADMIN_KEY) {
  console.error('Missing env: HV_API_URL, HV_PLATFORM_ADMIN_KEY');
  process.exit(2);
}

const RUN = `s2-${Date.now()}`;
const PASSWORD = `Portal-${RUN}!`;
let failures = 0;

function check(name: string, passed: boolean, detail?: unknown) {
  console.log(`  ${passed ? '✓' : '✗'} ${name}`);
  if (!passed) {
    failures++;
    if (detail !== undefined) {
      console.log(`      got: ${JSON.stringify(detail)?.slice(0, 260)}`);
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
const unwrap = (b: any) => b?.data ?? b;

/** Provision a venue and invite + activate its founding owner. */
async function makeVenueWithOwner(id: string) {
  const created = await call('/api/sources', {
    method: 'POST', headers: admin(),
    body: { source_id: id, source_name: `Slice2 ${id}` },
  });
  const apiKey = unwrap(created.body)?.api_key;

  const invite = await call(`/api/sources/${id}/staff`, {
    method: 'POST', headers: admin(),
    body: { email: `owner@${id}.test`, role: 'owner', display_name: 'Founding Owner' },
  });
  const inviteToken = unwrap(invite.body)?.invite_token;
  if (!inviteToken) return null;

  const accepted = await call('/api/portal/v1/auth/accept', {
    method: 'POST',
    body: { invite_token: inviteToken, password: PASSWORD, display_name: 'Founding Owner' },
  });
  const token = unwrap(accepted.body)?.session_token;
  return token ? { apiKey, ownerToken: token, id } : null;
}

/** Invite a colleague at `role` and activate them; returns their session. */
async function addStaff(ownerToken: string, email: string, role: string) {
  const invite = await call('/api/portal/v1/staff/invite', {
    method: 'POST', headers: bearer(ownerToken),
    body: { email, role },
  });
  const inviteToken = unwrap(invite.body)?.invite_token;
  if (!inviteToken) return null;
  const accepted = await call('/api/portal/v1/auth/accept', {
    method: 'POST',
    body: { invite_token: inviteToken, password: PASSWORD },
  });
  return {
    token: unwrap(accepted.body)?.session_token as string | undefined,
    staffId: unwrap(invite.body)?.staff_id as string,
  };
}

/** A real player account — used to prove Codex cannot reach the portal. */
async function makePlayer() {
  const stamp = Date.now().toString(36);
  const reg = await call('/api/account/register', {
    method: 'POST',
    body: { email: `player+${stamp}@slice2.test`, password: `Pl4yer-${stamp}!` },
  });
  let token = unwrap(reg.body)?.session_token;
  if (!token) return null;
  const hero = await call('/api/account/heroes', {
    method: 'POST', headers: bearer(token),
    body: { hero_name: `Player${stamp}`, alignment: 'ORDER' },
  });
  const rootId = unwrap(hero.body)?.root_id;
  if (rootId) {
    const sel = await call(`/api/account/heroes/${rootId}/select`, {
      method: 'POST', headers: bearer(token),
    });
    token = unwrap(sel.body)?.session_token ?? token;
  }
  return { token, rootId };
}

async function main() {
  console.log(`\nHEP Slice 2 verification against ${API}\n`);
  const venues = [`${RUN}-a`, `${RUN}-b`];

  // ── 0. Onboarding ────────────────────────────────────────────────
  console.log('0. Venue onboarding');
  const a = await makeVenueWithOwner(venues[0]);
  requireOrAbort('founding owner invited and activated', Boolean(a?.ownerToken));
  const b = await makeVenueWithOwner(venues[1]);
  requireOrAbort('second venue provisioned', Boolean(b?.ownerToken));

  const me = await call('/api/portal/v1/me', { headers: bearer(a!.ownerToken) });
  check('owner sees their own venue and role',
    unwrap(me.body)?.venue?.source_id === venues[0] && unwrap(me.body)?.staff?.role === 'owner',
    me.body);

  const login = await call('/api/portal/v1/auth/login', {
    method: 'POST',
    body: { email: `owner@${venues[0]}.test`, password: PASSWORD },
  });
  check('owner can log in with password', Boolean(unwrap(login.body)?.session_token), login.status);

  const badLogin = await call('/api/portal/v1/auth/login', {
    method: 'POST',
    body: { email: `owner@${venues[0]}.test`, password: 'wrong-password' },
  });
  check('wrong password rejected (401)', badLogin.status === 401, badLogin.status);

  // ── 1. The RBAC matrix ───────────────────────────────────────────
  console.log('\n1. RBAC matrix');
  const manager = await addStaff(a!.ownerToken, `manager@${venues[0]}.test`, 'manager');
  const operator = await addStaff(a!.ownerToken, `operator@${venues[0]}.test`, 'operator');
  const viewer = await addStaff(a!.ownerToken, `viewer@${venues[0]}.test`, 'viewer');
  requireOrAbort('manager, operator and viewer activated',
    Boolean(manager?.token && operator?.token && viewer?.token));

  // Everyone reads analytics.
  for (const [role, tok] of [
    ['owner', a!.ownerToken], ['manager', manager!.token!],
    ['operator', operator!.token!], ['viewer', viewer!.token!],
  ] as const) {
    const r = await call('/api/portal/v1/analytics', { headers: bearer(tok) });
    check(`${role} can read analytics`, r.status === 200, r.status);
  }

  // Only owner manages staff.
  for (const [role, tok, expect] of [
    ['owner', a!.ownerToken, 200], ['manager', manager!.token!, 403],
    ['operator', operator!.token!, 403], ['viewer', viewer!.token!, 403],
  ] as const) {
    const r = await call('/api/portal/v1/staff', { headers: bearer(tok) });
    check(`${role} staff.manage -> ${expect}`, r.status === expect, r.status);
  }

  // Owner and manager edit the venue; operator and viewer cannot.
  for (const [role, tok, expect] of [
    ['manager', manager!.token!, 200], ['operator', operator!.token!, 403],
    ['viewer', viewer!.token!, 403],
  ] as const) {
    const r = await call('/api/portal/v1/venue', {
      method: 'PATCH', headers: bearer(tok), body: { contact_phone: '+1-555-0100' },
    });
    check(`${role} venue.edit -> ${expect}`, r.status === expect, r.status);
  }

  // ── 2. Commercial terms are not venue-editable ───────────────────
  console.log('\n2. A venue cannot grant itself commercial terms');
  const selfGrant = await call('/api/portal/v1/venue', {
    method: 'PATCH', headers: bearer(a!.ownerToken),
    body: { scopes: 'xp titles runs rewards guests' },
  });
  check('owner cannot edit scopes (403)', selfGrant.status === 403, selfGrant.body);

  const selfActivate = await call('/api/portal/v1/venue', {
    method: 'PATCH', headers: bearer(a!.ownerToken), body: { status: 'active' },
  });
  check('owner cannot edit status (403)', selfActivate.status === 403, selfActivate.status);

  // ── 3. Tenant isolation ──────────────────────────────────────────
  console.log('\n3. Tenant isolation');
  const bStaff = await call('/api/portal/v1/staff', { headers: bearer(b!.ownerToken) });
  checkAll("venue B's staff list contains only venue B accounts",
    unwrap(bStaff.body),
    (s: any) => String(s.email).includes(venues[1]));

  const crossPatch = await call(`/api/portal/v1/staff/${manager!.staffId}`, {
    method: 'PATCH', headers: bearer(b!.ownerToken), body: { role: 'viewer' },
  });
  check("venue B cannot modify venue A's staff (404)", crossPatch.status === 404, crossPatch.status);

  // ── 4. THE BOUNDARY — Codex and the portal never meet ────────────
  console.log('\n4. Boundary: the portal is not reachable from Codex');
  const player = await makePlayer();
  requireOrAbort('player account created', Boolean(player?.token));

  const playerToPortal = await call('/api/portal/v1/me', { headers: bearer(player!.token) });
  check('a Codex player session cannot reach the portal (401)',
    playerToPortal.status === 401, playerToPortal.status);

  const staffToPlayer = await call('/api/account/heroes', { headers: bearer(a!.ownerToken) });
  check('a staff session cannot reach player routes (401)',
    staffToPlayer.status === 401, staffToPlayer.status);

  const keyToPortal = await call('/api/portal/v1/me', {
    headers: { 'X-PIK-API-Key': a!.apiKey },
  });
  check("a venue's machine API key cannot reach the portal (401)",
    keyToPortal.status === 401, keyToPortal.status);

  const staffToPartner = await call('/api/partner/v1/venue', { headers: bearer(a!.ownerToken) });
  check('a staff session cannot drive the machine API (403)',
    staffToPartner.status === 403, staffToPartner.status);

  // ── 5. Owner protection and revocation ───────────────────────────
  console.log('\n5. Owner protection and revocation');
  const selfDemote = await call(`/api/portal/v1/staff/${unwrap(me.body)?.staff?.staff_id}`, {
    method: 'PATCH', headers: bearer(a!.ownerToken), body: { role: 'viewer' },
  });
  check('the only owner cannot be demoted (409)', selfDemote.status === 409, selfDemote.status);

  const suspend = await call(`/api/portal/v1/staff/${manager!.staffId}`, {
    method: 'PATCH', headers: bearer(a!.ownerToken), body: { status: 'suspended' },
  });
  check('manager suspended', suspend.status === 200, suspend.status);

  const afterSuspend = await call('/api/portal/v1/me', { headers: bearer(manager!.token!) });
  check('suspension revokes the live session immediately (401)',
    afterSuspend.status === 401, afterSuspend.status);

  // ── 6. Audit ─────────────────────────────────────────────────────
  console.log('\n6. Audit trail');
  const audit = await call('/api/portal/v1/audit', { headers: bearer(a!.ownerToken) });
  const entries = unwrap(audit.body) ?? [];
  check('audit records the staff invitations',
    entries.some((e: any) => e.action === 'staff.invited'), entries?.length);
  check('audit records the suspension',
    entries.some((e: any) => e.action === 'staff.updated'), entries?.length);
  checkAll('every audit entry is attributed', entries, (e: any) => Boolean(e.by));

  // ── 7. Analytics shape ───────────────────────────────────────────
  console.log('\n7. Analytics');
  const stats = unwrap((await call('/api/portal/v1/analytics', {
    headers: bearer(a!.ownerToken),
  })).body);
  check('analytics reports a run block', typeof stats?.runs?.total === 'number', stats?.runs);
  check('analytics reports walk-in conversion',
    stats?.walk_in_conversion !== undefined, stats?.walk_in_conversion);
  check('a venue with no runs reports null completion rate, not 0',
    stats?.runs?.completion_rate === null, stats?.runs);

  // ── Cleanup ──────────────────────────────────────────────────────
  console.log('\n8. Cleanup');
  for (const v of venues) {
    await call(`/api/sources/${v}/status`, {
      method: 'POST', headers: admin(), body: { status: 'suspended' },
    }).catch(() => undefined);
  }
  // Verified, not asserted: `check(..., true)` is the exact vacuous pass
  // this harness family exists to stamp out.
  const deadKey = await call('/api/partner/v1/venue', {
    headers: { 'X-PIK-API-Key': a!.apiKey },
  });
  check('suspended venue key no longer authenticates (403)',
    deadKey.status === 403, deadKey.status);

  console.log(
    failures === 0
      ? '\n✅ Slice 2 verified — all checks passed\n'
      : `\n❌ ${failures} check(s) failed\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nHarness crashed:', err);
  process.exit(1);
});
