// src/fate-account/dto/auth.dto.ts

import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

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

export class CreateHeroDto {
  @IsString()
  @MinLength(2)
  hero_name: string;

  @IsOptional()
  @IsString()
  origin?: string;
}

export class UpdateHeroAlignmentDto {
  @IsString()
  alignment: string; // ORDER | CHAOS | LIGHT | DARK
}

export class SelectHeroDto {
  @IsString()
  hero_id: string;
}
