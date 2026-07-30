// ============================================================
// PIK — Leaderboard Module (Sprint 7.4 — Leaderboards)
// Place at: src/leaderboard/leaderboard.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardController } from './leaderboard.controller';
import { TrialsModule } from '../trials/trials.module';

@Module({
  imports: [TrialsModule],
  controllers: [LeaderboardController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
