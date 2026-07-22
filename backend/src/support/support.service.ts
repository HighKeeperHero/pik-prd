// ============================================================
// HEP Phase 2 Slice 8 — Venue Support Console (P11)
//
// Heroes staff only. Answers "what is wrong at this venue right now"
// without a psql prompt, which is currently the only way to find out.
//
// ── Read-only by construction ─────────────────────────────────
// There are no mutations in this file and there should never be. Every
// remedial action already exists and is already audited — reissue an
// invite, reverse a reward, rotate a key, suspend a venue, roll back a
// room config. The console links to those. A support tool that can only
// look is one that cannot make things worse at 2am, and this holds
// cross-tenant data so its blast radius deserves to stay small.
//
// ── Player data ───────────────────────────────────────────────
// Seats are reported as `root_id` + reward state and NOTHING else. No
// hero names, no account emails. A support question is almost always
// "did this seat get paid", which root_id answers; a named lookup should
// be a separate, separately-audited action rather than something every
// page render leaks across every venue.
//
// Venue STAFF emails are shown — they are the venue's business contacts,
// already visible through existing admin routes, and support needs to
// know who to call.
//
// Place at: src/support/support.service.ts
// ============================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TelemetryService } from '../spatial/telemetry.service';

/** How far back the "recent" windows look. */
const RECENT_RUNS = 25;
const RECENT_AUDIT = 30;
const HEALTH_WINDOW_DAYS = 30;

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetry: TelemetryService,
  ) {}

  /**
   * Cross-venue index — "where should I look first".
   *
   * Deliberately computed with grouped queries rather than a loop over
   * venues: this is the page support opens first and it must stay fast
   * as partners are added, or it will be abandoned for the psql prompt
   * it was built to replace.
   */
  async index() {
    const since = new Date(Date.now() - HEALTH_WINDOW_DAYS * 86400_000);

    const [venues, staffCounts, runCounts, stuckSeats, roomCounts, lastMetrics] =
      await Promise.all([
        this.prisma.source.findMany({
          where: { sourceType: { not: 'first_party' } },
          select: { id: true, name: true, status: true, scopes: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.venueStaff.groupBy({
          by: ['sourceId', 'status'],
          _count: { _all: true },
        }),
        this.prisma.experienceRun.groupBy({
          by: ['sourceId', 'status'],
          where: { startedAt: { gte: since } },
          _count: { _all: true },
        }),
        // Rewards owed to a known hero that never landed. The single
        // most actionable support signal we have.
        this.prisma.runParticipant.groupBy({
          by: ['rewardState'],
          where: {
            rootId: { not: null },
            rewardState: { in: ['pending', 'expired'] },
            run: { startedAt: { gte: since } },
          },
          _count: { _all: true },
        }),
        this.prisma.venueRoom.groupBy({ by: ['sourceId'], _count: { _all: true } }),
        this.prisma.spatialMetric.groupBy({
          by: ['sourceId'],
          _max: { capturedAt: true },
        }),
      ]);

    // Stuck seats need per-venue attribution, which groupBy on the
    // participant cannot give us (the sourceId lives on the run). One
    // extra query rather than a join we cannot express.
    const stuckByVenue = await this.prisma.experienceRun.findMany({
      where: {
        startedAt: { gte: since },
        participants: {
          some: { rootId: { not: null }, rewardState: { in: ['pending', 'expired'] } },
        },
      },
      select: {
        sourceId: true,
        _count: { select: { participants: true } },
      },
    });

    const staffBy = new Map<string, { active: number; invited: number }>();
    for (const row of staffCounts) {
      const e = staffBy.get(row.sourceId) ?? { active: 0, invited: 0 };
      if (row.status === 'active') e.active += row._count._all;
      if (row.status === 'invited') e.invited += row._count._all;
      staffBy.set(row.sourceId, e);
    }

    const runsBy = new Map<string, Record<string, number>>();
    for (const row of runCounts) {
      const e = runsBy.get(row.sourceId) ?? {};
      e[row.status] = row._count._all;
      runsBy.set(row.sourceId, e);
    }

    const roomsBy = new Map(roomCounts.map((r) => [r.sourceId, r._count._all]));
    const metricsBy = new Map(lastMetrics.map((m) => [m.sourceId, m._max.capturedAt]));
    const stuckCount = new Map<string, number>();
    for (const r of stuckByVenue) {
      stuckCount.set(r.sourceId, (stuckCount.get(r.sourceId) ?? 0) + 1);
    }

    const rows = venues.map((v) => {
      const staff = staffBy.get(v.id) ?? { active: 0, invited: 0 };
      const runs = runsBy.get(v.id) ?? {};
      const flags: string[] = [];

      // Flags are the product here. A page of numbers is a page nobody
      // reads; a page that says what is wrong gets opened.
      if (v.status !== 'active') flags.push(`venue_${v.status}`);
      if (staff.active === 0) {
        // The exact hole that stranded heroes-demo-venue's owner.
        flags.push(staff.invited > 0 ? 'no_active_staff_only_invites' : 'no_staff');
      }
      if ((stuckCount.get(v.id) ?? 0) > 0) flags.push('rewards_stuck');
      if (!v.scopes?.includes('rewards')) flags.push('cannot_mint');
      if ((roomsBy.get(v.id) ?? 0) === 0) flags.push('no_rooms');

      return {
        source_id: v.id,
        name: v.name,
        status: v.status,
        scopes: v.scopes,
        staff_active: staff.active,
        staff_invited: staff.invited,
        rooms: roomsBy.get(v.id) ?? 0,
        runs_30d: Object.values(runs).reduce((a, b) => a + b, 0),
        runs_by_status: runs,
        runs_with_stuck_rewards: stuckCount.get(v.id) ?? 0,
        last_telemetry_at: metricsBy.get(v.id)?.toISOString() ?? null,
        created_at: v.createdAt.toISOString(),
        flags,
      };
    });

    return {
      window_days: HEALTH_WINDOW_DAYS,
      venues: rows,
      // Sorted worst-first would be a UI decision; the count is a fact.
      needing_attention: rows.filter((r) => r.flags.length > 0).length,
      totals: {
        venues: rows.length,
        seats_stuck_pending:
          stuckSeats.find((s) => s.rewardState === 'pending')?._count._all ?? 0,
        seats_expired:
          stuckSeats.find((s) => s.rewardState === 'expired')?._count._all ?? 0,
      },
    };
  }

  /** Everything about one venue, in the order support asks for it. */
  async venue(sourceId: string, days = HEALTH_WINDOW_DAYS) {
    const venue = await this.prisma.source.findUnique({
      where: { id: sourceId },
      select: {
        id: true, name: true, status: true, scopes: true,
        sourceType: true, profile: true, createdAt: true,
      },
    });
    if (!venue) throw new NotFoundException(`No venue '${sourceId}'`);

    const since = new Date(Date.now() - Math.min(days, 365) * 86400_000);

    const [staff, rooms, runs, audit, claims, telemetry] = await Promise.all([
      this.prisma.venueStaff.findMany({
        where: { sourceId },
        select: {
          id: true, email: true, role: true, status: true,
          lastLoginAt: true, inviteExpires: true, createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.venueRoom.findMany({
        where: { sourceId },
        include: {
          activeConfig: {
            select: {
              id: true, version: true, status: true, originMode: true,
              validation: true, publishedAt: true,
            },
          },
          _count: { select: { configs: true } },
        },
      }),
      this.prisma.experienceRun.findMany({
        where: { sourceId, startedAt: { gte: since } },
        include: {
          experience: { select: { slug: true } },
          participants: {
            // root_id + reward state ONLY. See the header note.
            select: { id: true, rootId: true, rewardState: true, guestLabel: true },
          },
        },
        orderBy: { startedAt: 'desc' },
        take: RECENT_RUNS,
      }),
      this.prisma.venueAuditEntry.findMany({
        where: { sourceId },
        include: { staff: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        take: RECENT_AUDIT,
      }),
      this.prisma.guestClaim.groupBy({
        by: ['status'],
        where: { sourceId },
        _count: { _all: true },
      }).catch(() => [] as any[]),
      this.telemetry.summary(sourceId, days),
    ]);

    return {
      venue: {
        source_id: venue.id,
        name: venue.name,
        status: venue.status,
        source_type: venue.sourceType,
        scopes: venue.scopes,
        can_mint_rewards: venue.scopes?.includes('rewards') ?? false,
        profile: venue.profile,
        created_at: venue.createdAt.toISOString(),
      },
      staff: staff.map((s) => ({
        staff_id: s.id,
        email: s.email,
        role: s.role,
        status: s.status,
        last_login_at: s.lastLoginAt?.toISOString() ?? null,
        // Surfaced because a stranded invite is invisible otherwise, and
        // it is exactly what locked heroes-demo-venue's owner out.
        invite_expires: s.inviteExpires?.toISOString() ?? null,
        invite_stale:
          s.status === 'invited' &&
          !!s.inviteExpires &&
          s.inviteExpires.getTime() < Date.now(),
      })),
      rooms: rooms.map((r) => ({
        room_id: r.id,
        slug: r.slug,
        name: r.name,
        config_count: r._count.configs,
        active_config: r.activeConfig
          ? {
              room_config_id: r.activeConfig.id,
              version: r.activeConfig.version,
              origin_mode: r.activeConfig.originMode,
              published_at: r.activeConfig.publishedAt?.toISOString() ?? null,
              validation: r.activeConfig.validation,
            }
          : null,
      })),
      runs: runs.map((run) => ({
        run_id: run.id,
        experience: run.experience?.slug ?? null,
        status: run.status,
        started_at: run.startedAt.toISOString(),
        ended_at: run.endedAt?.toISOString() ?? null,
        duration_sec: run.durationSec,
        milestones_hit: run.milestonesHit,
        payout_multiplier: run.payoutMultiplier,
        failure_reason: run.failureReason,
        seats: run.participants.map((p) => ({
          participant_id: p.id,
          root_id: p.rootId,
          guest_label: p.guestLabel,
          reward_state: p.rewardState,
          // The support question, answered directly rather than left to
          // be inferred from a state name.
          reward_stuck: !!p.rootId && ['pending', 'expired'].includes(p.rewardState),
        })),
      })),
      guest_claims: Object.fromEntries(
        (claims as any[]).map((c) => [c.status, c._count._all]),
      ),
      telemetry,
      audit: audit.map((a) => ({
        entry_id: a.id,
        action: a.action,
        target: a.target,
        by: a.staff?.email ?? 'Heroes platform',
        metadata: a.metadata,
        at: a.createdAt.toISOString(),
      })),
      /**
       * Remedial actions live elsewhere and stay there. Listed so the UI
       * can link without this service growing a mutation.
       */
      remediation: {
        reissue_invite: 'POST /api/sources/:id/staff  (platform admin)',
        reverse_reward: 'POST /api/runs/:runId/reverse  (platform admin, reason required)',
        rotate_api_key: 'POST /api/sources/:id/rotate-key  (platform admin)',
        set_status: 'POST /api/sources/:id/status  (platform admin)',
        rollback_room: 'POST /api/portal/v1/rooms/:roomId/rollback  (venue manager)',
      },
    };
  }
}
