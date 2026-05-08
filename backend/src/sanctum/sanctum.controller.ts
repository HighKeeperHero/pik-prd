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
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/guards/session.guard';
import { SanctumService } from './sanctum.service';
import { SwearOathDto } from './dto/swear-oath.dto';

type AuthedRequest = Request & { rootId: string };

@Controller('api/sanctum')
@UseGuards(SessionGuard)
export class SanctumController {
  constructor(private readonly sanctum: SanctumService) {}

  @Get('state')
  async getState(@Req() req: AuthedRequest) {
    const state = await this.sanctum.getOrCreateState(req.rootId);
    return { data: state };
  }

  @Post('hearth/claim')
  async claimHearth(@Req() req: AuthedRequest) {
    const state = await this.sanctum.claimHearth(req.rootId);
    return {
      data: {
        state,
        granted: SanctumService.HEARTH_REWARD,
      },
    };
  }

  @Post('oath')
  async swearOath(@Req() req: AuthedRequest, @Body() body: SwearOathDto) {
    const state = await this.sanctum.swearOath(req.rootId, body.option);
    return { data: state };
  }
}
