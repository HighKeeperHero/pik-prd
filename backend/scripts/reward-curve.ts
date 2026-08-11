/**
 * reward-curve.ts — inspect and regression-check the reward scale.
 *
 *   npx tsx scripts/reward-curve.ts
 *
 * The reward economy has no unit tests and one very sharp failure
 * mode: a tuning change that silently nerfs a live alpha's income.
 * This prints the whole curve and asserts the three properties the
 * scale is designed to hold. Run it after touching ANY constant in
 * src/leveling/reward-scale.ts — especially LEVEL_SCALE_EXP.
 */
import { xpForLevel } from '../src/leveling/leveling.service';
import {
  levelScale, essenceScale, riskMultiplier, encounterReadiness,
  sealXp, REWARD_ANCHOR_LEVEL, type EncounterTier,
} from '../src/leveling/reward-scale';

const FLAT: Record<EncounterTier, number> = { minor: 50, wander: 100, dormant: 250, double: 500 };
const TIERS: EncounterTier[] = ['minor', 'wander', 'dormant', 'double'];

/** Mirrors RIFT_BANDS in veil.service.ts — the tier mix a hero of
 *  this level actually sees on the map. */
function mix(level: number): Record<EncounterTier, number> {
  if (level <= 5)  return { minor: .60, wander: .30, dormant: .08, double: .02 };
  if (level <= 15) return { minor: .45, wander: .35, dormant: .15, double: .05 };
  if (level <= 30) return { minor: .30, wander: .35, dormant: .25, double: .10 };
  if (level <= 40) return { minor: .20, wander: .30, dormant: .30, double: .20 };
  if (level <= 50) return { minor: .12, wander: .24, dormant: .34, double: .30 };
  return             { minor: .06, wander: .18, dormant: .36, double: .40 };
}

const oldAvg = (L: number) => TIERS.reduce((s, t) => s + mix(L)[t] * FLAT[t], 0);
const newAvg = (L: number) => TIERS.reduce((s, t) => s + mix(L)[t] * sealXp(t, L), 0);

console.log(`anchor level ${REWARD_ANCHOR_LEVEL}\n`);
console.log('lvl | lvlScale | essScale | avg XP/seal old → new | seals/level old → new');
console.log('----+----------+----------+-----------------------+----------------------');
for (const L of [1, 5, 10, 15, 20, 25, 26, 30, 35, 39, 40, 45, 50, 55, 59]) {
  const cost = xpForLevel(L);
  console.log(
    `${String(L).padStart(3)} | ${levelScale(L).toFixed(2).padStart(8)} | ${essenceScale(L).toFixed(2).padStart(8)} |` +
    ` ${oldAvg(L).toFixed(0).padStart(9)} → ${newAvg(L).toFixed(0).padStart(7)} |` +
    ` ${(cost / oldAvg(L)).toFixed(0).padStart(9)} → ${(cost / newAvg(L)).toFixed(0).padStart(7)}`,
  );
}

let failures = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`\n${ok ? 'PASS' : 'FAIL'} — ${name}\n      ${detail}`);
  if (!ok) failures++;
};

// 1. No regression, anywhere. A live alpha must never wake up poorer.
let worst = Infinity, worstAt = '';
for (let L = 1; L < 60; L++) for (const t of TIERS) {
  const r = sealXp(t, L) / FLAT[t];
  if (r < worst) { worst = r; worstAt = `${t}@L${L}`; }
}
check('no reward is ever smaller than the old flat table',
  worst >= 1, `min new/old ratio ${worst.toFixed(3)} at ${worstAt}`);

// 2. Below the anchor, content the hero has outgrown is untouched.
const drifted = [];
for (let L = 1; L <= REWARD_ANCHOR_LEVEL; L++) for (const t of TIERS) {
  if (encounterReadiness(t, L) === 'trivial' && sealXp(t, L) !== FLAT[t]) drifted.push(`${t}@L${L}`);
}
check(`L1-${REWARD_ANCHOR_LEVEL} trivial content is byte-identical`,
  drifted.length === 0, drifted.length ? drifted.join(', ') : 'all trivial payouts unchanged');

// 3. The veteran era stays weightier than the midgame, but is not a wall.
const spl = (L: number) => xpForLevel(L) / newAvg(L);
const ratio = spl(59) / spl(REWARD_ANCHOR_LEVEL);
check('endgame is slower per level than the anchor, but under 3x',
  ratio > 1 && ratio < 3,
  `seals/level L${REWARD_ANCHOR_LEVEL} ${spl(REWARD_ANCHOR_LEVEL).toFixed(0)} → L59 ${spl(59).toFixed(0)} (${ratio.toFixed(1)}x)` +
  `  [was ${(xpForLevel(59) / oldAvg(59) / (xpForLevel(25) / oldAvg(25))).toFixed(1)}x]`);

// 4. Risk actually pays where the tier ladder has headroom.
check('a low-level hero is paid more for a tear above their weight',
  riskMultiplier('double', 5) > riskMultiplier('double', 40),
  `double @L5 x${riskMultiplier('double', 5)} vs @L40 x${riskMultiplier('double', 40)}`);

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} CHECK(S) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
