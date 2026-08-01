// backend/scripts/seed-water-mask.ts
// Builds the per-cell placement mask that keeps procedural tears out
// of the water.
//
// WHY: an audit of 138 live tears on 2026-08-01 found 15% of them
// standing in water — 8 of Seattle's 24 in Puget Sound, New York's in
// the East River, one of Folsom's in the American River. Placement was
// uniform-random inside a 5.5 km cell and nothing in the pipeline had
// ever seen a coastline: the population source (GeoNames cities1000)
// is city centroids and population, nothing else.
//
// HOW: read Mapbox Streets v8 vector tiles, take the `water` layer,
// and rasterize each pop_cell into a 16×16 bitmap (~344 m per
// sub-cell, 32 bytes). tear-gen then rejection-samples against it.
//
//   npx tsx scripts/seed-water-mask.ts --bbox=-125,32,-114,42     # California
//   npx tsx scripts/seed-water-mask.ts --bbox=... --dry-run       # count only
//   npx tsx scripts/seed-water-mask.ts --bbox=... --force         # re-mask
//
//   DATABASE_URL="$(railway variables --environment production \
//     --service pik-prd --json | jq -r .DATABASE_PUBLIC_URL)" \
//     MAPBOX_TOKEN=pk.… npx tsx scripts/seed-water-mask.ts --bbox=…
//
// RESUMABLE AND PARTIAL BY DESIGN. There are ~988k cells worldwide;
// this is meant to be run region by region. A cell with no mask
// generates exactly as it did before, so a half-built mask degrades
// coverage, never correctness. `--stats` reports how much of the
// world is covered.

import { PrismaClient } from '@prisma/client';
import { VectorTile } from '@mapbox/vector-tile';
// pbf v4 dropped the default export in favour of named
// PbfReader/PbfWriter — `import Pbf from 'pbf'` yields undefined and
// fails only at construction time.
import { PbfReader } from 'pbf';
import {
  CELL_DEG_DEFAULT, MASK_BYTES, MASK_DIM,
  maskSet, maskGet, maskBlockedFraction, parseCellKey, cellMinCorner,
} from '../src/veil/tear-gen.util';

const CELL_DEG = CELL_DEG_DEFAULT;

/** Source zoom. z11 tiles are ~0.176°, so one tile covers ~3.5×3.5 of
 *  our cells — about 12 cells per fetch. Coarser (z10) starts dropping
 *  the narrower rivers from the water layer; finer (z12) quadruples
 *  the request count for detail below the mask's own 344 m grid. */
const TILE_Z = 11;
const MASK_SRC = `water@z${TILE_Z}`;

/** Concurrent tile fetches. Mapbox's default rate limit is generous
 *  but not infinite, and this is a background job — there is no reason
 *  to race it. */
const CONCURRENCY = 8;
const WRITE_BATCH = 500;

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=')[1];
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

// ── Tile maths ───────────────────────────────────────────────────
const lon2tile = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2tile = (lat: number, z: number) =>
  Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z,
  );

/** Ray-casting point-in-polygon over a GeoJSON ring, in lon/lat. */
function inRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

interface Poly { rings: number[][][]; minLon: number; minLat: number; maxLon: number; maxLat: number }

/** Outer ring plus holes, with a bbox so the hot loop can reject fast. */
function toPolys(coords: number[][][][] | number[][][], multi: boolean): Poly[] {
  const groups = (multi ? coords : [coords]) as number[][][][];
  const out: Poly[] = [];
  for (const rings of groups) {
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const [lon, lat] of rings[0]) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    out.push({ rings, minLon, minLat, maxLon, maxLat });
  }
  return out;
}

function isWater(lon: number, lat: number, polys: Poly[]): boolean {
  for (const p of polys) {
    if (lon < p.minLon || lon > p.maxLon || lat < p.minLat || lat > p.maxLat) continue;
    if (!inRing(lon, lat, p.rings[0])) continue;
    // Inside the outer ring — unless it falls in a hole (an island).
    let hole = false;
    for (let h = 1; h < p.rings.length; h++) {
      if (inRing(lon, lat, p.rings[h])) { hole = true; break; }
    }
    if (!hole) return true;
  }
  return false;
}

const tileCache = new Map<string, Poly[]>();

async function waterPolysFor(z: number, x: number, y: number, token: string): Promise<Poly[]> {
  const key = `${z}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached) return cached;

  const url = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/${z}/${x}/${y}.mvt?access_token=${token}`;
  let polys: Poly[] = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    // 404 is a legitimate answer: the tile has no data (open ocean is
    // not tiled as water — it's the ABSENCE of land). Treat as empty
    // and let the cell stay unmasked rather than guessing.
    if (res.status === 404) break;
    if (!res.ok) { await new Promise((r) => setTimeout(r, 500 * (attempt + 1))); continue; }

    const tile = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer())) as never);
    const layer = tile.layers['water'];
    if (!layer) break;
    for (let i = 0; i < layer.length; i++) {
      const geo = layer.feature(i).toGeoJSON(x, y, z).geometry;
      if (geo.type === 'Polygon') polys = polys.concat(toPolys(geo.coordinates, false));
      else if (geo.type === 'MultiPolygon') polys = polys.concat(toPolys(geo.coordinates, true));
    }
    break;
  }
  tileCache.set(key, polys);
  return polys;
}

