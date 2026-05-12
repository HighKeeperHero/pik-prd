// ============================================================
// PIK — IAP Controller
//
// /api/account/iap/* — StoreKit 2 redemption. Account-session
// auth; req.heroId is the hero credited.
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
import { IapService } from './iap.service';
import { RedeemIapDto } from './dto/redeem-iap.dto';

type AuthedRequest = Request & { accountId: string; heroId: string | null };

function requireHeroId(req: AuthedRequest): string {
  if (!req.heroId) {
    throw new BadRequestException('No hero selected on this session.');
  }
  return req.heroId;
}

@Controller('api/account/iap')
@UseGuards(AccountGuard)
export class IapController {
  constructor(private readonly iap: IapService) {}

  @Post('redeem')
  async redeem(@Req() req: AuthedRequest, @Body() body: RedeemIapDto) {
    return this.iap.redeem(requireHeroId(req), body.signedTransaction);
  }
}
