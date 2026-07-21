// ============================================================
// HEP Phase 2 Slice 1 — outcome-weighted payout policy
//
// Turns "what happened in the room" into "what the bundle pays".
//
// Tim's model (2026-07-21): contribution is weighted against the total
// available points.
//
//   victory   → 1.00 + 0.05 per milestone hit, bonus capped at +0.20
//   timeout   → 0.50   (60-minute timer expires without victory)
//   abandoned → 0.00   (party walked out)
//
// So a flawless run pays 1.20x and a timeout pays 0.50x.
//
// Discrete rewards (caches, titles) are GATED rather than scaled — you
// cannot grant half a cache. The default gate is 1.00, so a timeout pays
// partial XP but no loot: victory stays meaningful while a losing party
// still goes home with progress.
//
// Every constant is read from Experience.rewards.scaling, never hardcoded.
// Tim expects to recalibrate once live, and the engineering commitment is
// that no recalibration requires a deploy.
//
// Pure functions — no DB, no injection — so the economy is unit-testable
// without standing up the app.
//
// Place at: src/partner/reward-policy.ts
// ============================================================

/** How a run ended. Reported by the venue runtime, never inferred by Heroes. */
export type RunOutcome = 'victory' | 'timeout' | 'abandoned';

/** Tunables, stored in Experience.rewards.scaling. */
export interface RewardScaling {
  milestoneBonusEach: number;
  milestoneBonusCap: number;
  timeoutMultiplier: number;
  abandonedMultiplier: number;
  /** Minimum multiplier at which non-divisible rewards are granted. */
  discreteRewardMinMultiplier: number;
}

export const DEFAULT_SCALING: RewardScaling = {
  milestoneBonusEach: 0.05,
  milestoneBonusCap: 0.2,
  timeoutMultiplier: 0.5,
  abandonedMultiplier: 0,
  discreteRewardMinMultiplier: 1.0,
};

/** The reward bundle as authored on an Experience row. */
export interface RewardBundle {
  xp?: number;
  essence?: number;
  caches?: { type: string; rarity?: string }[];
  titles?: string[];
  scaling?: Partial<RewardScaling>;
}

/** What a single participant actually earns. */
export interface ResolvedReward {
  xp: number;
  essence: number;
  caches: { type: string; rarity?: string }[];
  titles: string[];
  multiplier: number;
  /** Recorded so a payout can be explained months later. */
  breakdown: {
    outcome: RunOutcome;
    milestonesHit: number;
    milestoneBonus: number;
    venueMultiplier: number;
    discreteRewardsGranted: boolean;
  };
}

export function resolveScaling(bundle: RewardBundle): RewardScaling {
  return { ...DEFAULT_SCALING, ...(bundle.scaling ?? {}) };
}

/**
 * The payout multiplier for a run, before the venue-level multiplier.
 *
 * Milestones are clamped at zero — a venue reporting a negative count must not
 * be able to drive the payout below the victory base.
 */
export function outcomeMultiplier(
  outcome: RunOutcome,
  milestonesHit: number,
  scaling: RewardScaling,
): { multiplier: number; milestoneBonus: number } {
  if (outcome === 'abandoned') {
    return { multiplier: scaling.abandonedMultiplier, milestoneBonus: 0 };
  }
  if (outcome === 'timeout') {
    return { multiplier: scaling.timeoutMultiplier, milestoneBonus: 0 };
  }

  const hits = Math.max(0, Math.floor(milestonesHit));
  const milestoneBonus = Math.min(
    hits * scaling.milestoneBonusEach,
    scaling.milestoneBonusCap,
  );
  return { multiplier: 1 + milestoneBonus, milestoneBonus };
}

/**
 * Apply the multiplier to a bundle.
 *
 * Numeric rewards scale and floor — partial points are absorbed rather than
 * producing fractional XP, matching how LevelingService treats the Fate Fox
 * bonus. Discrete rewards are all-or-nothing at the gate.
 */
export function resolveReward(
  bundle: RewardBundle,
  outcome: RunOutcome,
  milestonesHit: number,
  venueMultiplier = 1,
): ResolvedReward {
  const scaling = resolveScaling(bundle);
  const { multiplier: outcomeMult, milestoneBonus } = outcomeMultiplier(
    outcome,
    milestonesHit,
    scaling,
  );

  // A venue multiplier is a promotional dial; it must not turn a payout
  // negative, and a zeroed outcome stays zero regardless.
  const venue = Math.max(0, venueMultiplier);
  const effective = outcomeMult * venue;

  const grantDiscrete =
    effective >= scaling.discreteRewardMinMultiplier && outcomeMult > 0;

  return {
    xp: Math.floor((bundle.xp ?? 0) * effective),
    essence: Math.floor((bundle.essence ?? 0) * effective),
    caches: grantDiscrete ? (bundle.caches ?? []) : [],
    titles: grantDiscrete ? (bundle.titles ?? []) : [],
    multiplier: effective,
    breakdown: {
      outcome,
      milestonesHit: Math.max(0, Math.floor(milestonesHit)),
      milestoneBonus,
      venueMultiplier: venue,
      discreteRewardsGranted: grantDiscrete,
    },
  };
}
