# Fate Fox — external commission brief (Field Deploy, Nov 1)

Companion to [`field-deploy-nov1.md`](field-deploy-nov1.md) §9. This is the
one bespoke character in the November demonstrator, and it has the longest
lead time of anything in the build.

**Engine-agnostic on purpose.** The Unity-vs-native-ARKit call is open
(field-deploy-nov1.md §9); FBX + glTF 2.0 serves both, so this commission
must not wait on that decision. Nothing below changes either way.

**Reference:** `heroes-veritas-native/assets/ui/icons/FateFox_Unlock_Icon_2k.png`
— fennec silhouette, oversized ears, amber/gold coat, gold ethereal particle
trail wrapping the body. That trail is **our** VFX, not the vendor's; the
model must read without it.

---

## 1. What we are buying

One rigged, animated, mobile-ready quadruped companion.

| | |
|---|---|
| Naming | `HV_CH_FateFox_v001` (kit §30) |
| Triangles | 10k–35k, single mesh |
| Materials | **One** material set. Not two, not "one plus eyes". |
| Textures | 2K albedo / normal / ORM, **plus a separate emissive mask** (see §3) |
| Rig | Standard quadruped, ≤ 60 joints, no IK dependency in the export |
| Format | **FBX** (rig + clips) **and glTF 2.0** (validated) |
| Units | Metres, 1 unit = 1 m, **Y up, −Z forward**, origin between the front paws on the ground plane |
| LODs | LOD0 as above, LOD1 at ~50%, LOD2 at ~25% |

### Animation set (kit §13)

| Clip | Notes |
|---|---|
| `idle` | Seamless loop, 4–8 s. Ear flicks and tail — a dead-still companion reads as a bug. |
| `appear` | Manifestation. Non-looping, ~1.5 s. Must land in the idle pose. |
| `move` | Hover-glide or trot loop. **In place, no root motion** — the runtime drives translation between anchors. |
| `look_at` | Additive head/ear turn, or a short pose the runtime can blend. Ears carry this. |
| `vanish` | Dissolve exit, ~1.2 s. Must not require a ground shadow. |

---

## 2. Scale — read this before modelling

A real fennec fox stands ~20 cm at the shoulder. **Do not model to that.**

The guest views the fox on a phone from 1.5–3 m in a room. At true fennec
scale it is a smudge. Model to a **45–55 cm shoulder height**: larger than
life, unmistakably a companion rather than a pet, and legible at handset
distance.

Everything else follows from the same rule. At 2 m on a 6-inch screen the
guest sees **silhouette and motion**. They do not see fur strands. Budget
the effort into the ear shape, the tail, and the leg reads; do not spend it
on surface micro-detail that will never resolve.

---

## 3. The AR constraint that breaks ethereal art

**The demo happens on a brightly lit trade show floor**, not in the moody
lighting of the reference image. Emissive gold on a dark plate is
gorgeous; the same asset in 800-lux convention lighting is a beige dog.

So:

- **Emissive must be a separate mask channel**, tunable at runtime. We
  will raise it hard for bright rooms. Emissive baked into albedo is
  unusable and will be rejected.
- **The coat must read on its own value contrast** against a grey carpet
  and a white wall, with emissive at zero. Check it that way before
  delivering.
- **No baked ambient occlusion into albedo**, and **no baked ground
  shadow** — the fox stands on a real floor whose colour we do not know.
- Avoid large flat translucent planes for the tail wisps. Overdraw is the
  first thing to cost us frames on a phone (kit §23).

---

## 4. Milestones

Working back from kit Gate 3 (Sep 8–20, playable graybox with core
animations):

| By | Deliverable |
|---|---|
| **Aug 27** | Vendor selected, brief accepted |
| **Sep 3** | Blockout + rig approved — untextured, in-engine, at scale |
| **Sep 12** | `idle`, `appear`, `move` delivered against the rig |
| **Sep 22** | Full five-clip set, final textures, LOD0 |
| **Oct 6** | LOD1/LOD2, optimisation pass, final delivery |

The Sep 3 blockout matters more than it looks: **an untextured fox at
correct scale, standing in a real room on a real phone, is the only way to
find out that the scale is wrong** while it is still cheap to change.

---

## 5. Not in scope

- The gold particle trail, manifestation VFX, and dissolve shader — ours.
- Facial rig or blendshapes. The ears do the acting.
- Any second character. The Hero Echo is cut to a VFX shell and a voice
  cue for v0.1 (field-deploy-nov1.md §9).
- Cinematic-fidelity anything. Kit §12: mobile AR first, and explicitly
  **not** theme-park fidelity as the art target for this release.
