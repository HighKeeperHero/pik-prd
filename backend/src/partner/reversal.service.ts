// ============================================================
// HEP Phase 2 — reward reversal
//
// The identity kernel is append-only, and until now that meant a
// mis-granted reward was permanent. A venue integration that loops, a
// misconfigured bundle, a leaked key used before anyone noticed — the
// payout ceiling caps the blast radius, but capping is not correcting.
// A ceiling with no undo is half a control.
//
// ── How this respects append-only ──────────────────────────────
// Nothing is deleted and no history is rewritten. A reversal writes a
// COMPENSATING entry: the ledger records both the grant and its
// reversal, so the hero's story remains a true account of what
// happened, including the mistake. That is the honest shape for a
// system whose whole premise is a persistent record.
//
// ── What it will and will not take back ────────────────────────
// XP and essence are reduced, floored at zero — a hero is never pushed
// negative, and a level once reached is NOT taken back (LevelingService
// holds that guarantee, and revoking a level a player saw would be a
// worse harm than the over-grant).
//
// Caches are revoked ONLY while still sealed. Once opened, the contents
// are in the player's inventory and entangled with their decisions;
// clawing that back would break more than it fixes. An opened cache is
// reported as unrecoverable rather than silently ignored.
//
// Platform-admin only. A venue can never reverse its own payouts —
// that would let a partner rewrite a player's history.
//
// Place at: src/partner/reversal.service.ts
// ============================================================

import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';

export interface ReversalOutcome {
  run_id: string;
  reason: string;
  participants: {
    root_id: string | null;
    xp_reversed: number;
    essence_reversed: number;
    caches_revoked: number;
    caches_already_opened: number;
    titles_left: string[];
  }[];
  totals: { xp: number; essence: number; caches: number };
}

@Injectable()
export class ReversalService {
  private readonly logger = new Logger(ReversalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  /**
   * Reverse every payout made by one run.
   *
   * Idempotent: a run already reversed refuses rather than double-docking.
   */
  async reverseRun(runId: string, reason: string): Promise<ReversalOutcome> {
    const run = await this.prisma.experienceRun.findUnique({
      where: { id: runId },
      include: { participants: true },
    });
    if (!run) throw new NotFoundException(`Run not found: ${runId}`);

    const already = (run.outcome ?? {}) as Record<string, unknown>;
    if (already.reversed) {
      throw new ConflictException('This run has already been reversed');
    }

    const results: ReversalOutcome['participants'] = [];
    const totals = { xp: 0, essence: 0, caches: 0 };

    for (const seat of run.participants) {
      // Only applied seats moved anything. Pending guest claims are
      // voided by revoking the claim instead (below).
      if (seat.rewardState !== 'applied' || !seat.rootId) {
        if (seat.rewardState === 'pending') {
          await this.prisma.guestClaim
            .updateMany({
              where: { participantId: seat.id, status: 'pending' },
              data: { status: 'expired' },
            })
            .catch(() => undefined);
          await this.prisma.runParticipant.update({
            where: { id: seat.id },
            data: { rewardState: 'expired' },
          });
        }
        continue;
      }

      const applied = (seat.rewards ?? {}) as Record<string, any>;
      const xp = Number(applied.xp_granted ?? 0);
      const essence = Number(applied.essence_granted ?? 0);
      const cacheIds: string[] = applied.caches_granted ?? [];
      const titles: string[] = applied.titles_granted ?? [];

      // ── XP, floored at zero ──────────────────────────────────
      let xpReversed = 0;
      if (xp > 0) {
        const hero = await this.prisma.rootIdentity.findUnique({
          where: { id: seat.rootId },
          select: { fateXp: true },
        });
        const current = hero?.fateXp ?? 0;
        xpReversed = Math.min(xp, current);
        if (xpReversed > 0) {
          await this.prisma.rootIdentity.update({
            where: { id: seat.rootId },
            // fateLevel deliberately untouched — a level once reached is
            // never taken back. XP re-accrues into it.
            data: { fateXp: current - xpReversed },
          });
        }
      }

      // ── Essence, floored at zero ─────────────────────────────
      let essenceReversed = 0;
      if (essence > 0) {
        const sanctum = await this.prisma.sanctumState.findUnique({
          where: { rootId: seat.rootId },
          select: { veilEssence: true },
        });
        const current = sanctum?.veilEssence ?? 0;
        essenceReversed = Math.min(essence, current);
        if (essenceReversed > 0) {
          await this.prisma.sanctumState.update({
            where: { rootId: seat.rootId },
            data: { veilEssence: current - essenceReversed },
          });
        }
      }

      // ── Caches, only while sealed ────────────────────────────
      let revoked = 0;
      let opened = 0;
      for (const cacheId of cacheIds) {
        const cache = await this.prisma.fateCache.findUnique({
          where: { id: cacheId },
          select: { status: true },
        });
        if (!cache) continue;
        if (cache.status === 'sealed') {
          await this.prisma.fateCache.delete({ where: { id: cacheId } });
          revoked++;
        } else {
          opened++;
        }
      }

      totals.xp += xpReversed;
      totals.essence += essenceReversed;
      totals.caches += revoked;

      results.push({
        root_id: seat.rootId,
        xp_reversed: xpReversed,
        essence_reversed: essenceReversed,
        caches_revoked: revoked,
        caches_already_opened: opened,
        // Titles are identity, not currency. Stripping one a player has
        // worn is a different kind of harm from correcting a number, so
        // they are reported and left alone.
        titles_left: titles,
      });

      await this.prisma.runParticipant.update({
        where: { id: seat.id },
        data: { rewardState: 'reversed' },
      });

      // The compensating entry. History gains a correction; it does not
      // lose the original.
      await this.events.log({
        rootId: seat.rootId,
        eventType: 'venue.reward_reversed',
        sourceId: run.sourceId,
        payload: { run_id: runId, reason },
        changes: {
          xp_reversed: xpReversed,
          essence_reversed: essenceReversed,
          caches_revoked: revoked,
          caches_already_opened: opened,
          titles_left: titles,
        },
      });
    }

    await this.prisma.experienceRun.update({
      where: { id: runId },
      data: {
        outcome: { ...already, reversed: true, reversal_reason: reason } as never,
      },
    });

    this.logger.warn(
      `REVERSAL: run ${runId} — ${totals.xp} XP, ${totals.essence} essence, ` +
        `${totals.caches} cache(s) reversed across ${results.length} seat(s). Reason: ${reason}`,
    );

    return { run_id: runId, reason, participants: results, totals };
  }
}
