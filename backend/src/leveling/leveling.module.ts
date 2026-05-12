// ============================================================
// PIK — Leveling Module
//
// Exports LevelingService so any feature module can inject it
// to grant XP atomically. No controllers — XP is granted as a
// side-effect of other domain events, never as a direct API.
// ============================================================

import { Module } from '@nestjs/common';
import { LevelingService } from './leveling.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [LevelingService, PrismaService],
  exports:   [LevelingService],
})
export class LevelingModule {}
