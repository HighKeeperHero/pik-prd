// ============================================================
// PIK — Loot Controller (Sprint 6)
//
// GET  /api/users/:root_id/caches       — List player's caches
// POST /api/users/:root_id/caches/:id/open — Open a sealed cache
//
// Place at: src/loot/loot.controller.ts
// ============================================================

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { LootService } from './loot.service';
import { SessionGuard } from '../auth/guards/session.guard';

@Controller('api')
export class LootController {
  constructor(private readonly loot: LootService) {}

  // ── Player endpoints ──────────────────────────────────────

  /**
   * GET /api/users/:root_id/caches?status=sealed
   */
  @Get('users/:root_id/caches')
  async getCaches(
    @Param('root_id') rootId: string,
    @Query('status') status?: string,
  ) {
    return this.loot.getCaches(rootId, status);
  }

  /**
   * POST /api/users/:root_id/caches/:cache_id/open
   */
  @Post('users/:root_id/caches/:cache_id/open')
  @UseGuards(SessionGuard)
  async openCache(
    @Param('root_id') rootId: string,
    @Param('cache_id') cacheId: string,
    @Req() req: Request & { rootId: string },
  ) {
    if (req.rootId !== rootId) {
      return { status: 'error', message: 'Unauthorized' };
    }
    return this.loot.openCache(rootId, cacheId);
  }

  // ── Operator endpoints ────────────────────────────────────

  /**
   * GET /api/loot/table
   *
   * View the full loot table (operator / dashboard).
   */
  @Get('loot/table')
  async getLootTable() {
    return this.loot.getLootTable();
  }

  /**
   * POST /api/loot/grant
   *
   * Manually grant a cache to a player (operator action).
   * Body: { root_id, cache_type, rarity? }
   */
  @Post('loot/grant')
  async grantCacheManual(
    @Body() body: { root_id: string; cache_type: string; rarity?: string },
  ) {
    return this.loot.grantCacheManual(body);
  }
}
