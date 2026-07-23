// ============================================================
// HEP Phase 2 Slice 3 — verification harness
//
// Covers the surfaces that were device-verified but had no automated
// coverage, plus the mail seam built on top of them:
//
//   1. Venue check-in    — the path that lets an EXISTING Codex player
//                          join a run at all
//   2. Consent withdrawal — and the first-party guard, which is the one
//                          that stops a player severing themselves from
//                          their own game
//   3. Password reset    — the recovery path that removes the last piece
//                          of per-venue custom engineering
//   4. Invite delivery   — the other half of the same seam
//
// Sections 3–4 assert against the `log` transport's outbox when no mail
// provider is configured. That is the point: the flow must be provable
// before the credential exists, or the newest authentication code ships
// with its happy path untested.
//
// Usage:
//   HV_API_URL=https://pik-prd-staging.up.railway.app \
//   HV_PLATFORM_ADMIN_KEY=<staff key> \
//   npx ts-node scripts/verify-slice3.ts
// ============================================================

const API = process.env.HV_API_URL?.replace(/\/$/, '');
const ADMIN_KEY = process.env.HV_PLATFORM_ADMIN_KEY;

if (!API || !ADMIN_KEY) {
  console.error('Missing env: HV_API_URL, HV_PLATFORM_ADMIN_KEY');
  process.exit(2);
}

const RUN = `s3-${Date.now().toString(36)}`;
const PASSWORD = `Portal-${RUN}!`;
const NEW_PASSWORD = `Reset-${RUN}!`;
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

/** Create a throwaway account + hero, as a real player would. */
async function registerPlayer(tag: string) {
  const stamp = `${RUN}-${tag}`;
  const reg = await call('/api/account/register', {
    method: 'POST',
    body: {
      email: `player+${stamp}@slice3.test`,
      password: `Sl3ce-${stamp}!`,
      display_name: `Player ${tag}`,
    },
  });
  let sessionToken = unwrap(reg.body)?.session_token;
  if (!sessionToken) return { error: `register -> ${reg.status}`, detail: reg.body };

  const hero = await call('/api/account/heroes', {
    method: 'POST',
    headers: bearer(sessionToken),
    body: { hero_name: `Hero${tag}${Date.now().toString(36).slice(-4)}`, alignment: 'ORDER' },
  });
  const rootId = unwrap(hero.body)?.root_id ?? unwrap(hero.body)?.hero?.root_id;
  if (!rootId) return { error: `create hero -> ${hero.status}`, detail: hero.body };

  const sel = await call(`/api/account/heroes/${rootId}/select`, {
    method: 'POST', headers: bearer(sessionToken),
  });
  sessionToken = unwrap(sel.body)?.session_token ?? sessionToken;

  return { sessionToken, rootId };
}

/**
 * Read the log transport's outbox and find the newest message to an
 * address. Returns null when a real provider is configured — callers
 * treat that as "skip", not "fail": a staging box with a live Resend key
 * is a legitimate state, and failing there would train people to ignore
 * this harness.
 */
async function lastMailTo(email: string, kind: string) {
  const res = await call('/api/portal/v1/_mail/outbox', { headers: admin() });
  const body = unwrap(res.body);
  if (body?.transport !== 'log') return null;
  const matches = (body?.messages ?? []).filter(
    (m: any) => m.to === email && m.kind === kind,
  );
  return matches.length ? matches[matches.length - 1] : undefined;
}

/** Pull the token out of a link in a mail body. */
function tokenFrom(text: string, fragment: 'reset' | 'accept'): string | null {
  const m = text?.match(new RegExp(`#${fragment}=([A-Za-z0-9_-]+)`));
  return m ? m[1] : null;
}

/**
 * Refuse to grade a build that is not the one under test.
 *
 * A run seconds after a push hits the OLD container and reports confident
 * failures for correct code — indistinguishable from a real regression
 * unless the harness says so. Warns rather than aborts: verifying an
 * older deployment is sometimes exactly what you want, but you should
 * never do it by accident.
 */
