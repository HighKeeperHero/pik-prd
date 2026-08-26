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

1. ~~Answer the ownership question.~~ **Tim + Claude, 2026-08-20.**
2. ~~Scaffold the repo.~~ **Done** — `heroes-field-deploy`, §10.
3. Reconcile the euler/quaternion contradiction and define
   `coordinateConvention` (§3 above). Native makes this cheaper, not
   unnecessary: the document still contradicts itself.
4. Cut the Hero Echo to a VFX-plus-audio beat for v0.1 (§4, Risk 2).
5. Book the three unfamiliar test rooms for the Gate 4 window **now** —
   an unfamiliar room you have to go and find in October is a schedule
   risk disguised as a logistics task.
6. Build the ARKit provider and the app target. **Gate 1 then waits on
   nothing but a walk around a room.**

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

---

## 9. Re-baseline: two people, a fixed date (decided 2026-08-20)

Two answers landed on 2026-08-20 and both narrow the build:

- **Tim + Claude execute directly.** No firm, no hire.
- **November 1 is a fixed external date.** It does not move.

A fixed date with a fixed (and very small) team means scope is the only
variable left. Deciding the cuts now is strictly better than discovering
them in the Oct 16-24 hardening window, when there is nothing left to cut
but quality.

### The kit's §3 Definition of Done survives. Its §12 asset kit does not.

Eleven engineering line-items in §3 are achievable — they are mostly a
client for routes that already exist (§2). Thirteen asset rows, five
animation sets, nine VFX systems, ten audio cues and thirteen UI items,
authored from nothing, are not. **The Definition of Done is the promise;
the asset kit is a wish list, and it is the thing that will silently eat
the schedule if nobody cuts it deliberately.**

### The art cut, in priority order

| Asset | Call | Why |
|---|---|---|
| **Fate Fox** | **Bespoke. Commission this week.** | The only asset that is the IP. A prospect remembers the fox; they do not remember a pedestal. Rigged + animated mobile-ready runs weeks of lead time, so this is the long pole and it starts now or it does not arrive. |
| **Veil Rift** | Bespoke — but **shader and VFX, not mesh** | Highest wow per hour of anyone's time, and it is where the brand actually lives visually. No modelling, no rig, no animation pipeline. |
| Rune pedestal, Relic | **Licensed base mesh, re-textured** | Simple props. Authoring them from scratch buys nothing a prospect can see. |
| **Hero Echo** | **CUT to VFX shell + voice cue for v0.1** | It exists to deliver one warning line (kit §11). A spectral shell plus VO delivers that beat at a fraction of the cost. **The anchor slot stays exactly where it is**, so it upgrades to a real character after Nov 1 without touching the manifest or a single calibrated room. |
| Tendrils, sparks, debris, glyphs, markers | Procedural / licensed | Kit already marks debris optional. |
| Audio (10 cues) | **Licensed library + one bespoke Fate Fox summon cue** | The fox's signature cue is identity. The rest is craft anyone can license. |

That reduces bespoke art production to: **one rigged character, one
shader family, one audio cue.** Everything else is assembly.

### Fixed date changes two things immediately

1. **Fallback Mode D is a week-one deliverable.** Kit §29 asks for "one
   recorded deployment from blank room to live demo" as a handoff item.
   With an immovable date it is not a handoff item, it is insurance:
   shoot the first one on graybox the day Gate 2 passes, and re-shoot at
   every gate. A rough recording of a real deployment is a working demo
   when the venue Wi-Fi and the tracking both fail. A polished one that
   does not exist yet is not.
2. **The SOP outranks the feature list from October onward.** Gate 6 —
   ten consecutive runs — is an operations result. It is also the gate
   that actually predicts what happens on the show floor, and the only
   one that cannot be recovered by working a weekend.

### DECIDED: native ARKit/RealityKit, iOS-only (2026-08-20)

Kit §5 names Unity + AR Foundation. That was the right default for a firm
or an XR hire, and the wrong one for two people on a fixed date.

What native buys:

- **No Hub, no licence, no IL2CPP.** Unity was not installed on the build
  machine; day one of Gate 1 would have been a toolchain.
- **`ARWorldMap` is first-class**, so the §6 local-persistence path is
  nearly free rather than a port.
- **No handedness conversion at all.** ARKit's world coordinate space is
  *already* right-handed, +Y up, −Z forward — the exact convention §3
  pins. A Unity client has to negate Z in its provider adapter, and a
  mistake there mirrors the room instead of erroring: it reads as drift
  and costs a week to find. That entire bug class is gone.
