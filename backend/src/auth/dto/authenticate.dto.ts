// ============================================================
// PIK — WebAuthn Authentication DTOs
//
// Two-step authentication flow:
//   1. POST /api/auth/authenticate/options  → get challenge
//   2. POST /api/auth/authenticate/verify   → submit assertion
//
// Place at: src/auth/dto/authenticate.dto.ts
// ============================================================

import { IsString, IsOptional, IsObject, IsNotEmpty } from 'class-validator';

/**
 * Step 1: Request authentication options (challenge).
 * Optionally provide a root_id to scope allowed credentials.
 * If omitted, the server returns a "discoverable" challenge
 * that lets the browser pick from any registered passkey.
 */
export class AuthenticateOptionsDto {
  /** Optional RootID to scope allowed credentials */
  @IsString()
  @IsOptional()
  root_id?: string;
}

/**
 * Step 2: Submit the assertion response from the browser.
 * The browser's navigator.credentials.get() returns this.
 */
export class AuthenticateVerifyDto {
  /** The full assertion response from the browser, JSON-serialized */
  @IsObject()
  @IsNotEmpty()
  assertion: Record<string, unknown>;
}