async function preflightBuild() {
  const health = unwrap((await call('/api/health')).body);
  const deployed = health?.commit ?? null;
  let local: string | null = null;
  try {
    local = require('child_process')
      .execSync('git rev-parse --short=7 HEAD', { cwd: __dirname + '/..' })
      .toString()
      .trim();
  } catch {
    /* not a git checkout — skip the comparison */
  }

  console.log(
    `  build: ${health?.environment ?? '?'} ` +
      `branch=${health?.branch ?? '?'} commit=${deployed ?? 'unknown'}` +
      (local ? ` | local HEAD=${local}` : ''),
  );

  if (deployed && local && deployed !== local) {
    console.log(
      `  ⚠ DEPLOYED BUILD (${deployed}) IS NOT YOUR LOCAL HEAD (${local}).\n` +
        `    A deploy may still be rolling out. Failures below may be stale\n` +
        `    code rather than real regressions — re-run once it settles.`,
    );
  }
  if (!deployed) {
    console.log(
      '  · server reports no commit (pre-2026-07-21 build, or running locally)',
    );
  }
}

async function main() {
  console.log(`\nHEP Slice 3 verification — ${API}\n${'─'.repeat(58)}`);
  await preflightBuild();

  const venueId = `slice3-${RUN}`;
  const ownerEmail = `owner@${venueId}.test`;

  // ── Setup ───────────────────────────────────────────────────
  console.log('\n0. Setup');

  const created = await call('/api/sources', {
    method: 'POST', headers: admin(),
    body: { source_id: venueId, source_name: `Slice3 ${RUN}` },
  });
  requireOrAbort('venue created', !!unwrap(created.body)?.api_key, created.body);

  const invite = await call(`/api/sources/${venueId}/staff`, {
    method: 'POST', headers: admin(),
    body: { email: ownerEmail, role: 'owner', display_name: 'Founding Owner' },
  });
  const inviteToken = unwrap(invite.body)?.invite_token;
  requireOrAbort('founding owner invited', !!inviteToken, invite.body);

  const accepted = await call('/api/portal/v1/auth/accept', {
    method: 'POST',
    body: { invite_token: inviteToken, password: PASSWORD, display_name: 'Founding Owner' },
  });
  const ownerToken = unwrap(accepted.body)?.session_token;
  requireOrAbort('owner activated', !!ownerToken, accepted.body);

  // ── 1. Venue check-in ───────────────────────────────────────
  console.log('\n1. Venue check-in — an existing player can join');

  const player = await registerPlayer('a');
  requireOrAbort('player account + hero created', !!player.sessionToken, player);

  const describe = await call(`/api/venues/${venueId}`);
  const described = unwrap(describe.body);
  check('venue describes itself unauthenticated', describe.status === 200, describe.body);
  check('description names the venue', described?.name?.includes(RUN), described);

  const checkIn = await call(`/api/venues/${venueId}/check-in`, {
    method: 'POST', headers: bearer(player.sessionToken!), body: { zone: 'atrium' },
  });
  check('check-in succeeds', checkIn.status === 200, checkIn.body);

  // The whole reason check-in exists: it must produce the SourceLink that
  // startRun requires. A 200 that created no link would be the exact
  // silent failure this endpoint was written to fix.
  const links = unwrap(
    (await call(`/api/users/${player.rootId}/links`, {
      headers: bearer(player.sessionToken!),
    })).body,
  );
  const venueLink = (links ?? []).find((l: any) => l.source_id === venueId);
  check('check-in created a consent link', !!venueLink, links);
  check('the link is active', venueLink?.status === 'active', venueLink);

  const anon = await call(`/api/venues/${venueId}/check-in`, { method: 'POST' });
  check('check-in refuses an unauthenticated caller', anon.status === 401, anon.status);

  const checkOut = await call(`/api/venues/${venueId}/check-out`, {
    method: 'POST', headers: bearer(player.sessionToken!),
  });
  check('check-out succeeds', checkOut.status === 200, checkOut.body);

  // Leaving is not withdrawing. If check-out revoked consent, a player
  // would silently lose their rewards by walking out of the room.
  const afterOut = unwrap(
    (await call(`/api/users/${player.rootId}/links`, {
      headers: bearer(player.sessionToken!),
    })).body,
  );
  const linkAfterOut = (afterOut ?? []).find((l: any) => l.source_id === venueId);
  check('check-out did NOT revoke consent', linkAfterOut?.status === 'active', linkAfterOut);

  // ── 2. Withdrawal and the first-party guard ─────────────────
  console.log('\n2. Consent withdrawal');

  checkAll(
    'every link reports withdrawable',
    afterOut,
    (l: any) => typeof l.withdrawable === 'boolean',
    afterOut,
  );

  const firstParty = (afterOut ?? []).filter((l: any) => l.source_type === 'first_party');
  // This check has already earned its keep: the seed migration that types
  // this source used ON CONFLICT DO NOTHING, so environments where the row
  // pre-existed kept source_type='venue' and the guard below did nothing.
  // Staging was green (fresh row); production was wrong for eight days.
  checkAll(
    "Heroes' Codex is present and NOT withdrawable",
    firstParty,
    (l: any) => l.withdrawable === false,
    afterOut,
  );

  // The guard that matters. Every hero is FK-linked to Heroes' Codex, so
  // a successful revoke here severs a player from their own game.
  requireOrAbort(
    'a first-party link exists to test the guard against',
    firstParty.length > 0,
    afterOut,
  );
  const revokeFirstParty = await call(
    `/api/users/${player.rootId}/links/${firstParty[0].link_id}`,
    {
      method: 'DELETE',
      headers: bearer(player.sessionToken!),
      body: { revoked_by: 'user' },
    },
  );
  check(
    "withdrawing Heroes' Codex is REFUSED",
    revokeFirstParty.status === 403,
    { status: revokeFirstParty.status, body: revokeFirstParty.body },
  );

  const stillLinked = unwrap(
    (await call(`/api/users/${player.rootId}/links`, {
      headers: bearer(player.sessionToken!),
    })).body,
  );
  const fpAfter = (stillLinked ?? []).find((l: any) => l.link_id === firstParty[0].link_id);
  check('and the link is untouched', fpAfter?.status === 'active', fpAfter);

  // The third-party one, by contrast, must actually withdraw.
  const revokeVenue = await call(
    `/api/users/${player.rootId}/links/${venueLink.link_id}`,
    {
      method: 'DELETE',
      headers: bearer(player.sessionToken!),
      body: { revoked_by: 'user' },
    },
  );
  check('withdrawing the venue SUCCEEDS', revokeVenue.status === 200, revokeVenue.body);

  const postRevoke = unwrap(
    (await call(`/api/users/${player.rootId}/links`, {
      headers: bearer(player.sessionToken!),
    })).body,
  );
  const venueAfter = (postRevoke ?? []).find((l: any) => l.source_id === venueId);
  check('the venue link is revoked', venueAfter?.status === 'revoked', venueAfter);

  const doubleRevoke = await call(
    `/api/users/${player.rootId}/links/${venueLink.link_id}`,
    {
      method: 'DELETE',
      headers: bearer(player.sessionToken!),
      body: { revoked_by: 'user' },
    },
  );
  check('double withdrawal is a conflict', doubleRevoke.status === 409, doubleRevoke.status);

  // ── 3. Password reset ───────────────────────────────────────
  console.log('\n3. Password reset — the recovery path');

  // Non-disclosure first: an unknown address must be indistinguishable
  // from a real one, or this endpoint enumerates staff.
  const forgotUnknown = await call('/api/portal/v1/auth/forgot', {
    method: 'POST', body: { email: `nobody-${RUN}@nowhere.test` },
  });
  const forgotReal = await call('/api/portal/v1/auth/forgot', {
    method: 'POST', body: { email: ownerEmail },
  });
  check('forgot accepts an unknown address', forgotUnknown.status === 202, forgotUnknown.status);
  check('forgot accepts a real address', forgotReal.status === 202, forgotReal.status);
  check(
    'both replies are byte-identical (no enumeration oracle)',
    JSON.stringify(forgotUnknown.body) === JSON.stringify(forgotReal.body),
    { unknown: forgotUnknown.body, real: forgotReal.body },
  );

  const mail = await lastMailTo(ownerEmail, 'portal.password_reset');

  if (mail === null) {
    console.log('  … a real mail provider is configured; outbox checks skipped');
  } else {
    requireOrAbort('a reset email was produced', !!mail, mail);
    check('the reset mail names the venue', mail.text?.includes(RUN), mail.subject);
    check(
      'the reset mail does NOT leak the password',
      !mail.text?.includes(PASSWORD),
      mail.subject,
    );

    const resetToken = tokenFrom(mail.text, 'reset');
    requireOrAbort('the mail carries a reset token', !!resetToken, mail.text?.slice(0, 200));

    // A session that exists BEFORE the reset, to prove it gets evicted.
    const preSession = await call('/api/portal/v1/auth/login', {
      method: 'POST', body: { email: ownerEmail, password: PASSWORD, source_id: venueId },
    });
    const staleToken = unwrap(preSession.body)?.session_token;
    requireOrAbort('a second session exists pre-reset', !!staleToken, preSession.body);

    const tooShort = await call('/api/portal/v1/auth/reset', {
      method: 'POST', body: { reset_token: resetToken, password: 'short' },
    });
    check('reset rejects a short password', tooShort.status === 400, tooShort.status);

    const reset = await call('/api/portal/v1/auth/reset', {
      method: 'POST', body: { reset_token: resetToken, password: NEW_PASSWORD },
    });
    check('reset succeeds', reset.status === 200, reset.body);
    check('reset returns a session', !!unwrap(reset.body)?.session_token, reset.body);

    // The security property: a reset is what you do when you think you
    // are compromised, so the attacker's session must not survive it.
    check(
      'reset revoked the pre-existing session',
      (unwrap(reset.body)?.sessions_revoked ?? 0) >= 1,
      reset.body,
    );
    const staleCheck = await call('/api/portal/v1/me', { headers: bearer(staleToken) });
    check('the old session token is now dead', staleCheck.status === 401, staleCheck.status);

    const replay = await call('/api/portal/v1/auth/reset', {
      method: 'POST', body: { reset_token: resetToken, password: `Replay-${RUN}!` },
    });
    check('the reset token cannot be replayed', replay.status === 401, replay.status);

    const oldPw = await call('/api/portal/v1/auth/login', {
      method: 'POST', body: { email: ownerEmail, password: PASSWORD, source_id: venueId },
    });
    check('the OLD password no longer works', oldPw.status === 401, oldPw.status);

    const newPw = await call('/api/portal/v1/auth/login', {
      method: 'POST', body: { email: ownerEmail, password: NEW_PASSWORD, source_id: venueId },
    });
    check('the NEW password works', newPw.status === 200, newPw.status);

    // Suspended staff must not reset their way back in.
    const suspendee = `suspended+${RUN}@slice3.test`;
    const sInvite = await call(`/api/sources/${venueId}/staff`, {
      method: 'POST', headers: admin(), body: { email: suspendee, role: 'viewer' },
    });
    const sToken = unwrap(sInvite.body)?.invite_token;
    if (sToken) {
      await call('/api/portal/v1/auth/accept', {
        method: 'POST', body: { invite_token: sToken, password: PASSWORD },
      });
      const staffList = unwrap(
        (await call('/api/portal/v1/staff', { headers: bearer(unwrap(newPw.body).session_token) })).body,
      );
      const row = (staffList ?? []).find((s: any) => s.email === suspendee);
      if (row) {
        await call(`/api/portal/v1/staff/${row.staff_id}`, {
          method: 'PATCH',
          headers: bearer(unwrap(newPw.body).session_token),
          body: { status: 'suspended' },
        });
        await call('/api/portal/v1/auth/forgot', {
          method: 'POST', body: { email: suspendee },
        });
        const suspendedMail = await lastMailTo(suspendee, 'portal.password_reset');
        check(
          'a SUSPENDED member gets no reset mail',
          !suspendedMail,
          suspendedMail?.subject,
        );
      }
    }
  }

  // ── 4. Invite delivery ──────────────────────────────────────
  console.log('\n4. Invite delivery — the other half of the seam');

  const colleague = `colleague+${RUN}@slice3.test`;
  const ownerNow = await call('/api/portal/v1/auth/login', {
    method: 'POST',
    body: {
      email: ownerEmail,
      // Whichever password is current depends on whether section 3 ran.
      password: mail === null ? PASSWORD : NEW_PASSWORD,
      source_id: venueId,
    },
  });
  const activeOwner = unwrap(ownerNow.body)?.session_token;
  requireOrAbort('owner can sign in for the invite test', !!activeOwner, ownerNow.body);

  const colleagueInvite = await call('/api/portal/v1/staff/invite', {
    method: 'POST', headers: bearer(activeOwner),
    body: { email: colleague, role: 'operator' },
  });
  check('invite created', colleagueInvite.status === 201 || colleagueInvite.status === 200,
    colleagueInvite.status);
  check(
    'the invite token is still returned (hand-carry fallback survives)',
    !!unwrap(colleagueInvite.body)?.invite_token,
    colleagueInvite.body,
  );
  check(
    'the response says whether mail actually went',
    typeof unwrap(colleagueInvite.body)?.invite_emailed === 'boolean',
    colleagueInvite.body,
  );

  const inviteMail = await lastMailTo(colleague, 'portal.staff_invite');
  if (inviteMail === null) {
    console.log('  … a real mail provider is configured; outbox checks skipped');
  } else {
    requireOrAbort('an invite email was produced', !!inviteMail, inviteMail);

    // The bug this catches: an emailed link whose fragment the portal
    // page does not listen for. It sends perfectly and goes nowhere.
    const t = tokenFrom(inviteMail.text, 'accept');
    check('the invite link uses the #accept= fragment venue.html handles', !!t,
      inviteMail.text?.slice(0, 200));
    check(
      'the emailed token matches the returned one',
      t === unwrap(colleagueInvite.body)?.invite_token,
      { emailed: t?.slice(0, 12), returned: unwrap(colleagueInvite.body)?.invite_token?.slice(0, 12) },
    );

    // And it must actually work end to end.
    if (t) {
      const acceptedByMail = await call('/api/portal/v1/auth/accept', {
        method: 'POST', body: { invite_token: t, password: `Colleague-${RUN}!` },
      });
      check('the emailed invite activates the account',
        acceptedByMail.status === 200, acceptedByMail.body);
    }
  }

  // ── 5. Re-inviting a stale invite ───────────────────────────
  console.log('\n5. A never-accepted invite must be recoverable');

  // Found in production: heroes-demo-venue's founding owner sat 'invited'
  // forever. Reset does not apply (no password yet) and a second invite
  // used to 409, so the only way back was a Heroes engineer with database
  // access — the exact dependency this phase removes.
  const stale = `stale+${RUN}@slice3.test`;
  const first = await call(`/api/sources/${venueId}/staff`, {
    method: 'POST', headers: admin(), body: { email: stale, role: 'manager' },
  });
  const firstToken = unwrap(first.body)?.invite_token;
  requireOrAbort('an invite was issued', !!firstToken, first.body);

  const second = await call(`/api/sources/${venueId}/staff`, {
    method: 'POST', headers: admin(), body: { email: stale, role: 'manager' },
  });
  const secondToken = unwrap(second.body)?.invite_token;
  check('re-inviting an UNACCEPTED invite succeeds',
    second.status === 200 || second.status === 201, second.body);
  check('it reports itself as a reissue', unwrap(second.body)?.reissued === true, second.body);
  check('and mints a DIFFERENT token', !!secondToken && secondToken !== firstToken,
    { same: secondToken === firstToken });

  // Burning the old link is the security property that makes reissue safe.
  const replayOld = await call('/api/portal/v1/auth/accept', {
    method: 'POST', body: { invite_token: firstToken, password: `Stale-${RUN}!` },
  });
  check('the PREVIOUS invite token is dead', replayOld.status === 401, replayOld.status);

  const acceptNew = await call('/api/portal/v1/auth/accept', {
    method: 'POST', body: { invite_token: secondToken, password: `Stale-${RUN}!` },
  });
  check('the reissued token activates the account', acceptNew.status === 200, acceptNew.body);

  // Now ACTIVE — re-inviting must go back to being a conflict, or this
  // would be a way to mint a credential for someone else's live account.
  const thirdOnActive = await call(`/api/sources/${venueId}/staff`, {
    method: 'POST', headers: admin(), body: { email: stale, role: 'manager' },
  });
  check('re-inviting an ACTIVE account is still refused',
    thirdOnActive.status === 409, thirdOnActive.status);

  // ── 6. The printed QR must be SCANNABLE ─────────────────────
  console.log('\n6. The venue QR encodes a URL a phone can actually read');

  const qr = unwrap(
    (await call('/api/portal/v1/qr/venue', { headers: bearer(activeOwner) })).body,
  );
  requireOrAbort('QR payload responds', !!qr?.scan_url, qr);

  // The regression this exists to prevent: the QR used to encode
  // `heroescodex://venue/<id>` and a generic phone QR reader answered
  // "no usable data found". Scanners only act on a whitelist; a custom
  // scheme is an opaque string to them. Device testing missed it because
  // `am start -a VIEW -d <url>` never involves the scanner.
  check('scan_url is an http(s) URL, NOT a custom scheme',
    /^https?:\/\//.test(qr.scan_url ?? ''), qr.scan_url);
  check('and it is NOT the heroescodex:// scheme',
    !String(qr.scan_url).startsWith('heroescodex:'), qr.scan_url);
  check('the QR image encodes the scan_url, not the deep link',
    typeof qr.qr_svg === 'string' && qr.qr_svg.length > 0 &&
    !qr.qr_svg.includes('heroescodex:'), (qr.qr_svg ?? '').slice(0, 80));
  check('the deep link is still reported for diagnostics',
    String(qr.deep_link ?? '').startsWith('heroescodex://venue/'), qr.deep_link);

  // The landing page must work for a stranger with no app and no session.
  const landing = await call(`/v/${venueId}`);
  check('the scan target is reachable unauthenticated', landing.status === 200,
    landing.status);

  const landingHtml = await (await fetch(`${API}/v/${venueId}`)).text();
  check('it names the venue (so the page does not look like phishing)',
    landingHtml.includes(RUN), landingHtml.slice(0, 200));
  check('and it still carries the deep link for someone who has it',
    landingHtml.includes(`heroescodex://venue/${venueId}`), 'deep link missing');

  // Android Chrome refuses a bare custom scheme even on a tap, which is
  // why the button did nothing on a real phone. intent:// names the
  // package so the OS resolves it without the browser trusting a scheme.
  check('the page swaps in an intent:// URL for Android',
    /intent:\/\/[^#]*#Intent;scheme=heroescodex;package=com\.heroesveritas\.codex;/
      .test(landingHtml), 'intent url missing or malformed');
  check('iOS keeps the plain scheme (there is no intent:// there)',
    landingHtml.includes(`href="heroescodex://venue/${venueId}"`), 'plain scheme href missing');

  // A fabricated store id can resolve to a STRANGER'S app. The first
  // version of this page shipped an invented App Store id; a link you
  // know is dead is worse than none, because it tells the guest the
  // problem is theirs.
  check('no invented App Store id is shipped',
    !/id0{6,}/.test(landingHtml), 'placeholder store id present');
  // "link invalid" was what a real phone showed: an intent with no
  // fallback dead-ends when the app is absent, or when a QR app's
  // in-app browser will not follow one. A dead end at this exact moment
  // is a walk-in guest lost.
  check('the intent carries a browser fallback',
    /S\.browser_fallback_url=/.test(landingHtml), 'no fallback on the intent');
  check('and the fallback points at /get',
    /S\.browser_fallback_url=[^;]*%2Fget/.test(landingHtml), 'fallback is not /get');
  check('the page always offers a route for someone without the app',
    landingHtml.includes('href="/get"'), 'no GET THE APP link');

  const getPage = await fetch(`${API}/get`);
  const getHtml = await getPage.text();
  check('/get is reachable unauthenticated', getPage.status === 200, getPage.status);
  check('/get ships no invented store id', !/id0{6,}/.test(getHtml), 'placeholder id');
  const getHasStores = /play\.google\.com|apps\.apple\.com/.test(getHtml);
  check(
    getHasStores
      ? '/get links the configured stores'
      : '/get states the closed-testing situation instead of linking nowhere',
    getHasStores || /closed testing/i.test(getHtml),
    getHtml.slice(0, 200),
  );
  // The public codexpwa page still says "now an iOS application", written
  // before the Android alpha existed. A page that misdescribes which
  // platforms work makes the guest think the problem is their phone.
  check('/get does not claim to be iOS-only',
    !/now an iOS application/i.test(getHtml), 'stale iOS-only copy');

  const unknownVenue = await (await fetch(`${API}/v/definitely-not-a-venue`)).text();
  check('an unknown code says so rather than pretending',
    /not found/i.test(unknownVenue), unknownVenue.slice(0, 160));

  // ── Deep-link domain association ────────────────────────────
  // These files are what let a scan open the app directly. Apple and
  // Google fetch them by exact name; a wrong content-type or a redirect
  // silently breaks verification with no error anyone sees.
  const aasaRes = await fetch(`${API}/.well-known/apple-app-site-association`);
  check('AASA serves 200 at the extensionless path', aasaRes.status === 200, aasaRes.status);
  check('AASA is application/json',
    (aasaRes.headers.get('content-type') || '').includes('application/json'),
    aasaRes.headers.get('content-type'));
  const aasa = await aasaRes.json().catch(() => null);
  check('AASA names the real Apple app id',
    aasa?.applinks?.details?.[0]?.appID === '936L85M7CN.com.heroesveritas.codex',
    aasa?.applinks?.details?.[0]?.appID);
  checkAll('AASA scopes only /v/ and /t/',
    aasa?.applinks?.details?.[0]?.paths,
    (p: string) => p.startsWith('/v/') || p.startsWith('/t/'),
    aasa?.applinks?.details?.[0]?.paths);

  // assetlinks.json is env-gated: absent (404) is correct until the real
  // release fingerprint is set, and NEVER a file naming no valid signer.
  const alRes = await fetch(`${API}/.well-known/assetlinks.json`);
  if (alRes.status === 200) {
    const al = await alRes.json().catch(() => null);
    check('assetlinks names the real package',
      al?.[0]?.target?.package_name === 'com.heroesveritas.codex', al?.[0]?.target);
    check('and carries at least one fingerprint',
      (al?.[0]?.target?.sha256_cert_fingerprints ?? []).length > 0, al?.[0]?.target);
    check('with no obviously-placeholder fingerprint',
      !JSON.stringify(al).includes('AB:CD:EF'), 'placeholder fingerprint shipped');
  } else {
    check('assetlinks 404s honestly when the fingerprint is unset',
      alRes.status === 404, alRes.status);
  }

  // A claim token is a bearer credential printed on a receipt that may
  // be dropped. The page must not confirm whether one is real.
  const testament = await (await fetch(`${API}/t/not-a-real-token`)).text();
  check('the testament page reveals NOTHING about token validity',
    !/invalid|expired|not found|already used/i.test(testament),
    testament.slice(0, 200));

  // The outbox must be shut to anyone without the platform key.
  const unguarded = await call('/api/portal/v1/_mail/outbox');
  check('the mail outbox refuses an unauthenticated caller',
    unguarded.status === 403 || unguarded.status === 401 || unguarded.status === 503,
    unguarded.status);

  // ── Cleanup ─────────────────────────────────────────────────
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
