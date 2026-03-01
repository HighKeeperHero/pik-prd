// ============================================================
// PIK — Wearable Controller (Sprint 7.2 — Wearable Bridge)
//
// REST API for wearable identity resolution.
//
// Core tap flow (venue hardware):
//   POST /api/wearable/tap    — resolve token → identity (+ auto check-in)
//
// Management:
//   POST /api/wearable/issue         — bind token to identity
//   GET  /api/wearable/tokens        — all active tokens
//   GET  /api/wearable/player/:id    — tokens for a player
//   POST /api/wearable/:id/revoke    — deactivate token
//
// Place at: src/wearable/wearable.controller.ts
// ============================================================

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { WearableService } from './wearable.service';

@Controller('api/wearable')
export class WearableController {
  constructor(private readonly wearableService: WearableService) {}

  // ── Core Tap Flow ──────────────────────────────────────

  /**
   * POST /api/wearable/tap
   *
   * The key API contract for venue hardware integration.
   * Venue reader sends token_uid, PIK resolves to identity.
   *
   * Body:
   *   token_uid: string       (required — physical token ID)
   *   source_id?: string      (which venue is tapping)
   *   zone?: string           (zone within venue)
   *   auto_checkin?: boolean  (start live session on tap)
   */
  @Post('tap')
  @SkipThrottle()
  tap(
    @Body() body: {
      token_uid: string;
      source_id?: string;
      zone?: string;
      auto_checkin?: boolean;
    },
  ) {
    return this.wearableService.resolve({
      tokenUid: body.token_uid,
      sourceId: body.source_id,
      zone: body.zone,
      autoCheckin: body.auto_checkin,
    });
  }

  // ── Token Management ───────────────────────────────────

  @Post('issue')
  issue(
    @Body() body: {
      root_id: string;
      token_type: string;
      token_uid?: string;
      friendly_name?: string;
      expires_at?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.wearableService.issueToken({
      rootId: body.root_id,
      tokenType: body.token_type,
      tokenUid: body.token_uid,
      friendlyName: body.friendly_name,
      expiresAt: body.expires_at,
      metadata: body.metadata,
    });
  }

  @Get('tokens')
  @SkipThrottle()
  getAllTokens() {
    return this.wearableService.getAllActiveTokens();
  }

  @Get('player/:rootId')
  getPlayerTokens(@Param('rootId') rootId: string) {
    return this.wearableService.getTokensForPlayer(rootId);
  }

  @Post(':tokenId/revoke')
  revoke(@Param('tokenId') tokenId: string) {
    return this.wearableService.revokeToken(tokenId);
  }
}
