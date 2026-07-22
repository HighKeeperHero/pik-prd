// ============================================================
// HEP Phase 2 Slice 9 — certification module
//
// Place at: src/certification/certification.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import {
  CertificationController,
  CertificationPortalController,
} from './certification.controller';
import { CertificationService } from './certification.service';
import { SpatialModule } from '../spatial/spatial.module';
import { PortalModule } from '../portal/portal.module';
import { VenueStaffGuard } from '../portal/venue-staff.guard';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [SpatialModule, PortalModule],
  controllers: [CertificationController, CertificationPortalController],
  providers: [CertificationService, VenueStaffGuard, PrismaService],
  exports: [CertificationService],
})
export class CertificationModule {}
