// ============================================================
// PIK — Job progression constants (canon §13.4)
//
// A JobXP track independent of Fate XP. Job Level and JobRank are
// both DERIVED from the stored jobXp — nothing else is persisted.
// Job Level gates class depth (Doctrine, Phase 4); the six ranks
// are the endgame ladder. Pure functions — no DI, importable by
// both the JobService (reads) and the LevelingService (grant hook).
//
// Curve is deliberately tunable (Tim may retune the economy): a
// hero only earns JobXP after choosing a Job at Fate L40, so the
// track is sized to reach Grandmaster around the Fate cap at the
// same income. jobXpToReach(50) ≈ 153k with these constants.
// ============================================================

export const MAX_JOB_LEVEL = 50;
const JOB_BASE = 16;
const JOB_EXP  = 1.6;

/** XP required to advance from job level N to N+1. 0 at the cap. */
export function jobXpForLevel(level: number): number {
  if (level < 1 || level >= MAX_JOB_LEVEL) return 0;
  return Math.floor(JOB_BASE * Math.pow(level, JOB_EXP));
}

/** Cumulative XP to reach job level N (jobXpToReach(1) === 0). */
export function jobXpToReach(level: number): number {
  let sum = 0;
  for (let l = 1; l < level; l++) sum += jobXpForLevel(l);
  return sum;
}

/** Derive job level from cumulative jobXp (monotonic; fixed curve). */
export function jobLevelFromXp(xp: number): number {
  let level = 1;
  while (level < MAX_JOB_LEVEL && xp >= jobXpToReach(level + 1)) level++;
  return level;
}

export interface JobRankTier { name: string; minLevel: number; }

/** The six-rank endgame ladder (canon §13.4). */
export const JOB_RANKS: JobRankTier[] = [
  { name: 'Initiate',    minLevel: 1  },
  { name: 'Adept',       minLevel: 10 },
  { name: 'Veteran',     minLevel: 20 },
  { name: 'Elite',       minLevel: 30 },
  { name: 'Master',      minLevel: 40 },
  { name: 'Grandmaster', minLevel: 50 },
];

export function jobRankForLevel(level: number): string {
  let rank = JOB_RANKS[0].name;
  for (const t of JOB_RANKS) if (level >= t.minLevel) rank = t.name;
  return rank;
}

/** The next rank above the given level, or null at Grandmaster. */
export function nextJobRank(level: number): JobRankTier | null {
  return JOB_RANKS.find(t => t.minLevel > level) ?? null;
}
