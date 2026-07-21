// ============================================================
// HEP Phase 2 Slice 1 — Partner Integration API v1
//
// Routes: /api/partner/v1/*
//
// This namespace is VERSIONED from day one, deliberately. The existing
// /api/* routes grew organically for the mobile client and are not a
// contract anyone external should depend on. A partner surface needs a
// stable shape and room to evolve independently of the app — and
// retrofitting a version prefix after a venue has shipped firmware is
// expensive, while adding it now costs nothing.
//
// Every route is authenticated by the venue's API key and tenant-scoped
// to that venue. Guest claim redemption is NOT here — it is called by
// the player's app, not the venue (see claim.controller.ts).
//
// Place at: src/partner/partner.controller.ts
// ============================================================

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiKeyGuard, ResolvedSource } from '../auth/guards/api-key.guard';
import {
  PartnerService,
  StartRunInput,
  CompleteRunInput,
} from './partner.service';

@Controller('api/partner/v1')
@UseGuards(ApiKeyGuard)
export class PartnerController {
  constructor(private readonly partner: PartnerService) {}

  /** Venue Status — what this venue may run, and what is happening now. */
  @Get('venue')
  venue(@Req() req: RequestWithSource) {
    return this.partner.venueStatus(req.source);
  }

  /** Player Lookup — consent-gated, minimal projection. */
  @Get('players/:rootId')
  player(@Req() req: RequestWithSource, @Param('rootId') rootId: string) {
    return this.partner.lookupPlayer(req.source, rootId);
  }

  /** Experience Start. Idempotent on partner_run_key. */
  @Post('runs')
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  startRun(@Req() req: RequestWithSource, @Body() dto: StartRunInput) {
    return this.partner.startRun(req.source, dto);
  }

  @Get('runs')
  runs(@Req() req: RequestWithSource, @Query('limit') limit?: string) {
    return this.partner.runHistory(
      req.source,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /** Keeps a long session alive; a silent run is eventually abandoned. */
  @Post('runs/:runId/heartbeat')
  @Throttle({ default: { ttl: 60000, limit: 120 } })
  heartbeat(@Req() req: RequestWithSource, @Param('runId') runId: string) {
    return this.partner.heartbeat(req.source, runId);
  }

  /** Experience Complete — victory. Pays out; idempotent. */
  @Post('runs/:runId/complete')
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  complete(
    @Req() req: RequestWithSource,
    @Param('runId') runId: string,
    @Body() dto: CompleteRunInput,
  ) {
    return this.partner.completeRun(req.source, runId, dto);
  }

  /** Experience Failed — timer expiry or abandonment. Pays the reduced bundle. */
  @Post('runs/:runId/fail')
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  fail(
    @Req() req: RequestWithSource,
    @Param('runId') runId: string,
    @Body() dto: CompleteRunInput & { reason?: string },
  ) {
    return this.partner.failRun(req.source, runId, dto);
  }
}

type RequestWithSource = Request & { source: ResolvedSource };
