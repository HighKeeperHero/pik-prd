// ============================================================
// HEP Phase 2 Slice 2 — Partner Portal API
//
// Routes: /api/portal/v1/*
//
// The venue's HUMANS. Distinct from /api/partner/v1 (the venue's
// machines, API-key authed) and from every player route in the app.
//
// ── The boundary ───────────────────────────────────────────────
// Nothing here is reachable from Heroes' Codex. VenueStaffGuard reads
// venue_staff_sessions only, so a player's token is rejected however it
// is presented. The portal is connective tissue into the platform, not
// a screen inside the game.
//
// Place at: src/portal/portal.controller.ts
// ============================================================

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PortalService } from './portal.service';
import { PortalAnalyticsService } from './portal-analytics.service';
import {
  VenueStaffGuard,
  RequirePermission,
  type ResolvedStaff,
} from './venue-staff.guard';

type StaffRequest = Request & { staff: ResolvedStaff; headers: Record<string, string> };

@Controller('api/portal/v1')
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    private readonly analyticsService: PortalAnalyticsService,
  ) {}

  // ── Unauthenticated: sign-in and invite acceptance ────────────

  @Post('auth/login')
  @HttpCode(200)
  // Tight: this is the venue's front door and the only place a password
  // is guessable.
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  login(@Body() body: { email?: string; password?: string; source_id?: string }) {
    return this.portal.login(body.email ?? '', body.password ?? '', body.source_id);
  }

  @Post('auth/accept')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  accept(
    @Body() body: { invite_token?: string; password?: string; display_name?: string },
  ) {
    return this.portal.acceptInvite(
      body.invite_token ?? '',
      body.password ?? '',
      body.display_name,
    );
  }

  // ── Authenticated ─────────────────────────────────────────────

  @Post('auth/logout')
  @UseGuards(VenueStaffGuard)
  @HttpCode(200)
  logout(@Req() req: StaffRequest) {
    const raw = String(req.headers['authorization'] ?? '').slice(7);
    return this.portal.logout(req.staff, raw);
  }

  /** No permission required — every authenticated staff member may ask. */
  @Get('me')
  @UseGuards(VenueStaffGuard)
  me(@Req() req: StaffRequest) {
    return this.portal.me(req.staff);
  }

  // ── Venue profile ─────────────────────────────────────────────

  @Get('venue')
  @UseGuards(VenueStaffGuard)
  @RequirePermission('analytics.read')
  venue(@Req() req: StaffRequest) {
    return this.portal.getVenue(req.staff);
  }

  @Patch('venue')
  @UseGuards(VenueStaffGuard)
  @RequirePermission('venue.edit')
  updateVenue(@Req() req: StaffRequest, @Body() body: Record<string, unknown>) {
    return this.portal.updateVenue(req.staff, body);
  }

  // ── Staff ─────────────────────────────────────────────────────

  @Get('staff')
  @UseGuards(VenueStaffGuard)
  @RequirePermission('staff.manage')
  listStaff(@Req() req: StaffRequest) {
    return this.portal.listStaff(req.staff);
  }

  @Post('staff/invite')
  @UseGuards(VenueStaffGuard)
  @RequirePermission('staff.manage')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  invite(
    @Req() req: StaffRequest,
    @Body() body: { email?: string; role?: string; display_name?: string },
  ) {
    return this.portal.inviteStaff(req.staff, req.staff.sourceId, {
      email: body.email ?? '',
      role: body.role ?? 'viewer',
      display_name: body.display_name,
    });
  }

  @Patch('staff/:staffId')
  @UseGuards(VenueStaffGuard)
  @RequirePermission('staff.manage')
  updateStaff(
    @Req() req: StaffRequest,
    @Param('staffId') staffId: string,
    @Body() body: { role?: string; status?: string },
  ) {
    return this.portal.updateStaff(req.staff, staffId, body);
  }

  // ── Experiences ───────────────────────────────────────────────

  @Get('experiences')
  @UseGuards(VenueStaffGuard)
  @RequirePermission('analytics.read')
  experiences(@Req() req: StaffRequest) {
    return this.portal.listExperiences(req.staff);
  }

  @Patch('experiences/:slug')
  @UseGuards(VenueStaffGuard)
  @RequirePermission('experiences.manage')
  updateExperience(
    @Req() req: StaffRequest,
    @Param('slug') slug: string,
    @Body() body: { enabled?: boolean; available_from?: string; available_until?: string },
  ) {
    return this.portal.updateExperience(req.staff, slug, body);
  }

  // ── Printable assets ──────────────────────────────────────────

  /**
   * The venue's check-in QR payload.
   *
   * Deliberately withheld until now: a QR is only worth generating once
   * the app can act on it, and the venue check-in flow is what made that
   * true. Emitting codes nothing could scan would have been a feature in
   * name only.
   */
  @Get('qr/venue')
  @UseGuards(VenueStaffGuard)
  @RequirePermission('assets.generate')
  venueQr(@Req() req: StaffRequest) {
    return this.portal.venueQrPayload(req.staff);
  }

  @Get('runs')
  @UseGuards(VenueStaffGuard)
  @RequirePermission('analytics.read')
  runs(@Req() req: StaffRequest, @Query('limit') limit?: string) {
    return this.portal.listRuns(req.staff, limit ? parseInt(limit, 10) : 15);
  }

  // ── Analytics ─────────────────────────────────────────────────

  @Get('analytics')
  @UseGuards(VenueStaffGuard)
  @RequirePermission('analytics.read')
  analytics(@Req() req: StaffRequest, @Query('days') days?: string) {
    return this.analyticsService.summary(
      req.staff,
      days ? parseInt(days, 10) : 30,
    );
  }

  // ── Audit ─────────────────────────────────────────────────────

  @Get('audit')
  @UseGuards(VenueStaffGuard)
  @RequirePermission('staff.manage')
  audit(@Req() req: StaffRequest, @Query('limit') limit?: string) {
    return this.portal.listAudit(req.staff, limit ? parseInt(limit, 10) : 50);
  }
}
