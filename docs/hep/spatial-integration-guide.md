# Heroes spatial integration guide

For the Tier C partner building the XR runtime and calibration client.

This describes the server contract: what exists, what you call, and the
conventions the whole system depends on. It is deliberately short —
everything in it is live and testable today, before you have written a
line of client code.

---

## 1. The one convention that matters

**Every pose we store or return is room-local.**

- Origin at the room's **calibrated origin anchor**
- **Metres**
- **Right-handed**, **+Y up**, **−Z forward** — the glTF / OpenXR / ARKit /
  ARCore basis
- Positions are `[x, y, z]`
- Rotations are **euler degrees `[x, y, z]`**, applied **intrinsically in
  the order Y → X → Z** (yaw, then pitch, then roll)

Never device space, never provider space. Two headsets in the same room
disagree about where the world is and agree about where the room is, so
room-local is the only frame in which their state can be compared. Please
do not "helpfully" convert at the boundary — send us room-local, and we
will hand it back to the next device unchanged.

Every resolve response repeats this as `coordinate_space:
"room_local_meters_y_up"` so it is visible without consulting a document.

### Read this bit twice

The handedness and the euler order above are the whole contract, and **the
server cannot enforce either of them.** A pose is three floats to us; we
store and return them untouched. If your client and ours disagree about
what they mean, nothing errors — the room is simply mirrored, or the Fate
Fox faces a wall, and it looks like drift.

Two consequences:

- **Right-handed is not what Unity uses.** Unity is left-handed with +Z
  forward. If you build the calibration client or the runtime in Unity,
  negate Z on the way in and on the way out, in your provider adapter, in
  one place. We chose the provider-side basis deliberately: the engine is
  still an open decision and every spatial provider you will integrate is
  right-handed, so the conversion belongs at the engine boundary rather
  than in our data.
- **Y→X→Z intrinsic is Unity's `eulerAngles` order** (equivalently, extrinsic
  Z-X-Y). That is not a coincidence; given the handedness conversion has to
  happen anyway, the rotation order may as well cost nothing.

> **Divergence from the developer brief.** §4.2 of the Spatial Platform
> Developer Brief specifies `local_rotation {x,y,z,w}` — a quaternion. The
> server stores euler degrees as described above and always has. **This
> document is the contract; the brief is out of date on this point.** If you
> would rather we moved the wire format to quaternions, say so **before you
> write the calibration client**. While no room has been published it is a
> cheap change; once calibrations exist it means migrating measured poses,
> which is the one kind of data nobody can re-derive from a desk.

---

## 2. Two objects, deliberately separate

| | |
|---|---|
| **Manifest** — on the `Experience` | What the experience *needs*: named anchors, zones, clearance, player counts. Heroes-authored, identical at every venue. |
| **RoomConfig** — per venue room | How that fits *here*: measured poses, provider anchor ids, zone placements. Venue-specific, versioned, immutable once published. |

They join on `requiredAnchors[].name` ⟷ `placements[].anchor_name`.

That separation is what lets an experience be deployed to a second venue
without re-authoring, and it is why a placement naming nothing in the
manifest is a warning and a manifest anchor with no placement is a
publish failure.

### There is no `VenuePackage`

§6 of the Spatial Platform Developer Brief describes a single immutable
`VenuePackage` carrying venue, experience, content, assets and rewards
together. **That object does not exist and we do not intend to build it.**
Do not write a loader for it.

The brief is right about the requirement — versioned, immutable, no
hard-coded scenes — and describes it as one blob because that is the
simplest way to say it. But one blob welds the experience to the venue,
and the brief's own repeatability metric ("a second venue deployed through
configuration rather than new application code") is the thing that welding
breaks. So the contract is split at the manifest/RoomConfig seam above, and
your runtime assembles from two calls: the experience's manifest, and the
room's published config.

Where each field in §6 actually lives today:

