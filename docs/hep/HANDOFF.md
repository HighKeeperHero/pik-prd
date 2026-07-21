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

## Next, in order

1. **Email provider decision — the only real blocker.** No mail infrastructure
   exists at all, so **venue staff have no password reset**: an owner who
   forgets theirs needs a Heroes engineer, which is precisely the per-venue
   custom engineering Phase 2 exists to remove. Reset and staff-invite delivery
   share one seam; build both once a key is in Railway.
2. Confirm the alpha build landed and testers can scan.
3. `verify-slice3` — venue check-in, consent withdrawal and the first-party
   revoke guard are device-verified but have **no automated coverage**, and
   they are the newest code.
4. Rotate `heroes-demo-venue`'s API key (it was pasted into a chat transcript).

## Things that will bite, if not remembered

- **The config API refuses to CREATE keys.** Every tunable needs a seed row in
  `seed-experiences.ts` or it is a dial welded shut. This bit twice — the
  payout ceiling looked armed while silently falling back to its code default.
- **`fonts.title` (Marcellus SC) does not resolve on Android.** No shipped
  screen used it, so it had never been exercised. Use `fonts.display` (Cinzel).
- **`railway run` injects the INTERNAL DB host.** Prisma scripts need
  `sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" …'`.
- **Harnesses that pass vacuously.** `[].every()` is `true`; a test that passes
  when nothing happened manufactures confidence. Use `checkAll()` /
  `requireOrAbort()`.
- **Deep links need a native build** — a URL scheme compiles in, so it can
  never ship OTA.
- Local Android builds: see `heroes-veritas-native/docs/local-android-build.md`
  (four undocumented walls, two of them in prebuild-generated files).

## Deliberately NOT built

Tier C — the XR runtime, spatial layer, room mapping, device layer — has **no
owner**. And "Echoes of Kingvale" is a reward bundle, not an experience: no
objectives, dialogue or encounter logic. That is fine for a pilot that
*augments an existing attraction* (the venue runs its own room and calls
`complete`/`fail`, which is the brief's "augment, never replace") and not fine
for anything claiming to *be* a Heroes experience.
