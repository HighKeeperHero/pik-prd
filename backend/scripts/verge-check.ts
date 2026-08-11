/**
 * verge-check.ts — assert the Verge ceiling holds against a hostile
 * or stale client.
 *
 *   npx tsx scripts/verge-check.ts
 *
 * Verge carries a reward multiplier of up to 2.4x on real XP and
 * essence, and the depth is CLAIMED by the client. This asserts the
 * clamp, and that an inflated claim is scaled back rather than paid.
 * A sign error here mints currency — one already slipped through in
 * review: clampVerge(x, Infinity) was used as a "no ceiling" sentinel,
 * but vergeCeiling treats a non-finite Resonance as 0, which inverted
 * the correction into a SECOND application of the multiplier.
 */
import {
  clampVerge, claimedVerge, vergeCeiling, vergeReward, VERGE_RESONANCE,
} from '../src/veil/verge';

let fail = 0;
const t = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); fail++; }
  else console.log(`ok   ${name} = ${JSON.stringify(got)}`);
};

console.log('— ceiling —');
t('naked hero', vergeCeiling(0), 0);
t('R44 just under I', vergeCeiling(44), 0);
t('R45 opens I', vergeCeiling(VERGE_RESONANCE[1]), 1);
t('R100 opens II', vergeCeiling(VERGE_RESONANCE[2]), 2);
t('R170 opens III', vergeCeiling(VERGE_RESONANCE[3]), 3);
t('R999 caps at III', vergeCeiling(999), 3);
t('NaN resonance', vergeCeiling(NaN as unknown as number), 0);

console.log('\n— clamp (the hostile-client path) —');
t('old client omits', clampVerge(undefined, 0), 0);
t('claims 3 with no gear', clampVerge(3, 0), 0);
t('claims 3 with R100', clampVerge(3, 100), 2);
t('claims 3 with R170', clampVerge(3, 170), 3);
t('claims 99', clampVerge(99, 999), 3);
t('claims -5', clampVerge(-5, 999), 0);
t('claims "3" string', clampVerge('3', 999), 3);
t('claims 2.7 float', clampVerge(2.7, 999), 2);
t('claims null', clampVerge(null, 999), 0);
t('claims {}', clampVerge({}, 999), 0);

// The essence roll already had the CLAIM folded in client-side, so
// the correction must be <= 1 for any over-claim and exactly 1 for an
// honest one. Anything above 1 is the engine paying the depth twice.
console.log('\n— essence correction (what a liar actually gets) —');
let inflated = 0;
for (const [claimed, res] of [[3, 0], [3, 100], [2, 0], [3, 170], [1, 45], [0, 0]] as const) {
  const honoured   = clampVerge(claimed, res);
  const correction = vergeReward(honoured) / vergeReward(claimedVerge(claimed));
  if (correction > 1) inflated++;
  console.log(`  claims ${claimed} at R${res} → honoured ${honoured}, essence x${correction.toFixed(3)}`);
}
t('no correction ever exceeds 1', inflated, 0);
t(
  'old client essence untouched',
  vergeReward(clampVerge(undefined, 0)) / vergeReward(claimedVerge(undefined)),
  1,
);

console.log(fail === 0 ? '\nAll verge checks passed.\n' : `\n${fail} CHECK(S) FAILED.\n`);
process.exit(fail === 0 ? 0 : 1);
