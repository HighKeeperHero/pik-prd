// ============================================================
// The oath week — one definition, shared by the oath and the quests.
//
// Oath v2 weeks start SUNDAY 00:00 UTC. Quest weeks are ISO weeks and
// start MONDAY. That one-day skew is why no quest may COUNT oath events
// per quest week: a hero who swears on a Sunday (the last day of one ISO
// week) and next on a Monday leaves the ISO week between them with
// nothing to swear. Quests ask "is this hero under oath right now?"
// instead — see QuestLogService.underOath().
// ============================================================

/** Sunday-start UTC week key, e.g. "2026-09-13". */
export function oathWeekKey(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().split('T')[0];
}

/** Oath statuses that mean the hero stands under this week's oath.
 *  A `broken` oath (resolveOath) no longer binds, so it doesn't count. */
export const UNDER_OATH_STATUSES = ['pending', 'kept'] as const;
