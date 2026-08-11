/**
 * deed-streak-check.ts — assert the daily streak advances, resets and
 * pays correctly.
 *
 *   npx tsx scripts/deed-streak-check.ts
 *
 * The streak writes real essence on a schedule driven by dates, which
 * is where off-by-one and clock-skew bugs live. It is also called on
 * EVERY quest event, so the same-day fast path has to be exact or a
 * busy day pays many times.
 */
import { advanceDeedStreak, streakEssence, isDeedEvent, STREAK_REWARD_CAP_DAYS } from '../src/sanctum/deed-streak';

let fail = 0;
const t = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); fail++; }
  else console.log(`ok   ${name}`);
};
const adv = (last: string | null, streak: number, today: string) =>
  advanceDeedStreak(last, streak, streak, today, 1);

console.log('— advancing —');
t('first ever deed',        adv(null, 0, '2026-08-11').streak, 1);
t('consecutive day',        adv('2026-08-10', 4, '2026-08-11').streak, 5);
t('across a month bound',   adv('2026-07-31', 9, '2026-08-01').streak, 10);
t('same day does not pay',  adv('2026-08-11', 5, '2026-08-11').advanced, false);
t('same day keeps count',   adv('2026-08-11', 5, '2026-08-11').streak, 5);
t('one day missed resets',  adv('2026-08-09', 30, '2026-08-11').streak, 1);
t('long absence resets',    adv('2026-01-01', 99, '2026-08-11').streak, 1);
t('garbage date resets',    adv('not-a-date', 7, '2026-08-11').streak, 1);
t('future date pays nothing', adv('2026-08-12', 5, '2026-08-11').advanced, false);

console.log('\n— longest is a high-water mark —');
t('reset keeps the record',
  advanceDeedStreak('2026-01-01', 99, 99, '2026-08-11', 1).longest, 99);
t('growth raises it',
  advanceDeedStreak('2026-08-10', 9, 9, '2026-08-11', 1).longest, 10);

console.log('\n— payout —');
t('day 1 at L1', streakEssence(1, 1), 5);
t('day 7 at L1', streakEssence(7, 1), 35);
t('caps past 7', streakEssence(60, 1), streakEssence(STREAK_REWARD_CAP_DAYS, 1));
t('never pays 0', streakEssence(0, 1) > 0, true);
const l1 = streakEssence(7, 1), l59 = streakEssence(7, 59);
t('veteran earns more', l59 > l1, true);
t('but not runaway (<3x)', l59 < l1 * 3, true);
console.log(`     L1 week ${l1} → L59 week ${l59}`);
t('no pay when not advanced', adv('2026-08-11', 5, '2026-08-11').essence, 0);

console.log('\n— what counts as a deed —');
t('a seal counts',      isDeedEvent('tear_seal'), true);
t('a rite counts',      isDeedEvent('rite'), true);
t('a ritual counts',    isDeedEvent('hearth'), true);
t('a cache open does not', isDeedEvent('cache_open'), false);

console.log(fail === 0 ? '\nAll deed-streak checks passed.\n' : `\n${fail} CHECK(S) FAILED.\n`);
process.exit(fail === 0 ? 0 : 1);