- Claude can build, deploy and drive an Xcode/iOS project directly. It
  cannot drive the Unity Editor — which on a two-person team is the
  difference between one pair of hands and two.

What it costs, stated plainly: **Android, and the Unity-only Niantic
NSDK.** Gate 5's VPS2 upgrade path closes. Kit §2 already says VPS2 must
never be show-critical and §6 proposes spending that window on local
persistence instead — but this is a real door shut, and it is the door
marked "fundraising spike." Reopening it means a Unity client later, not
a flag.

**Repo: `~/dev/heroes-veritas/heroes-field-deploy`** (see §10).

### The one thing that must happen regardless, this week

Commission the Fate Fox. It is engine-agnostic (FBX/glTF either way),
it has the longest lead time of anything on this page, and every gate
from Sep 8 onward has it on the critical path. See
[`field-deploy-art-brief.md`](field-deploy-art-brief.md).

---

## 10. The repo — `heroes-field-deploy` (2026-08-20)

A fourth repo. `codexpwa` / `pik-prd` / `heroes-veritas-native` are
unchanged; "tri-repo" is now a historical name.

### The constraint that shapes it

**ARKit does not run in the Simulator.** An app whose authoring rules live
inside an `ARView` is an app one person with one phone can verify — which
on a 73-day clock with a two-person team means the other person is blind
for the whole build.

So everything decidable without a camera lives in a Swift package:

```bash
cd ~/dev/heroes-veritas/heroes-field-deploy && swift test   # 29 tests
```

The state machine, the serialiser and the safety rules run on a laptop.
The device is reserved for the one question only a device can answer:
*does it track?* **Preserve this split** — it is what makes the team size
survivable, and it degrades quietly the first time a rule is written into
a view controller.

| | |
|---|---|
| `Core/RoomLocal.swift` | The coordinate convention, and why it is free under ARKit |
| `Core/RoomManifest.swift` | Decodes `veil-breach-portable.v1.json`, unmodified |
| `Core/VenueDraft.swift` | The saved venue file — already the platform draft body |
| `Spatial/SpatialProvider.swift` | Kit §2's provider seam |
| `Spatial/MockSpatialProvider.swift` | Same preconditions as ARKit, no camera |
| `Authoring/DeploySession.swift` | The eight steps and their gates |
| `Authoring/SafetyValidator.swift` | Kit §24, evaluated in the room |

### Two deliberate deviations from the kit

1. **Template selection moved ahead of the boundary draw.** Kit §10 orders
   these Boundary (3) then Template (4), which has the operator draw a
   boundary before anything has told them the required clearance — so a
   short room surfaces at Validate and they walk it back. On a 15-minute
   clock with a prospect watching, that round trip is most of the budget.
   Now a 2 m room is refused while the operator is still at the wall.
2. **Validation does not survive what it validated.** Moving an anchor
   after a green pass clears both the validation and the test flag. A
   stale tick over a room that has since moved is worse than no tick.

### Not built yet

The ARKit provider, the operator UI, the experience runtime, and the app
target. Gate 1 needs the first of those — and a phone.

---

## 11. The Codex seam — already built, not yet used

Field Deploy is a **separate app on a shared backend**, not a fork.
`veil_breach_portable` is an `Experience` row beside `echoes_of_kingvale`,
running the same `RoomConfig` → `ExperienceRun` → settlement pipeline. No
code is shared with Codex — Swift vs React Native — and none should be.

**The bridge between them already ships.** Slice 1's guest-claim path:
a guest plays with no account, their deeds are witnessed and held, they
leave with a QR plus a printed short code, and they redeem it onto a real
hero later. Codex has the screens live today —
`src/screens/Testament/{TestamentScreen,VenueCheckInScreen,WitnessesScreen}.tsx`,
wired into `CodexStack`.

**The Nov 1 demo does not use it.** As specced the encounter ends at a
local reward screen and nothing leaves the phone.

### Why it is worth wiring, and when

Fast deploy alone proves *"we can augment your space in 15 minutes"* — a
cost argument. With the testament bridge it proves *"and your guest walks
out with something that persists into an identity they keep"* — a
retention argument, and the actual north-star hypothesis. For a partner
deciding whether to host us, the second is the stronger sentence.

The build is small — start the run, settle it, show the claim QR. Two HTTP
calls against endpoints that already exist, which is the same shape as
finding #1 of the Niantic spike review.

Two constraints if we do it:

