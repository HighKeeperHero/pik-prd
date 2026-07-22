// ============================================================
// HEP Phase 2 Slice 9 — certification API
//
// Routes: /api/certification/*        — Heroes staff (platform admin)
//         /api/portal/v1/certification — the venue's own read
//
// Certifying is a HEROES decision: a venue certifying itself is a venue
// marking its own homework. But the venue must be able to SEE its status
// and what is blocking it — a gate whose subject cannot see why it is
// closed is one they will phone support about, which defeats the point.
//
// Place at: src/certification/certification.controller.ts
// ============================================================

import {
  Controller, Get, Post, Body, Param, Req, UseGuards, HttpCode,
} from '@nestjs/common';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import {
  VenueStaffGuard, RequirePermission, type ResolvedStaff,
} from '../portal/venue-staff.guard';
import { CertificationService } from './certification.service';

type StaffRequest = Request & { staff: ResolvedStaff };

@Controller('api/certification')
@UseGuards(PlatformAdminGuard)
export class CertificationController {
  constructor(private readonly certification: CertificationService) {}

  @Get(':sourceId')
  status(@Param('sourceId') sourceId: string) {
    return this.certification.statusFor(sourceId);
  }

  /** Dry run — see what is blocking before deciding. */
  @Post(':sourceId/evaluate')
  @HttpCode(200)
  evaluate(
    @Param('sourceId') sourceId: string,
    @Body() body: { experience_slug?: string; room_id?: string },
  ) {
    return this.certification.evaluate(
      sourceId, body.experience_slug ?? '', body.room_id ?? '',
    );
  }

  @Post(':sourceId/certify')
  @HttpCode(200)
  certify(
    @Param('sourceId') sourceId: string,
    @Body() body: { experience_slug?: string; room_id?: string },
  ) {
    return this.certification.certify(
      sourceId, body.experience_slug ?? '', body.room_id ?? '', 'platform',
    );
  }

  @Post(':sourceId/override')
  @HttpCode(200)
  override(
    @Param('sourceId') sourceId: string,
    @Body() body: { experience_slug?: string; room_id?: string; reason?: string; days?: number },
  ) {
    return this.certification.override(
      sourceId, body.experience_slug ?? '', body.room_id ?? '',
      { reason: body.reason, days: body.days }, 'platform',
    );
  }

  @Post(':sourceId/revoke')
  @HttpCode(200)
  revoke(
    @Param('sourceId') sourceId: string,
    @Body() body: { experience_slug?: string; room_id?: string; reason?: string },
  ) {
    return this.certification.revoke(
      sourceId, body.experience_slug ?? '', body.room_id ?? '', body.reason, 'platform',
    );
  }
}

/** The venue's own view. Read-only — they cannot certify themselves. */
@Controller('api/portal/v1/certification')
export class CertificationPortalController {
  constructor(private readonly certification: CertificationService) {}

  @Get()
  @UseGuards(VenueStaffGuard)
  @RequirePermission('analytics.read')
  mine(@Req() req: StaffRequest) {
    return this.certification.statusFor(req.staff.sourceId);
  }
}
