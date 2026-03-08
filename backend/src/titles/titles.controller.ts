// src/titles/titles.controller.ts
// ============================================================
// Sprint 8 — Vault: Titles
// Routes: GET /api/users/:rootId/titles
//         POST /api/users/:rootId/titles/:titleId/equip
// ============================================================

import { Controller, Get, Post, Param, Headers, ForbiddenException } from '@nestjs/common';
import { TitlesService } from './titles.service';

@Controller('api/users/:rootId')
export class TitlesController {
  constructor(private readonly titles: TitlesService) {}

  // GET /api/users/:rootId/titles
  // Public — no auth required (same pattern as /caches)
  @Get('titles')
  async getTitles(@Param('rootId') rootId: string) {
    const data = await this.titles.getTitles(rootId);
    return { status: 'ok', data };
  }

  // POST /api/users/:rootId/titles/:titleId/equip
  // Requires Bearer token header
  @Post('titles/:titleId/equip')
  async equipTitle(
    @Param('rootId') rootId: string,
    @Param('titleId') titleId: string,
    @Headers('authorization') auth: string,
  ) {
    if (!auth?.startsWith('Bearer ')) {
      throw new ForbiddenException('Missing or invalid Authorization header. Expected: Bearer ');
    }
    const data = await this.titles.equipTitle(rootId, titleId);
    return { status: 'ok', data };
  }
}
