// backend/scripts/seed-pop-grid.ts
// Rasterizes a population dataset (GeoNames cities1000, CC-BY 4.0)
// into the `pop_cell` grid that drives procedural Veil generation.
// Run explicitly — NOT part of `migrate deploy` (too large/slow):
//
//   npm run seed:pop            # compute + write to the DB
//   npm run seed:pop -- --dry-run   # compute + print stats, no DB write
//
// Each city's population is spread into nearby cells with a Gaussian
// falloff so density is realistic (and so land around a town is
// covered, not just the exact point). Per-cell weight ≈ the expected
// number of tears that cell spawns; the service clamps to
// [floor, maxPerCell] and the fate-band mix caps what's returned.
//
// Attribution: this data is © GeoNames (https://www.geonames.org/),
// licensed CC-BY 4.0. See NOTICE.

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  CELL_DEG_DEFAULT,
  cellIndices,
  cellKey as makeCellKey,
  cellCenter,
} from '../src/veil/tear-gen.util';

// ── Tunables (mirror service PROC_DEFAULTS where relevant) ──────────
const CELL_DEG       = CELL_DEG_DEFAULT; // 0.05°
const KERNEL_RADIUS  = 2;                // cells of Gaussian spread (5×5)
const KERNEL_SIGMA   = 1.0;              // in cell units
const MIN_CELL_POP   = 200;              // drop ultra-faint spread cells
const FLOOR_WEIGHT   = 3;                // min weight for any kept cell (blanket)
const MAX_WEIGHT     = 40;               // cap (matches service maxPerCell)
// weight = clamp(LOG_SLOPE*log1p(pop) - LOG_OFFSET, FLOOR, MAX)
const LOG_SLOPE      = 4.0;
const LOG_OFFSET     = 23.0;
const BATCH          = 5000;

const DATA_FILE = path.join(__dirname, '..', 'data', 'cities1000.csv');

interface Cell {
  latIdx: number;
  lonIdx: number;
  pop: number;          // accumulated, kernel-weighted
  bestContrib: number;  // strongest single-city contribution (for region label)
  region: string | null;
}

function slugify(name: string, admin: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const a = (admin || '').trim().toLowerCase();
  return a ? `${base}-${a}` : base;
}

function weightFor(pop: number): number {
  const w = LOG_SLOPE * Math.log1p(pop) - LOG_OFFSET;
  return Math.max(FLOOR_WEIGHT, Math.min(MAX_WEIGHT, w));
}

function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (!fs.existsSync(DATA_FILE)) {
    console.error(`[seed-pop-grid] missing data file: ${DATA_FILE}`);
    process.exit(1);
  }

  const lines = fs.readFileSync(DATA_FILE, 'utf8').split('\n');
  const cells = new Map<string, Cell>();
  let cityCount = 0;

  // Precompute kernel weights.
  const kernel: Array<{ dy: number; dx: number; w: number }> = [];
  for (let dy = -KERNEL_RADIUS; dy <= KERNEL_RADIUS; dy++) {
    for (let dx = -KERNEL_RADIUS; dx <= KERNEL_RADIUS; dx++) {
      kernel.push({ dy, dx, w: Math.exp(-(dy * dy + dx * dx) / (2 * KERNEL_SIGMA * KERNEL_SIGMA)) });
    }
  }

  for (let i = 1; i < lines.length; i++) { // skip header
    const line = lines[i];
    if (!line) continue;
    const [latS, lonS, popS, name, , admin1] = line.split(',');
    const lat = parseFloat(latS);
    const lon = parseFloat(lonS);
    const pop = Math.max(0, parseInt(popS, 10) || 0);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || pop <= 0) continue;
    cityCount++;

    const { latIdx, lonIdx } = cellIndices(lat, lon, CELL_DEG);
    const region = slugify(name, admin1);

    for (const k of kernel) {
      const li = latIdx + k.dy;
      const oi = lonIdx + k.dx;
      const key = makeCellKey(li, oi);
      const contrib = pop * k.w;
      let cell = cells.get(key);
      if (!cell) {
        cell = { latIdx: li, lonIdx: oi, pop: 0, bestContrib: 0, region: null };
        cells.set(key, cell);
      }
      cell.pop += contrib;
      if (contrib > cell.bestContrib) {
        cell.bestContrib = contrib;
        cell.region = region;
      }
    }
  }

  // Materialize rows, dropping faint cells.
  const rows: Array<{ cellKey: string; weight: number; regionLabel: string | null; centerLat: number; centerLon: number }> = [];
  for (const [key, cell] of cells) {
    if (cell.pop < MIN_CELL_POP) continue;
    const c = cellCenter(cell.latIdx, cell.lonIdx, CELL_DEG);
    rows.push({
      cellKey: key,
      weight: Math.round(weightFor(cell.pop) * 100) / 100,
      regionLabel: cell.region,
      centerLat: Math.round(c.lat * 1e6) / 1e6,
      centerLon: Math.round(c.lon * 1e6) / 1e6,
    });
  }

  // Stats
  const weights = rows.map((r) => r.weight).sort((a, b) => a - b);
  const pct = (p: number) => weights[Math.floor((weights.length - 1) * p)];
  console.log(`[seed-pop-grid] cities used: ${cityCount.toLocaleString()}`);
  console.log(`[seed-pop-grid] grid cells:  ${rows.length.toLocaleString()}`);
  console.log(`[seed-pop-grid] weight p10/p50/p90/max: ${pct(0.1)} / ${pct(0.5)} / ${pct(0.9)} / ${weights[weights.length - 1]}`);
  console.log(`[seed-pop-grid] floored (=${FLOOR_WEIGHT}) cells: ${(weights.filter((w) => w === FLOOR_WEIGHT).length / weights.length * 100).toFixed(1)}%`);
  const sf = rows.find((r) => r.regionLabel?.startsWith('san-francisco'));
  if (sf) console.log(`[seed-pop-grid] sample SF cell: ${sf.cellKey} weight=${sf.weight} region=${sf.regionLabel}`);

  if (dryRun) {
    console.log('[seed-pop-grid] --dry-run: no DB writes.');
    return;
  }

  void writeToDb(rows);
}

async function writeToDb(rows: Array<{ cellKey: string; weight: number; regionLabel: string | null; centerLat: number; centerLon: number }>) {
  const prisma = new PrismaClient();
  try {
    console.log('[seed-pop-grid] clearing pop_cell …');
    await prisma.popCell.deleteMany({});
    console.log(`[seed-pop-grid] inserting ${rows.length.toLocaleString()} rows in batches of ${BATCH} …`);
    for (let i = 0; i < rows.length; i += BATCH) {
      await prisma.popCell.createMany({ data: rows.slice(i, i + BATCH), skipDuplicates: true });
      if (i % (BATCH * 10) === 0) process.stdout.write('.');
    }
    console.log('\n[seed-pop-grid] done.');
  } finally {
    await prisma.$disconnect();
  }
}

main();
