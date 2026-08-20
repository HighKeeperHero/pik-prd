# Heroes Field Deploy — the path to November 1

Reading of `Heroes_Field_Deploy_Developer_Kit_Nov1.docx` (received
2026-08-20) against what pik-prd already ships. Companion to
[`spatial-integration-guide.md`](spatial-integration-guide.md) (the
contract) and [`niantic-spike-review.md`](niantic-spike-review.md) (the
fundraising spike this kit partly supersedes).

**73 days to freeze.** Kit Gate 1 exits Aug 28 — eight days from today.

---

## 1. The kit's central call is right, and it is not new

> "Local Mode is the show-critical path. Niantic VPS2 is an optional
> persistence upgrade and must never be required for the 5-15 minute live
> demo." — kit §2

This is finding #3 of the Niantic spike review, adopted: the cheapest
kill-shot involves no Unity and no Niantic account terms. Demoting VPS2 to
optional removes the single largest unverified dependency (Scaniverse
business account, 1-hour tokens, NSDK 4.x ↔ AR Foundation compatibility)
from the critical path of a dated commercial deliverable. Keep it there.

**But be clear about what that costs us**, because it is easy to miss:

| Proof | Nov 1 kit | Niantic spike |
|---|---|---|
| "We can augment your space in 15 minutes" | ✅ this is the whole build | — |
| "Leave, come back tomorrow, the world is still there" | ❌ **not proven** | ✅ its entire purpose |

