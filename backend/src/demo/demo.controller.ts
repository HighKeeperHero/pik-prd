// ============================================================
// PIK — Demo Controller (Sprint 6 — Track A)
//
// POST /api/demo/seed    — Start a cinematic demo sequence
// GET  /api/demo/status  — Check if demo is running
//
// Place at: src/demo/demo.controller.ts
// ============================================================

import { Controller, Post, Get, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DemoService } from './demo.service';

@Controller('api/demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  /**
   * POST /api/demo/seed
   *
   * Starts a cinematic demo sequence. Returns immediately
   * with the new identity info. The simulation runs async,
   * broadcasting events via SSE.
   *
   * Optional body params:
   *   hero_name, fate_alignment, origin, session_count, delay_ms
   */
  @Post('seed')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async seed(
    @Body()
    body?: {
      hero_name?: string;
      fate_alignment?: string;
      origin?: string;
      session_count?: number;
      delay_ms?: number;
    },
  ) {
    return this.demo.startDemo(body);
  }

  /**
   * GET /api/demo/status
   *
   * Check if a demo sequence is currently running.
   */
  @Get('status')
  async status() {
    return {
      running: this.demo.isRunning(),
      timestamp: new Date().toISOString(),
    };
  }
}
