// ============================================================
// HEP Phase 2 Slice 1 — experience run lifecycle
//
// The partner-facing core: start a run, heartbeat it, complete or fail
// it, and pay out. Everything here is tenant-scoped to the venue whose
// API key made the call — a partner can never see or touch another
// venue's runs.
//
// Place at: src/partner/partner.service.ts
// ============================================================

import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';
import { RewardService } from './reward.service';
import {
  RewardBundle,
  RunOutcome,
  resolveReward,
} from './reward-policy';
import { ResolvedSource } from '../auth/guards/api-key.guard';
import { SCOPES, describeScopes, intersectScopes } from '../auth/scopes';
import { generateShortCode, hashCode } from './claim-code';

/** Guest claim links stay valid for this long unless overridden by config. */
const DEFAULT_CLAIM_TTL_DAYS = 30;

/** A run with no heartbeat for this long is considered abandoned. */
export const RUN_STALE_AFTER_MS = 90 * 60 * 1000; // 90 min

export interface StartRunInput {
  experience_slug: string;
  partner_run_key: string;
  /** Identified Codex heroes taking part. */
  root_ids?: string[];
  /** Unidentified seats — labels are venue-facing only ("Player 3"). */
  guests?: { label?: string }[];
}

export interface CompleteRunInput {
  outcome?: RunOutcome;
  milestones_hit?: number;
  duration_sec?: number;
  details?: Record<string, unknown>;
}

@Injectable()
export class PartnerService {
  private readonly logger = new Logger(PartnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly rewards: RewardService,
  ) {}

  // ────────────────────────────────────────────────────────────
  // START
  // ────────────────────────────────────────────────────────────

  async startRun(source: ResolvedSource, dto: StartRunInput) {
    this.requireScope(source, SCOPES.RUNS);

    if (!dto.experience_slug || !dto.partner_run_key) {
      throw new BadRequestException(
        'Requires: experience_slug, partner_run_key',
      );
    }

    const experience = await this.prisma.experience.findUnique({
      where: { slug: dto.experience_slug },
    });
    if (!experience || experience.status !== 'active') {
      throw new NotFoundException(
        `Unknown or inactive experience: ${dto.experience_slug}`,
      );
    }

    // The venue must be assigned this experience, and it must be in season.
    const assignment = await this.prisma.venueExperience.findUnique({
      where: {
        sourceId_experienceId: {
          sourceId: source.id,
          experienceId: experience.id,
        },
      },
    });
    const now = new Date();
    const inSeason =
      assignment?.enabled &&
      (!assignment.availableFrom || assignment.availableFrom <= now) &&
      (!assignment.availableUntil || assignment.availableUntil >= now);
    if (!inSeason) {
      throw new ForbiddenException(
        `Experience '${dto.experience_slug}' is not currently available at this venue`,
      );
    }

    const rootIds = [...new Set(dto.root_ids ?? [])];
    const guests = dto.guests ?? [];
    const seats = rootIds.length + guests.length;

    if (seats < experience.minPlayers || seats > experience.maxPlayers) {
      throw new BadRequestException(
        `${experience.slug} seats ${experience.minPlayers}-${experience.maxPlayers} players; got ${seats}`,
      );
    }
    if (guests.length > 0) {
      this.requireScope(source, SCOPES.GUESTS);
    }

    // Every identified hero must exist and have consented to this venue.
    // Checking in at the venue is the moment consent is established, so a
    // failure here is actionable by staff rather than mysterious.
    if (rootIds.length > 0) {
      const heroes = await this.prisma.rootIdentity.findMany({
        where: { id: { in: rootIds } },
        select: { id: true },
      });
      const known = new Set(heroes.map((h) => h.id));
      const unknown = rootIds.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        throw new NotFoundException(`Unknown hero(es): ${unknown.join(', ')}`);
      }

      const links = await this.prisma.sourceLink.findMany({
        where: { sourceId: source.id, rootId: { in: rootIds }, status: 'active' },
        select: { rootId: true },
      });
      const consented = new Set(links.map((l) => l.rootId));
      const missing = rootIds.filter((id) => !consented.has(id));
      if (missing.length > 0) {
        throw new ForbiddenException(
          `No active consent for this venue from: ${missing.join(', ')}. ` +
            `The player grants it from the Codex app at check-in.`,
        );
      }
    }

