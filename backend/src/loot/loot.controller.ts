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
import { AccountGuard } from '../auth/guards/account.guard';

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
  @UseGuards(AccountGuard)
  async openCache(
    @Param('root_id') rootId: string,
    @Param('cache_id') cacheId: string,
    @Req() req: Request & { heroId: string },
  ) {
    if (req.heroId !== rootId) {
      return { status: 'error', message: 'Unauthorized' };
    }
    return this.loot.openCache(rootId, cacheId);
  }

  // ── Operator endpoints ────────────────────────────────────

  /**
   * GET /api/loot/debug
   */
  @Get('loot/debug')
  async debugLoot() {
    return this.loot.debugLootTable();
  }

  /**
   * POST /api/loot/patch-minlevels
   * One-shot: corrects minLevel values to match actual tier thresholds
   * Bronze(1) Copper(7) Silver(14) Gold(22) Platinum(30)
   */
  @Post('loot/patch-minlevels')
  async patchMinLevels() {
    return this.loot.patchMinLevels();
  }

  /**
   * POST /api/loot/seed-veil
   */
  @Post('loot/seed-veil')
  async seedVeilLoot() {
    return this.loot.seedVeilLoot();
  }

  /**
   * GET /api/loot/table
   */
  @Get('loot/table')
  async getLootTable() {
    return this.loot.getLootTable();
  }

  /**
   * POST /api/loot/grant
   * Body: { root_id, cache_type, rarity? }
   */
  @Post('loot/grant')
  async grantCacheManual(
    @Body() body: { root_id: string; cache_type: string; rarity?: string },
  ) {
    return this.loot.grantCacheManual(body);
  }
}
