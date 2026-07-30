// ============================================================
// TrialsController — Arena score-attack gauntlets (2026-07-30)
// Routes: /api/trials/*
// Reads are open (same posture as training); the submit route is
// AccountGuard-gated with a heroId match, per the 2026-07-30
// warband hardening pattern.
// ============================================================

import { Controller, Get, Post, Param, Body, UseGuards, Req } from '@nestjs/common';
import { TrialsService } from './trials.service';
import { AccountGuard } from '../auth/guards/account.guard';

type Authed = Request & { heroId: string };

@Controller('api/trials')
export class TrialsController {
  constructor(private readonly trials: TrialsService) {}

  /** GET /api/trials/:root_id — season, seeds, defs, seasonal bests */
  @Get(':root_id')
  async getTrials(@Param('root_id') rootId: string) {
    return this.trials.getTrials(rootId);
  }

  /** POST /api/trials/:root_id/submit — report a finished run's tally */
  @Post(':root_id/submit')
  @UseGuards(AccountGuard)
  async submitRun(
    @Param('root_id') rootId: string,
    @Body() body: { trial_id: string; perfect: number; misses: number },
    @Req() req: Authed,
  ) {
    if (req.heroId !== rootId) return { status: 'error', message: 'Unauthorized' };
    return this.trials.submitRun(rootId, body);
  }
}
