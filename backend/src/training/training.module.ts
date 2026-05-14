// src/training/training.module.ts

import { Module } from '@nestjs/common';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';
import { PrismaService } from '../prisma.service';
import { EventsModule } from '../events/events.module';
import { LevelingModule } from '../leveling/leveling.module';

@Module({
  imports: [EventsModule, LevelingModule],
  controllers: [TrainingController],
  providers: [TrainingService, PrismaService],
  exports: [TrainingService],
})
export class TrainingModule {}
