// ============================================================
// PIK — Vocation Module (canon §13.6, Phase 5)
// Read-only routes — no AccountGuard, so no FateAccountModule
// needed (the 4a DI lesson applies only to guarded modules).
// GearModule supplies getComputedParadigm (the 40% signal).
// ============================================================
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventsModule } from '../events/events.module';
import { GearModule } from '../gear/gear.module';
import { VocationService } from './vocation.service';
import { VocationController } from './vocation.controller';

@Module({
  imports:     [EventsModule, GearModule],
  controllers: [VocationController],
  providers:   [VocationService, PrismaService],
  exports:     [VocationService],
})
export class VocationModule {}
