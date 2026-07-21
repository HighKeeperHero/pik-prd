// ============================================================
// HEP Phase 2 Slice 1 — guest claim redemption
//
// A walk-in plays without a Codex account. Their rewards are held on the
// run participant and a single-use token is handed to them at the venue.
// When they install Codex and redeem it, the held bundle lands on their
// new hero.
//
// This is the primitive that makes all three arrival paths one mechanism:
// on-site enrollment is simply this flow, redeemed at the kiosk instead
// of at home.
//
// Security posture, matching the rest of the codebase:
//   • token is 32 random bytes, stored ONLY as a SHA-256 digest
//   • single use — redeeming twice pays once
//   • expires (30 days), after which it pays nothing
//   • redemption is player-authenticated; the venue cannot redeem for them
//
// Place at: src/partner/claim.service.ts
// ============================================================

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  GoneException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma.service';
import { RewardService } from './reward.service';
import { ResolvedReward } from './reward-policy';
import { hashCode, isWellFormed, looksLikeShortCode } from './claim-code';

@Injectable()
export class ClaimService {
  private readonly logger = new Logger(ClaimService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rewards: RewardService,
  ) {}

  /**
   * Inspect a claim without redeeming it, so the app can show "you earned X
   * at Y" before asking the player to commit. Safe to call unauthenticated —
   * it reveals only what the bearer of the token already witnessed.
   */
  async preview(token: string) {
    const claim = await this.findByToken(token);

    return {
      status: claim.status,
      venue: claim.sourceId,
      expires_at: claim.expiresAt.toISOString(),
      expired: claim.expiresAt.getTime() < Date.now(),
      rewards: this.summarize(claim.participant.rewards as unknown as ResolvedReward),
    };
  }

  /**
   * Redeem a claim onto a hero.
   *
   * The token is burned inside a transaction BEFORE rewards are applied, so
   * two concurrent redemptions cannot both pass the status check — the loser
   * hits the unique status guard and pays nothing.
   */
  async redeem(token: string, rootId: string) {
    const claim = await this.findByToken(token);

    if (claim.status === 'claimed') {
      throw new ConflictException(
        'This claim has already been redeemed',
      );
    }
    if (claim.status === 'expired' || claim.expiresAt.getTime() < Date.now()) {
      // Persist the expiry so the analytics view reflects reality.
      if (claim.status !== 'expired') {
        await this.prisma.guestClaim
          .update({ where: { id: claim.id }, data: { status: 'expired' } })
          .catch(() => undefined);
        await this.prisma.runParticipant
          .update({
            where: { id: claim.participantId },
            data: { rewardState: 'expired' },
          })
          .catch(() => undefined);
      }
      throw new GoneException('This claim has expired');
    }

    const hero = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      select: { id: true },
    });
    if (!hero) throw new NotFoundException(`Identity not found: ${rootId}`);

    // Burn first. updateMany with a status predicate makes this a compare-
    // and-swap: exactly one concurrent caller sees count === 1.
    const burned = await this.prisma.guestClaim.updateMany({
      where: { id: claim.id, status: 'pending' },
      data: { status: 'claimed', claimedAt: new Date(), claimedBy: rootId },
    });
    if (burned.count !== 1) {
      throw new ConflictException('This claim has already been redeemed');
    }

    const reward = claim.participant.rewards as unknown as ResolvedReward;
    const applied = await this.rewards.apply(rootId, reward, {
      sourceId: claim.sourceId,
      trigger: `guest_claim:${claim.id}`,
      runId: claim.participant.runId,
    });

    // Bind the seat to the hero so the run's history is complete and the
    // venue's conversion metric can be computed from the seat alone.
    await this.prisma.runParticipant.update({
      where: { id: claim.participantId },
      data: {
        rootId,
        rewardState: 'applied',
        appliedAt: new Date(),
        rewards: applied as never,
      },
    });

    this.logger.log(
      `Guest claim ${claim.id} redeemed by ${rootId} (venue ${claim.sourceId})`,
    );

    return {
      claimed: true,
      venue: claim.sourceId,
      run_id: claim.participant.runId,
      applied,
    };
  }

  /**
   * Resolve either credential to the same claim: the long token a QR
   * encodes, or the short code a guest types when the scan fails.
   *
   * Length discriminates — tokens are 43 characters, codes are 8.
   */
  private async findByToken(input: string) {
    if (!input) throw new BadRequestException('Missing claim code');

    if (looksLikeShortCode(input)) {
      if (!isWellFormed(input)) {
        // Codes are printed from an alphabet with no I, O, 0 or 1, so a
        // character outside it is a transcription error. Say so plainly
        // rather than returning a bare "not found".
        throw new BadRequestException(
          'That code contains characters we never print. Check for O/0 and I/1 mix-ups.',
        );
      }
      const claim = await this.prisma.guestClaim.findUnique({
        where: { shortCodeHash: hashCode(input) },
        include: { participant: true },
      });
      if (!claim) throw new NotFoundException('Claim not found');
      return claim;
    }

    if (input.length < 16) {
      throw new BadRequestException('Malformed claim token');
    }

    const tokenHash = createHash('sha256').update(input).digest('hex');
    const claim = await this.prisma.guestClaim.findUnique({
      where: { tokenHash },
      include: { participant: true },
    });
    if (!claim) throw new NotFoundException('Claim not found');
    return claim;
  }

  /** Player-facing summary — no internal ids, no scaling internals. */
  private summarize(reward: ResolvedReward | null) {
    if (!reward) return { xp: 0, essence: 0, caches: 0, titles: [] };
    return {
      xp: reward.xp ?? 0,
      essence: reward.essence ?? 0,
      caches: reward.caches?.length ?? 0,
      titles: reward.titles ?? [],
    };
  }
}
