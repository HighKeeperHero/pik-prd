// ============================================================
// PIK — Auth Controller
// Routes: /api/auth/*
//
// WebAuthn registration, authentication, key rotation,
// and key revocation. Session-protected routes use the
// SessionGuard to require a valid Bearer token.
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
import { AuthService } from './auth.service';
import { KeyService } from './key.service';
import { SessionGuard } from './guards/session.guard';
import { RegisterOptionsDto, RegisterVerifyDto } from './dto/register.dto';
import { AuthenticateOptionsDto, AuthenticateVerifyDto } from './dto/authenticate.dto';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly keyService: KeyService,
  ) {}

  // ── Registration ──────────────────────────────────────────

  /**
   * POST /api/auth/register/options
   *
   * Generate WebAuthn registration challenge.
   * Called before navigator.credentials.create().
   *
   * Request:  { hero_name, fate_alignment, origin?, enrolled_by?, source_id? }
   * Response: PublicKeyCredentialCreationOptions (JSON)
   */
  @Post('register/options')
  async registerOptions(@Body() dto: RegisterOptionsDto) {
    return this.authService.generateRegistrationOptions(dto);
  }

  /**
   * POST /api/auth/register/verify
   *
   * Verify the attestation response from the browser.
   * Creates RootID, stores public key, issues session token.
   *
   * Request:  { attestation: <browser response>, friendly_name? }
   * Response: { root_id, persona_id, key_id, session_token, ... }
   */
  @Post('register/verify')
  async registerVerify(@Body() dto: RegisterVerifyDto) {
    return this.authService.verifyRegistration(
      dto.attestation,
      dto.friendly_name,
    );
  }

  // ── Authentication ────────────────────────────────────────

  /**
   * POST /api/auth/authenticate/options
   *
   * Generate WebAuthn authentication challenge.
   * Called before navigator.credentials.get().
   *
   * Request:  { root_id? }  — omit for discoverable credentials
   * Response: PublicKeyCredentialRequestOptions (JSON)
   */
  @Post('authenticate/options')
  async authenticateOptions(@Body() dto: AuthenticateOptionsDto) {
    return this.authService.generateAuthenticationOptions(dto);
  }

  /**
   * POST /api/auth/authenticate/verify
   *
   * Verify the assertion response from the browser.
   * Issues a session token on success.
   *
   * Request:  { assertion: <browser response> }
   * Response: { root_id, hero_name, key_id, session_token, ... }
   */
  @Post('authenticate/verify')
  async authenticateVerify(@Body() dto: AuthenticateVerifyDto) {
    return this.authService.verifyAuthentication(dto.assertion);
  }

  // ── Key Management (requires active session) ──────────────

  /**
   * GET /api/auth/keys
   *
   * List all credentials for the authenticated user.
   * Requires: Authorization: Bearer <session_token>
   *
   * Response: [ { key_id, device_type, status, created_at, ... } ]
   */
  @Get('keys')
  @UseGuards(SessionGuard)
  async listKeys(@Req() req: Request & { rootId: string }) {
    return this.keyService.listKeys(req.rootId);
  }

  /**
   * POST /api/auth/keys/rotate
   *
   * Generate registration options for a NEW credential.
   * The old key remains active until explicitly revoked.
   * Requires: Authorization: Bearer <session_token>
   *
   * Response: PublicKeyCredentialCreationOptions (JSON)
   */
  @Post('keys/rotate')
  @UseGuards(SessionGuard)
  async rotateKeyOptions(@Req() req: Request & { rootId: string }) {
    return this.keyService.generateRotationOptions(req.rootId);
  }

  /**
   * POST /api/auth/keys/rotate/verify
   *
   * Verify and store the new rotated credential.
   * Requires: Authorization: Bearer <session_token>
   *
   * Request:  { attestation: <browser response>, friendly_name? }
   * Response: { key_id, device_type, created_at }
   */
  @Post('keys/rotate/verify')
  @UseGuards(SessionGuard)
  async rotateKeyVerify(
    @Req() req: Request & { rootId: string },
    @Body() body: { attestation: Record<string, unknown>; friendly_name?: string },
  ) {
    return this.keyService.verifyRotation(
      req.rootId,
      body.attestation,
      body.friendly_name,
    );
  }

  /**
   * POST /api/auth/keys/:key_id/revoke
   *
   * Revoke a credential. Immediately fails authentication.
   * SAFETY: Cannot revoke the last active key (returns 409).
   * Requires: Authorization: Bearer <session_token>
   *
   * Response: { key_id, status: "revoked", revoked_at }
   */
  @Post('keys/:key_id/revoke')
  @UseGuards(SessionGuard)
  async revokeKey(
    @Req() req: Request & { rootId: string },
    @Param('key_id') keyId: string,
  ) {
    return this.keyService.revokeKey(req.rootId, keyId);
  }
}
