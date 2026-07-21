# Tier C — spatial workstreams, integrated into the Phase 2 plan

Received 2026-07-21: an 11-workstream XR specification (anchor providers,
room calibration, manifests, asset standards, interaction contracts, test
harness, quality metrics, confidence states, multiplayer prep) plus a six
sprint-group sequence and a first developer backlog.

This document places that specification against what actually exists, and
says plainly what can start now and what cannot.

---

## 1. The blunt version

**The specification is sound.** It is correctly sequenced, it starts with
measurement rather than content, and it refuses the usual traps by name
(GPS indoors, markerless multiroom, cloud anchors as sole recovery). The
Mode A / Mode B split — fiducial-assisted local anchoring for the first
venue, native persistent anchoring evaluated alongside it — is the right
call for a pilot, because it keeps the commercial deployment off a
critical dependency on someone else's cloud.

**Roughly 85% of it cannot be started.** Two hard blockers, neither
technical:

| Blocker | Status |
|---|---|
| ~~**Tier C has no owner**~~ | **RESOLVED 2026-07-21: partnered out to a design firm.** This changes the priority order — see §6. |
| **There is no Unity repository** | The tri-repo is `codexpwa` (web), `pik-prd` (NestJS), `heroes-veritas-native` (React Native/Expo). Every C# interface in the spec has nowhere to live. |

A third, softer blocker matters for Sprint Group 5: **"Echoes of Kingvale"
is a reward bundle, not an experience.** It has no objectives, dialogue,
or encounter logic. Sprint Group 5 assumes a Hero Echo sequence, Fate Fox
guidance, an Artifact interaction and a Veil Tear event — that is content
design, and it has no owner either.

**Therefore the plan below does not schedule Tier C.** It does the one
thing that is genuinely available: build the backend contracts now, so an
XR team hired in three months integrates against a live, versioned,
already-exercised API instead of designing one from scratch. This is the
strategy already agreed for Phase 2 — *keep the Tier A/B contracts stable
enough for an external XR team to build against* — and this spec is
finally concrete enough to do it against.

---

## 2. Already shipped

Worth stating before planning anything, because the spec's own sequence
ends on work that is done:

| Spec item | Where it lives |
|---|---|
| Sprint Group 5 — "Player check-in" | `/api/venues/:id/check-in`, shipped, device-verified, covered by `verify-slice3` |
| Sprint Group 5 — "Codex reward synchronization" | Slice 1 outcome-weighted payouts + reward reversal, in production |
| Sprint Group 5 — "Completion event" | `POST /api/partner/v1/runs/:runId/complete` |
| Workstream 11 — server authority over phase/state/rewards/completion | `ExperienceRun` is already the authoritative record; partners report, they do not decide |
| Workstream 3 — operator identity and audit | `VenueStaff` RBAC (`owner`/`manager`/`operator`/`viewer`) + `VenueAuditEntry` |
| An XR asset-delivery seam | `/api/relic-marks/*` — platform-negotiated USDZ/GLB with fallbacks, built Sprint 31 |

**Sprint Group 5's first and last items are already in production.** What
is missing from that group is exclusively the middle: the spatial runtime
and the content.

---

## 3. What pik-prd can own now

These are backend workstreams wearing XR clothing. None of them need a
headset, a Unity licence, or an XR engineer.

### 3.1 RoomConfig is a Partner Portal object

Workstream 3 Step 8 describes an immutable, versioned, operator-published
configuration record. That is precisely the shape the portal already has:
staff identity, a role matrix, an audit ledger, and per-venue scoping.

The spec's `RoomConfig` maps onto our existing model with almost no
friction — `venueId` is `Source.id`, `publishedBy` is `VenueStaff.id`, and
publication is an audit entry. **Calibration is a staff action**, and
`operator` is already a role.

New permission required: `rooms.calibrate` (operator and above). New
tables: `VenueRoom`, `RoomConfig`, `AnchorRecord`, `ContentPlacement`,
`SpatialZone`, `DeviceCapabilityProfile` — all additive, all per-venue,
all versioned.

**Why now rather than with the XR client:** an immutable versioned config
with rollback is a schema problem, and getting it wrong later means
migrating live venue calibrations. Getting it right costs a sprint now.

### 3.2 The room manifest belongs on `Experience`

Workstream 4 states the separation exactly right:

> The experience package describes what it needs. The room configuration
> describes how that experience fits into a specific venue.

That is the *same* separation Slice 1 already encodes: `Experience` is
Heroes-authored and canonical, `VenueExperience` is the per-venue
assignment. The manifest is a new column on `Experience`, validated
against a published schema — and `Experience.rewards` already establishes
the precedent that this kind of descriptor is **data, not code**, so
revising a manifest is a DB edit rather than a deploy.

⚠ **The manifest needs a `manifestSchemaVersion` field.** The example has
`experienceVersion` but nothing versioning the *schema itself*. Since this
is the contract an external XR team builds against, and they will be
building months after we write it, a manifest we cannot evolve without
breaking their client is a trap. Add it before anyone consumes it.

### 3.3 Spatial telemetry has an ingestion path already

Workstream 9's metrics are the strongest part of the specification —
"looks aligned is not an acceptable test result" is exactly the right
instinct, and the initial threshold table gives it teeth.

Every one of those metrics is a measurement reported by a client and
stored against a run. `/api/ingest` exists, is idempotent, and is
scope-guarded; `ExperienceRun` is the natural parent. We can define and
build the metric schema now so the XR client has somewhere to report to on
day one — and so the thresholds are enforced by something other than
someone reading a spreadsheet.

Of the ten thresholds, **one is measurable today with zero XR work**:
*Reward synchronization ≥99.5%*. We should instrument it now, because it
is the only threshold on that table that governs a system already carrying
real players.

