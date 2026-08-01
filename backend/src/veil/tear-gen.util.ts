// backend/src/veil/tear-gen.util.ts
// Pure, dependency-free deterministic primitives for the procedural
// Veil. No DB, no NestJS — trivially unit-testable.
//
// The PRNG chain is FNV-1a (32-bit) → mulberry32. The FNV-1a here is
// byte-for-byte the same algorithm the CLIENT uses to pick a tear's
// name/lore (heroes-veritas-native/src/screens/Map/tearTypes.ts), so
// the two codebases share one hashing concept. Same inputs → same
// outputs on every platform and every run, which is what keeps a
// tear's identity (and therefore its name) stable forever.

/** Default grid cell size in degrees (~5.5 km of latitude). */
export const CELL_DEG_DEFAULT = 0.05;

/** FNV-1a 32-bit hash of a string → unsigned 32-bit int. Matches the
 *  client (basis 2166136261, prime 16777619). */
export function fnv1a(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG: a uint32 seed → a function yielding floats [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic PRNG stream keyed by an arbitrary list of parts,
 *  e.g. rngFor(cellKey, slot, 'tier'). Parts are joined with '|' so
 *  ('1', 2) and (1, '2') don't collide with (12). */
export function rngFor(...parts: Array<string | number>): () => number {
  return mulberry32(fnv1a(parts.join('|')));
}

/** Grid indices for a coordinate at the given cell size (degrees).
 *  Offset by +90 / +180 so indices are always non-negative. */
export function cellIndices(
  lat: number,
  lon: number,
  cellDeg: number,
): { latIdx: number; lonIdx: number } {
  return {
    latIdx: Math.floor((lat + 90) / cellDeg),
    lonIdx: Math.floor((lon + 180) / cellDeg),
  };
}

/** Canonical cell key string: "{latIdx}:{lonIdx}". ASCII, stable. */
export function cellKey(latIdx: number, lonIdx: number): string {
  return `${latIdx}:${lonIdx}`;
}

export function cellKeyForCoord(lat: number, lon: number, cellDeg: number): string {
  const { latIdx, lonIdx } = cellIndices(lat, lon, cellDeg);
  return cellKey(latIdx, lonIdx);
}

/** Parse a cell key back into its indices. */
export function parseCellKey(key: string): { latIdx: number; lonIdx: number } {
  const [a, b] = key.split(':');
  return { latIdx: parseInt(a, 10), lonIdx: parseInt(b, 10) };
}

/** Lower-left (minimum) corner of a cell, in degrees. */
export function cellMinCorner(
  latIdx: number,
  lonIdx: number,
  cellDeg: number,
): { lat: number; lon: number } {
  return { lat: latIdx * cellDeg - 90, lon: lonIdx * cellDeg - 180 };
}

// ── Placement mask ───────────────────────────────────────────────
// A cell is divided into MASK_DIM × MASK_DIM sub-cells; one bit each,
// row-major from the cell's SOUTH-WEST corner (row = latitude index,
// ascending north; col = longitude index, ascending east). A set bit
// means "a tear must not be placed here" — water today, possibly
// motorway corridors later.
//
// 16 × 16 over a 0.05° cell is ~344 m per sub-cell, which resolves the
// water that actually caused the problem (bays, harbours, lakes and
// the wider rivers) at 32 bytes per cell. Finer would resolve creeks
// and cost proportionally more to build and store; coarser stops
// seeing the East River.

export const MASK_DIM = 16;
export const MASK_BYTES = (MASK_DIM * MASK_DIM) / 8; // 32

/** Bit index for a sub-cell. `col`/`row` are 0..MASK_DIM-1. */
export function maskBitIndex(row: number, col: number): number {
  return row * MASK_DIM + col;
}

export function maskGet(mask: Uint8Array, row: number, col: number): boolean {
  const bit = maskBitIndex(row, col);
  return (mask[bit >> 3] & (1 << (bit & 7))) !== 0;
}

export function maskSet(mask: Uint8Array, row: number, col: number): void {
  const bit = maskBitIndex(row, col);
  mask[bit >> 3] |= 1 << (bit & 7);
}

/** Is the position at fractional offsets (rx, ry) within a cell
 *  blocked? `rx` runs west→east, `ry` south→north, both in [0,1).
 *  A null/short mask means "we have no data here" — which must read
 *  as ALLOWED, never as blocked, or an unmasked cell would stop
 *  spawning entirely. */
export function isBlocked(
  mask: Uint8Array | null | undefined,
  rx: number,
  ry: number,
): boolean {
  if (!mask || mask.length < MASK_BYTES) return false;
  const col = Math.min(MASK_DIM - 1, Math.max(0, Math.floor(rx * MASK_DIM)));
  const row = Math.min(MASK_DIM - 1, Math.max(0, Math.floor(ry * MASK_DIM)));
  return maskGet(mask, row, col);
}

/** Fraction of a cell that is blocked, 0..1. Used to report coverage
 *  and to explain a cell that legitimately spawns nothing. */
export function maskBlockedFraction(mask: Uint8Array | null | undefined): number {
  if (!mask || mask.length < MASK_BYTES) return 0;
  let bits = 0;
  for (let i = 0; i < MASK_BYTES; i++) {
    let b = mask[i];
    while (b) { bits += b & 1; b >>= 1; }
  }
  return bits / (MASK_DIM * MASK_DIM);
}

/** Geographic center of a cell, in degrees. */
export function cellCenter(
  latIdx: number,
  lonIdx: number,
  cellDeg: number,
): { lat: number; lon: number } {
  const min = cellMinCorner(latIdx, lonIdx, cellDeg);
  return { lat: min.lat + cellDeg / 2, lon: min.lon + cellDeg / 2 };
}
