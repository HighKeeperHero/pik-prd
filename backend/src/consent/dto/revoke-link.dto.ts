// ============================================================
// PIK — Revoke Link DTO
//
// Validates DELETE /api/users/:root_id/links/:link_id body.
//
// Place at: src/consent/dto/revoke-link.dto.ts
// ============================================================

import { IsString, IsOptional } from 'class-validator';

export class RevokeLinkDto {
  /**
   * Who initiated the revocation.
   * "user" for user-initiated, "operator:<id>" for operator-initiated.
   * Defaults to "user" if not provided.
   */
  @IsString()
  @IsOptional()
  revoked_by?: string;
}
