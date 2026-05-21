// ============================================================
// PIK — Leveling Service
//
// Fate XP curve per Phase 2 roadmap (docs/roadmap/phase-2.md):
//   xp_to_next_level(n) = floor(80 * n ^ 1.5)
//
// Front-loaded easy, exponentially harder. Daily-active player
// targeted to reach L40 in 10-12 weeks. The single source of
// truth — don't reimplement the curve elsewhere. Inject this
// service.
//
// Per canon (heroes-veritas-native:docs/canon/progression.md):
// Fate XP is the account-wide progression number. Drives
// Adventurer Rank and all content gates. Combat power is
// Resonance, which is gear-derived and computed separately.
//
// Reference cumulative XP:
//   L5  -> 1,500
//   L10 -> 7,000
//   L20 -> 36,000
//   L30 -> 100,000
//   L40 -> 210,000
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const BASE = 80;
const EXP  = 1.5;

/** XP required to go from level N to level N+1. */
export function xpForLevel(level: number): number {
  if (level < 1) return 0;
  return Math.floor(BASE * Math.pow(level, EXP));
}

/** Cumulative XP required to reach level N from level 1. */
export function xpToReach(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let n = 1; n < level; n++) total += xpForLevel(n);
  return total;
}

/** Derive level from cumulative XP. Walks the curve from 1
 *  upward. The curve is monotonic so this terminates quickly. */
export function levelFromXp(xp: number): number {
  if (xp < 0) return 1;
  let level = 1;
  while (xpToReach(level + 1) <= xp) level++;
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

    const newXp     = (hero.fateXp ?? 0) + totalGain;
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
      xp_gained:        totalGain,
      fate_xp:          newXp,
      fate_level:       newLevel,
      leveled_up:       leveledUp,
      fox_bonus:        foxBonus,
      xp_in_level:      newXp - baseForLevel,
      xp_to_next_level: xpForLevel(newLevel),
    };
  }
}
