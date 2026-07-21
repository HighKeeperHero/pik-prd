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
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { ConfigService } from './config.service';
import { SourceAdminService } from './source-admin.service';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';

@Controller('api')
export class ConfigController {
  constructor(
    private readonly configService: ConfigService,
    private readonly sourceAdmin: SourceAdminService,
  ) {}

  // Renamed from 'health' in Phase 2 Slice 0. It was a second @Get('health')
  // on top of the one in app.module.ts, which registers first and therefore
  // won — this handler had been unreachable dead code, so editing it to
  // change /api/health did nothing. It is a genuinely useful schema
  // diagnostic, so it keeps its own path instead of being deleted.
  @Get('health/schema')
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
      { name: 'player_sessions', query: () => this.configService.checkTable('player_sessions') },
      { name: 'identity_tokens', query: () => this.configService.checkTable('identity_tokens') },
      { name: 'quest_templates', query: () => this.configService.checkTable('quest_templates') },
      { name: 'player_quests', query: () => this.configService.checkTable('player_quests') },
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

  // Writes to runtime config change the live progression economy for
  // every venue — Heroes staff only. Reads stay open; clients need them.
  @Post('config')
  @UseGuards(PlatformAdminGuard)
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
  // Every route below is cross-tenant partner administration:
  // it lists, creates, and re-keys venues other than the caller's.
  // Heroes staff only until Slice 2 replaces this with staff RBAC.

  @Get('sources')
  @UseGuards(PlatformAdminGuard)
  async getSources() {
    return this.sourceAdmin.listSourcesDetailed();
  }

  // ── Source Admin ────────────────────────────────────────

  @Post('sources')
  @UseGuards(PlatformAdminGuard)
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
  @UseGuards(PlatformAdminGuard)
  async getSourceDetail(@Param('id') id: string) {
    return this.sourceAdmin.getSourceDetail(id);
  }

  @Post('sources/:id/rotate-key')
  @UseGuards(PlatformAdminGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async rotateSourceKey(@Param('id') id: string) {
    return this.sourceAdmin.rotateApiKey(id);
  }

  @Post('sources/:id/status')
  @UseGuards(PlatformAdminGuard)
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
