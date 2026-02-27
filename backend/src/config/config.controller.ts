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
  BadRequestException,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
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
    return { healthy: true, timestamp: new Date().toISOString() };
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
