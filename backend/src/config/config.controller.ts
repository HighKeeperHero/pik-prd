// ============================================================
// PIK — Config Controller
// Routes: /api/config, /api/sources
//
// Live config tuning and source registry listing.
// Preserves the exact MVP endpoint contract.
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
import { ConfigService } from './config.service';

@Controller('api')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  /**
   * GET /api/health
   *
   * Health check endpoint for Railway deployment.
   * Returns 200 if the server is running.
   */
  @Get('health')
  async health() {
    return { healthy: true, timestamp: new Date().toISOString() };
  }

  /**
   * GET /api/config
   *
   * Returns all config key-value pairs.
   *
   * MVP contract preserved:
   *   Response: { "fate.xp_per_session_normal": 100, ... }
   */
  @Get('config')
  async getConfig() {
    return this.configService.getAll();
  }

  /**
   * POST /api/config
   *
   * Update a single config value. Rejects unknown keys.
   *
   * MVP contract preserved:
   *   Request:  { config_key: "fate.event_xp_multiplier", config_value: 2.0 }
   *   Response: { config_key, config_value, updated_at }
   */
  @Post('config')
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

  /**
   * GET /api/sources
   *
   * List all registered sources (venues/partners).
   *
   * MVP contract preserved:
   *   Response: [ { source_id, source_name, status, created_at } ]
   */
  @Get('sources')
  async getSources() {
    return this.configService.getSources();
  }
}
