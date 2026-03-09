// src/titles/titles.controller.ts
// ============================================================
// Sprint 8 — Vault: Titles
// Routes: GET /api/users/:rootId/titles
//         POST /api/users/:rootId/titles/:titleId/equip
// ============================================================

import { Controller, Get, Post, Param, UseGuards, Req } from '@nestjs/common';
import { TitlesService } from './titles.service';
import { AccountGuard } from '../auth/guards/account.guard';

@Controller('api/users/:rootId')
export class TitlesController {
  constructor(private readonly titles: TitlesService) {}

  // GET /api/users/:rootId/titles
  // Public — no auth required
  @Get('titles')
  async getTitles(@Param('rootId') rootId: string) {
    const data = await this.titles.getTitles(rootId);
    return { status: 'ok', data };
  }

  // POST /api/users/:rootId/titles/:titleId/equip
  // Requires AccountSession Bearer token
  @Post('titles/:titleId/equip')
  @UseGuards(AccountGuard)
  async equipTitle(
    @Param('rootId') rootId: string,
    @Param('titleId') titleId: string,
    @Req() req: Request & { heroId: string },
  ) {
    if (req.heroId !== rootId) {
      return { status: 'error', message: 'Unauthorized' };
    }
    const data = await this.titles.equipTitle(rootId, titleId);
    return { status: 'ok', data };
  }
}
