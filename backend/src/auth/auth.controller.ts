// ============================================================
// PIK — Auth Controller (Sprint 3 — Rate Limited)
// Routes: /api/auth/*
//
// Rate limits:
//   - Register/Authenticate: 10 per minute (prevent brute force)
//   - Key management: 20 per minute (normal use)
//
// Place at: src/auth/auth.controller.ts
// ============================================================

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { KeyService } from './key.service';
import { SessionGuard } from './guards/session.guard';
import { RegisterOptionsDto, RegisterVerifyDto } from './dto/register.dto';
import {
  AuthenticateOptionsDto,
  AuthenticateVerifyDto,
} from './dto/authenticate.dto';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly keyService: KeyService,
  ) {}

  // ── Registration (strict: 10/min) ────────────────────────

  @Post('register/options')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async registerOptions(@Body() dto: RegisterOptionsDto) {
    return this.authService.generateRegistrationOptions(dto);
  }

  @Post('register/verify')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async registerVerify(@Body() dto: RegisterVerifyDto) {
    return this.authService.verifyRegistration(
      dto.attestation,
      dto.friendly_name,
    );
  }

  // ── Authentication (strict: 10/min) ──────────────────────

  @Post('authenticate/options')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async authenticateOptions(@Body() dto: AuthenticateOptionsDto) {
    return this.authService.generateAuthenticationOptions(dto);
  }

  @Post('authenticate/verify')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async authenticateVerify(@Body() dto: AuthenticateVerifyDto) {
    return this.authService.verifyAuthentication(dto.assertion);
  }

  // ── Key Management (session-protected, 20/min) ───────────

  @Get('keys')
  @UseGuards(SessionGuard)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async listKeys(@Req() req: Request & { rootId: string }) {
    return this.keyService.listKeys(req.rootId);
  }

  @Post('keys/rotate')
  @UseGuards(SessionGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async rotateKeyOptions(@Req() req: Request & { rootId: string }) {
    return this.keyService.generateRotationOptions(req.rootId);
  }

  @Post('keys/rotate/verify')
  @UseGuards(SessionGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async rotateKeyVerify(
    @Req() req: Request & { rootId: string },
    @Body()
    body: { attestation: Record<string, unknown>; friendly_name?: string },
  ) {
    return this.keyService.verifyRotation(
      req.rootId,
      body.attestation,
      body.friendly_name,
    );
  }

  @Post('keys/:key_id/revoke')
  @UseGuards(SessionGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async revokeKey(
    @Req() req: Request & { rootId: string },
    @Param('key_id') keyId: string,
  ) {
    return this.keyService.revokeKey(req.rootId, keyId);
  }

  // ── Operator Impersonate (creates session for any user) ───

  @Post('impersonate/:root_id')
  async impersonate(@Param('root_id') rootId: string) {
    return this.authService.issueSessionToken(rootId);
  }
}
