// src/forge/forge.module.ts
// ============================================================
// The Forge — Sprint 33
// Workout-logging companion. Depends on TrainingModule (Forge
// pillar progression), LevelingModule (Fate XP), and EventsModule
// (Chronicle / domain events).
// ============================================================

import { Module } from '@nestjs/common';
import { ForgeController } from './forge.controller';
import { ForgeService } from './forge.service';
import { PrismaService } from '../prisma.service';
import { EventsModule } from '../events/events.module';
import { LevelingModule } from '../leveling/leveling.module';
import { TrainingModule } from '../training/training.module';

@Module({
  imports: [EventsModule, LevelingModule, TrainingModule],
  controllers: [ForgeController],
  providers: [ForgeService, PrismaService],
  exports: [ForgeService],
})
export class ForgeModule {}
