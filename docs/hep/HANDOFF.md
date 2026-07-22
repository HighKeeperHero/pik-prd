# HEP Phase 2 — session handoff (2026-07-21)

State of play at the end of a long build session, so the next one starts
from here instead of rediscovering it.

## Shipped and verified

Slices 0–2 are **in production**, each verified by its own black-box harness
against staging before promotion.

| | |
|---|---|
| **Slice 0** hardening | unguarded `impersonate` (session token for ANY hero) closed; scopes enforced; ingest idempotency; partner XP moved onto the canonical curve |
| **Slice 1** experience runs | `ExperienceRun`/`RunParticipant`/`GuestClaim`; outcome-weighted payouts (victory `1.00 + 0.05/milestone` cap `+0.20`, timeout `0.50`, abandoned `0.00`); guest testaments with short claim codes |
| **Slice 2** partner portal | `VenueStaff` + owner/manager/operator/viewer RBAC; `/api/portal/v1/*`; analytics incl. walk-in conversion; static UI at `/venue.html` |
| Venue check-in | `/api/venues/:id/check-in` — closed the gap where an existing Codex player could not join a run at all |
| Consent withdrawal | "Who Witnesses You" in app Settings |
| Circuit breakers | stale-run sweeper, claim expiry sweeper, per-venue 24h XP ceiling, reward reversal |

Harnesses: `verify-slice0/1/2.ts` (assert), `fake-venue.ts` (the partner demo,
prints), `provision-venue.ts` (one-command onboarding).

## Verified end to end, on a real device

Both arrival paths work, and QR deep links were confirmed on the
production-signed 1.4.0 binary by firing `am start` **without** a package hint,
so Android resolved the scheme itself — exactly what a scanner does.

```
venue prints QR → player scans → consent screen → seated in a run → rewards in Codex
guest seat      → claim code   → Testament rite → new hero, level 1 → 6
```

## Live right now

- **production** — Slices 0–2 + check-in + breakers; config keys seeded;
  `heroes-demo-venue` ("Heroes Demo Venue") provisioned, **no `rewards` scope**
  so it cannot mint
- **staging** — same, plus `kingvale-demo`; portal owner
  `owner@kingvale.test` / `KingvalePortal2026`
- **native** `sprint-28-foundation` — Testament, Threshold, Witnesses screens;
  version 1.4.0 (versionCode 18); alpha build was running at session end

## Session 2 (2026-07-21 afternoon) — done

Branch `hep/mail-seam-and-slice3`, **not pushed**. Three commits.

1. **Mail seam built** — `MailService` (provider-agnostic, Resend over plain
   `fetch`, no SDK dependency), `/auth/forgot` + `/auth/reset`, invite emails,
   forgot-password UI in `venue.html`. **Still needs `RESEND_API_KEY` in
   Railway** to actually deliver; until then it runs a `log` transport that
   writes links to the server log. Every downstream path is identical either
   way, so nothing is untested waiting on the key.
2. **`verify-slice3` — 46 checks, all green** against a local server + dev DB.
3. **Found and fixed a live production bug** — see below.
4. Alpha build 1.4.0 (versionCode 19) **finished** 2:02 PM.
5. `heroes-demo-venue` production key **rotated**; new key at
   `~/heroes-demo-venue-apikey.txt` (mode 600, deliberately never printed to a
   transcript — that is how the last one leaked). Verified: new key 200,
   bogus 403. Scopes still `guests runs titles xp`, no `rewards`.

### ⚠ The first-party withdraw guard was OFF in production

`ConsentService` refuses withdrawal only when `sourceType === 'first_party'`.
In production that source was typed `'venue'`, so **the guard never fired**:
Heroes' Codex appeared in "Who Witnesses You" as withdrawable with a working
WITHDRAW button. Every hero is FK-linked to it, so a player who pressed it
severed themselves from their own game.

Cause: the seeding migration is idempotent about the ROW but silent about its
COLUMNS — `INSERT ... ON CONFLICT (source_id) DO NOTHING`. Any environment
where the row already existed kept `source_type='venue'`. Measured: staging
`first_party`, production `venue` with 3 live links. Wrong since 2026-07-13.

**The lesson worth keeping: verifying against staging cannot catch a data
defect that only exists where history exists.** Staging was green the whole
time. Fixed by `20260721190000_fix_first_party_source_type` (an UPDATE).

## Next, in order

1. ~~Push~~ — **DONE. `main` and the `production` branch are both at
   `20c497e`; production deployed 22:20 UTC and the consent fix is verified
   live** (`src-heroes-veritas-01` is now `first_party`, 3 links intact).

   ⚠ **Deploy topology, corrected — this cost time today.** `main` → Staging
   ONLY. Production deploys from a branch literally named `production`.
   Pushing `main` is safe and does NOT reach players; production shows no
   deploy activity at all until you promote:

   ```bash
   git checkout production && git merge --ff-only main && git push origin production
   git checkout main
   ```

   Before today production had been sitting 14 commits behind, so the Partner
   Portal UI (`/venue.html`) and reward reversal had never actually shipped
   despite this document claiming they were live. Both are live now. **Check
   the running service, not this file, when it matters.**
2. **Put `RESEND_API_KEY` in Railway** (+ optional `MAIL_FROM`,
   `PORTAL_BASE_URL`). Until then mail is `log`-transport only and no venue
   owner can actually receive a reset. Verify the sending domain first.
3. ~~Re-run `verify-slice3` against staging after deploy~~ — **done, 46/46
   green against the live staging deployment.** Note staging passes the
   first-party section either way (its row was already correct); production
   is the only place that fix can be proven.