- ⚠ **Optional, and it must degrade silently.** Kit §2/§8: the core demo
  needs no internet. Offline ⇒ no claim code, demo runs identically. Same
  discipline that keeps Niantic off the critical path.
- It needs a venue `Source` row and an API key **provisioned ahead of
  time**, never in the room.

**Sequence it as a Gate 4/5 item, flag-gated** — after the deployment loop
is solid. It is the wrong thing to be debugging in September.

---

## 12. Buying art: kitbash, FAB, and what actually ports (2026-08-20)

The question was whether Unity assets from FAB can dress this demo. The
answer splits, and the split is favourable — **the part that ports is the
expensive part to make, and the part that doesn't was always going to be
ours.**

A `.unitypackage` is prefabs, `.mat` files bound to Unity shaders,
ShaderGraph, Animator controllers and Shuriken/VFX Graph systems. None of
that runs in RealityKit. What survives is the geometry underneath: meshes,
textures, rigs, animation clips.

| Asset | Buy it? |
|---|---|
| Rune pedestal, Relic, glyphs, debris, totem | ✅ Ideal — mesh + texture is all they are |
| **Veil Rift, seal beam, essence burst, spectral Echo** | ❌ **Buys nothing.** This is exactly the shader/VFX layer that does not port |
| Fate Fox | ⚠️ A rigged base mesh could cut the commission materially |

**Shop the "3D Models" category, not the Unity-packaged listings** — often
the same assets, but engine-neutral source and usually broader rights. A
listing offering USD/USDZ is zero conversion.

⚠ **Licence trap: FAB carries *Engine Restricted* listings (Unreal-only)
and some Personal Use content.** This is a commercial demonstrator shown to
partners, not a hobby build. Verify per listing and keep the receipt with
the asset. Not legal advice — get the terms checked.

⚠ **Apple's toolchain cannot read FBX or glTF.** Verified against ModelIO:
imports OBJ / USD / ABC / PLY / STL only. So there is a mandatory
conversion hop, and Blender (which reads FBX and GLB, writes USD) is not
installed on the build machine.

### Animation is a far smaller problem than kit §13 implies

Read that list again against RealityKit and **only one asset needs
skeletal animation at all**:

| Kit §13 asks for | What it actually is |
|---|---|
| Rift: closed → tear → active → destabilize → seal → collapse | **One shader parameter being driven.** Not animation |
| Rune: dormant → charge → active → discharge | Shader parameter + particles |
| Relic: idle float, spin, highlight, collected | Transform animation. **No rig** |
| Hero Echo | Already cut to VFX + voice (§9) |
| **Fate Fox** | ✅ Genuinely skeletal |

That is what makes prebuilt props viable: four of five need no animation
data whatsoever.

### Confirmed present in the iOS SDK

Compiled against it rather than trusted to documentation:
`ParticleEmitterComponent`, `ShaderGraphMaterial` + `setParameter` (drive
the rift's five states from one float), `CustomMaterial` with Metal
modifiers as the escape hatch, `FromToByAnimation`, `InputTargetComponent`,
`CollisionComponent`.

⚠ Particles and ShaderGraphMaterial are **iOS 18+**. Deployment target
moved from 17 to 18. Free — every registered device is on 26.x.

⚠ **ShaderGraphMaterial is authored in Reality Composer Pro's GUI.** Claude
can write the runtime that drives the parameters and define the parameter
contract, but the node graph is hands-on. It can be hand-authored as USDA
text if absolutely necessary; it is not pleasant to iterate on. This is the
one place the two-person split has a real gap — plan for it.

### The architecture that makes kitbash safe

Built 2026-08-20, `heroes-field-deploy`:

```
manifest slot ─┬─► where it is        RoomConfig, calibrated per room
               ├─► what it looks like binding table (data, swappable)
               └─► what it does       component keyed to the slot name
```

Behaviour binds to the slot **name**, never a model. October's commissioned
fox lands as a one-line edit, **with no room needing recalibration**.

**The scale guard is the piece to keep.** Every bound model is loaded
through RealityKit on macOS and measured against the height its binding
claims. A purchased asset arriving in centimetres is the most common way a
bought-art pipeline wastes a day — unmissable in a room, invisible in a
diff. Watched it fail deliberately before trusting it.

### One addendum to the fox commission

RealityKit's weak spot is multiple named clips inside a single USDZ. Ask
for **FBX source plus one USDZ per clip** (idle / appear / move / look_at /
vanish). Trivial if it is in the contract on day one; a renegotiation in
October.
