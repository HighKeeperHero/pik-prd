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

/** Geographic center of a cell, in degrees. */
export function cellCenter(
  latIdx: number,
  lonIdx: number,
  cellDeg: number,
): { lat: number; lon: number } {
  const min = cellMinCorner(latIdx, lonIdx, cellDeg);
  return { lat: min.lat + cellDeg / 2, lon: min.lon + cellDeg / 2 };
}