4. Confirm testers can scan both QR flows on alpha build 19.
5. ~~Decide Tier C~~ — **DECIDED 2026-07-21: partnered out to a design
   firm.** Slice 4 (the spatial contract) was built the same day in
   consequence: six tables, manifest schema + validated authoring,
   calibration API, publish gate, immutability + rollback, seeded
   tolerances and device tiers, runtime resolve. `verify-slice4` green at
   71 checks locally. Purely additive.
   - **Send the firm `docs/hep/spatial-integration-guide.md`.** Its §6
     lists four things to agree EARLY because they are cheaper than a
     retrofit: the tracking-quality signal, the relocalization operation,
     anchor enumeration, and what a tracking-lost session pays.
   - Revised order for the rest: **telemetry (Slice 6) next, not the
     manifest tooling** — once their client is in a room, drift numbers
     are the only way to know any of this works, and the Workstream 9
     thresholds are guesses until real data moves them.
6. ~~Run `verify-slice4` against staging~~ — **done, 71/71 green.**
   `verify-slice3` is 53/53 green on staging too.
7. **Slice 6 (spatial telemetry) is built** — `SpatialMetric`,
   `POST /api/partner/v1/telemetry`, and
   `GET /api/portal/v1/spatial/metrics` evaluating the Workstream 9
   table. `verify-slice6` 30/30 green locally; needs a staging run after
   deploy. Contract documented for the firm in
   `spatial-integration-guide.md` §3b.
8. **Reward sync is now DERIVED** from the run ledger (eligible = seats
   with a rootId in applied|pending|expired; delivered = applied).
   Needs no XR client, and is the one W9 threshold already governing
   real players. `skipped`/`reversed`/unclaimed-guest seats are excluded
   — see the commit for why counting them lies in both directions.
9. **Still open with the design firm** (guide §6): the tracking-quality
   signal, a relocalization operation, anchor enumeration, and the
   commercial question of what a tracking-lost session pays.
10. `heroes-demo-venue`'s owner invite can now be reissued — the account
   had been stranded in `invited` with no way in.

## Things that will bite, if not remembered

- **The config API refuses to CREATE keys.** Every tunable needs a seed row in
  `seed-experiences.ts` or it is a dial welded shut. This bit twice — the
  payout ceiling looked armed while silently falling back to its code default.
- **`INSERT ... ON CONFLICT DO NOTHING` is idempotent about the row, not its
  columns.** A seed migration written that way will silently skip every
  environment that already had the row — which is every environment with
  players. Use an explicit `UPDATE` when the column value is the point.
- **A guard is not armed until its data says so.** The first-party revoke guard
  was correct code reading a wrong column for eight days. Test the guard
  against real data; do not trust that it fires.
- **`/api/users/:root_id/links` is authenticated** — the harness first called
  it bare and got an error object where it expected an array.
- **`fonts.title` (Marcellus SC) does not resolve on Android.** No shipped
  screen used it, so it had never been exercised. Use `fonts.display` (Cinzel).
- **Production deploys from the `production` BRANCH, not `main`.** No deploy
  is queued or lagging until you merge — "waiting for production" is waiting
  forever. Verify with `railway deployment list --environment production`,
  whose metadata names the branch and commit.
- **`railway run` injects the INTERNAL DB host.** Prisma scripts need
  `sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" …'`.
- **`no_data` is not `pass`.** The Slice 6 rollup counts unmeasured
  thresholds separately for this reason. A quality dashboard that reads
  green because nothing was measured is the worst place to relearn the
  vacuous-pass lesson.
- **Harnesses that pass vacuously.** `[].every()` is `true`; a test that passes
  when nothing happened manufactures confidence. Use `checkAll()` /
  `requireOrAbort()`.
- **Deep links need a native build** — a URL scheme compiles in, so it can
  never ship OTA.
- Local Android builds: see `heroes-veritas-native/docs/local-android-build.md`
  (four undocumented walls, two of them in prebuild-generated files).

## Known gaps in Phase 2 coverage

- **P11 Support Portal — BUILT (Slice 8).** `/api/support/venues[/:id]`
  (platform admin, READ-ONLY) + `/support.html`. `verify-slice8` 33/33
  green locally. Player data is minimised to `root_id` + reward state;
  the harness asserts hero names and player emails appear nowhere.
  ⚠ **The HTML is not visually verified** — needs an eyeball once
  deployed.
- **P12 Certification — scoped, not built.** Both scoped in see `docs/hep/slice-8-9-support-and-certification-scope.md`.
  Decided 2026-07-21: P11 is Heroes-staff-only and read-only (no
  helpdesk — integrate one if ticketing is the need); P12 is a gate with
  an audited override. Slice 8 first, since its aggregation is Slice 9's
  raw material. **One decision still open: how much player data the
  support console shows** (recommendation: rootId + reward state, not
  names or emails).
- **P8 Live Ops** is partial: analytics and audit exist, but there is no
  live operational surface.
- **Tier B** (P3 Heroes Runtime, P4 Experience Studio, P9 Update System)
  is unscoped and unassigned.

## Deliberately NOT built

Tier C — the XR runtime, spatial layer, room mapping, device layer — has **no
owner**. And "Echoes of Kingvale" is a reward bundle, not an experience: no
objectives, dialogue or encounter logic. That is fine for a pilot that
*augments an existing attraction* (the venue runs its own room and calls
`complete`/`fail`, which is the brief's "augment, never replace") and not fine
for anything claiming to *be* a Heroes experience.
