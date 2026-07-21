// src/session/session.controller.ts
// Sprint 11: added GET /api/sessions/active/:rootId
import {
  Controller, Get, Post, Body, Param, Query, UseGuards, Req,
  ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SessionService } from './session.service';
import { ApiKeyGuard, ResolvedSource } from '../auth/guards/api-key.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';

@Controller('api/sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  // ── Live Queries (Heroes staff — these span every venue) ──────────────────
  // Phase 2 Slice 0: previously unauthenticated. They expose who is
  // physically inside which partner venue right now, so they are
  // cross-tenant PII and cannot stay open. A venue that wants its own
  // live view uses GET source/:sourceId with its API key.

  @Get('live')
  @UseGuards(PlatformAdminGuard)
  @SkipThrottle()
  getActiveSessions() {
    return this.sessionService.getActiveSessions();
  }

  @Get('live/counts')
  @UseGuards(PlatformAdminGuard)
  @SkipThrottle()
  getLiveCounts() {
    return this.sessionService.getLiveCounts();
  }

  @Get('recent')
  @UseGuards(PlatformAdminGuard)
  getRecentSessions(@Query('limit') limit?: string) {
    return this.sessionService.getRecentSessions(
      limit ? Math.min(parseInt(limit, 10), 50) : 20,
    );
  }

  @Get('player/:rootId')
  @UseGuards(PlatformAdminGuard)
  getPlayerSessions(@Param('rootId') rootId: string) {
    return this.sessionService.getPlayerSessions(rootId);
  }

  // Tenant-scoped: a partner may only read its own venue's sessions.
  @Get('source/:sourceId')
  @UseGuards(ApiKeyGuard)
  getActiveBySource(
    @Param('sourceId') sourceId: string,
    @Req() req: any,
  ) {
    const source = req.source as ResolvedSource;
    assertOwnSource(source, sourceId);
    return this.sessionService.getActiveBySource(sourceId);
  }

  // ── Active session for a specific player (used by Live Session Feed) ───────
  // NOTE: must be declared before :sessionId routes to avoid param collision
  // GET /api/sessions/active/:rootId
  @Get('active/:rootId')
  @UseGuards(PlatformAdminGuard)
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
    // ApiKeyGuard attaches the resolved venue as `req.source`. This read
    // was `req.pikSource` before Phase 2 Slice 0, which is always
    // undefined — partner check-in threw on every call.
    const source = req.source as ResolvedSource;
    return this.sessionService.checkIn({
      rootId:   body.root_id,
      sourceId: source.id,
      zone:     body.zone,
    });
  }

  @Post(':sessionId/heartbeat')
  @UseGuards(ApiKeyGuard)
  async heartbeat(
    @Param('sessionId') sessionId: string,
    @Body() body: { zone?: string },
    @Req() req: any,
  ) {
    await this.assertSessionBelongsToCaller(sessionId, req.source);
    return this.sessionService.heartbeat(sessionId, body?.zone);
  }

  @Post(':sessionId/check-out')
  @UseGuards(ApiKeyGuard)
  async checkOut(
    @Param('sessionId') sessionId: string,
    @Body() body: { summary?: Record<string, unknown> },
    @Req() req: any,
  ) {
    await this.assertSessionBelongsToCaller(sessionId, req.source);
    return this.sessionService.checkOut(sessionId, body?.summary);
  }

  /**
   * Tenant isolation for the session lifecycle. A valid API key proves
   * *which* venue is calling, not that the session belongs to it — without
   * this check any partner could heartbeat or force-check-out a player
   * standing in a competitor's venue.
   */
  private async assertSessionBelongsToCaller(
    sessionId: string,
    source: ResolvedSource | undefined,
  ) {
    const ownerId = await this.sessionService.getSessionSourceId(sessionId);
    if (!ownerId) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }
    assertOwnSource(source, ownerId);
  }

  // ── Dashboard direct (Heroes staff — no venue API key) ────────────────────
  // Lets an operator check a player in on behalf of ANY source_id, so it is
  // strictly more powerful than the partner-facing route above.

  @Post('direct/check-in')
  @UseGuards(PlatformAdminGuard)
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
  @UseGuards(PlatformAdminGuard)
  directCheckOut(
    @Param('sessionId') sessionId: string,
    @Body() body: { summary?: Record<string, unknown> },
  ) {
    return this.sessionService.checkOut(sessionId, body?.summary);
  }
}

/** Reject a partner acting on a venue other than the one its key resolves to. */
function assertOwnSource(
  source: ResolvedSource | undefined,
  targetSourceId: string,
) {
  if (!source || source.id !== targetSourceId) {
    throw new ForbiddenException(
      'API key is not authorized for this venue',
    );
  }
}
