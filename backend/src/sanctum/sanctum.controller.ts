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

  @Get('state')
  async getState(@Req() req: AuthedRequest) {
    const state = await this.sanctum.getOrCreateState(requireHeroId(req));
    return { data: state };
  }

  @Post('hearth/claim')
  async claimHearth(@Req() req: AuthedRequest) {
    const state = await this.sanctum.claimHearth(requireHeroId(req));
    return {
      data: {
        state,
        granted: SanctumService.HEARTH_REWARD,
      },
    };
  }

  @Post('oath')
  async swearOath(@Req() req: AuthedRequest, @Body() body: SwearOathDto) {
    const state = await this.sanctum.swearOath(requireHeroId(req), body.option);
    return { data: state };
  }
}
