import {
  BadRequestException, Body, Controller, Get, Post, Req, UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccountGuard } from '../auth/guards/account.guard';
import { FoxService } from './fox.service';

type AuthedRequest = Request & { accountId: string; heroId: string | null };

function requireHeroId(req: AuthedRequest): string {
  if (!req.heroId) throw new BadRequestException('No hero selected on this session.');
  return req.heroId;
}

@Controller('api/fox')
@UseGuards(AccountGuard)
export class FoxController {
  constructor(private readonly fox: FoxService) {}

  @Get('status')
  status(@Req() req: AuthedRequest) {
    return this.fox.status(requireHeroId(req));
  }

  @Get('calling')
  calling(@Req() req: AuthedRequest) {
    return this.fox.calling(requireHeroId(req));
  }

  @Post('calling')
  submitCalling(
    @Req() req: AuthedRequest,
    @Body() body: { answers?: Record<string, string> },
  ) {
    return this.fox.submitCalling(requireHeroId(req), body?.answers ?? {});
  }

  @Post('customize')
  customize(
    @Req() req: AuthedRequest,
    @Body() body: {
      name?: string;
      furPrimary?: string; furSecondary?: string; eyeColor?: string;
      collar?: string; pendant?: string; auraColor?: string;
    },
  ) {
    return this.fox.customize(requireHeroId(req), body ?? {});
  }

  @Post('witness')
  witness(@Req() req: AuthedRequest, @Body() body: { beat?: string }) {
    return this.fox.witness(requireHeroId(req), body?.beat ?? '');
  }

  @Get('catalogs')
  catalogs() {
    return this.fox.catalogs();
  }
}