### 3.4 Confidence state has a server-side consequence

Workstream 10 is right that the experience must never silently continue
after poor localization. The state machine itself is client-side, but
`LOST` has a backend meaning: a run that ends because the room became
untrustworthy is **not** the same as a player abandoning it, and paying it
out as `abandoned` (0.00) would penalise a player for our tracking
failure.

That is a new run outcome, and it is a commercial decision as much as a
technical one — it needs a payout weight. Raising it now rather than
discovering it during a pilot.

---

## 4. Two real gaps in the spec

Both are in Workstream 2's interface, and both surface only when you read
it against Workstream 10.

**(a) `ISpatialAnchorProvider` cannot report tracking quality.** Workstream
10 requires the runtime to distinguish `READY` / `DEGRADED` / `LOST`, and
to measure drift at 5, 10 and 20 minutes. The interface exposes creation,
resolution, save, delete, and three static capability booleans — nothing
that yields a confidence or quality signal. The state machine has no
source of truth. The interface needs something like a
`TrackingQuality`/`AnchorConfidence` accessor or an event stream, or
Workstream 10 cannot be implemented on top of Workstream 2.

**(b) There is no relocalization method.** Workstream 10's `DEGRADED`
response includes "attempt silent relocalization," but the interface
offers only `ResolveAnchorAsync` by id, which is a cold resolve rather
than a recovery. Worth deciding whether recovery is a distinct operation
or a documented re-resolve.

**(c), minor but operationally real:** there is no way to *enumerate*
anchors, only to delete one by id. ARCore Cloud Anchors are hosted, TTL'd
and billable; without enumeration, orphaned anchors from abandoned
calibrations leak silently and nobody notices until an invoice does. Add a
list operation, or make deletion the calibration workflow's guaranteed
responsibility.

---

## 5. Recommended sequencing

**Do not** open a Unity repo, adopt AR Foundation, or buy hardware until
Tier C has an owner. Standing up an engine nobody is staffed to use
produces a repository that rots and a false sense of progress.

**Do** build the backend contracts, in this order. All of it fits the
existing Slice cadence and is verifiable by the same black-box harness
discipline as Slices 0–3.

| | Slice | Contents | Exit condition |
|---|---|---|---|
| **4** | Spatial data model | `VenueRoom`, `RoomConfig`, `AnchorRecord`, `ContentPlacement`, `SpatialZone`, `DeviceCapabilityProfile`; immutable versioning + rollback; `rooms.calibrate` permission; audit on publish | A room configuration can be published, versioned, rolled back and audited via the API, with `verify-slice4` green |
| **5** | Manifest + validation | Manifest schema (with `manifestSchemaVersion`), `Experience.manifest`, server-side validation, device-profile negotiation | An experience declares its spatial requirements and a malformed manifest is rejected at publish, not at runtime |
| **6** | Spatial telemetry | Metric schema against `ExperienceRun`, ingestion, threshold evaluation, the Workstream 9 table as queryable analytics | Reward-sync ≥99.5% is measured on live data; the other nine thresholds have somewhere to land |
| **7** | Calibration API + portal UI | The operator flow's *server* half (Steps 1, 2 partially, 7 validation rules, 8 publish) and its portal screens | A non-developer can drive calibration state from the portal; only the on-device half is missing |

That leaves Workstreams 2, 5, 6, 7, 8 and the client half of 3 — the
genuine XR engineering — as a clean, well-specified brief for whoever is
hired. Which is a considerably better position than handing them a blank
page, and it is achievable with the team that exists.

**The one thing to decide before any of it:** whether Tier C is being
hired for, partnered out, or deferred. Slices 4–7 are worth building under
"hired" or "partnered." Under "deferred," they are speculative schema for
a client that may never arrive, and the honest move is to build only 3.3
(the telemetry, which pays for itself on the current product) and stop.


---

## 6. Update — Tier C partnered out (2026-07-21)

Tim confirmed Tier C goes to an external design firm. That **inverts the
urgency** of everything above: the contract is no longer speculative
schema for a client that may never arrive, it is a document another
company starts building against shortly. A partner with no contract
invents one, and then we integrate against their assumptions.

So **Slice 4 was built the same day** — see
`docs/hep/spatial-integration-guide.md`, the partner-facing brief.

Shipped: six tables (`VenueRoom`, `RoomConfig`, `AnchorRecord`,
`ContentPlacement`, `SpatialZone`, `DeviceCapabilityProfile`), the
manifest schema with `manifestSchemaVersion`, validated manifest
authoring, the calibration API, the publish gate, immutability and
rollback, seeded tolerances and device tiers, and the runtime resolve.
`verify-slice4` is green at 71 checks. All additive — safe to deploy long
before any XR client exists, which is the point.

**Revised order for what remains:**

1. **Slice 6 (telemetry) next, not Slice 5.** Once the firm has a client
   in a room, drift and localization numbers are the only way to know
   whether any of this works, and the Workstream 9 thresholds are
   guesses until real data moves them. Telemetry also pays for itself
   immediately: reward-sync ≥99.5% is measurable today.
2. **Slice 7 (portal calibration UI)** when the firm's operator flow
   settles — building screens before their client exists would be
   guessing at a workflow they are still designing.
3. **Slice 5 (asset/content-package validation)** last: it constrains
   *their* pipeline, so it should be negotiated rather than imposed.

**Three things to put in front of the firm early**, because they are
cheaper to agree than to retrofit — the tracking-quality signal, the
relocalization operation, and anchor enumeration (all §4 above), plus the
commercial question of what a tracking-lost session pays. All four are
written up as open questions in §6 of the integration guide.
