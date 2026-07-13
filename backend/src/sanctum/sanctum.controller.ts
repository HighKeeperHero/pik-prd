// ============================================================
// PIK — Sanctum Controller
//
// /api/sanctum/* — daily-ritual state for the iOS app.
// All routes require a valid session token (SessionGuard).
// ============================================================

import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccountGuard } from '../auth/guards/account.guard';
import { SanctumService, type UpgradeTrack } from './sanctum.service';
import { SwearOathDto } from './dto/swear-oath.dto';

type AuthedRequest = Request & { accountId: string; heroId: string | null };

function requireHeroId(req: AuthedRequest): string {
  if (!req.heroId) {
    throw new BadRequestException('No hero selected on this session.');
  }
  return req.heroId;
}

@Controller('api/sanctum')
@UseGuards(AccountGuard)
export class SanctumController {
  constructor(private readonly sanctum: SanctumService) {}

  // Controllers return raw objects; the global response interceptor
  // adds the { data: ... } envelope. Wrapping here would double-wrap
  // and break clients that single-unwrap with `json?.data ?? json`.

  @Get('state')
  async getState(@Req() req: AuthedRequest) {
    return this.sanctum.getOrCreateState(requireHeroId(req));
  }

  @Post('hearth/claim')
  async claimHearth(@Req() req: AuthedRequest) {
    const state = await this.sanctum.claimHearth(requireHeroId(req));
    return { state, granted: SanctumService.HEARTH_REWARD };
  }

  @Post('oath')
  async swearOath(@Req() req: AuthedRequest, @Body() body: SwearOathDto) {
    return this.sanctum.swearOath(requireHeroId(req), body.option);
  }

  // Sprint 30 / Slice 5.1 — Veil Trial completion.
  // Body: { score: number }. Returns the updated sanctum_state +
  // xp_award + granted essence + score / best.
  @Post('trial/complete')
  async completeTrial(@Req() req: AuthedRequest, @Body() body: { score?: number }) {
    const score = Number(body?.score ?? 0);
    return this.sanctum.completeTrial(requireHeroId(req), score);
  }

  // 2026-07-08 — Rite of Purification (replaces the Wisp Harvest).
  // Body: { purity: 0-100, nodes_purified?, corruption_removed? }.
  // Server grades (S/A/B/C) and scales essence by Sanctum level.
  @Post('rite/complete')
  async completeRite(
    @Req() req: AuthedRequest,
    @Body() body: { purity?: number; nodes_purified?: number; corruption_removed?: number },
  ) {
    return this.sanctum.completeRite(requireHeroId(req), {
      purity:            Number(body?.purity ?? 0),
      nodesPurified:     Number(body?.nodes_purified ?? 0),
      corruptionRemoved: Number(body?.corruption_removed ?? 0),
    });
  }

  // Sprint 30 / Slice 5.2 — Augury Draw.
  // No body. Server-side weighted pick of 3 cards from AUGURY_DECK.
  // Returns the cards + aggregated essence/xp/cache grants.
  @Post('augury/draw')
  async drawAugury(@Req() req: AuthedRequest) {
    return this.sanctum.drawAugury(requireHeroId(req));
  }

  // 2026-07-06 — restoration upgrade commit (the UPGRADE button).
  // Body: { track: 'sanctum' | 'library' | 'forge' | 'altar' | 'hearth' }. Validates
  // points thresholds + wing prerequisites; 409 with a player-
  // readable message when a gate is unmet. Returns updated state.
  @Post('upgrade')
  async upgrade(@Req() req: AuthedRequest, @Body() body: { track?: string }) {
    const track = body?.track as UpgradeTrack;
    if (!['sanctum', 'library', 'forge', 'altar', 'hearth'].includes(track)) {
      throw new BadRequestException('track must be sanctum | library | forge | altar | hearth');
    }
    return this.sanctum.upgrade(requireHeroId(req), track);
  }

  // 2026-07-10 — restoration economy: upgrade STARTS a timed build
  // (essence + materials deducted); this claims a finished one.
  @Post('upgrade/complete')
  async completeBuild(@Req() req: AuthedRequest, @Body() body: { track?: string }) {
    const track = body?.track as UpgradeTrack;
    if (!['sanctum', 'library', 'forge', 'altar', 'hearth'].includes(track)) {
      throw new BadRequestException('track must be sanctum | library | forge | altar | hearth');
    }
    return this.sanctum.completeBuild(requireHeroId(req), track);
  }
}