Tim's demo chain is `room → map → anchor → run → leave → return → object
exists`. **The Nov 1 demonstrator stops at `run`.** It is a session-local
proof. A partner venue is not buying a 15-minute setup; they are buying an
installation that is there on Tuesday. So Nov 1 answers the *deployment
cost* objection and leaves the *persistence* objection untouched.

That is an acceptable trade for a November date. It is not acceptable to
walk into the room believing we proved both. See §6 for the cheap way to
close the gap without Niantic.

---

## 2. The finding that changes the shape of this build

**The field-deploy backend is already built, shipped, and verified.** Slice
4 (spatial data model, 71 checks) and Slice 6 (spatial telemetry, 30
checks) implement almost exactly the workflow the kit describes in §4 and
§10 — because both descend from the same Tier C spec.

Kit §10's eight-step operator UX maps onto live routes:

| Kit step | Shipped endpoint | |
|---|---|---|
| 1. New Venue | `POST /api/portal/v1/rooms` `{slug, name, profile}` | ✅ |
| 2. Scan Space | client-side (AR Foundation) | — |
| 3. Set Origin | `originMode` + the `origin` verification anchor | ✅ |
| 4. Define Boundary | `zones[]`, kinds `safety` / `clearance` | ✅ |
| 5. Select Template | `POST /rooms/:roomId/drafts` `{experience_slug, origin_mode}` | ✅ |
| 6. Place Required Slots | `PATCH /rooms/drafts/:configId` `{anchors[], placements[], zones[]}` | ✅ |
| 7. Validate | `GET /rooms/configs/:id/validation` — dry run, never mutates | ✅ |
| 8. Deploy | `POST /rooms/configs/:id/publish` | ✅ |
| Run the demo | `GET /api/partner/v1/rooms/:roomSlug` (API key) | ✅ |
| Diagnostics upload | `POST /api/partner/v1/telemetry` | ✅ |

Validation, versioning, immutability, rollback, audit, the
calibrate-vs-publish permission split, and the metric thresholds all
already exist. **The Nov 1 build is a Unity client for a server that is
waiting for it**, not a system to design from scratch.

### What this means for the kit's §6

Kit §6 defines `HeroesVenue`, `HeroesAnchor`, `HeroesExperienceTemplate`
and `HeroesVenueManifest`. Three of those four already exist under
different names, and one of them we have explicitly decided not to build:

| Kit §6 | Reality |
|---|---|
| `HeroesVenue` | = `VenueRoom` + `RoomConfig` (the split is load-bearing — see below) |
| `HeroesAnchor` | = `AnchorRecord` + `ContentPlacement` |
| `HeroesExperienceTemplate` | = `Experience.manifest`, schema-versioned, validator shipped |
| `HeroesVenueManifest` | this is the `VenuePackage` the integration guide §2 says **does not exist and will not be built** |

⚠ **The one welded blob is the mistake to avoid.** `HeroesVenueManifest`
bundles venue + anchors + objects + template into a single object. That
welds the experience to the room, and the repeatability claim the whole
partnership model rests on — "a second venue deployed through
configuration, not new application code" — is exactly what welding breaks.
The manifest/RoomConfig separation exists to prevent it.

**Action: the Unity app's serializer emits the platform shape.** Keep the
kit's `Heroes*` C# type names if the field team prefers them — they are
readable — but they are a *view*, and the bytes that hit disk are a
`RoomConfig` draft body. Doing this now is free. Doing it in December is a
migration plus a re-shoot of every recorded demo.

This is not a cloud dependency. The local file is authoritative during the
demo; sync is a later, optional `PATCH` + `publish` of a draft that was
already the right shape.

---

## 3. Decide the coordinate convention now — the engine is no longer undecided

`spatial-integration-guide.md` §1 pinned **right-handed, +Y up, −Z
forward, euler degrees intrinsic Y→X→Z**, and said explicitly that it was
chosen *because the engine was still undecided* and every provider is
right-handed. Unity is left-handed, so a Unity client negates Z in its
provider adapter.

The kit names Unity + AR Foundation (§5). That decision is now made.

**Recommendation: keep right-handed and negate in the adapter.** It is
already in a partner-facing document, it survives a future headset or a
non-Unity runtime, and the conversion is four lines in one file. The cost
of changing is a document renegotiation; the cost of *not deciding* is a
mirrored room that reads as drift and takes a week to find.

⚠ Two things must land in week one, both flagged by the spike review and
neither yet done:

1. `HeroesVenue.coordinateConvention` is declared in the spike brief and
   never defined. Define it, or delete it — a field that means nothing is
   worse than no field, because a client author will populate it.
2. The developer brief §4.2 says quaternion `{x,y,z,w}` and is **wrong**.
   The guide is the contract: euler degrees. Reconcile before the Unity
   team writes a deserializer against the wrong one.

---

## 4. What is actually at risk

The kit's §19 lists seven workstreams with owner profiles. Six of the
seven have no named owner today.

### Risk 1 — there is no Unity repo and no XR engineer (BLOCKING)

Tri-repo is codexpwa / pik-prd / heroes-veritas-native. `UE_Studio` in the
art repo is an empty UE5 starter project — not a Unity pipeline, and
Unreal's mobile AR support is not the right tool here anyway. **Every C#
line in this kit has nowhere to live.**

Tier C was recorded as partnered out to a design firm on 2026-07-21.
Whether that firm is executing this November build is the single question
that determines what happens next week. Nothing else on this page is
useful until it is answered.

### Risk 2 — art is the long pole, not code (HIGH)

The kit asks for 13 asset rows, 5 animation sets, 9 VFX systems, 10 audio
cues and 13 UI items, mobile-optimised, by Oct 24. **None of it exists.**
There is no rigged 3D Fate Fox, no rift shader, no spectral Hero Echo. The
2D art in `heroes-veritas-native` is direction, not source.

The kit's own schedule gives "Fox blockout" a single week alongside
project setup. A rigged, animated, mobile-optimised hero character with
five animation states is not a one-week job for someone who is also
standing up an AR session.

**Mitigation: cut the character count for v0.1 before the schedule cuts it
for you.** The Hero Echo (§12, 8k-25k tris, spectral shader, materialize /
idle / point / dissolve) exists in the encounter to deliver one warning
line. A voice cue plus a spectral VFX shell delivers the same beat at a
fraction of the cost, and can be upgraded after Nov 1 without touching the
manifest — the anchor slot stays exactly where it is.

### Risk 3 — the schedule has no slack and a hard external date (MEDIUM)

Seven gates, zero buffer weeks, and a freeze date that looks chosen for a
trade show rather than for the build. If that is IAAPA, the date genuinely
cannot move, which makes two things non-optional rather than nice to have:

- **Fallback Mode D (recorded proof) is a week-one deliverable, not a
  week-ten one.** Kit §29 asks for "one recorded deployment from blank
  room to live demo." Shoot the first one the day Gate 2 passes, on
  graybox. A rough recording of a real deployment is a working demo when
  the venue Wi-Fi and the tracking both fail; a polished one that does not
  exist yet is not.
- **The SOP outranks the feature list.** Ten consecutive runs (Gate 6) is
  an operations result, not an engineering one.

---

## 5. Revised gate table

Kit §20 unchanged where it holds. Changes marked ▲.

| Window | Gate | Change |
|---|---|---|
| Aug 20-28 | **G1** local placement on-device | ▲ Add: repo exists, owner named, `verify:field-deploy` green in their CI |
| Aug 29-Sep 7 | **G2** venue created without Unity Editor | ▲ Saved file is a `RoomConfig` draft body, not a bespoke format. ▲ First recorded deployment (graybox). |
| Sep 8-20 | **G3** encounter runs from template data | ▲ Data = the seeded `veil_breach_portable` manifest, unmodified |
| Sep 21-Oct 5 | **G4** 3 unfamiliar rooms ≤15 min | ▲ Telemetry posted to `/api/partner/v1/telemetry`, so deploy times are measured, not remembered |
| Oct 6-15 | **G5** Niantic cannot destabilise Local | ▲ Or spend it on §6 local persistence instead — decide by Oct 1 |
| Oct 16-24 | **G6** 10 consecutive demos | unchanged — this is the gate that actually predicts the trade show |
| Oct 25-31 | **FINAL** RC frozen | unchanged |

---

## 6. The cheap way to close the persistence gap (decide by Oct 1)

§1 notes Nov 1 proves fast deploy and not persistence. Niantic VPS2 is one
way to close that; it is also the expensive, account-gated, unverified
way, which is precisely why the kit demoted it.

There is a local one. **ARKit `ARWorldMap` serialises to disk and
relocalises offline on the same device** (ARCore's analogue is Cloud
Anchors, which is *not* offline — so this is an iOS-first proof). Save the
world map alongside the venue file at Deploy; on next launch, relocalise
and resolve the same anchors.

That turns the demo from "watch me set this up" into "this room was set up
yesterday, and here it still is" — same hardware, no network, no vendor
account, no new art. It is a smaller claim than city-scale VPS and it is
the claim a single partner venue actually cares about.

Sequence it as the **alternative** use of the Oct 6-15 window, not as
extra scope. One or the other, not both.

---

## 7. Week one — landed today

Answer-independent work, done before the ownership question resolves:

- ✅ `docs/hep/manifests/veil-breach-portable.v1.json` — the encounter as
  data. Seven anchors, five zones, room-local metres. This is Gate 3's
  evidence and it exists on day one instead of week six.
- ✅ `npm run verify:field-deploy` — validates it against the *shipped*
  publish validator, then against the kit's own §24 safety rules that no
  schema can express: nothing required outside the boundary, no backward
  walking, the rift on a wall and facing the guest. Needs no server, no
  database, no Unity. **It caught a real design error on its first run**
  (a boundary that excluded its own wall-mounted rift).
- ✅ `npm run seed:experiences` now seeds `veil_breach_portable` with that
  manifest, read from the file so the two cannot drift, refusing to seed
  an invalid one.

### Next, in order

1. **Answer the ownership question.** Firm, hire, or Tim-plus-Claude.
2. Scaffold the Unity repo to kit §18 with `verify:field-deploy` wired
   into its CI, so the contract is enforced from commit one.
3. Reconcile the euler/quaternion contradiction and define
   `coordinateConvention` (§3 above).
4. Cut the Hero Echo to a VFX-plus-audio beat for v0.1 (§4, Risk 2).
5. Book the three unfamiliar test rooms for the Gate 4 window **now** —
   an unfamiliar room you have to go and find in October is a schedule
   risk disguised as a logistics task.

---

## 8. What the kit says not to build, and one to add

Kit §28 is good and should be enforced. Add one line to it:

> **Do not invent a spatial object/trigger/encounter schema.** The
> integration guide §2 lists `objects[].what`, `triggers[]` and
> `encounters[]` as the known ❌ gaps and asks the XR team not to design
> them unilaterally. The Veil Breach interaction graph (kit §11) is
> exactly the thing that will tempt someone to. For v0.1 the graph may
> live in the Unity template; it must not be written to disk as a format
> anyone else will read.
