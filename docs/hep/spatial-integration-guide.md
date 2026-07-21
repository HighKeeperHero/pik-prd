# Heroes spatial integration guide

For the Tier C partner building the XR runtime and calibration client.

This describes the server contract: what exists, what you call, and the
conventions the whole system depends on. It is deliberately short —
everything in it is live and testable today, before you have written a
line of client code.

---

## 1. The one convention that matters

**Every pose we store or return is room-local.**

- **Metres**, **Y up**
- Origin at the room's **calibrated origin anchor**
- Rotations are **euler degrees `[x, y, z]`**
- Positions are `[x, y, z]`

Never device space, never provider space. Two headsets in the same room
disagree about where the world is and agree about where the room is, so
room-local is the only frame in which their state can be compared. Please
do not "helpfully" convert at the boundary — send us room-local, and we
will hand it back to the next device unchanged.

Every resolve response repeats this as `coordinate_space:
"room_local_meters_y_up"` so it is visible without consulting a document.

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
GET /api/partner/v1/rooms/:roomSlug     header: X-PIK-API-Key
```

Read-only by construction. Returns the published config: anchors,
placements, zones, `origin_mode`, `supported_device_profiles`. 404 if the
room has never been published — treat that as "not calibrated", not as an
error to retry.

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

One product question we cannot answer alone: **a session lost to
untrustworthy tracking is not an abandonment.** Today our payout model
has victory / timeout / abandoned, and paying a tracking failure as
"abandoned" (0.00) penalises a guest for our problem. That needs a new
outcome and a payout weight, and it is a commercial decision we will make
once we know how often it actually happens.

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
