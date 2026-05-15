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
import { SanctumService } from './sanctum.service';
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
}
