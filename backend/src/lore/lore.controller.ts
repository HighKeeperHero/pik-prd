// ============================================================
// PIK — Lore Controller
// Routes: /api/users/:root_id/lore
//
// Public read (mirrors the Memoria / Chronicle pattern) so iOS
// can fetch the Archive without a bearer. Undiscovered entries
// come back as silhouettes — title/rarity visible, body withheld
// until found.
// ============================================================

import { Controller, Get, Param } from '@nestjs/common';
import { LoreService } from './lore.service';

@Controller('api/users')
export class LoreController {
  constructor(private readonly lore: LoreService) {}

  /**
   * GET /api/users/:root_id/lore
   *
   * Response (wrapped by the global interceptor as { status, data }):
   *   {
   *     entries: [{ id, title, category, rarity, glyph,
   *                 body: string|null, found, found_at, display_order }],
   *     found_count: int,
   *     total_count: int,
   *   }
   */
  @Get(':root_id/lore')
  async list(@Param('root_id') rootId: string) {
    const entries = await this.lore.listForPlayer(rootId);
    return {
      entries,
      found_count: entries.filter((e) => e.found).length,
      total_count: entries.length,
    };
  }
}