| §6 field | Where it lives | |
|---|---|---|
| `venue_id` | `Source` (the venue) + `VenueRoom.slug` | ✅ |
| `venue_version` | `RoomConfig.version` | ✅ |
| `experience_id` / `experience_version` | `Experience.slug` / `.version` | ✅ |
| `localization_config` | `RoomConfig.originMode`, `orientationReference`, `supportedDeviceProfiles` | ✅ |
| `anchors[]` | `AnchorRecord` | ✅ |
| `zones[]` | `SpatialZone` | ✅ |
| `reward_definitions[]` | `Experience.rewards` | ✅ |
| `safety_rules[]` | `SpatialZone` kinds `safety` / `clearance`, plus the `spatial.*` tolerances | ✅ |
| `objects[]` | `ContentPlacement` says **where**. Nothing says **what** — no prefab, type, presentation, interaction or state model | ⚠ partial |
| `asset_bundles[]` | `/api/relic-marks/:slug/ar` negotiates USDZ/GLB per platform, but nothing binds a bundle set to a room config | ⚠ partial |
| `required_runtime_version` | nowhere | ❌ |
| `triggers[]` | nowhere | ❌ |
| `encounters[]` | nowhere | ❌ |

The ⚠ and ❌ rows are the brief's §4.3 spatial object model, §4.4 object
library, and the trigger/encounter graph. They are real work and they are
not built. **Do not invent them at your end and hand us the result** — that
is the version we would have to migrate off. Tell us what your runtime
needs to interpret and we will design the schema with you; that is the
cheapest conversation on this page.

Until those exist, an experience is: named anchors, named zones, placements,
and a reward bundle settled server-side. That is enough for the POC in §12
of the brief, and it is deliberately not enough for a second experience —
which is the right time to build the rest.

---

## 3. Endpoints

### Learn the contract (no auth)

```
GET  /api/spatial/manifest-schema
POST /api/spatial/manifest-schema/validate     → { valid, issues[] }
```

`validate` exists so you can check manifests **in your CI from day one** —
before you have a venue, an API key, or anything of ours deployed
alongside you. Please wire it in early; a contract you cannot test against
is one you discover you have broken at integration.

### Calibration client (venue staff token)

```
GET   /api/portal/v1/rooms
POST  /api/portal/v1/rooms                       {slug, name, profile}
POST  /api/portal/v1/rooms/:roomId/drafts        {experience_slug, origin_mode}
PATCH /api/portal/v1/rooms/drafts/:configId      {anchors[], placements[], zones[], …}
GET   /api/portal/v1/rooms/configs/:id/validation → dry run, never mutates
POST  /api/portal/v1/rooms/configs/:id/publish
POST  /api/portal/v1/rooms/:roomId/rollback      {version}
```

Auth is a `VenueStaffSession` bearer token from
`POST /api/portal/v1/auth/login`. Two permissions apply:

- **`rooms.calibrate`** — owner, manager, **operator**. Create rooms, open
  drafts, record anchors, run validation.
- **`rooms.publish`** — owner, manager only. Makes a room live for guests.

Your operator app should expect a calibrating user who **cannot publish**
and design for it: they calibrate, they validate, and a manager signs off.
That is not an edge case, it is the common venue staffing shape.

### Runtime (venue API key)

```
GET  /api/partner/v1/rooms/:roomSlug    header: X-PIK-API-Key
POST /api/partner/v1/telemetry          header: X-PIK-API-Key
```

Read-only by construction. Returns the published config: anchors,
placements, zones, `origin_mode`, `supported_device_profiles`. 404 if the
room has never been published — treat that as "not calibrated", not as an
error to retry.

---

## 3b. Telemetry — please wire this in early

```jsonc
POST /api/partner/v1/telemetry          → 202
{
  "run_id": "…",             // optional
  "room_config_id": "…",     // optional, but see §5 on caching
  "metrics": [
    { "metric": "anchor.translation_error_m", "value": 0.021, "unit": "m",
      "captured_at": "2026-07-21T22:14:00Z", "device_profile": "tier-b-standalone-headset" }
  ]
}
```

Rules that will bite if you skip them:

- **Batches accept partially.** Valid rows are stored, invalid ones come
  back in `issues` with reasons. One bad sample never costs the session.
- **A known metric in the wrong unit is REJECTED.** Report
  `anchor.translation_error_m` in `m`, not `cm` — centimetres judged
  against a metre threshold would pass every time while the room is 20cm
  out. Unknown metrics have no unit constraint.
- **Unknown metric names are accepted and stored.** If you learn
  something we did not think to ask for, just send it; it appears in the
  venue rollup as `unmeasured_metrics`. Tell us and we will give it a
  threshold.
- `captured_at` in the future or before 2026 is rejected — device clocks
  drift and a sample stamped 2049 would sit atop every window forever.

