// ============================================================
// HEP Phase 2 Slice 8 — Support Console module
//
// Imports SpatialModule for the telemetry rollup rather than
// reimplementing it: a support view showing different numbers from the
// venue's own dashboard would make every conversation with a partner
// start by reconciling two reports.
//
// Place at: src/support/support.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { SpatialModule } from '../spatial/spatial.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [SpatialModule],
  controllers: [SupportController],
  providers: [SupportService, PrismaService],
})
export class SupportModule {}
