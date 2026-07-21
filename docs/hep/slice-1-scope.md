# HEP Phase 2 — Slice 1 scope

**Goal:** one venue, one experience, end to end — `check-in → start → complete →
rewards land in Codex` — proven by a scripted fake venue client, with zero XR.

Status: proposed 2026-07-20. Depends on Slice 0 (shipped, verified).

## Why this slice

It is the first artifact that can be shown to a prospective partner, and it
proves the brief's headline player-experience criterion — *"progression
synchronizes seamlessly with the existing Codex application"* and *"rewards
persist across participating venues"* — using software that already exists.

It also forces the Partner Integration API into a real shape **before** an
external XR team builds against it. Tier C has no owner yet; the contract they
will eventually implement against should be settled and stable first. Every week
this stays unspecified is a week the eventual XR contract is guesswork.

## The gap

There is no concept of **an experience run**.

Today: `PlayerSession` models venue *presence* (check-in → heartbeat →
check-out) and `/api/ingest` models *progression events*. Neither models the
thing a partner actually starts, completes, or fails.

Every analytics field the brief asks of the Partner Portal — completion rate,
session duration, technical failures, artifact rewards — is measured against a
run. Without the entity there is nothing to count.

The brief also specifies Echoes of Kingvale as **2–6 players**. A run is
therefore a *party* fact, not a per-player one: the party completes or fails
together, while rewards land per player.

## Data model

Four new tables. All additive.

```
Experience          canonical content catalog (Heroes-authored)
  id, slug, name, version, minPlayers, maxPlayers,
  targetDurationSec, rewards Json, status

VenueExperience     which venues may run which experiences (P1 "Experience Assignment")
  sourceId, experienceId, enabled, availableFrom, availableUntil
  @@unique([sourceId, experienceId])

ExperienceRun       one party's playthrough
  id, sourceId, experienceId, experienceVersion,
  status: active | completed | failed | abandoned,
  startedAt, endedAt, durationSec,
  outcome Json, failureReason
  @@unique([sourceId, partnerRunKey])     ← idempotency

RunParticipant      one player within a run
  runId, rootId, sessionId?, role?,
  rewardsApplied Json, joinedAt
  @@unique([runId, rootId])
```

`PlayerSession` is unchanged and still means venue presence — a player checks in
once and may play several runs before checking out.

`experienceVersion` is copied onto the run at start, so analytics stay
attributable after content is revised (P4/P9 will version experiences).

## API surface

**Namespace and version the partner API from day one: `/api/partner/v1/…`.**

This is deliberate. The existing routes grew organically for the mobile client
and are not a contract anyone external should depend on. A partner-facing
surface needs a stable shape, an explicit version, and the freedom to evolve
independently of the app. Retrofitting a version prefix after a venue has
shipped firmware is expensive; adding it now costs nothing.

| Brief endpoint | Route | Notes |
|---|---|---|
| Venue Authentication | *(existing)* `X-PIK-API-Key` | Slice 0 |
| Player Check-In | `POST /api/partner/v1/check-in` | wraps existing session check-in |
| Experience Start | `POST /api/partner/v1/runs` | body: experience slug, roster of root_ids, `partner_run_key` |
| Experience Complete | `POST /api/partner/v1/runs/:id/complete` | applies rewards, idempotent |
| Experience Failed | `POST /api/partner/v1/runs/:id/fail` | reason; no rewards, still counted |
| Player Lookup | `GET /api/partner/v1/players/:rootId` | consent-gated, minimal projection |
| Venue Status | `GET /api/partner/v1/venue` | own venue only; assigned experiences, active runs |
| Heartbeat | `POST /api/partner/v1/runs/:id/heartbeat` | detects abandoned runs |

Deferred to Slice 2: Device Registration, Analytics Upload, Reward Request as a
standalone endpoint (Slice 1 grants rewards on completion).

### Scopes

Two new values in the Slice 0 scope vocabulary: `runs` (start/complete/fail) and
`rewards` (grant on completion). A venue licensed to run experiences but not to
grant rewards is a real configuration — it is how a pilot or a demo venue should
be provisioned.

## Reward application

**Introduce `RewardService.apply(rootId, bundle, attribution)` — one function
that grants a reward bundle atomically.**

Slice 0 found there is no such thing today: XP goes through `LevelingService`
(mostly), caches are `prisma.fateCache.create` scattered per module, titles are
`userTitle.upsert` in three places, essence is `sanctumState.upsert` in at least
four. `quest-log.claim()` is the closest existing thing but is quest-specific.

Experience completion needs to grant several reward types at once, per player,
transactionally, idempotently. Building that as one service is the correct
shape, and it gives the four remaining `fateXp: { increment }` bypasses a
migration target.

**Canon respected:** XP is granted by *completing the experience* (an action),
not by opening any cache it drops. That is Tim's locked principle — no XP on
cache open — and venue runs must not become a loophole.

### Reward magnitude — needs Tim's number

The committed in-app income is ~1,000 XP/day (see `leveling.service.ts`). A
15–20 minute venue experience should feel like a meaningful chunk of a day
without trivializing the calendar.

**Proposed anchor: 500–800 Fate XP** for a completed run, plus one cache, plus a
first-completion title. That is roughly half a day's committed income for
~20 minutes of play, which reads as "worth the trip" without letting a
season-pass holder outrun the curve. **This number is a placeholder — it is an
economy decision, not an engineering one.**

## Deliverable: the fake venue

`scripts/fake-venue.ts` — a scripted client that drives a full Echoes of
Kingvale run for a 3-hero party against staging, then prints what each hero
gained. `verify-slice0.ts` is already two-thirds of this.

This *is* the demo. It runs on a laptop, needs no headset, and shows a partner
exactly what integrating looks like. It doubles as the integration test and as
the reference implementation handed to a venue's engineers.

## Definition of done

1. A scripted party of 3 heroes completes a run on staging; all three see XP,
   a cache, and a title in the Codex app.
2. Replaying complete with the same `partner_run_key` grants nothing further.
3. A failed run records the failure, grants nothing, and appears in run history.
4. The same hero completing runs at two different sources demonstrates
   cross-venue continuation on one identity.
5. A venue without the `rewards` scope can start and complete runs but grants
   nothing.
6. `verify-slice1.ts` green against staging.

## Explicitly out of scope

XR/spatial anything, device management, room mapping, the Portal UI, the
analytics dashboard UI, matchmaking beyond a supplied roster, partner-authored
content, and offline/degraded-network run reconciliation.

## Open decisions (need Tim)

1. **Walk-ins.** Echoes of Kingvale seats 2–6, but some players will arrive
   without a Codex account. Options: (a) run is Codex-only, everyone installs
   first; (b) guest participants play but earn nothing and are offered a claim
   link afterward; (c) on-site enrollment at a kiosk. This is a **product and
   conversion** decision, not a technical one, and it materially changes the
   partner pitch. It is the single biggest open question in this slice.
2. **Reward magnitude** — the 500–800 XP anchor above.
3. **Do venue runs advance daily/weekly quests?** Yes is more rewarding and
   pulls app players into venues; no keeps the economies clean.
4. **Failure semantics.** If a party fails at the boss, do they get partial
   credit? Real venues will care, because guests who paid and lost will complain.
