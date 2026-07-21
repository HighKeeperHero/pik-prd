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

RunParticipant      one seat in a run — identified OR guest
  runId, rootId?, guestLabel?, sessionId?, role?,
  rewards Json, rewardState: applied | pending | expired,
  joinedAt
  @@unique([runId, rootId])               ← partial; guests have null rootId

GuestClaim          unclaimed rewards waiting for an account
  id, participantId, tokenHash, sourceId,
  status: pending | claimed | expired,
  expiresAt, claimedAt, claimedByRootId
  @@unique([tokenHash])
```

`RunParticipant.rootId` is **nullable** — that is the entire concession the
model makes for walk-ins, and it is what lets all three arrival paths share one
mechanism (see below).

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
| *(new)* Guest claim redemption | `POST /api/claims/:token` | **player-facing, not partner** — called by the Codex app, account-authed |

`/api/claims/:token` deliberately sits outside `/api/partner` — it is called by
the player's app, not by the venue, and must not require a venue key.

Deferred to Slice 2: Device Registration, Analytics Upload, Reward Request as a
standalone endpoint (Slice 1 grants rewards on completion).

### Scopes

Three new values in the Slice 0 scope vocabulary: `runs` (start/complete/fail),
`rewards` (grant on completion), and `guests` (issue claim tokens for
unidentified seats). A venue licensed to run experiences but not to grant
rewards is a real configuration — it is how a pilot or demo venue should be
provisioned. `guests` is separable because a venue that does not want to handle
claim QR codes simply is not granted it.

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

#Reward magnitude is configuration rather than code — see Decisions §3.

## Deliverable: the fake venue

`scripts/fake-venue.ts` — a scripted client that drives a full Echoes of
Kingvale run for a 3-hero party against staging, then prints what each hero
gained. `verify-slice0.ts` is already two-thirds of this.

This *is* the demo. It runs on a laptop, needs no headset, and shows a partner
exactly what integrating looks like. It doubles as the integration test and as
the reference implementation handed to a venue's engineers.

## Definition of done

1. A scripted party completes a run on staging; identified heroes see XP,
   a cache, and a title in the Codex app.
2. Replaying complete with the same `partner_run_key` grants nothing further.
3. A failed run records the failure, grants nothing, and appears in run history.
4. The same hero completing runs at two different sources demonstrates
   cross-venue continuation on one identity.
5. A venue without the `rewards` scope can start and complete runs but grants
   nothing.
6. **A guest seat produces a claim token; redeeming it on a fresh account lands
   the held rewards on that hero. Redeeming twice pays once. An expired token
   pays nothing.**
7. Retuning `Experience.rewards` changes what a run pays **without a deploy.**
8. `verify-slice1.ts` green against staging.

## Explicitly out of scope

XR/spatial anything, device management, room mapping, the Portal UI, the
analytics dashboard UI, matchmaking beyond a supplied roster, partner-authored
content, and offline/degraded-network run reconciliation.

## Decisions (Tim, 2026-07-20)

### 1. Additive only — never rewire Codex

No component of Slice 1 modifies existing Codex behavior. Concretely:

- `RewardService` is **new code called by new endpoints only.** The four
  remaining `fateXp: { increment }` bypasses (`quest.service`, `hunt-tracker`,
  `loot.service`, `demo.service`) are *not* migrated in this slice, despite
  being a natural target. They are a separate, opt-in cleanup.
- No changes to quest evaluation, loot tables, the Sanctum, or the XP curve.
- New tables only; no columns dropped or retyped on existing ones.

The venue layer is a *source of events* into Codex, exactly as `/api/ingest`
already is. Codex does not learn that venues exist.

### 2. All three arrival paths — and they collapse into one mechanism

Codex will be in the app stores by launch, so a venue will see existing players,
walk-ins, and people willing to sign up at the door. All three are supported —
but they are **not three features**:

> **Guest participation with a claim link is the primitive.
> On-site enrollment is that primitive, claimed immediately.**

| Arrival | Mechanism |
|---|---|
| Existing Codex player | `RunParticipant.rootId` set; rewards applied at completion |
| Walk-in guest | `rootId` null; rewards held `pending`; claim link issued |
| On-site enrollment | guest seat + staff-assisted account creation + immediate claim |

One code path, one set of tests, one thing to get right. A kiosk is a UX around
the claim endpoint, not a separate integration.

**Claim flow**

1. Run completes. Identified participants are paid immediately; guest seats have
   their computed bundle stored with `rewardState: pending`.
2. A single-use claim token is generated per guest seat. Stored **hashed**
   (same pattern as API keys and account sessions — never at rest in plaintext),
   handed to the venue once for printing as a QR or short code.
3. Guest installs Codex, creates an account, opens the claim link.
4. `POST /api/claims/:token` binds the pending bundle to their new hero and
   applies it through `RewardService`.

Constraints: tokens are single-use, expire (**30 days** proposed), are rate
limited, and a claim is idempotent on the token. An expired token transitions to
`expired` and pays nothing.

**This produces the single best metric in the partner pitch:** claims ÷ guest
seats is a literal walk-in→player conversion rate, per venue. That is direct
evidence for the brief's business-validation criterion — *"measurable increases
in player engagement or repeat visitation attributable to Heroes integration"* —
and no other feature in Phase 2 produces it.

**Codex app work (native, additive):** a claim entry point — deep link plus a
manual code field. New screen, no changes to existing ones. Tracked separately
from this backend slice.

### 3. Rewards: build the dial, not the number

Tim: *"track best practices as it relates to in-game progression logic. We will
more than likely have to calibrate once live anyway."*

So the reward value is **configuration, not code**:

- The bundle lives in `Experience.rewards` (JSON, DB row) — tunable without a
  deploy, per experience, per version.
- A `venue.reward_multiplier` runtime `Config` key allows global calibration,
  and per-venue promotional tuning later.
- Changes are logged to `IdentityEvent`, so a retune is auditable against the
  progression it produced.

Starting anchor (**a starting point, expected to move**): ~500–800 Fate XP for a
completed run — roughly half a day's committed income (~1,000 XP/day per
`leveling.service.ts`) for ~20 minutes of play. Best-practice grounding: a
destination activity should feel like a meaningful fraction of a day's
progression without letting it be farmed past the calendar the curve encodes.

The engineering commitment is that **no recalibration requires a code change.**

## Still open

1. **Do venue runs advance daily/weekly quests?** Yes pulls app players into
   venues; no keeps the economies separate. Not blocking — runs can grant
   rewards without touching quest progress, and this can be switched on later.
2. **Failure semantics.** Partial credit when a party fails at the boss? Real
   venues will care, because guests who paid and lost will complain. Recommend
   a reduced "attempt" bundle rather than nothing.
