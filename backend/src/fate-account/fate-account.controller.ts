// src/fate-account/fate-account.controller.ts
// ============================================================
// Routes:
//   POST /api/account/register        — email + password
//   POST /api/account/login           — email + password
//   POST /api/account/auth/google     — Google ID token
//   POST /api/account/auth/apple      — Apple identity token
//   POST /api/account/logout          — revoke session
//   GET  /api/account/heroes          — list heroes (auth required)
//   POST /api/account/heroes          — create hero (auth required)
//   POST /api/account/heroes/:id/select    — select active hero
//   PUT  /api/account/heroes/:id/alignment — set alignment (level 20+)
// ============================================================

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FateAccountService } from './fate-account.service';
import { AccountGuard } from '../auth/guards/account.guard';
import {
  RegisterDto,
  LoginDto,
  GoogleAuthDto,
  AppleAuthDto,
  CreateHeroDto,
  UpdateHeroAlignmentDto,
} from './dto/auth.dto';

@Controller('api/account')
export class FateAccountController {
  constructor(private readonly service: FateAccountService) {}

  // ── Auth (no guard needed) ─────────────────────────────────────────────────

  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async register(@Body() dto: RegisterDto) {
    return this.service.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async login(@Body() dto: LoginDto) {
    return this.service.login(dto);
  }

  @Post('auth/google')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async googleAuth(@Body() dto: GoogleAuthDto) {
    return this.service.googleAuth(dto);
  }

  @Post('auth/apple')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async appleAuth(@Body() dto: AppleAuthDto) {
    return this.service.appleAuth(dto);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request & { headers: { authorization?: string } }) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) await this.service.revokeSession(token);
  }

  // ── Hero management (AccountGuard required) ────────────────────────────────

  @Get('heroes')
  @UseGuards(AccountGuard)
  async listHeroes(@Req() req: Request & { accountId: string }) {
    return this.service.listHeroes(req.accountId);
  }

  @Post('heroes')
  @UseGuards(AccountGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async createHero(
    @Req() req: Request & { accountId: string },
    @Body() dto: CreateHeroDto,
  ) {
    return this.service.createHero(req.accountId, dto);
  }

  @Post('heroes/:id/select')
  @UseGuards(AccountGuard)
  @HttpCode(200)
  async selectHero(
    @Req() req: Request & { accountId: string; rawToken: string },
    @Param('id') heroId: string,
  ) {
    return this.service.selectHero(req.accountId, heroId, req.rawToken);
  }

  @Put('heroes/:id/alignment')
  @UseGuards(AccountGuard)
  async updateAlignment(
    @Req() req: Request & { accountId: string },
    @Param('id') heroId: string,
    @Body() dto: UpdateHeroAlignmentDto,
  ) {
    return this.service.updateAlignment(req.accountId, heroId, dto.alignment);
  }
}
