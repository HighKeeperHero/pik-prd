// ============================================================
// HEP Phase 2 Slice 10 — operating a run as a PERSON
//
// Routes: /api/portal/v1/runs/*   (venue staff token, `runs.operate`)
//
// ── Why this exists ────────────────────────────────────────────
// `runs.operate` was granted to owner, manager and operator from Slice 2
// and enforced by NOTHING — no route required it. The run lifecycle
// lived only on /api/partner/v1, which is API-key authed, so an operator
// could sign into the portal and be unable to do the one thing their
// role is named after.
//
// ── Why not just use the venue API key in the browser ──────────
// That was the shortcut, and it would put a REWARD-MINTING credential in
// a tab on a shared terminal in a room full of strangers — precisely the
// threat the per-venue daily XP ceiling exists to mitigate. The API key
// belongs in the venue's own hardware. A human gets a human's session.
//
// ── One policy, two doors ──────────────────────────────────────
// Every handler below delegates to PartnerService with a ResolvedSource
// built from the staff member's own venue. Scope checks, the seat range,
// consent checks, the certification gate, the payout curve and the daily
// ceiling are therefore IDENTICAL on both paths — there is no second
// implementation to drift.
//
// What differs is attribution: the machine path records that a venue did
// something, this one records WHICH PERSON did it. For a pilot that is
// strictly better evidence.
//
// Place at: src/partner/staff-run.controller.ts
// ============================================================

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  NotFoundException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  VenueStaffGuard,
  RequirePermission,
  type ResolvedStaff,
} from '../portal/venue-staff.guard';
import { PortalService } from '../portal/portal.service';
import { PrismaService } from '../prisma.service';
import {
  PartnerService,
  type StartRunInput,
  type CompleteRunInput,
} from './partner.service';
import type { ResolvedSource } from '../auth/guards/api-key.guard';

type StaffRequest = Request & { staff: ResolvedStaff };

@Controller('api/portal/v1/runs')
@UseGuards(VenueStaffGuard)
export class StaffRunController {
  constructor(
    private readonly partner: PartnerService,
    private readonly portal: PortalService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * What is running right now.
   *
   * The floor's most-asked question, and deliberately its own endpoint
   * rather than a filter on the history list — an operator mid-shift
   * wants the two rows that matter, not to scan thirty.
   */
  @Get('active')
  @RequirePermission('runs.operate')
  async active(@Req() req: StaffRequest) {
    const runs = await this.prisma.experienceRun.findMany({
      where: { sourceId: req.staff.sourceId, status: 'active' },
      include: {
        experience: { select: { slug: true, name: true, targetDurationSec: true } },
        participants: {
          select: { id: true, rootId: true, guestLabel: true, rewardState: true },
        },
      },
      orderBy: { startedAt: 'asc' },
    });

    const now = Date.now();
    return runs.map((r) => ({
      run_id: r.id,
      experience: r.experience?.name ?? r.experience?.slug,
      partner_run_key: r.partnerRunKey,
      started_at: r.startedAt.toISOString(),
      elapsed_sec: Math.round((now - r.startedAt.getTime()) / 1000),
      target_duration_sec: r.experience?.targetDurationSec ?? null,
      milestones_hit: r.milestonesHit,
      seats: r.participants.length,
      // Surfaced because a run whose heartbeat has stopped will be swept
      // to `abandoned` and pay nothing — an operator should see that
      // coming rather than discover it in the payout.
      last_heartbeat: r.lastHeartbeat.toISOString(),
      stale_sec: Math.round((now - r.lastHeartbeat.getTime()) / 1000),
    }));
  }

  @Post()
  @RequirePermission('runs.operate')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async start(@Req() req: StaffRequest, @Body() body: StartRunInput) {
    const source = await this.sourceFor(req.staff);
    const run = await this.partner.startRun(source, body);

    await this.portal.audit(
      req.staff.sourceId,
      req.staff.id,
      'run.started_by_staff',
      (run as any)?.run_id ?? null,
      { experience: body?.experience_slug },
    );
    return run;
  }

  @Post(':runId/heartbeat')
  @RequirePermission('runs.operate')
  @HttpCode(200)
  async heartbeat(@Req() req: StaffRequest, @Param('runId') runId: string) {
    const source = await this.sourceFor(req.staff);
    // Not audited: a heartbeat is not a decision, and writing an audit
    // row every 30 seconds would bury the entries that matter.
    return this.partner.heartbeat(source, runId);
  }

  @Post(':runId/complete')
  @RequirePermission('runs.operate')
  @HttpCode(200)
  async complete(
    @Req() req: StaffRequest,
    @Param('runId') runId: string,
    @Body() body: CompleteRunInput,
  ) {
    const source = await this.sourceFor(req.staff);
    const result = await this.partner.completeRun(source, runId, body ?? {});

    // This one pays people. It gets a name against it.
    await this.portal.audit(
      req.staff.sourceId,
      req.staff.id,
      'run.completed_by_staff',
      runId,
      { milestones_hit: body?.milestones_hit ?? 0 },
    );
    return result;
  }

  @Post(':runId/fail')
  @RequirePermission('runs.operate')
  @HttpCode(200)
  async fail(
    @Req() req: StaffRequest,
    @Param('runId') runId: string,
    @Body() body: CompleteRunInput & { reason?: string },
  ) {
    const source = await this.sourceFor(req.staff);
    const result = await this.partner.failRun(source, runId, body ?? {});

    await this.portal.audit(
      req.staff.sourceId,
      req.staff.id,
      'run.failed_by_staff',
      runId,
      { outcome: body?.outcome ?? 'timeout', reason: body?.reason ?? null },
    );
    return result;
  }

  /**
   * The venue this staff member belongs to, in the shape PartnerService
   * expects.
   *
   * Read fresh every call rather than cached on the session: `scopes` is
   * the venue's commercial ceiling and `status` can be suspended
   * mid-shift. A stale copy would let a venue keep minting for the life
   * of a 12-hour token after we switched it off.
   */
  private async sourceFor(staff: ResolvedStaff): Promise<ResolvedSource> {
    const venue = await this.prisma.source.findUnique({
      where: { id: staff.sourceId },
      select: { id: true, name: true, scopes: true, status: true },
    });
    if (!venue || venue.status !== 'active') {
      throw new NotFoundException('This venue is not active');
    }
    return { id: venue.id, name: venue.name, scopes: venue.scopes };
  }
}
