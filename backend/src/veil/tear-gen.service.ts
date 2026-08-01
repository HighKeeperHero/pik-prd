// backend/src/veil/tear-gen.service.ts
// Procedural tear generator. Given a grid cell and its population
// weight, deterministically produces the tears that live in that
// cell. Pure logic over the seeded PRNG in tear-gen.util — no DB
// access here; the caller (veil.service) fetches weights + seals.

import { Injectable } from '@nestjs/common';
import { cellKey as makeCellKey, cellMinCorner, isBlocked, rngFor } from './tear-gen.util';

export type Tier = 'T1' | 'T2' | 'T3' | 'T4';

export interface GenTear {
  tearId: string;
  lat: number;
  lon: number;
  tier: Tier;
  cellKey: string;
  regionLabel: string | null;
}

export interface GenParams {
  cellDeg: number;       // grid resolution in degrees
  densityFactor: number; // weight * densityFactor → expected raw count
  floorTears: number;    // min tears for any cell that has a pop_cell row
  maxPerCell: number;    // cap so a dense metro cell can't blow up payloads
  rotationMs: number;    // position-rotation window length
}

// Global distribution for what tier each generated slot IS. This is
// independent of the fate-band mix (RIFT_BANDS), which decides how
// many of each tier to RETURN within the player's radius. Cumulative
// thresholds: T1 .55, T2 .82, T3 .95, T4 1.0.
const TIER_CDF: Array<{ tier: Tier; cum: number }> = [
  { tier: 'T1', cum: 0.55 },
  { tier: 'T2', cum: 0.82 },
  { tier: 'T3', cum: 0.95 },
  { tier: 'T4', cum: 1.0 },
];

function tierFor(r: number): Tier {
  for (const entry of TIER_CDF) if (r < entry.cum) return entry.tier;
  return 'T4';
}

/** How many positions a slot may try before giving up.
 *
 *  An audit of 138 live tears on 2026-08-01 found 15% of them standing
 *  in water — a third of Seattle's in Puget Sound, New York's in the
 *  East River — because placement was uniform-random inside a 5.5 km
 *  cell with nothing to say no. This is the "no".
 *
 *  8 attempts clears a cell that's up to ~70% water with high
 *  probability while bounding the work at 8 PRNG draws. A slot that
 *  exhausts its attempts is DROPPED rather than placed anyway: a cell
 *  that is mostly lake should spawn fewer tears, and forcing the
 *  count would just put them back in the lake. */
const MAX_PLACEMENT_ATTEMPTS = 8;

@Injectable()
export class TearGenService {
  /** Deterministic tear list for one grid cell at a point in time.
   *  - count scales with population `weight` (floored/capped),
   *  - tier and existence are stable (seeded without epoch),
   *  - position rotates each `rotationMs` window so returning players
   *    don't see the identical points forever, while the tear_id
   *    (and therefore its name) stays permanent. */
  genCellTears(
    latIdx: number,
    lonIdx: number,
    weight: number,
    regionLabel: string | null,
    params: GenParams,
    nowMs: number,
    /** Sub-cell placement mask for this cell (see tear-gen.util).
     *  Null when the cell hasn't been masked yet — the mask is built
     *  incrementally across ~988k cells, so an absent mask must mean
     *  "place as before", not "place nothing". */
    blockMask?: Uint8Array | null,
  ): GenTear[] {
    const key = makeCellKey(latIdx, lonIdx);
    const raw = Math.round(weight * params.densityFactor);
    const count = Math.max(params.floorTears, Math.min(params.maxPerCell, raw));
    if (count <= 0) return [];

    const min = cellMinCorner(latIdx, lonIdx, params.cellDeg);
    const epoch = Math.floor(nowMs / params.rotationMs);
    const tears: GenTear[] = [];

    for (let s = 0; s < count; s++) {
      const tier = tierFor(rngFor(key, s, 'tier')());

      // Rejection sampling. Each attempt draws from its OWN seeded
      // stream (the attempt index is part of the key), so the result
      // stays deterministic — the same cell, slot and epoch always
      // land on the same point, mask or no mask.
      //
      // Adding `attempt` to the key changes every stream, so positions
      // shift for ALL tears on the first deploy, not only the ones
      // that were in water. That's harmless: `tearId` omits the epoch
      // and so is permanent (names and lore ride the id), and
      // positions already rotate every `rotationMs` by design.
      //
      // fLat runs south→north, fLon west→east — the mask is indexed
      // (row = fLat, col = fLon) from the cell's SW corner.
      let placed: { fLat: number; fLon: number } | null = null;
      for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
        const fLat = rngFor(key, s, 'lat', epoch, attempt)();
        const fLon = rngFor(key, s, 'lon', epoch, attempt)();
        if (!isBlocked(blockMask, fLon, fLat)) { placed = { fLat, fLon }; break; }
      }
      // Every attempt landed in water: this slot belongs to a cell
      // that is mostly lake or harbour. Leave it empty.
      if (!placed) continue;

      tears.push({
        tearId: `${key}#${s}`, // epoch deliberately omitted → permanent id
        lat: min.lat + placed.fLat * params.cellDeg,
        lon: min.lon + placed.fLon * params.cellDeg,
        tier,
        cellKey: key,
        regionLabel,
      });
    }
    return tears;
  }
}