    // Idempotent on the partner's own run key: a retried start returns the
    // existing run rather than opening a second one for the same party.
    const existing = await this.prisma.experienceRun.findUnique({
      where: {
        sourceId_partnerRunKey: {
          sourceId: source.id,
          partnerRunKey: dto.partner_run_key,
        },
      },
      include: { participants: true },
    });
    if (existing) {
      return { ...this.presentRun(existing), replayed: true };
    }

    const run = await this.prisma.experienceRun.create({
      data: {
        sourceId: source.id,
        experienceId: experience.id,
        experienceVersion: experience.version,
        partnerRunKey: dto.partner_run_key,
        participants: {
          create: [
            ...rootIds.map((rootId) => ({ rootId })),
            ...guests.map((g) => ({ guestLabel: g.label ?? null })),
          ],
        },
      },
      include: { participants: true },
    });

    this.logger.log(
      `Run started: ${experience.slug} v${experience.version} at ${source.name} ` +
        `(${rootIds.length} identified, ${guests.length} guest)`,
    );

    return this.presentRun(run);
  }

  // ────────────────────────────────────────────────────────────
  // HEARTBEAT
  // ────────────────────────────────────────────────────────────

  async heartbeat(source: ResolvedSource, runId: string) {
    const run = await this.ownedRun(source, runId);
    if (run.status !== 'active') {
      throw new ConflictException(`Run is already ${run.status}`);
    }
    await this.prisma.experienceRun.update({
      where: { id: runId },
      data: { lastHeartbeat: new Date() },
    });
    return { run_id: runId, status: 'active' };
  }

  // ────────────────────────────────────────────────────────────
  // COMPLETE / FAIL
  // ────────────────────────────────────────────────────────────

  async completeRun(
    source: ResolvedSource,
    runId: string,
    dto: CompleteRunInput,
  ) {
    return this.settleRun(source, runId, 'victory', dto);
  }

  async failRun(
    source: ResolvedSource,
    runId: string,
    dto: CompleteRunInput & { reason?: string },
  ) {
    const outcome: RunOutcome =
      dto.outcome === 'abandoned' ? 'abandoned' : 'timeout';
    return this.settleRun(source, runId, outcome, dto, dto.reason);
  }

  /**
   * Settle a run: compute each seat's payout, pay identified heroes now, and
   * hold guest bundles behind a claim token.
   *
   * Idempotent — a retried settle returns the original result. The run's
   * terminal status is the guard, so a partner retrying after a timeout
   * cannot double-pay a party.
   */
  private async settleRun(
    source: ResolvedSource,
    runId: string,
    outcome: RunOutcome,
    dto: CompleteRunInput,
    failureReason?: string,
  ) {
    this.requireScope(source, SCOPES.RUNS);

    const run = await this.ownedRun(source, runId);

    if (run.status !== 'active') {
      const settled = await this.prisma.experienceRun.findUnique({
        where: { id: runId },
        include: { participants: true },
      });
      return { ...this.presentRun(settled!), replayed: true };
    }

    const experience = await this.prisma.experience.findUnique({
      where: { id: run.experienceId },
    });
    const bundle = (experience?.rewards ?? {}) as RewardBundle;
    const venueMultiplier = await this.venueMultiplier();

    const reward = resolveReward(
      bundle,
      outcome,
      dto.milestones_hit ?? 0,
      venueMultiplier,
    );

    // A venue may be licensed to run experiences without paying them out —
    // that is how a demo or pilot venue is provisioned.
    const mayPay = intersectScopes(source.scopes).has(SCOPES.REWARDS);

    const endedAt = new Date();
    const durationSec =
      dto.duration_sec ??
      Math.round((endedAt.getTime() - run.startedAt.getTime()) / 1000);

    const participants = await this.prisma.runParticipant.findMany({
      where: { runId },
    });

    const results: Record<string, unknown>[] = [];

    for (const seat of participants) {
      if (!mayPay || reward.multiplier <= 0) {
        await this.prisma.runParticipant.update({
          where: { id: seat.id },
          data: { rewards: reward as never, rewardState: 'skipped' },
        });
        results.push({
          participant_id: seat.id,
          root_id: seat.rootId,
          reward_state: 'skipped',
          reason: mayPay ? 'zero payout' : 'venue lacks rewards scope',
        });
        continue;
      }

      if (seat.rootId) {
        const applied = await this.rewards.apply(seat.rootId, reward, {
          sourceId: source.id,
          trigger: `experience:${experience?.slug}:${outcome}`,
          runId,
        });
        await this.prisma.runParticipant.update({
          where: { id: seat.id },
          data: {
            rewards: applied as never,
            rewardState: 'applied',
            appliedAt: new Date(),
          },
        });
        results.push({
          participant_id: seat.id,
          root_id: seat.rootId,
          reward_state: 'applied',
          applied,
        });
        continue;
      }

      // Guest seat — hold the bundle and mint a single-use claim token.
      const { token, shortCode, claim } = await this.issueGuestClaim(
        seat.id,
        source.id,
      );
      await this.prisma.runParticipant.update({
        where: { id: seat.id },
        data: { rewards: reward as never, rewardState: 'pending' },
      });
      results.push({
        participant_id: seat.id,
        guest_label: seat.guestLabel,
        reward_state: 'pending',
        // The only time the plaintext credentials are ever available. They
        // are not recoverable afterward — the venue must print or show them
        // to the guest now, before the party leaves.
        claim_token: token, // encode as the QR
        claim_code: shortCode, // print as the fallback the guest can type
        claim_expires_at: claim.expiresAt.toISOString(),
      });
    }

    const updated = await this.prisma.experienceRun.update({
      where: { id: runId },
      data: {
        status: outcome === 'victory' ? 'completed' : outcome === 'abandoned' ? 'abandoned' : 'failed',
        endedAt,
        durationSec,
        milestonesHit: Math.max(0, Math.floor(dto.milestones_hit ?? 0)),
        payoutMultiplier: reward.multiplier,
        failureReason: failureReason ?? null,
        outcome: {
          outcome,
          breakdown: reward.breakdown,
          details: dto.details ?? null,
        } as never,
      },
      include: { participants: true },
    });

    this.logger.log(
      `Run ${runId} settled: ${outcome} x${reward.multiplier.toFixed(2)} ` +
        `(${results.length} seats) at ${source.name}`,
    );

    return { ...this.presentRun(updated), participants_settled: results };
  }

  // ────────────────────────────────────────────────────────────
  // VENUE / PLAYER READS
  // ────────────────────────────────────────────────────────────

  async venueStatus(source: ResolvedSource) {
    const [assignments, activeRuns, completedToday] = await Promise.all([
      this.prisma.venueExperience.findMany({
        where: { sourceId: source.id, enabled: true },
        include: { experience: true },
      }),
      this.prisma.experienceRun.count({
        where: { sourceId: source.id, status: 'active' },
      }),
      this.prisma.experienceRun.count({
        where: {
          sourceId: source.id,
          status: 'completed',
          endedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      venue: { source_id: source.id, name: source.name },
      scopes: describeScopes(intersectScopes(source.scopes)),
      experiences: assignments.map((a) => ({
        slug: a.experience.slug,
        name: a.experience.name,
        version: a.experience.version,
        min_players: a.experience.minPlayers,
        max_players: a.experience.maxPlayers,
        target_duration_sec: a.experience.targetDurationSec,
        available_from: a.availableFrom?.toISOString() ?? null,
        available_until: a.availableUntil?.toISOString() ?? null,
      })),
      active_runs: activeRuns,
      completed_last_24h: completedToday,
    };
  }

  /**
   * Minimal player projection for a venue. Deliberately narrow: a partner
   * needs enough to greet a player and gate content, not their whole record.
   * Consent-gated like every other player-affecting partner call.
   */
  async lookupPlayer(source: ResolvedSource, rootId: string) {
    const link = await this.prisma.sourceLink.findFirst({
      where: { sourceId: source.id, rootId, status: 'active' },
    });
    if (!link) {
      throw new ForbiddenException(
        'No active consent link for this player and venue',
      );
    }

    const hero = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      select: { id: true, heroName: true, fateLevel: true, fateAlignment: true },
    });
    if (!hero) throw new NotFoundException(`Identity not found: ${rootId}`);

    const priorRuns = await this.prisma.runParticipant.count({
      where: { rootId, run: { sourceId: source.id, status: 'completed' } },
    });

    return {
      root_id: hero.id,
      hero_name: hero.heroName,
      fate_level: hero.fateLevel,
      fate_alignment: hero.fateAlignment,
      /** Lets a venue recognise a repeat visitor — a brief analytics field. */
      prior_runs_at_venue: priorRuns,
    };
  }

  async runHistory(source: ResolvedSource, limit = 20) {
    const runs = await this.prisma.experienceRun.findMany({
      where: { sourceId: source.id },
      include: { participants: true, experience: true },
      orderBy: { startedAt: 'desc' },
      take: Math.min(limit, 100),
    });
    return runs.map((r) => this.presentRun(r));
  }

  // ────────────────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────────────────

  private requireScope(source: ResolvedSource, scope: string) {
    const granted = intersectScopes(source.scopes);
    if (!granted.has(scope)) {
      throw new ForbiddenException(
        `This venue lacks the '${scope}' scope; it has: ${describeScopes(granted)}`,
      );
    }
  }

  /** Load a run, refusing to reveal that another venue's run even exists. */
  private async ownedRun(source: ResolvedSource, runId: string) {
    const run = await this.prisma.experienceRun.findUnique({
      where: { id: runId },
    });
    if (!run || run.sourceId !== source.id) {
      throw new NotFoundException(`Run not found: ${runId}`);
    }
    return run;
  }

  /** Global calibration dial — a DB edit, never a deploy. */
  private async venueMultiplier(): Promise<number> {
    const row = await this.prisma.config.findUnique({
      where: { key: 'venue.reward_multiplier' },
    });
    const parsed = Number(row?.value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  private async issueGuestClaim(participantId: string, sourceId: string) {
    // 32 random bytes, stored only as a SHA-256 digest — the same handling
    // as source API keys and account sessions.
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const expiresAt = new Date(
      Date.now() + DEFAULT_CLAIM_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    // A short code is only 40 bits, so collisions are rare but not
    // impossible across a large venue estate. Retry a few times rather than
    // failing a guest's payout over a coin flip.
    for (let attempt = 0; attempt < 5; attempt++) {
      const shortCode = generateShortCode();
      try {
        const claim = await this.prisma.guestClaim.create({
          data: {
            participantId,
            tokenHash,
            shortCodeHash: hashCode(shortCode),
            sourceId,
            expiresAt,
          },
        });
        return { token, shortCode, claim };
      } catch (err: any) {
        // P2002 on short_code_hash — try another code. Any other unique
        // violation (participant already has a claim) is a real error.
        if (err?.code !== 'P2002') throw err;
        const target = String(err?.meta?.target ?? '');
        if (!target.includes('short_code')) throw err;
      }
    }

    throw new ConflictException(
      'Could not allocate a unique claim code; retry the settle',
    );
  }

  private presentRun(run: {
    id: string;
    sourceId: string;
    experienceId: string;
    experienceVersion: number;
    partnerRunKey: string;
    status: string;
    startedAt: Date;
    endedAt: Date | null;
    durationSec: number | null;
    milestonesHit: number;
    payoutMultiplier: number | null;
    failureReason: string | null;
    participants?: { id: string; rootId: string | null; guestLabel: string | null; rewardState: string }[];
  }) {
    return {
      run_id: run.id,
      partner_run_key: run.partnerRunKey,
      experience_version: run.experienceVersion,
      status: run.status,
      started_at: run.startedAt.toISOString(),
      ended_at: run.endedAt?.toISOString() ?? null,
      duration_sec: run.durationSec,
      milestones_hit: run.milestonesHit,
      payout_multiplier: run.payoutMultiplier,
      failure_reason: run.failureReason,
      participants: (run.participants ?? []).map((p) => ({
        participant_id: p.id,
        root_id: p.rootId,
        guest_label: p.guestLabel,
        reward_state: p.rewardState,
      })),
    };
  }
}
