// ============================================================
// PIK — Session Controller (Sprint 7.1 — Live Sessions)
//
// REST API for live session management.
//
// Public (dashboard/portal):
//   GET  /api/sessions/live         — all active sessions
//   GET  /api/sessions/live/counts  — aggregated live counts
//   GET  /api/sessions/recent       — recent completed sessions
//   GET  /api/sessions/player/:id   — session history for a player
//   GET  /api/sessions/source/:id   — active sessions at a source
//
// Protected (API key required):
//   POST /api/sessions/check-in     — start a live session
//   POST /api/sessions/:id/heartbeat — keep session alive
//   POST /api/sessions/:id/check-out — end a session
//
// Place at: src/session/session.controller.ts
// ============================================================

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SessionService } from './session.service';
import { ApiKeyGuard, ResolvedSource } from '../auth/guards/api-key.guard';

@Controller('api/sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  // ── Live Queries (no auth — dashboard/portal) ──────────

  @Get('live')
  @SkipThrottle()
  getActiveSessions() {
    return this.sessionService.getActiveSessions();
  }

  @Get('live/counts')
  @SkipThrottle()
  getLiveCounts() {
    return this.sessionService.getLiveCounts();
  }

  @Get('recent')
  getRecentSessions(@Query('limit') limit?: string) {
    return this.sessionService.getRecentSessions(
      limit ? Math.min(parseInt(limit, 10), 50) : 20,
    );
  }

  @Get('player/:rootId')
  getPlayerSessions(@Param('rootId') rootId: string) {
    return this.sessionService.getPlayerSessions(rootId);
  }

  @Get('source/:sourceId')
  getActiveBySource(@Param('sourceId') sourceId: string) {
    return this.sessionService.getActiveBySource(sourceId);
  }

  // ── Session Lifecycle (API key required) ───────────────

  @Post('check-in')
  @UseGuards(ApiKeyGuard)
  checkIn(
    @Body() body: { root_id: string; zone?: string },
    @Req() req: any,
  ) {
    const source = req.pikSource as ResolvedSource;
    return this.sessionService.checkIn({
      rootId: body.root_id,
      sourceId: source.id,
      zone: body.zone,
    });
  }

  @Post(':sessionId/heartbeat')
  @UseGuards(ApiKeyGuard)
  heartbeat(
    @Param('sessionId') sessionId: string,
    @Body() body: { zone?: string },
  ) {
    return this.sessionService.heartbeat(sessionId, body?.zone);
  }

  @Post(':sessionId/check-out')
  @UseGuards(ApiKeyGuard)
  checkOut(
    @Param('sessionId') sessionId: string,
    @Body() body: { summary?: Record<string, unknown> },
  ) {
    return this.sessionService.checkOut(sessionId, body?.summary);
  }

  // ── Dashboard direct (no API key — operator use) ───────

  @Post('direct/check-in')
  directCheckIn(
    @Body() body: { root_id: string; source_id: string; zone?: string },
  ) {
    return this.sessionService.checkIn({
      rootId: body.root_id,
      sourceId: body.source_id,
      zone: body.zone,
    });
  }

  @Post('direct/:sessionId/check-out')
  directCheckOut(
    @Param('sessionId') sessionId: string,
    @Body() body: { summary?: Record<string, unknown> },
  ) {
    return this.sessionService.checkOut(sessionId, body?.summary);
  }
}
