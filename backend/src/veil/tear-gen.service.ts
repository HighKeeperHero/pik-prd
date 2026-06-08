// backend/src/veil/tear-gen.service.ts
// Procedural tear generator. Given a grid cell and its population
// weight, deterministically produces the tears that live in that
// cell. Pure logic over the seeded PRNG in tear-gen.util — no DB
// access here; the caller (veil.service) fetches weights + seals.

import { Injectable } from '@nestjs/common';
import { cellKey as makeCellKey, cellMinCorner, rngFor } from './tear-gen.util';

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
      const rx = rngFor(key, s, 'lat', epoch)();
      const ry = rngFor(key, s, 'lon', epoch)();
      tears.push({
        tearId: `${key}#${s}`, // epoch deliberately omitted → permanent id
        lat: min.lat + rx * params.cellDeg,
        lon: min.lon + ry * params.cellDeg,
        tier,
        cellKey: key,
        regionLabel,
      });
    }
    return tears;
  }
}
