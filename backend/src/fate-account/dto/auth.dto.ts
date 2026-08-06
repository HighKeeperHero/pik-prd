// src/fate-account/dto/auth.dto.ts

import { IsEmail, IsString, MinLength, IsOptional, IsObject } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  display_name?: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class GoogleAuthDto {
  @IsString()
  id_token: string; // Google ID token from frontend OAuth flow
}

export class AppleAuthDto {
  @IsString()
  identity_token: string; // Apple identity token from frontend Sign In with Apple

  @IsOptional()
  @IsString()
  full_name?: string; // Apple only sends this on first sign-in
}

/** Attach a provider to the account you are ALREADY signed in as.
 *  Exactly one token field is required; which one names the provider. */
export class LinkIdentityDto {
  @IsOptional()
  @IsString()
  google_id_token?: string;

  @IsOptional()
  @IsString()
  apple_identity_token?: string;
}

export class CreateHeroDto {
  @IsString()
  @MinLength(2)
  hero_name: string;

  @IsOptional()
  @IsString()
  origin?: string;

  // Sprint 33 — Character Creation appearance ({ gender, ancestry, region,
  // kit, hairstyle }); stored as JSON, drives the Profile portrait.
  @IsOptional()
  @IsObject()
  appearance?: Record<string, unknown>;

  // Awakening narrative fields — previously dropped by this DTO (the frontend
  // has always sent them). RootIdentity already has the columns.
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() wound?: string;
  @IsOptional() @IsString() calling?: string;
  @IsOptional() @IsString() virtue?: string;
  @IsOptional() @IsString() vice?: string;
}

export class UpdateHeroAlignmentDto {
  @IsString()
  alignment: string; // ORDER | CHAOS | LIGHT | DARK
}

export class SelectHeroDto {
  @IsString()
  hero_id: string;
}
