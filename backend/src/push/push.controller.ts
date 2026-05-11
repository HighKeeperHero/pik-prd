// ============================================================
// PIK — Push Controller
//
// /api/account/push/* — push token registration. Account-session
// auth (same as fate-account routes) — req.heroId is the FK target
// for storing the token.
// ============================================================

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccountGuard } from '../auth/guards/account.guard';
import { PushService } from './push.service';
import { RegisterPushDto } from './dto/register-push.dto';

type AuthedRequest = Request & { accountId: string; heroId: string | null };

function requireHeroId(req: AuthedRequest): string {
  if (!req.heroId) {
    throw new BadRequestException('No hero selected on this session.');
  }
  return req.heroId;
}

@Controller('api/account/push')
@UseGuards(AccountGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Post('register')
  async register(@Req() req: AuthedRequest, @Body() body: RegisterPushDto) {
    await this.push.registerToken(requireHeroId(req), body.token);
    return { registered: true };
  }

  @Post('unregister')
  async unregister(@Req() req: AuthedRequest) {
    await this.push.clearToken(requireHeroId(req));
    return { registered: false };
  }
}
