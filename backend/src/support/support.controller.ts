// ============================================================
// HEP Phase 2 Slice 8 — Support Console API
//
// Routes: /api/support/*   — Heroes staff, platform-admin key.
//
// ── The boundary ───────────────────────────────────────────────
// This is the ONLY surface in the platform that reads across tenants.
// Every other route is scoped to one venue by its guard. That makes it
// the most sensitive thing here, and the reason it is read-only:
// there are no mutations on this controller and none should be added.
// Remedial actions have their own routes, their own guards and their own
// audit entries.
//
// Place at: src/support/support.controller.ts
// ============================================================

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { SupportService } from './support.service';

@Controller('api/support')
@UseGuards(PlatformAdminGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  /** Where should I look first. */
  @Get('venues')
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  index() {
    return this.support.index();
  }

  /** What happened at this venue. */
  @Get('venues/:sourceId')
  @Throttle({ default: { ttl: 60000, limit: 120 } })
  venue(
    @Param('sourceId') sourceId: string,
    @Query('days') days?: string,
  ) {
    return this.support.venue(sourceId, days ? parseInt(days, 10) : 30);
  }
}
