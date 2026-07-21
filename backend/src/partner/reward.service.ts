// ============================================================
// HEP Phase 2 Slice 1 — reward bundle applier
//
// One function that grants a resolved reward bundle to one hero,
// atomically, with attribution to the venue that earned it.
//
// ── Scope discipline (Tim, 2026-07-20) ─────────────────────────
// This is NEW code called by NEW endpoints only. It deliberately does
// NOT rewire any existing Codex grant path. The four raw
// `fateXp: { increment }` bypasses catalogued in Slice 0
// (quest.service, hunt-tracker, loot.service, demo.service) are left
// exactly as they are — migrating them is a separate, opt-in cleanup.
// The venue layer is a source of events into Codex, not a rewrite of it.
//
// ── Canon ──────────────────────────────────────────────────────
// XP is granted for COMPLETING THE EXPERIENCE — an action. Caches
// dropped by a run still pay no XP when opened. Venue runs must not
// become a loophole around that rule.
//
// Place at: src/partner/reward.service.ts
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LevelingService } from '../leveling/leveling.service';
import { EventsService } from '../events/events.service';
import { ResolvedReward } from './reward-policy';

export interface RewardAttribution {
  sourceId: string;
  /** Free-text provenance for the ledger, e.g. "run:<id>" or "claim:<id>". */
  trigger: string;
  runId?: string;
}

export interface AppliedReward {
  xp_granted: number;
  fate_level: number | null;
  leveled_up: boolean;
  fox_bonus: number;
  essence_granted: number;
  caches_granted: string[];
  titles_granted: string[];
}

@Injectable()
export class RewardService {
  private readonly logger = new Logger(RewardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leveling: LevelingService,
    private readonly events: EventsService,
  ) {}

  /**
   * Grant a resolved bundle to one hero.
   *
   * XP goes through LevelingService so venue XP obeys the canonical curve,
   * the L60 cap, the Fate Fox bonus, and the monotonic level guard — the
   * exact divergence Slice 0 found and fixed in the ingest path.
   *
   * Essence, caches and titles are written in a single transaction so a
   * partial failure cannot leave a hero paid for some of the bundle. XP is
   * granted outside that transaction because LevelingService owns its own
   * write; a failure after XP lands is reported rather than silently rolled
   * back, since taking XP back would violate the monotonic guarantee.
   */
  async apply(
    rootId: string,
    reward: ResolvedReward,
    attribution: RewardAttribution,
  ): Promise<AppliedReward> {
    const applied: AppliedReward = {
      xp_granted: 0,
      fate_level: null,
      leveled_up: false,
      fox_bonus: 0,
      essence_granted: 0,
      caches_granted: [],
      titles_granted: [],
    };

    if (reward.xp > 0) {
      const award = await this.leveling.grantXp(rootId, reward.xp);
      if (award) {
        applied.xp_granted = award.xp_gained;
        applied.fate_level = award.fate_level;
        applied.leveled_up = award.leveled_up;
        applied.fox_bonus = award.fox_bonus;
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (reward.essence > 0) {
        await tx.sanctumState.upsert({
          where: { rootId },
          create: { rootId, veilEssence: reward.essence },
          update: { veilEssence: { increment: reward.essence } },
        });
        applied.essence_granted = reward.essence;
      }

      for (const cache of reward.caches) {
        const created = await tx.fateCache.create({
          data: {
            rootId,
            cacheType: cache.type,
            rarity: cache.rarity ?? 'common',
            sourceId: attribution.sourceId,
            trigger: attribution.trigger,
          },
        });
        applied.caches_granted.push(created.id);
      }

      for (const titleId of reward.titles) {
        // A repeat visitor already holds the experience's title; that is
        // expected, not an error, so a duplicate is skipped rather than
        // failing the whole bundle.
        const exists = await tx.userTitle.findFirst({
          where: { rootId, titleId },
          select: { rootId: true },
        });
        if (exists) continue;

        const known = await tx.title.findUnique({ where: { id: titleId } });
        if (!known) {
          this.logger.warn(
            `Experience bundle references unknown title '${titleId}' — skipped`,
          );
          continue;
        }

        await tx.userTitle.create({
          data: { rootId, titleId, sourceId: attribution.sourceId },
        });
        applied.titles_granted.push(titleId);
      }
    });

    await this.events.log({
      rootId,
      eventType: 'venue.reward_granted',
      sourceId: attribution.sourceId,
      payload: {
        trigger: attribution.trigger,
        run_id: attribution.runId ?? null,
        multiplier: reward.multiplier,
        breakdown: reward.breakdown,
      },
      changes: applied as unknown as Record<string, unknown>,
    });

    this.logger.log(
      `Venue reward → ${rootId}: +${applied.xp_granted} XP ` +
        `(x${reward.multiplier.toFixed(2)}), ${applied.caches_granted.length} cache(s), ` +
        `${applied.titles_granted.length} title(s) [${attribution.trigger}]`,
    );

    return applied;
  }
}
