// ============================================================
// PIK — Enroll User DTO
//
// Validates the POST /api/users/enroll request body.
// Matches the exact field names the MVP accepts.
//
// Place at: src/identity/dto/enroll-user.dto.ts
// ============================================================

import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsIn,
} from 'class-validator';

export class EnrollUserDto {
  /**
   * The hero's display name within the mythic identity layer.
   * Required. This becomes the persona's displayName.
   */
  @IsString()
  @IsNotEmpty()
  hero_name: string;

  /**
   * Fate alignment — the hero's mythic orientation.
   * Required. Free-form string (Order, Chaos, Wild, Veil, etc.)
   */
  @IsString()
  @IsNotEmpty()
  fate_alignment: string;

  /**
   * Origin story / background label.
   * Optional narrative metadata.
   */
  @IsString()
  @IsOptional()
  origin?: string;

  /**
   * Who initiated this enrollment.
   * "self" for B2C self-enrollment.
   * "operator:<id>" for B2B operator-enrolled paths.
   */
  @IsString()
  @IsNotEmpty()
  enrolled_by: string;

  /**
   * Immediately link the new identity to this source.
   * Optional — self-enrolled users may add sources later.
   * Must match an existing source_id in the sources table.
   */
  @IsString()
  @IsOptional()
  source_id?: string;
}
