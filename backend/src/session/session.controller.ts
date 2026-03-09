// src/session/session.controller.ts
// Sprint 11: added GET /api/sessions/active/:rootId
import {
  Controller, Get, Post, Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SessionService } from './session.service';
import { ApiKeyGuard, ResolvedSource } from '../auth/guards/api-key.guard';

@Controller('api/sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  // ── Live Queries (no auth — dashboard/portal) ─────────────────────────────

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

  // ── Active session for a specific player (used by Live Session Feed) ───────
  // NOTE: must be declared before :sessionId routes to avoid param collision
  // GET /api/sessions/active/:rootId
  @Get('active/:rootId')
  @SkipThrottle()
  getActiveSession(@Param('rootId') rootId: string) {
    return this.sessionService.getActiveSession(rootId);
  }

  // ── Session Lifecycle (API key required) ──────────────────────────────────

  @Post('check-in')
  @UseGuards(ApiKeyGuard)
  checkIn(
    @Body() body: { root_id: string; zone?: string },
    @Req() req: any,
  ) {
    const source = req.pikSource as ResolvedSource;
    return this.sessionService.checkIn({
      rootId:   body.root_id,
      sourceId: source.id,
      zone:     body.zone,
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

  // ── Dashboard direct (no API key — operator use) ──────────────────────────

  @Post('direct/check-in')
  directCheckIn(
    @Body() body: { root_id: string; source_id: string; zone?: string },
  ) {
    return this.sessionService.checkIn({
      rootId:   body.root_id,
      sourceId: body.source_id,
      zone:     body.zone,
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
