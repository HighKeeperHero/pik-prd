// ============================================================
// PIK — Leveling Service
//
// Fate XP curve per Phase 2 roadmap (docs/roadmap/phase-2.md,
// retuned 2026-07-09 — see the era constants below for the
// income math). The single source of truth — don't reimplement
// the curve elsewhere. Inject this service.
//
// Per canon (heroes-veritas-native:docs/canon/progression.md):
// Fate XP is the account-wide progression number. Drives
// Adventurer Rank and all content gates. Combat power is
// Resonance, which is gear-derived and computed separately.
//
// Reference cumulative XP (exact, from the era formulas):
//   L5  -> 169        (day one)
//   L10 -> 1,107      (~day 2-3)
//   L20 -> 6,704      (~2 weeks)
//   L30 -> 18,888     (~5-6 weeks)
//   L40 -> 39,201     (~11 weeks — the Job Quest gate)
//   L50 -> 79,503     (~5-6 months — the Fate Fox gate)
//   L60 -> 184,041    (~12 months — the cap)
// (Regenerate via xpToReach if constants change.)
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// ── The two-era curve (retuned 2026-07-09) ──────────────────
// Grounded in measured income: a committed daily player earns
// ~500-620 XP/day (rituals ~85 + daily quests ~135 + tear seals
// ~200 + amortized weeklies ~200). The old 80·n^1.5 put L40 at
// ~304k XP ≈ 20 months — 5x the stated 10-12 week target.
//
// Industry grammar for a daily-habit geo RPG (Pokémon GO caps,
// Genshin Adventure Ranks): a fast onboarding pop, a smooth
// progression era to the big unlock, then a compounding veteran
// era where the last third of the ladder holds most of the XP.
//
//   Era 1 (1-39):  xp(n) = floor(10 · n^1.5)      — progression
//   Era 2 (40-59): xp(n) = floor(xp(40) · 1.1^(n-40)) — veteran
//
// Calendar pacing at ~500 XP/day:
//   L5 day one (with the story-quest burst) · L10 ~day 2-3 ·
//   L20 ~2 weeks · L40 (Job) ~11 weeks · L50 (Fox) ~5-6 months ·
//   L60 (cap) ~12 months.
const E1_BASE   = 10;
const E1_EXP    = 1.5;
const E2_START  = 40;                                        // veteran era begins
const E2_STEP   = Math.floor(E1_BASE * Math.pow(E2_START, E1_EXP)); // 2,529
const E2_GROWTH = 1.10;                                      // +10% per level

/** Hard cap (Tim, 2026-07-09): Fate XP stops generating at L60.
 *  Cumulative XP clamps at xpToReach(60) — no overflow banking.
 *  Content gates for this version: Forge L5 · Job Quest L40 ·
 *  Fate Fox L50 · cap L60. */
export const MAX_FATE_LEVEL = 60;

/** XP required to go from level N to level N+1. Returns 0 at the
 *  cap — there is no next level to fund. */
export function xpForLevel(level: number): number {
  if (level < 1 || level >= MAX_FATE_LEVEL) return 0;
  if (level < E2_START) return Math.floor(E1_BASE * Math.pow(level, E1_EXP));
  return Math.floor(E2_STEP * Math.pow(E2_GROWTH, level - E2_START));
}

/** Cumulative XP required to reach level N from level 1. */
export function xpToReach(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let n = 1; n < level && n < MAX_FATE_LEVEL; n++) {
    total += xpForLevel(n);
  }
  return total;
}

/** Derive level from cumulative XP. Walks the curve from 1
 *  upward; clamps at MAX_FATE_LEVEL. */
export function levelFromXp(xp: number): number {
  if (xp < 0) return 1;
  let level = 1;
  while (level < MAX_FATE_LEVEL && xpToReach(level + 1) <= xp) level++;
  return level;
}

export interface XpAward {
  xp_gained:        number;
  fate_xp:          number;
  fate_level:       number;
  leveled_up:       boolean;
  /** Convenience for the iOS client — XP into the current level
   *  and XP needed to reach the next, so the progress bar
   *  doesn't need to re-derive the curve. */
  xp_in_level:      number;
  xp_to_next_level: number;
  /** Sprint 31 — extra XP added by the hero's bonded Fate Fox
   *  (canon § 6 modifier layer). 0 if no fox bonded. Reported
   *  separately so iOS can surface "Your fox lent its luck +N"
   *  in level-up or trial-result cinematics. */
  fox_bonus:        number;
}

@Injectable()
export class LevelingService {
  private readonly logger = new Logger(LevelingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Grant Fate XP atomically and return the updated state plus
   *  a leveled_up flag if this grant pushed the hero to a new
   *  Fate level. No-ops with a null return if the hero doesn't
   *  exist (caller should treat that as a missing entitlement,
   *  not a fatal error). */
  async grantXp(rootId: string, amount: number): Promise<XpAward | null> {
    if (amount <= 0) return null;
    const hero = await this.prisma.rootIdentity.findUnique({
      where:  { id: rootId },
      select: { fateXp: true, fateLevel: true, fateFox: true },
    });
    if (!hero) return null;

    // Sprint 31 — Fate Fox XP-yield modifier (canon § 6). Flat +5%
    // when a fox is bonded. Floored so partial points are absorbed
    // rather than producing half-XP grants.
    const foxBonus = hero.fateFox ? Math.floor(amount * 0.05) : 0;
    const totalGain = amount + foxBonus;

    // L60 cap: XP stops generating — clamp cumulative XP at the
    // cap's threshold. A fully-capped hero gets no award at all.
    const capXp     = xpToReach(MAX_FATE_LEVEL);
    const prevXp    = hero.fateXp ?? 0;
    if (prevXp >= capXp) return null;
    const newXp     = Math.min(prevXp + totalGain, capXp);
    const newLevel  = levelFromXp(newXp);
    const leveledUp = newLevel > (hero.fateLevel ?? 1);

    await this.prisma.rootIdentity.update({
      where: { id: rootId },
      data:  { fateXp: newXp, fateLevel: newLevel },
    });

    if (leveledUp) {
      this.logger.log(`Hero ${rootId} reached Fate level ${newLevel} (xp=${newXp})`);
    }

    const baseForLevel = xpToReach(newLevel);
    return {
      xp_gained:        newXp - prevXp,   // may be truncated at the cap
      fate_xp:          newXp,
      fate_level:       newLevel,
      leveled_up:       leveledUp,
      fox_bonus:        foxBonus,
      xp_in_level:      newXp - baseForLevel,
      xp_to_next_level: xpForLevel(newLevel),   // 0 at the cap
    };
  }
}
