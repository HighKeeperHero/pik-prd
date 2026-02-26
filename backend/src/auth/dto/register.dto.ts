// ============================================================
// PIK — WebAuthn Registration DTOs
//
// Two-step registration flow:
//   1. POST /api/auth/register/options  → get challenge
//   2. POST /api/auth/register/verify   → submit attestation
//
// Place at: src/auth/dto/register.dto.ts
// ============================================================

import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

/**
 * Step 1: Request registration options (challenge).
 * Sent before the browser calls navigator.credentials.create().
 */
export class RegisterOptionsDto {
  /** Hero display name for the new identity */
  @IsString()
  @IsNotEmpty()
  hero_name: string;

  /** Fate alignment (Order, Chaos, Wild, Veil, etc.) */
  @IsString()
  @IsNotEmpty()
  fate_alignment: string;

  /** Origin story — optional narrative metadata */
  @IsString()
  @IsOptional()
  origin?: string;

  /** Who initiated enrollment: "self" or "operator:<id>" */
  @IsString()
  @IsOptional()
  enrolled_by?: string;

  /** Immediately link to this source after registration */
  @IsString()
  @IsOptional()
  source_id?: string;
}

/**
 * Step 2: Submit the attestation response from the browser.
 * The browser's navigator.credentials.create() returns this.
 */
export class RegisterVerifyDto {
  /** The full attestation response from the browser, JSON-serialized */
  @IsObject()
  @IsNotEmpty()
  attestation: Record<string, unknown>;

  /** Optional friendly name for this credential ("iPhone 15", "YubiKey") */
  @IsString()
  @IsOptional()
  friendly_name?: string;
}
