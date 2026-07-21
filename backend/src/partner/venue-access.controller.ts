// ============================================================
// HEP Phase 2 — venue check-in (player-facing)
//
// Routes: /api/venues/*
//
// Closes the gap that made an EXISTING Codex player unable to join a
// venue run at all: startRun requires an active SourceLink, and nothing
// in the app could create one. Only walk-in guests could actually play,
// which is the inverse of what the business wants — the engaged players
// are the ones you'd incentivise to travel to a venue.
//
// This is the player's own action on their own identity, so it sits
// beside /api/claims rather than under /api/partner (the venue's
// machines) or /api/portal (the venue's staff). A venue cannot check a
// player in; only the player can consent.
//
// Place at: src/partner/venue-access.controller.ts
// ============================================================

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccountGuard } from '../auth/guards/account.guard';
import { VenueAccessService } from './venue-access.service';

type HeroRequest = Request & { heroId?: string };

@Controller('api/venues')
export class VenueAccessController {
  constructor(private readonly venues: VenueAccessService) {}

  /**
   * What the player is being asked to agree to, before they agree to it.
   *
   * Unauthenticated: it returns only what is already printed on the sign
   * they are standing in front of, and the consent screen must be able to
   * name the venue before asking for permission.
   */
  @Get(':sourceId')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  describe(@Param('sourceId') sourceId: string) {
    return this.venues.describe(sourceId);
  }

  /**
   * Grant consent and open a session — the act of walking in.
   *
   * Account-authenticated, and always for the caller's own hero. The
   * scope is whatever the player accepts on screen, intersected server
   * side with what the venue is licensed for.
   */
  @Post(':sourceId/check-in')
  @UseGuards(AccountGuard)
  @HttpCode(200)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  checkIn(
    @Param('sourceId') sourceId: string,
    @Req() req: HeroRequest,
    @Body() body: { zone?: string },
  ) {
    if (!req.heroId) {
      throw new BadRequestException('Select a hero before checking in');
    }
    return this.venues.checkIn(sourceId, req.heroId, body?.zone);
  }

  /** Leave — ends the session but never revokes consent. */
  @Post(':sourceId/check-out')
  @UseGuards(AccountGuard)
  @HttpCode(200)
  checkOut(@Param('sourceId') sourceId: string, @Req() req: HeroRequest) {
    if (!req.heroId) {
      throw new BadRequestException('Select a hero before checking out');
    }
    return this.venues.checkOut(sourceId, req.heroId);
  }
}
