// ============================================================
// Reward scale — the exchange rate between an encounter and the
// hero standing in front of it.
//
// The problem this fixes (2026-08-11): every reward in the world
// was a FLAT constant while the Fate curve grows as 20·L^1.5 and
// then compounds at +10%/level past 40. A dormant seal paid 250
// XP at L5 (more than a whole level) and 250 XP at L59 (0.8% of
// one). The same act got 140x weaker the longer you played. The
// curve's own calibration note assumed ~1,000 XP/day committed
// income — but ~250 of that was cache-open XP, deleted on
// 2026-07-10, and every surviving source is flat.
//
// The fix is one function. A reward's flat table value is now
// read as ITS VALUE AT THE ANCHOR LEVEL; above that it rides the
// same curve the costs ride, so a tier-appropriate encounter
// stays worth a roughly constant slice of the current level.
//
//   scaled = flat x levelScale(level) x riskMultiplier(readiness)
//
// Two deliberate properties:
//
//   1. levelScale CLAMPS AT 1. Nothing below the anchor level
//      changes by a single point. The entire L1-25 game — which
//      is every closed-alpha tester — is byte-identical.
//   2. riskMultiplier NEVER GOES BELOW 1. Punching above your
//      weight pays more; nothing pays less than it does today.
//      Discounting trivial content is the obvious next dial
//      (see RISK_MULT.trivial) but it is a nerf, and we do not
//      nerf a live alpha's economy mid-flight.
//
// MIRRORED in heroes-veritas-native src/world/rewards.ts. This
// side is authoritative for XP; the client rolls essence off the
// same numbers. Change one, change both.
// ============================================================

import { xpForLevel, MAX_FATE_LEVEL } from './leveling.service';

export type EncounterTier = 'minor' | 'wander' | 'dormant' | 'double';

// ── The level scale ─────────────────────────────────────────

/** The level at which every flat reward table is exactly correct.
 *  Chosen as the point the old economy started to visibly stall:
 *  below it the flat tables are generous, above it they rot. */
export const REWARD_ANCHOR_LEVEL = 25;

const ANCHOR_XP = xpForLevel(REWARD_ANCHOR_LEVEL);   // 2,500

/** Damping on the level term. Scaling rewards by the FULL cost
 *  ratio would hold time-per-level constant to L60 — but the curve
 *  is deliberately shaped so "the last third of the ladder holds
 *  most of the XP", and a flat 1.0 exponent actually made L59
 *  faster than L25. 0.6 keeps the veteran era slower than the
 *  midgame (~1.7x the encounters per level) without the 7x wall
 *  it was. This is THE tuning dial — raise it to speed the
 *  endgame up, lower it to make the last levels weightier. */
const LEVEL_SCALE_EXP = 0.6;

/** How much richer the world should be for THIS hero than it is
 *  for an anchor-level hero. Clamped at 1 — a reward is never
 *  scaled DOWN, so the early game is untouched. Clamped at the
 *  cap's value so L60 (xpForLevel 0) doesn't collapse to zero. */
export function levelScale(fateLevel: number): number {
  const lv = Math.min(Math.max(fateLevel, 1), MAX_FATE_LEVEL - 1);
  return Math.max(1, Math.pow(xpForLevel(lv) / ANCHOR_XP, LEVEL_SCALE_EXP));
}

/** The currency scale — deliberately SOFTER than the XP scale.
 *  Veil Essence buys fixed-price things (restoration upgrades,
 *  future Reliquary sinks) whose costs do not ride the Fate
 *  curve. sqrt keeps a veteran meaningfully richer (L59 ~2.1x)
 *  without flooding those sinks. */
export function essenceScale(fateLevel: number): number {
  return Math.sqrt(levelScale(fateLevel));
}

// ── Readiness — how hard is THIS encounter for THIS hero ────
// Deliberately Fate-only, NOT Resonance-aware, so this service
// can compute it without a GearService injection and the client
// preview can promise exactly what the server pays.

export type ReadinessLevel = 'trivial' | 'even' | 'risky' | 'deadly';

/** The Fate level at which each tier is an even test. */
export const TIER_EVEN_FATE: Record<EncounterTier, number> = {
  minor: 3, wander: 12, dormant: 22, double: 32,
};

export function encounterReadiness(tier: EncounterTier, fateLevel: number): ReadinessLevel {
  const delta = fateLevel - (TIER_EVEN_FATE[tier] ?? TIER_EVEN_FATE.minor);
  if (delta >= 8)  return 'trivial';
  if (delta >= 0)  return 'even';
  if (delta >= -8) return 'risky';
  return 'deadly';
}

/** What risk is worth. Floored at 1.0 on purpose — see the header.
 *  trivial is the dial to turn down (0.75 is the intended resting
 *  value) once we are willing to nerf farming low tiers. */
export const RISK_MULT: Record<ReadinessLevel, number> = {
  trivial: 1.00,
  even:    1.15,
  risky:   1.40,
  deadly:  1.75,
};

export function riskMultiplier(tier: EncounterTier, fateLevel: number): number {
  return RISK_MULT[encounterReadiness(tier, fateLevel)];
}

// ── The flat tables, now read as "value at the anchor level" ──

/** Phase 2 Arc A tear-seal XP. Source of truth for the base amount. */
const SEAL_XP_AT_ANCHOR: Record<EncounterTier, number> = {
  minor:   50,
  wander:  100,
  dormant: 250,
  double:  500,
};

/** XP for a successful seal, scaled to the hero. */
export function sealXp(tier: string, fateLevel: number): number {
  const base = SEAL_XP_AT_ANCHOR[tier as EncounterTier] ?? 0;
  if (base === 0) return 0;
  return Math.round(base * levelScale(fateLevel) * riskMultiplier(tier as EncounterTier, fateLevel));
}

/** Fauna tiers map onto the same readiness ladder the client
 *  already uses for them (FaunaPreviewScreen reads a creature's
 *  tier through encounterReadiness). */
const FAUNA_TIER_AS_TEAR: Record<number, EncounterTier> = {
  1: 'minor', 2: 'wander', 3: 'dormant', 4: 'double',
};

/** XP for a banish, scaled to the hero. `base` stays the catalog's
 *  per-species value so species keep their relative worth. */
export function faunaXp(base: number, tier: number, fateLevel: number): number {
  const asTear = FAUNA_TIER_AS_TEAR[tier] ?? 'minor';
  return Math.round(base * levelScale(fateLevel) * riskMultiplier(asTear, fateLevel));
}

/** Quest-claim XP. Quests are the other large flat income source
 *  (~360 XP/day of the curve's assumed 1,000). No risk term —
 *  a quest has no tier — but it must ride the level curve or the
 *  daily/weekly ledger rots exactly like the seals did. */
export function questXp(base: number, fateLevel: number): number {
  if (!base || base <= 0) return 0;
  return Math.round(base * levelScale(fateLevel));
}
