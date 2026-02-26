// ============================================================
// PIK — Grant Link DTO
//
// Validates POST /api/users/:root_id/links request body.
// Creates a consent receipt linking a user to a source.
//
// Place at: src/consent/dto/grant-link.dto.ts
// ============================================================

import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class GrantLinkDto {
  /**
   * The source to link this identity to.
   * Must match an existing, active source_id in the sources table.
   */
  @IsString()
  @IsNotEmpty()
  source_id: string;

  /**
   * Who authorized this link.
   * "self" for user-initiated, "operator:<id>" for operator-initiated.
   */
  @IsString()
  @IsNotEmpty()
  granted_by: string;

  /**
   * Custom scope override. Defaults to the system default
   * ("xp fate_markers titles") if not provided.
   */
  @IsString()
  @IsOptional()
  scope?: string;
}
