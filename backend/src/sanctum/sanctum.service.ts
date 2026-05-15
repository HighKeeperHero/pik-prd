// ============================================================
// PIK — Sanctum Service
//
// In-app daily-ritual state for the iOS Heroes Veritas app.
// One row per hero. Daily reset is by UTC date (computed
// server-side; client-supplied dates are advisory).
//
// Behaviors:
//   - getOrCreateState: ensures a row exists for the hero
//   - claimHearth:      idempotent for the UTC day; awards
//                       HEARTH_REWARD Veil Essence the first
//                       time it succeeds, no-op afterwards
//   - swearOath:        records one of forge|lore|veil for
//                       the UTC day; second call same day
//                       throws AlreadySworn
// ============================================================

import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LevelingService, levelFromXp, xpForLevel, xpToReach } from '../leveling/leveling.service';

export type OathOption = 'forge' | 'lore' | 'veil';
const VALID_OATHS: ReadonlyArray<OathOption> = ['forge', 'lore', 'veil'];

const HEARTH_REWARD = 5;

// Phase 2 Arc A — XP grants on daily ritual actions.
const XP_HEARTH = 25;
const XP_OATH   = 25;

// Sprint 30 Slice 5.1 — Veil Trial reward shape.
//   * Essence: 1 per "catch" (score), capped so a perfect run
//     can't out-yield a Hearth + Oath. Trial is the snackable
//     dopamine layer, not the primary income.
//   * Fate XP: small flat bonus so the loop still ladders into
//     Adventurer Rank progression — but small enough that it
//     doesn't compete with battles / chapters for primary XP.
const TRIAL_ESSENCE_PER_CATCH = 1;
const TRIAL_ESSENCE_MAX       = 20;
const XP_TRIAL                = 10;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class SanctumService {
  constructor(
    private readonly prisma:   PrismaService,
    private readonly leveling: LevelingService,
  ) {}

  async getOrCreateState(rootId: string) {
    const existing = await this.prisma.sanctumState.findUnique({ where: { rootId } });
    const state = existing ?? await this.prisma.sanctumState.create({ data: { rootId } });
    return this.attachProgression(rootId, state);
  }

  /** Append Fate progression (level + XP) to a sanctum_state row.
   *  The client uses this as the canonical level source so the
   *  Sanctum screen can render "LVL N" + XP progress bar without
   *  needing a second API call. Fate XP per canon (progression.md
   *  §2) drives Adventurer Rank and content gates. */
  private async attachProgression<T extends { rootId: string }>(rootId: string, state: T) {
    const hero = await this.prisma.rootIdentity.findUnique({
      where:  { id: rootId },
      select: { fateXp: true, fateLevel: true },
    });
    const fateXp       = hero?.fateXp ?? 0;
    // Derive Fate level fresh from XP — the stored fateLevel may lag
    // if a non-LevelingService path granted XP without recomputing.
    const fateLevel    = levelFromXp(fateXp);
    const xpInLevel    = fateXp - xpToReach(fateLevel);
    const xpToNextLvl  = xpForLevel(fateLevel);
    return {
      ...state,
      fateLevel,
      fateXp,
      xpInLevel,
      xpToNextLevel: xpToNextLvl,
    };
  }

  async claimHearth(rootId: string) {
    const today = todayUtc();
    const state = await this.getOrCreateState(rootId);
    if (state.lastHearthClaim === today) {
      throw new ConflictException('Hearth already tended today.');
    }
    const updated = await this.prisma.sanctumState.update({
      where: { rootId },
      data: {
        veilEssence:       { increment: HEARTH_REWARD },
        lastHearthClaim:   today,
        totalHearthClaims: { increment: 1 },
      },
    });
    const xpAward     = await this.leveling.grantXp(rootId, XP_HEARTH);
    const withProgress = await this.attachProgression(rootId, updated);
    return { ...withProgress, xp_award: xpAward };
  }

  async swearOath(rootId: string, option: OathOption) {
    if (!VALID_OATHS.includes(option)) {
      throw new BadRequestException(`Invalid oath option: ${option}`);
    }
    const today = todayUtc();
    const state = await this.getOrCreateState(rootId);
    if (state.oathTodayDate === today) {
      throw new ConflictException('Oath already sworn today.');
    }
    const updated = await this.prisma.sanctumState.update({
      where: { rootId },
      data: {
        oathTodayDate:    today,
        oathTodayOption:  option,
        totalOathsSworn:  { increment: 1 },
      },
    });
    const xpAward      = await this.leveling.grantXp(rootId, XP_OATH);
    const withProgress = await this.attachProgression(rootId, updated);
    return { ...withProgress, xp_award: xpAward };
  }

  /** Awarded amount for hearth claim — exposed so the controller can echo it back. */
  static readonly HEARTH_REWARD = HEARTH_REWARD;

  /** Sprint 30 / Slice 5.1 — Veil Trial completion.
   *
   *  Daily snackable minigame; one run per UTC day per hero. The
   *  client posts the score it tallied client-side; the server
   *  caps it via TRIAL_ESSENCE_MAX so a fudged client can't
   *  out-yield the cap. Tighten with server-side rate / duration
   *  validation in a later slice if abuse appears.
   *
   *  Reward: Veil Essence = min(score, max) + small flat Fate XP. */
  async completeTrial(rootId: string, score: number) {
    if (!Number.isFinite(score) || score < 0) {
      throw new BadRequestException('Trial score must be a non-negative number.');
    }
    const today = todayUtc();
    const state = await this.getOrCreateState(rootId);
    if ((state as { lastTrialComplete?: string | null }).lastTrialComplete === today) {
      throw new ConflictException('Veil Trial already completed today.');
    }

    const essence = Math.min(
      Math.floor(score) * TRIAL_ESSENCE_PER_CATCH,
      TRIAL_ESSENCE_MAX,
    );
    const newBest = Math.max(
      (state as { bestTrialScore?: number }).bestTrialScore ?? 0,
      Math.floor(score),
    );

    const updated = await this.prisma.sanctumState.update({
      where: { rootId },
      data: {
        veilEssence:        { increment: essence },
        lastTrialComplete:  today,
        totalTrials:        { increment: 1 },
        bestTrialScore:     newBest,
      },
    });
    const xpAward      = await this.leveling.grantXp(rootId, XP_TRIAL);
    const withProgress = await this.attachProgression(rootId, updated);
    return {
      ...withProgress,
      xp_award: xpAward,
      essence_granted: essence,
      score:           Math.floor(score),
      best:            newBest,
    };
  }
}
