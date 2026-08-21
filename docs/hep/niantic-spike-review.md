# Review — Heroes Spatial Technical Spike (Niantic NSDK 4.x / VPS2)

Reviewed 2026-08-18 against what is actually built in `pik-prd`.
Source: `docs/hep/Heroes_Spatial_Niantic_Technical_Spike.docx`.

**Verdict: this is a good spike document.** It asks a falsifiable question,
it names its stop conditions, and it refuses to build Studio. What follows
is not a rewrite — it is seven corrections, one of which changes what you
do in week one.

The demo Tim wants to show is:

```
room → map → anchor → run → leave → return → object exists
```

Six of those seven links are already built and running. This review is
mostly about connecting the spike to them instead of stubbing them.

---

## 1. The spike stops one link short of the demo

§14 scopes out "quest/reward economy beyond a stub callback" and
"production backend authentication". But **`run` is in the chain Tim wants
to show investors**, and a stub callback demonstrates nothing to anybody.

That link is not expensive, because it is finished: check-in, run start,
outcome-weighted settlement, guest claim tokens, and reward sync into a
real Codex account have been in production since Slice 1. The spike does
not need to *build* the run — it needs to *call* it.

**Change:** replace "stub callback" with two real calls,
`POST /api/partner/v1/runs` and `.../complete`, using the venue API key
the spike is issued. Cost: an afternoon of HTTP. Return: the investor
demo ends on a hero's account gaining XP from a physical room, rather
than on a fox standing still.

Everything the client needs to make those calls is in
`partner-integration-guide.md` §4.

## 2. Google is not deferred, and Geospatial is the wrong Google

§14 lists "Google provider implementation" as out of scope and §16 sketches
the deferred track as **ARCore Geospatial**. Given Niantic and Google are
both named providers, two things need saying:

**ARCore Geospatial is an outdoor system.** It localizes against Google's
global VPS using GPS + Street View–derived imagery. It has no useful answer
for a 780 sq ft interior room, which is the platform brief's own POC target
(§11: "one 500–1,000 sq. ft. mapped room"). The `VPS availability check`
§16 mentions is a Geospatial concept and will report unavailable indoors.

**The indoor Google analogue is ARCore Cloud Anchors** (or Android XR
persistent anchors on that track). Different lifecycle, different billing,
different failure modes — cloud anchors are hosted, TTL'd and billable,
which is why `AnchorRecord.releasedAt` exists on our side.

**Change:** keep Google deferred if you like, but write §16 against Cloud
Anchors, not Geospatial, and keep Geospatial in the interface's future for
the outdoor/campus case only. Otherwise `IHeroesSpatialProvider` gets
designed around georeferencing — an assumption §16 explicitly warns
against, and then makes.

## 3. The cheapest way to fail this spike involves no Unity at all

§13's first stop condition is "selected venue cannot be mapped/localized
using the intended Niantic workflow." §18's checklist puts that discovery
at step 8, after a Scaniverse account, a pinned Unity version, AR
Foundation, NSDK, a dev token, an XR loader and a device build.

That ordering can burn two weeks to learn something answerable in two days.

**Change:** make step 1 a hard gate, before any Unity project exists —

> Scan the actual test room with Scaniverse and confirm you can create and
> activate a private VPS location for it, indoors, on the account terms
> you can actually get.

If that fails, the spike is not delayed — it is a *different spike*
(fiducial origin, Mode A, which our `RoomConfig.originMode` already
supports precisely because this might happen). Learn it first.

## 4. `coordinateConvention` is declared and never defined

§6.1 gives `HeroesVenue` a `coordinateConvention` field, which is exactly
right, and then never says what goes in it. The server side is now pinned
(`spatial-integration-guide.md` §1):

- room-local, metres, origin at the calibrated origin anchor
- **right-handed, +Y up, −Z forward**
- **euler degrees, intrinsic Y → X → Z**

**Unity is left-handed with +Z forward.** The conversion belongs inside
`NianticSpatialProvider`, in one place, on the way in and on the way out.

This matters more than it sounds. The server stores three floats and
validates only that they are finite — a handedness disagreement does not
error, it mirrors the room. On a single device that is invisible; the fox
simply appears somewhere plausible. It surfaces the first time a second
device joins, or the first time an operator recalibrates, and it presents
as drift. Budget for it now or debug it in a venue.

> The Spatial Platform Developer Brief §4.2 says `{x,y,z,w}` — a
> quaternion. That is out of date. If you would rather move the wire
> format to quaternions, decide before the calibration client is written;
> once a room is calibrated it means migrating measured poses.

