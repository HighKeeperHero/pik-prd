// ============================================================
// PIK — Config Controller (Sprint 3 — Rate Limited)
// Routes: /api/config, /api/sources, /api/health
//
// Health check: no rate limit (Railway probes this)
// Config write: 10/min (admin-only, shouldn't be spammed)
//
// Place at: src/config/config.controller.ts
// ============================================================
import {
  Controller,
  Get,
  Post,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ConfigService } from './config.service';

@Controller('api')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

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

  @Get('sources')
  async getSources() {
    return this.configService.getSources();
  }
}
