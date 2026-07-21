// ============================================================
// HEP Phase 2 Slice 2 — Partner Portal module
//
// The venue's humans. Imports nothing from the player-facing modules
// and is imported by none of them — the isolation is structural, not
// just a convention in the guards.
//
// Place at: src/portal/portal.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { PortalAnalyticsService } from './portal-analytics.service';
import { VenueStaffGuard } from './venue-staff.guard';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [PortalController],
  providers: [PortalService, PortalAnalyticsService, VenueStaffGuard, PrismaService],
  exports: [PortalService],
})
export class PortalModule {}