## 5. §15 says to build a `VenuePackage`. Do not.

"Add a serializable VenuePackage definition" contradicts the architecture
that shipped. There is no single package; the contract is deliberately
split into the experience's **manifest** (what it needs from any room) and
the room's **RoomConfig** (how it fits *this* room, immutable, versioned).

That split is what satisfies the platform brief's own repeatability
metric — a second venue deployed by configuration rather than new code. A
single blob welds the experience to the venue and breaks it.

Full field-by-field mapping, including the three §6 fields that genuinely
have no home yet (`triggers[]`, `encounters[]`, `required_runtime_version`),
is in `spatial-integration-guide.md` §2.

## 6. The acceptance criteria are not yet falsifiable

§12 asks for "10 repeated relaunch tests produce a documented success rate
and localization-time distribution." A documented rate is not a pass
condition — 40% is also a documented rate.

**Fixed in this pass.** Two thresholds now exist as seeded config keys, so
the spike and the pilot are judged by the same ruler and either can be
retuned without a deploy:

| Key | Default | Means |
|---|---|---|
| `spatial.min_cold_return_success` | `0.90` | ≥9 of 10 cold returns resolve the anchor |
| `spatial.max_cold_return_offset_m` | `0.10` | p95 offset from the intended feature ≤10cm |

`0.10` is a starting bar, not a law. Set it from what the *experience*
needs: a fox standing near a wall tolerates 15cm; a rune the player must
physically reach for does not.

## 7. §11 lists 13 things to instrument and no destination

The instrumentation list is good and had nowhere to go. Four metrics were
added to the platform's threshold table so the spike's test protocol rows
4–8 land in the same rollup the pilot is graded on:

| Metric | Unit | Target | Spike protocol row |
|---|---|---|---|
| `anchor.cold_return_success` | ratio | ≥0.90 | Cold return |
| `anchor.cold_return_offset_m` | m (p95) | ≤0.10 | Cold return / repeated sessions |
| `anchor.relocalization_success` | ratio | ≥0.90 | Tracking interruption |
| `anchor.relocalization_time_s` | s | ≤10 | Tracking interruption |

Localization time and success were already there
(`anchor.localization_time_s`, `anchor.localization_success`).

**A row reading `no_data` is never a pass.** Before a phone has been in
the room, most of this table is `no_data`, and it should look that way.

---

## Claims in the doc I could not verify

These are load-bearing and version-sensitive. The doc says to re-check
them against official documentation before starting, which is correct
advice; flagging them so nobody treats them as settled:

- NSDK 4.x requiring AR Foundation ≥6.3.0, recommending 6.4.1
- Unity 6000.0.74f1 as the specifically supported configuration
- A Scaniverse **business** account being required for NSDK
- Niantic production access tokens expiring after one hour
- VPS2/`ARVps2Manager` supporting cross-session anchor persistence

The last one is the entire spike. Confirm it from Niantic's current docs
in week one rather than from this document.

---

## What was built alongside this review

`npm run spike:sim` — a reference client that drives the whole server
chain against a live deployment: provision venue → register room →
calibrate against `provider: 'niantic'` → publish → resolve as a runtime
would → replay N cold-return sessions → ingest telemetry → settle a
victory and a `tracking_lost` → print the spike's test-protocol table with
verdicts.

It has two modes:

```bash
# rehearsal — synthetic sessions, proves the pipeline
npx ts-node scripts/spike-sim.ts --simulate --sessions 12

# field — real HUD measurements, identical path
npx ts-node scripts/spike-sim.ts --ingest ./field-run-2026-09-02.json
```

The second mode is the point. The Unity dev writes the HUD log to a JSON
array; the same script, the same thresholds and the same dashboard turn it
into the §12 verdict. **The rehearsal becomes the field harness with a
flag change**, which is how the spike's results end up comparable with the
pilot's instead of stranded in a notebook.

Simulate mode prints a warning saying its numbers are generated and must
not appear in a deck. Please leave that in.

---

## Suggested week one

1. Scaniverse the real room; prove a private indoor VPS location can be
   created and activated. **Gate — everything else waits.**
2. Confirm the NSDK/AR Foundation/Unity version matrix from current docs.
3. Run `npm run spike:sim --simulate` against staging so the server chain
   is provably green before any client exists. Any later failure is then
   demonstrably in the client.
4. Only then: Unity project, NSDK, dev token, one device, bare AR scene.

Steps 1–3 need no Unity, no hardware beyond a phone with Scaniverse, and
no Niantic code. They also contain the only two things that can kill the
spike outright.
