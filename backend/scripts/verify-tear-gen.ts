// backend/scripts/verify-tear-gen.ts
// Pure-unit verification of the procedural generator — no DB, no server.
//   npm run verify:tear-gen
// Exits non-zero on any failed assertion.

import { fnv1a, CELL_DEG_DEFAULT } from '../src/veil/tear-gen.util';
import { TearGenService, type GenParams } from '../src/veil/tear-gen.service';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.error(`  ✗ ${name} ${detail}`);
    failures++;
  }
}

const gen = new TearGenService();
const params: GenParams = {
  cellDeg: CELL_DEG_DEFAULT,
  densityFactor: 1,
  floorTears: 3,
  maxPerCell: 40,
  rotationMs: 24 * 3600 * 1000,
};
const t0 = 1_700_000_000_000;

// 1. FNV-1a pinned to client-computed vectors (protects name stability —
//    the client hashes tear_id the same way to pick a name/lore).
console.log('FNV-1a client parity:');
check("fnv1a('veil')", fnv1a('veil') === 35523297, `got ${fnv1a('veil')}`);
check("fnv1a('2575:2117#3')", fnv1a('2575:2117#3') === 3143523949, `got ${fnv1a('2575:2117#3')}`);
check("fnv1a('heroes-veritas')", fnv1a('heroes-veritas') === 1806294264, `got ${fnv1a('heroes-veritas')}`);

// 2. Determinism within an epoch.
console.log('Determinism:');
const a = gen.genCellTears(1500, 2400, 20, 'x-ca', params, t0);
const b = gen.genCellTears(1500, 2400, 20, 'x-ca', params, t0);
check('identical id+tier+pos within epoch', JSON.stringify(a) === JSON.stringify(b));

// 3. Across epochs: ids + tiers stable, positions move.
console.log('Epoch rotation:');
const c = gen.genCellTears(1500, 2400, 20, 'x-ca', params, t0 + 25 * 3600 * 1000);
check('ids stable across epochs', a.map((t) => t.tearId).join() === c.map((t) => t.tearId).join());
check('tiers stable across epochs', a.map((t) => t.tier).join() === c.map((t) => t.tier).join());
check('positions move across epochs', a.some((t, i) => t.lat !== c[i].lat || t.lon !== c[i].lon));

// 4. Count clamping.
console.log('Count clamping:');
check('weight 0 → floor (3)', gen.genCellTears(1, 1, 0, 'r', params, t0).length === 3);
check('weight 999 → cap (40)', gen.genCellTears(1, 1, 999, 'r', params, t0).length === 40);
check('weight 12 → 12', gen.genCellTears(1, 1, 12, 'r', params, t0).length === 12);

// 5. tear_id format / uniqueness / ASCII.
console.log('IDs:');
const ids = gen.genCellTears(1500, 2400, 40, 'r', params, t0).map((t) => t.tearId);
check('unique', new Set(ids).size === ids.length);
check('format {cellKey}#{slot}', ids.every((id) => /^\d+:\d+#\d+$/.test(id)));
check('ASCII printable', ids.every((id) => /^[\x20-\x7e]+$/.test(id)));

// 6. Positions inside cell bounds.
console.log('Position bounds:');
const tears = gen.genCellTears(1500, 2400, 40, 'r', params, t0);
const minLat = 1500 * CELL_DEG_DEFAULT - 90;
const minLon = 2400 * CELL_DEG_DEFAULT - 180;
check('lat in cell', tears.every((t) => t.lat >= minLat && t.lat < minLat + CELL_DEG_DEFAULT));
check('lon in cell', tears.every((t) => t.lon >= minLon && t.lon < minLon + CELL_DEG_DEFAULT));

// 7. Tier distribution ≈ CDF (T1 .55 / T2 .27 / T3 .13 / T4 .05).
console.log('Tier distribution (~8000 samples):');
const counts: Record<string, number> = { T1: 0, T2: 0, T3: 0, T4: 0 };
let total = 0;
for (let li = 1000; li < 1200; li++) {
  for (const t of gen.genCellTears(li, 2400, 40, 'r', params, t0)) {
    counts[t.tier]++;
    total++;
  }
}
const f = (k: string) => counts[k] / total;
check('T1 ≈ 0.55', Math.abs(f('T1') - 0.55) < 0.05, `${f('T1').toFixed(3)}`);
check('T2 ≈ 0.27', Math.abs(f('T2') - 0.27) < 0.05, `${f('T2').toFixed(3)}`);
check('T3 ≈ 0.13', Math.abs(f('T3') - 0.13) < 0.04, `${f('T3').toFixed(3)}`);
check('T4 ≈ 0.05', Math.abs(f('T4') - 0.05) < 0.03, `${f('T4').toFixed(3)}`);

console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
