// ============================================================
// PIK — Leaderboard Controller (Sprint 7.4 — Leaderboards)
//
// REST API for ranked player standings.
//
//   GET /api/leaderboard             — main board (default: xp)
//   GET /api/leaderboard/summary     — top 5 across all boards
//
// Query params:
//   board    = xp | level | sessions | boss_kills | quests | gear_score
//   period   = all_time | daily | weekly | monthly
//   source   = filter by source_id
//   limit    = max entries (default 25, max 100)
//
// Place at: src/leaderboard/leaderboard.controller.ts
// ============================================================

import { Controller, Get, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { LeaderboardService } from './leaderboard.service';

@Controller('api/leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get()
  @SkipThrottle()
  getLeaderboard(
    @Query('board') board?: string,
    @Query('period') period?: string,
    @Query('source') sourceId?: string,
    @Query('limit') limit?: string,
  ): Promise<any> {
    return this.leaderboard.getLeaderboard({
      board,
      period,
      sourceId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('summary')
  @SkipThrottle()
  getSummary(@Query('limit') limit?: string): Promise<any> {
    return this.leaderboard.getSummary(
      limit ? Math.min(parseInt(limit, 10), 10) : 5,
    );
  }
}
