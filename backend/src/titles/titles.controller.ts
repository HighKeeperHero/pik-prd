// src/titles/titles.controller.ts
// ============================================================
// Sprint 8 — Vault: Titles
// Routes: GET /api/users/:rootId/titles
//         POST /api/users/:rootId/titles/:titleId/equip
// Auth: Bearer token required (via guard)
// ============================================================

import { Controller, Get, Post, Param, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { TitlesService } from './titles.service';
import { AuthGuard } from '../auth/auth.guard'; // reuse existing guard

@Controller('api/users/:rootId')
export class TitlesController {
  constructor(private readonly titles: TitlesService) {}

  @Get('titles')
  @UseGuards(AuthGuard)
  async getTitles(@Param('rootId') rootId: string, @Request() req: any) {
    // Ensure the session's selected hero matches (or operator access)
    const session = req.session;
    if (session?.selectedHeroId && session.selectedHeroId !== rootId) {
      throw new ForbiddenException('Cannot access another hero\'s titles');
    }
    const data = await this.titles.getTitles(rootId);
    return { status: 'ok', data };
  }

  @Post('titles/:titleId/equip')
  @UseGuards(AuthGuard)
  async equipTitle(
    @Param('rootId') rootId: string,
    @Param('titleId') titleId: string,
    @Request() req: any,
  ) {
    const session = req.session;
    if (session?.selectedHeroId && session.selectedHeroId !== rootId) {
      throw new ForbiddenException('Cannot modify another hero\'s titles');
    }
    const data = await this.titles.equipTitle(rootId, titleId);
    return { status: 'ok', data };
  }
}
