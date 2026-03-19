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
  // ── Loot Engine (Sprint Loot-A) ──────────────────────────

  /**
   * POST /api/loot/seed-base-items
   * Seeds Phase 1 base item library into base_items table.
   * Idempotent — safe to run multiple times.
   */
  @Post('loot/seed-base-items')
  async seedBaseItems() {
    return this.loot.seedBaseItems();
  }

  /**
   * GET /api/loot/debug-engine
   * Returns base item library counts and drop family configs.
   * Use to verify Phase 1 seed state.
   */
  @Get('loot/debug-engine')
  async debugEngine() {
    return this.loot.debugBaseItems();
  }

  /**
   * POST /api/loot/test-roll
   * Body: { root_id, cache_type, hero_level, region_hint? }
   * Dry-run a Phase 4 family roll — useful for QA.
   */
  @Post('loot/test-roll')
  async testRoll(
    @Body() body: { root_id: string; cache_type: string; hero_level: number; region_hint?: string },
  ) {
    return this.loot.rollFromFamily({
      rootId:      body.root_id,
      cacheType:   body.cache_type,
      heroLevel:   body.hero_level,
      regionHint:  body.region_hint,
    });
  }


  /**
   * POST /api/loot/bootstrap-tables
   * Creates base_items and pity_counters tables if they don't exist.
   * Safe to run multiple times (IF NOT EXISTS guards).
   * Required because migrations were marked applied without executing SQL.
   */
  @Post('loot/bootstrap-tables')
  async bootstrapTables() {
    return this.loot.bootstrapTables();
  }


}
