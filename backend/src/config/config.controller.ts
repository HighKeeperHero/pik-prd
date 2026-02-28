// ============================================================
// PIK — Config Controller (Sprint 5 — Source Admin)
// Routes: /api/config, /api/sources, /api/health
//
// New admin endpoints:
//   POST   /api/sources           — Create source + generate API key
//   GET    /api/sources/:id       — Source detail with stats
//   POST   /api/sources/:id/rotate-key — Rotate API key
//   POST   /api/sources/:id/status     — Suspend/activate/deactivate
//
// Place at: src/config/config.controller.ts
// ============================================================
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { ConfigService } from './config.service';
import { SourceAdminService } from './source-admin.service';

@Controller('api')
export class ConfigController {
  constructor(
    private readonly configService: ConfigService,
    private readonly sourceAdmin: SourceAdminService,
  ) {}

  @Get('health')
  @SkipThrottle()
  async health() {
    // Quick diagnostic: check if all tables exist
    const tables: Record<string, boolean> = {};
    const checks = [
      { name: 'root_identities', query: () => this.configService.checkTable('root_identities') },
      { name: 'sources', query: () => this.configService.checkTable('sources') },
      { name: 'loot_table', query: () => this.configService.checkTable('loot_table') },
      { name: 'fate_caches', query: () => this.configService.checkTable('fate_caches') },
      { name: 'gear_items', query: () => this.configService.checkTable('gear_items') },
      { name: 'player_inventory', query: () => this.configService.checkTable('player_inventory') },
      { name: 'player_equipment', query: () => this.configService.checkTable('player_equipment') },
    ];
    for (const c of checks) {
      try { await c.query(); tables[c.name] = true; }
      catch { tables[c.name] = false; }
    }
    const allOk = Object.values(tables).every(v => v);
    return {
      healthy: allOk,
      timestamp: new Date().toISOString(),
      tables,
      action: allOk ? null : 'Run: npx prisma migrate deploy && npx prisma db seed',
    };
  }

  /**
   * GET /api/go/demo — redirect to /demo.html
   * Provides a clean URL for investor presentations.
   */
  @Get('go/demo')
  @SkipThrottle()
  goDemo(@Res() res: Response) {
    res.redirect('/demo.html');
  }

  @Get('config')
  async getConfig() {
    return this.configService.getAll();
  }

  @Post('config')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async updateConfig(
    @Body() body: { config_key?: string; config_value?: unknown },
  ) {
    if (!body.config_key || body.config_value == null) {
      throw new BadRequestException(
        'Request body requires: config_key and config_value',
      );
    }
    return this.configService.update(body.config_key, body.config_value);
  }

  // ── Source Listing ──────────────────────────────────────

  @Get('sources')
  async getSources() {
    return this.sourceAdmin.listSourcesDetailed();
  }

  // ── Source Admin ────────────────────────────────────────

  @Post('sources')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async createSource(
    @Body() body: { source_id?: string; source_name?: string },
  ) {
    if (!body.source_id || !body.source_name) {
      throw new BadRequestException(
        'Request body requires: source_id and source_name',
      );
    }
    return this.sourceAdmin.createSource({
      source_id: body.source_id,
      source_name: body.source_name,
    });
  }

  @Get('sources/:id')
  async getSourceDetail(@Param('id') id: string) {
    return this.sourceAdmin.getSourceDetail(id);
  }

  @Post('sources/:id/rotate-key')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async rotateSourceKey(@Param('id') id: string) {
    return this.sourceAdmin.rotateApiKey(id);
  }

  @Post('sources/:id/status')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async setSourceStatus(
    @Param('id') id: string,
    @Body() body: { status?: string },
  ) {
    if (!body.status) {
      throw new BadRequestException('Request body requires: status');
    }
    return this.sourceAdmin.setStatus(id, body.status);
  }
}
