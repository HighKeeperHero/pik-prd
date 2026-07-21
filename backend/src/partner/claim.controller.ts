// ============================================================
// HEP Phase 2 Slice 1 — guest claim redemption
//
// Routes: /api/claims/*
//
// Deliberately OUTSIDE /api/partner. This is called by the player's
// Codex app, not by the venue, and must not require a venue API key —
// the guest has left the building by the time they redeem.
//
// Redemption is account-authenticated so a claim lands on a hero the
// caller actually owns. Preview is open, because it reveals only what
// the bearer of the token already witnessed in the room.
//
// Place at: src/partner/claim.controller.ts
// ============================================================

import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccountGuard } from '../auth/guards/account.guard';
import { ClaimService } from './claim.service';

@Controller('api/claims')
export class ClaimController {
  constructor(private readonly claims: ClaimService) {}

  /**
   * Show what a token is worth without spending it. Rate limited hard —
   * this is the one route where an attacker could grind for valid tokens,
   * and 32 random bytes are not brute-forceable at 20 tries a minute.
   */
  @Get(':token')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  preview(@Param('token') token: string) {
    return this.claims.preview(token);
  }

  /** Redeem onto the caller's currently selected hero. */
  @Post(':token/redeem')
  @UseGuards(AccountGuard)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  redeem(@Param('token') token: string, @Req() req: RequestWithHero) {
    if (!req.heroId) {
      throw new BadRequestException(
        'Select a hero before redeeming a claim',
      );
    }
    return this.claims.redeem(token, req.heroId);
  }
}

type RequestWithHero = Request & { heroId?: string };
