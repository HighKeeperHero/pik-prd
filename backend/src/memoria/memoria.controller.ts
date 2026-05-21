// ============================================================
// PIK — Memoria Controller
// Routes: /api/users/:root_id/memoria
//
// Sprint 32 / Tier 2 identity-collection. Public read so iOS
// can fetch without a bearer (mirrors the Chronicle / Fox /
// Mark read pattern). Listing implicitly runs backfill, so
// players newly granted a Memoria see it on next fetch.
// ============================================================

import { Controller, Get, Param } from '@nestjs/common';
import { MemoriaService } from './memoria.service';

@Controller('api/users')
export class MemoriaController {
  constructor(private readonly memoria: MemoriaService) {}

  /**
   * GET /api/users/:root_id/memoria
   *
   * Returns the full Memoria def list with per-row ownership state.
   * Locked rows include lore so iOS can render a hint-of-what's-coming
   * without spoiling the trigger.
   *
   * Response shape (wrapped by global interceptor as { status, data }):
   *   {
   *     memoria: [{
   *       id, name, lore, glyph, accent,
   *       owned: bool, granted_at: string|null, display_order: int
   *     }],
   *     owned_count: int,
   *     total_count: int,
   *   }
   */
  @Get(':root_id/memoria')
  async list(@Param('root_id') rootId: string) {
    const memoria = await this.memoria.listForPlayer(rootId);
    return {
      memoria,
      owned_count: memoria.filter((m) => m.owned).length,
      total_count: memoria.length,
    };
  }
}
