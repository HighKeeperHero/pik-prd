// ============================================================
// HEP Phase 2 Slice 4 — spatial module
//
// Imports PortalModule for staff resolution and the audit ledger:
// calibration is a staff action, and every publish must be attributable
// to a person. Deliberately does NOT import any player-facing module —
// the portal boundary holds here too.
//
// Place at: src/spatial/spatial.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import {
  SpatialPortalController,
  SpatialPartnerController,
  SpatialSchemaController,
  SpatialAdminController,
  SpatialMetricsController,
  TelemetryController,
} from './spatial.controller';
import { TelemetryService } from './telemetry.service';
import { SpatialService } from './spatial.service';
import { PortalModule } from '../portal/portal.module';
import { VenueStaffGuard } from '../portal/venue-staff.guard';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [PortalModule],
  controllers: [
    SpatialPortalController,
    SpatialPartnerController,
    SpatialSchemaController,
    SpatialAdminController,
    SpatialMetricsController,
    TelemetryController,
  ],
  providers: [SpatialService, TelemetryService, VenueStaffGuard, PrismaService],
  exports: [SpatialService, TelemetryService],
})
export class SpatialModule {}