`GET /api/portal/v1/spatial/metrics` (staff token) evaluates the
Workstream 9 table against real samples. Two things to know reading it:
lower-is-better metrics report **p95, not mean** (a mean hides the one
session in twenty that went badly), and a threshold with no samples
reports **`no_data`, never `pass`**.

---

## 4. The publish gate

A draft becomes live only when validation passes. Current rules:

| Fails publish | Why |
|---|---|
| No origin anchor | The room has no coordinate space |
| More than one origin anchor | Ambiguous |
| `origin_mode: 'fiducial'` with no `marker_id` | Operators would have no recovery target, which is the entire advantage of fiducial mode |
| Fewer than 2 verification points | Configurable: `spatial.min_verification_points` |
| Verification points that reported **no measurement** | A validation that passes because nothing was measured manufactures confidence |
| No `player_start` zone | The runtime would have to invent a start position |
| A manifest content anchor with no placement | Content the runtime will look for and not find |
| An invalid manifest on the bound experience | Fix the manifest before calibrating |

Warnings do not block: a placement matching no manifest anchor, a draft
not bound to an experience, a manifest/experience version mismatch.

Tolerances live in runtime config (`spatial.max_translation_error_m`,
`spatial.max_rotation_error_deg`, `spatial.max_floor_height_error_m`,
`spatial.min_verification_points`) and are tunable **without a deploy** —
they are explicitly initial targets and we expect to move them once you
have real drift data.

---

## 5. Immutability

A published `RoomConfig` is never edited. Recalibration opens version+1;
rollback repoints the room at an earlier published version. The superseded
config stays readable.

This is not fastidiousness. Spatial telemetry is measured against the
config that was live when a session ran, and an editable config would
silently make historical drift figures refer to an origin that no longer
existed when they were taken.

Practical consequence for your client: **cache by `room_config_id`, not by
room**. If it changes mid-session, the calibration under you has moved and
the safe response is to re-resolve rather than reconcile.

---

## 6. What we have NOT built, and want your input on

Three gaps we found reading the workstream spec against itself. All three
are yours to shape — we would rather agree the contract than guess it.

1. **Tracking quality has no representation.** The confidence state
   machine (`READY` / `DEGRADED` / `LOST`) needs a signal, and
   `ISpatialAnchorProvider` as specified exposes none. We have not
   modelled it server-side either. Tell us what your providers can
   actually report and we will give it a home.

2. **Relocalization is not an operation.** "Attempt silent
   relocalization" has nothing to call — `ResolveAnchorAsync` is a cold
   resolve by id. Is recovery a distinct method, or a documented
   re-resolve?

3. **Anchor enumeration is missing.** You can delete an anchor by id but
   not list them. ARCore Cloud Anchors are hosted, TTL'd and billable, so
   orphans from abandoned calibrations leak until an invoice notices. We
   track `releasedAt` on our side; we would like your lifecycle to match.

### Answered: a tracking failure is not an abandonment (2026-08-14)

This used to be listed here as an open commercial question. It is decided
and shipped, because leaving it open meant the first session your runtime
lost would have paid a guest 0.00 for our failure.

`tracking_lost` is now a fourth run outcome. Report it via
`POST /api/partner/v1/runs/{run_id}/fail` with `outcome: "tracking_lost"`
when localization is unrecoverable — relocalization exhausted, anchors
unresolvable, the room no longer trustworthy. It pays **0.75 plus the
normal milestone bonus, capped at a victory**, settles to its own run
status, and is reported separately in venue analytics. Full rules in
`partner-integration-guide.md` §4.

Two asks:

- **Send it rather than going silent.** A run with no heartbeat for 90
  minutes is swept as `abandoned` and pays nothing, and the sweeper cannot
  tell a dead client from a party that left.
- **Pair it with telemetry.** A `tracking_lost` run with no accompanying
  spatial metrics tells us a room failed but not why. The run says *that*
  it happened; §3b says *what the tracking was doing*. We need both to
  know whether a threshold in §4 is set wrong or a room needs re-scanning.

---

## 7. Getting started

1. `GET /api/spatial/manifest-schema` — read the shape.
2. Write your manifest, validate it in CI against
   `POST /api/spatial/manifest-schema/validate`.
3. Ask us to provision a venue and a room; we return a staff invite and an
   API key.
4. Build calibration against `/api/portal/v1/rooms/*`.
5. Build runtime resolve against `/api/partner/v1/rooms/:slug`.

Steps 1 and 2 need nothing from us and no credentials. Start there.
