// ============================================================
// VERGE — how far into a rift the hero chooses to go.
//
// The gap this closes (2026-08-11): Resonance had nowhere to be
// spent. Gear widened the telegraph window, paid ~30% more
// essence and healed on a perfect read — all of which made the
// fight EASIER. Nothing in the world ever required power, so
// there was no reason to chase it. Tier could not carry that
// load either: with four tiers against sixty Fate levels, every
// tear reads ROUTINE by L45 and the world stops changing.
//
// Verge is the axis that runs the other way. The hero picks it
// at the tear. Deeper means more distortions, harder tells, a
// tighter window and a longer containment — and proportionally
// more XP and essence.
//
// HYBRID CEILING (Tim, 2026-08-11): the choice is free up to a
// ceiling derived from Resonance. Not a refusal — you are never
// told a tear is closed to you — but the depths open as the note
// strengthens. This is a SOFT GATE and it sits deliberately
// against canon's "Fate drives all content gates"; see the
// amendment in docs/canon/progression.md §13.10.
//
// Verge 0 is the encounter exactly as it shipped. Every scale
// here returns its identity value at 0, so a hero who never
// touches the selector plays the game they played yesterday.
//
// MIRRORED in heroes-veritas-native src/world/verge.ts. THIS side
// owns the ceiling — it recomputes Resonance and clamps whatever
// the client posted, because the reward multiplier is real XP.
// Change one, change both.
// ============================================================

export const VERGE_MAX = 3;

export type Verge = 0 | 1 | 2 | 3;

/** Resonance at which each verge opens. Sits under the existing
 *  combat-dial caps (shard +30% at R150, window +50% at R200) so
 *  Verge lives in the same design space as the other gear dials.
 *  Reachable band-wise: ~T4 gear opens I, ~T6 opens II, ~T7-T8
 *  opens III (seed base power 10/20/35/55/80/110/150/200). */
export const VERGE_RESONANCE: Record<Exclude<Verge, 0>, number> = {
  1: 45,
  2: 100,
  3: 170,
};

/** The deepest verge this hero may choose. Always at least 0 —
 *  a naked hero can still seal a tear, just at the surface. */
export function vergeCeiling(resonance: number): Verge {
  const r = Number.isFinite(resonance) ? resonance : 0;
  if (r >= VERGE_RESONANCE[3]) return 3;
  if (r >= VERGE_RESONANCE[2]) return 2;
  if (r >= VERGE_RESONANCE[1]) return 1;
  return 0;
}

/** The verge the client CLAIMED, clamped only to the legal range —
 *  no Resonance ceiling. This is the denominator when correcting an
 *  essence roll that already had the claim folded into it.
 *
 *  Deliberately its own function rather than clampVerge(x, Infinity):
 *  vergeCeiling treats a non-finite Resonance as 0, so that sentinel
 *  silently returned 0 and inverted the correction into a SECOND
 *  application of the multiplier. */
export function claimedVerge(requested: unknown): Verge {
  const n = Math.floor(Number(requested));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, VERGE_MAX) as Verge;
}

/** Clamp an arbitrary (possibly hostile, possibly stale-client)
 *  value into a legal verge for this hero. */
export function clampVerge(requested: unknown, resonance: number): Verge {
  return Math.min(claimedVerge(requested), vergeCeiling(resonance)) as Verge;
}

// ── What a verge costs and pays ─────────────────────────────

/** Reward multiplier on XP and essence. The whole point: depth
 *  is the reason to have gear, so it has to be worth the risk. */
export const VERGE_REWARD: Record<Verge, number> = {
  0: 1.00,
  1: 1.35,
  2: 1.80,
  3: 2.40,
};

export function vergeReward(verge: Verge): number {
  return VERGE_REWARD[verge] ?? 1;
}

/** Extra distortions the rift may manifest, on top of its tier
 *  budget (0/1/2/3 for T1-T4). Capped by the caller at the
 *  number of distortion types that actually exist. */
export function vergeDistortionBonus(verge: Verge): number {
  return verge;
}

/** Telegraph windows tighten with depth. This is the direct
 *  counterweight to Resonance widening them: gear buys you the
 *  ability to hold a window a shallower hero could not. */
export function vergeWindowScale(verge: Verge): number {
  return 1 - 0.10 * verge;
}

/** Tells hit harder the deeper you stand. */
export function vergeDamageScale(verge: Verge): number {
  return 1 + 0.18 * verge;
}

/** The containment runs longer — more of the rift to work through. */
export function vergeHpScale(verge: Verge): number {
  return 1 + 0.20 * verge;
}

// ── Presentation ────────────────────────────────────────────

/** Label for the selector and the result card. 0 is the surface:
 *  the tear as it presents itself, no descent. */
export function vergeLabel(verge: Verge): string {
  return (['SURFACE', 'VERGE I', 'VERGE II', 'VERGE III'] as const)[verge] ?? 'SURFACE';
}

/** One line of rule copy, so the selector explains itself. */
export function vergeHint(verge: Verge): string {
  return ([
    'The tear as it lies. No descent.',
    'One step in. The seam distorts more readily, and answers narrower.',
    'Deep. The rift bends its own rules twice over, and strikes to match.',
    'The floor of it. Everything the rift can do, it will.',
  ] as const)[verge] ?? '';
}
