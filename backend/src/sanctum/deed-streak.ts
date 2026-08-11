// ============================================================
// THE DEED STREAK — the reason to come back tomorrow.
//
// The gap this closes (2026-08-11): the app had no daily hook at
// all. Seven undifferentiated daily quests reset silently, and
// skipping a day cost nothing and was never mentioned. The only
// streak in the codebase was in training.service, over real-world
// pillars — nothing tracked showing up to the GAME.
//
// Three deliberate choices:
//
//  1. It advances on a DEED, not a login. Tim's locked rule that
//     XP comes from actions and never from opening a reward
//     container applies here too — a streak you can farm by
//     launching the app is a vanity number. Cache opens are
//     excluded for the same reason.
//
//  2. Breaking it costs NOTHING but the count. No debt, no decay
//     marker, no lost progress. Same ethic as the Oath, where
//     OATH_BROKEN_DEBT is 0 because a hard week is carried, not
//     punished.
//
//  3. It pays ESSENCE, not XP. Essence is the daily-loop currency
//     (hearth drip and battle reward already share the balance)
//     and it funds restoration, which is the cozy long game. Fate
//     XP would have collided with the actions-only rule.
// ============================================================

import { essenceScale } from '../leveling/reward-scale';

/** Days to reach the full daily payout. Past this the streak keeps
 *  counting — it is a record worth holding — but the essence stops
 *  climbing, so a long streak is pride rather than a runaway income
 *  a lapsed player can never catch up to. */
export const STREAK_REWARD_CAP_DAYS = 7;

/** Essence per streak-day at the anchor level, before the level
 *  scale. Day 1 pays 5, a held week pays 35 — set against the
 *  ~30-60/day essence income the restoration economy assumes, so
 *  it is felt without dominating. */
export const STREAK_ESSENCE_PER_DAY = 5;

export interface StreakAdvance {
  /** The streak after this deed. */
  streak:   number;
  /** The best streak this hero has ever held. */
  longest:  number;
  /** False when the day was already counted — the caller must not
   *  pay twice, and most deeds in a day land on this branch. */
  advanced: boolean;
  /** Essence owed for this advance. 0 when !advanced. */
  essence:  number;
}

/** Whole days between two 'YYYY-MM-DD' UTC dates, or null if either
 *  is unparseable. Date-only maths on purpose: the streak is about
 *  calendar days, not 24-hour windows. */
function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Advance the streak for a deed done on `today`.
 *
 * - same day  → no change, no pay (idempotent across a busy day)
 * - yesterday → continues
 * - older, unset, or unparseable → restarts at 1
 * - a date in the FUTURE (clock skew, a doctored client) → treated
 *   as already counted, so skew can never mint essence
 */
export function advanceDeedStreak(
  lastDeedDate: string | null,
  currentStreak: number,
  longestStreak: number,
  today: string,
  fateLevel: number,
): StreakAdvance {
  const held = Math.max(0, currentStreak);
  const best = Math.max(0, longestStreak);

  if (lastDeedDate) {
    const gap = daysBetween(lastDeedDate, today);
    if (gap !== null && gap <= 0) {
      // Today already counted, or the client's clock is ahead.
      return { streak: held, longest: best, advanced: false, essence: 0 };
    }
    if (gap === 1) {
      const streak = held + 1;
      return {
        streak,
        longest:  Math.max(best, streak),
        advanced: true,
        essence:  streakEssence(streak, fateLevel),
      };
    }
  }
  // No record, a gap, or an unreadable date — begin again at one.
  return {
    streak:   1,
    longest:  Math.max(best, 1),
    advanced: true,
    essence:  streakEssence(1, fateLevel),
  };
}

/** Essence for holding the streak to `streak` days, at this hero's
 *  place on the curve. Rides the same softened currency scale the
 *  seal economy uses, so a veteran's daily is worth a veteran's
 *  day without flooding the fixed-price restoration sinks. */
export function streakEssence(streak: number, fateLevel: number): number {
  const days = Math.min(Math.max(streak, 1), STREAK_REWARD_CAP_DAYS);
  return Math.round(STREAK_ESSENCE_PER_DAY * days * essenceScale(fateLevel));
}

/** Quest events that do NOT count as a deed. `cache_open` is a
 *  reward container, not an act — the same reason it grants no XP. */
const NON_DEED_EVENTS = new Set(['cache_open']);

export function isDeedEvent(eventType: string): boolean {
  return !NON_DEED_EVENTS.has(eventType);
}
