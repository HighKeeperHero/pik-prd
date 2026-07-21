// ============================================================
// HEP Phase 2 — stale run and claim sweeper
//
// Two things rotted quietly because nothing ever closed them out, and
// both corrupted the exact numbers a partner judges the platform on:
//
//   • A party that walks out leaves its run `active` FOREVER. Since
//     completion_rate counts only runs that ended, an abandoned run was
//     simply excluded — so the rate silently INFLATED. The worse a venue
//     performed, the better its dashboard looked.
//
//   • A guest claim only flipped to `expired` when somebody tried to
//     redeem it. Nobody redeems a claim they have forgotten, so dead
//     claims sat `pending` forever and walk-in conversion (claims
//     redeemed / claims issued) counted them as still-possible. That is
//     the single metric the partner pitch leans on.
//
// Follows the existing pattern in session.service.ts — a plain interval
// rather than @nestjs/schedule, which is not a dependency here.
//
// Place at: src/partner/venue-sweeper.service.ts
// ============================================================

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RUN_STALE_AFTER_MS } from './partner.service';

/** How often to look. Cheap queries; nothing here is time-critical. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class VenueSweeperService implements OnModuleInit {
  private readonly logger = new Logger(VenueSweeperService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Sweep once at boot so a restart does not leave yesterday's rot in
    // place until the first interval elapses.
    void this.sweep();
    setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
  }

  async sweep() {
    await Promise.all([this.abandonStaleRuns(), this.expireStaleClaims()]);
  }

  /**
   * A run with no heartbeat for RUN_STALE_AFTER_MS is abandoned.
   *
   * Marked `abandoned`, not `failed`: the venue never reported an
   * outcome, so we do not know one. Abandonment pays nothing (the
   * multiplier is 0), and conflating it with a reported failure would
   * misrepresent the venue's operations back to them.
   */
  private async abandonStaleRuns() {
    const cutoff = new Date(Date.now() - RUN_STALE_AFTER_MS);

    const stale = await this.prisma.experienceRun.findMany({
      where: { status: 'active', lastHeartbeat: { lt: cutoff } },
      select: { id: true, sourceId: true, startedAt: true },
    });
    if (stale.length === 0) return;

    for (const run of stale) {
      const endedAt = new Date();
      await this.prisma.experienceRun.update({
        where: { id: run.id },
        data: {
          status: 'abandoned',
          endedAt,
          durationSec: Math.round(
            (endedAt.getTime() - run.startedAt.getTime()) / 1000,
          ),
          payoutMultiplier: 0,
          failureReason: 'no heartbeat',
          outcome: { outcome: 'abandoned', swept: true } as never,
        },
      });

      // Seats were never settled, so mark them explicitly rather than
      // leaving them `pending` and indistinguishable from a guest claim
      // that is genuinely waiting to be redeemed.
      await this.prisma.runParticipant.updateMany({
        where: { runId: run.id, rewardState: 'pending' },
        data: { rewardState: 'skipped' },
      });
    }

    this.logger.log(
      `Swept ${stale.length} abandoned run(s) with no heartbeat since ${cutoff.toISOString()}`,
    );
  }

  /** Retire claims whose window has closed, so conversion counts truthfully. */
  private async expireStaleClaims() {
    const now = new Date();

    const dead = await this.prisma.guestClaim.findMany({
      where: { status: 'pending', expiresAt: { lt: now } },
      select: { id: true, participantId: true },
    });
    if (dead.length === 0) return;

    await this.prisma.guestClaim.updateMany({
      where: { id: { in: dead.map((c) => c.id) } },
      data: { status: 'expired' },
    });

    await this.prisma.runParticipant.updateMany({
      where: { id: { in: dead.map((c) => c.participantId) } },
      data: { rewardState: 'expired' },
    });

    this.logger.log(`Expired ${dead.length} unredeemed guest claim(s)`);
  }
}