/** Rasterize one cell: test the CENTRE of each sub-cell. */
async function maskForCell(cellKey: string, token: string): Promise<Uint8Array> {
  const { latIdx, lonIdx } = parseCellKey(cellKey);
  const min = cellMinCorner(latIdx, lonIdx, CELL_DEG);
  const step = CELL_DEG / MASK_DIM;
  const mask = new Uint8Array(MASK_BYTES);

  for (let row = 0; row < MASK_DIM; row++) {
    const lat = min.lat + (row + 0.5) * step;
    for (let col = 0; col < MASK_DIM; col++) {
      const lon = min.lon + (col + 0.5) * step;
      const polys = await waterPolysFor(TILE_Z, lon2tile(lon, TILE_Z), lat2tile(lat, TILE_Z), token);
      if (polys.length && isWater(lon, lat, polys)) maskSet(mask, row, col);
    }
  }
  return mask;
}

/** Mask one cell and print it, without touching the database.
 *  `#` is blocked, `.` is placeable — the fastest way to see whether
 *  the rasterizer agrees with a coastline you can picture.
 *
 *    npx tsx scripts/seed-water-mask.ts --probe=-122.3321,47.6062 */
async function probe(lonLat: string, token: string) {
  const [lon, lat] = lonLat.split(',').map(Number);
  const latIdx = Math.floor((lat + 90) / CELL_DEG);
  const lonIdx = Math.floor((lon + 180) / CELL_DEG);
  const key = `${latIdx}:${lonIdx}`;
  const mask = await maskForCell(key, token);
  const min = cellMinCorner(latIdx, lonIdx, CELL_DEG);

  console.log(`cell ${key}  SW ${min.lat.toFixed(4)},${min.lon.toFixed(4)}  → NE ${(min.lat + CELL_DEG).toFixed(4)},${(min.lon + CELL_DEG).toFixed(4)}`);
  console.log(`blocked: ${(maskBlockedFraction(mask) * 100).toFixed(0)}%   (north is up)`);
  for (let row = MASK_DIM - 1; row >= 0; row--) {
    let line = '';
    for (let col = 0; col < MASK_DIM; col++) line += maskGet(mask, row, col) ? '#' : '.';
    console.log('  ' + line);
  }
}

async function main() {
  const token = process.env.MAPBOX_TOKEN;
  if (hasFlag('stats')) return stats();
  if (!token) { console.error('MAPBOX_TOKEN is required'); process.exit(1); }

  const probePoint = arg('probe');
  if (probePoint) return probe(probePoint, token);

  const bbox = arg('bbox');
  if (!bbox) {
    console.error('--bbox=minLon,minLat,maxLon,maxLat is required (this runs region by region)');
    process.exit(1);
  }
  const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(Number);
  const dryRun = hasFlag('dry-run');
  const force  = hasFlag('force');

  const cells = await prisma.popCell.findMany({
    where: {
      centerLat: { gte: minLat, lte: maxLat },
      centerLon: { gte: minLon, lte: maxLon },
      ...(force ? {} : { blockMask: null }),
    },
    select: { cellKey: true },
  });
  console.log(`[water-mask] ${cells.length.toLocaleString()} cells in bbox${force ? '' : ' without a mask'}`);
  if (dryRun || cells.length === 0) return;

  let done = 0, blockedCells = 0, blockedSubTotal = 0;
  const pending: Array<{ cellKey: string; mask: Buffer }> = [];

  const flush = async () => {
    if (!pending.length) return;
    // One UPDATE per cell — Postgres has no multi-row upsert for
    // distinct BYTEA values, and this runs in the background.
    await prisma.$transaction(
      pending.map((p) =>
        prisma.popCell.update({
          where: { cellKey: p.cellKey },
          data:  { blockMask: p.mask, blockMaskSrc: MASK_SRC },
        }),
      ),
    );
    pending.length = 0;
  };

  const queue = [...cells];
  const worker = async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      const mask = await maskForCell(next.cellKey, token);
      const frac = maskBlockedFraction(mask);
      if (frac > 0) { blockedCells++; blockedSubTotal += frac; }
      pending.push({ cellKey: next.cellKey, mask: Buffer.from(mask) });
      done++;
      if (pending.length >= WRITE_BATCH) await flush();
      if (done % 250 === 0) {
        console.log(`[water-mask] ${done}/${cells.length}  cells with water: ${blockedCells}  tiles cached: ${tileCache.size}`);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await flush();

  console.log(
    `\n[water-mask] done. ${done.toLocaleString()} cells masked; ` +
    `${blockedCells.toLocaleString()} contain water ` +
    `(mean ${blockedCells ? ((blockedSubTotal / blockedCells) * 100).toFixed(0) : 0}% of those cells blocked).`,
  );
  await stats();
}

async function stats() {
  const total  = await prisma.popCell.count();
  const masked = await prisma.popCell.count({ where: { blockMask: { not: null } } });
  console.log(`[water-mask] coverage: ${masked.toLocaleString()} / ${total.toLocaleString()} cells (${((100 * masked) / total).toFixed(2)}%)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
