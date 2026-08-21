// ============================================================
// Payout policy — offline verification
//
// reward-policy.ts is pure by design ("unit-testable without standing up
// the app") and had no test. verify-slice1.ts covers the same ground but
// needs a live server, an admin key and a real hero, so nobody runs it
// while editing the economy — which is exactly when it is worth running.
//
// This needs nothing. `npm run verify:payout` and read the exit code.
//
// Usage:
//   npx ts-node scripts/verify-payout-policy.ts
// ============================================================

import {
  DEFAULT_SCALING,
  RUN_OUTCOMES,
  RewardBundle,
  RunOutcome,
  outcomeMultiplier,
  resolveReward,
  resolveScaling,
} from '../src/partner/reward-policy';

let failures = 0;

function check(name: string, passed: boolean, detail?: unknown) {
  if (passed) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`);
    if (detail !== undefined) console.error(`      ${JSON.stringify(detail)}`);
  }
}

function near(a: number, b: number, tol = 1e-9) {
  return Math.abs(a - b) < tol;
}

const BUNDLE: RewardBundle = {
  xp: 600,
  essence: 50,
  caches: [{ type: 'venue_run', rarity: 'uncommon' }],
  titles: ['title_kingvale_echo'],
};

const S = DEFAULT_SCALING;
const mult = (o: RunOutcome, m = 0) => outcomeMultiplier(o, m, S).multiplier;

console.log('\nPayout policy\n');

// ── The table as documented ──────────────────────────────────
console.log('Documented multipliers');
check('victory, no milestones = 1.00', near(mult('victory', 0), 1.0));
check('victory, 4 milestones = 1.20', near(mult('victory', 4), 1.2));
check('victory bonus caps at +0.20', near(mult('victory', 99), 1.2));
check('timeout = 0.50', near(mult('timeout', 3), 0.5));
check('abandoned = 0.00', near(mult('abandoned', 3), 0));

// ── tracking_lost ────────────────────────────────────────────
console.log('\ntracking_lost');
check('base, no milestones = 0.75', near(mult('tracking_lost', 0), 0.75));
check('3 milestones = 0.90', near(mult('tracking_lost', 3), 0.9));
check(
  'scales with progress (more milestones pay more)',
  mult('tracking_lost', 4) > mult('tracking_lost', 1),
);
check(
  'always pays more than an abandonment — the entire point',
  mult('tracking_lost', 0) > mult('abandoned', 0),
);
check(
  'always pays more than a timeout: their failure vs ours',
  mult('tracking_lost', 0) > mult('timeout', 0),
);

// The clamp. A tuned-up base must not outrun a completed run.
console.log('\ntracking_lost cannot beat a victory');
check(
  'never exceeds 1.00 at default scaling',
  RUN_OUTCOMES.every(() => mult('tracking_lost', 99) <= 1.0),
  { at99: mult('tracking_lost', 99) },
);
{
  const reckless = { ...S, trackingLostBase: 5 };
  const m = outcomeMultiplier('tracking_lost', 99, reckless).multiplier;
  check('clamped even when the dial is turned to 5.0', near(m, 1.0), { m });
}
{
  // The reported bonus must describe the payout, not the intent.
  const b = outcomeMultiplier('tracking_lost', 99, S);
  check(
    'reported milestoneBonus matches what was actually paid',
    near(b.multiplier - S.trackingLostBase, b.milestoneBonus),
    b,
  );
}
{
  const negative = { ...S, trackingLostBase: -2 };
  const m = outcomeMultiplier('tracking_lost', 0, negative).multiplier;
  check('a negative base floors at 0, never inverts', m >= 0, { m });
}

// ── Resolved bundles ─────────────────────────────────────────
console.log('\nResolved bundle');
{
  const r = resolveReward(BUNDLE, 'tracking_lost', 2);
  check('pays XP', r.xp === Math.floor(600 * 0.85), { xp: r.xp });
  check('pays essence', r.essence === Math.floor(50 * 0.85), {
    essence: r.essence,
  });
  check('no cache — the run was not finished', r.caches.length === 0);
  check('no title — the run was not finished', r.titles.length === 0);
  check('breakdown records the outcome', r.breakdown.outcome === 'tracking_lost');
}
{
  const abandoned = resolveReward(BUNDLE, 'abandoned', 2);
  const lost = resolveReward(BUNDLE, 'tracking_lost', 2);
  check('an abandoned party still gets nothing', abandoned.xp === 0);
  check('a guest is not charged for our tracking failure', lost.xp > 0, {
    abandoned: abandoned.xp,
    lost: lost.xp,
  });
}
{
  // The venue multiplier is promotional and must not create the exploit
  // the clamp exists to prevent... at the outcome level. It scales all
  // outcomes equally, so the ordering is what matters.
  const lost = resolveReward(BUNDLE, 'tracking_lost', 4, 1.5);
  const win = resolveReward(BUNDLE, 'victory', 4, 1.5);
  check('victory still outpays tracking_lost under a venue bonus', win.xp > lost.xp, {
    win: win.xp,
    lost: lost.xp,
  });
}

// ── Retuning without a deploy ────────────────────────────────
console.log('\nTunability');
{
  const tuned: RewardBundle = { ...BUNDLE, scaling: { trackingLostBase: 0.9 } };
  const r = resolveReward(tuned, 'tracking_lost', 0);
  check('Experience.rewards.scaling overrides the default', r.multiplier === 0.9, {
    multiplier: r.multiplier,
  });
  check(
    'an unset key still falls back to the default',
    resolveScaling(tuned).timeoutMultiplier === 0.5,
  );
}
{
  // Rows seeded before 2026-08-14 have no trackingLostBase at all.
  const legacy: RewardBundle = {
    ...BUNDLE,
    scaling: {
      milestoneBonusEach: 0.05,
      milestoneBonusCap: 0.2,
      timeoutMultiplier: 0.5,
      abandonedMultiplier: 0,
      discreteRewardMinMultiplier: 1.0,
    } as never,
  };
  check(
    'an Experience row predating this change still settles correctly',
    resolveReward(legacy, 'tracking_lost', 0).multiplier === 0.75,
  );
}

// ── Every outcome is handled ─────────────────────────────────
console.log('\nExhaustiveness');
for (const o of RUN_OUTCOMES) {
  const m = mult(o, 2);
  check(`${o} yields a finite, non-negative multiplier`, Number.isFinite(m) && m >= 0, {
    o,
    m,
  });
}

console.log(
  failures === 0
    ? '\nAll payout policy checks passed.\n'
    : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
