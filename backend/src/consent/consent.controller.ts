// ============================================================
// PIK — Consent Controller
// Routes: /api/users/:root_id/links
//
// Manages source link grant, revoke, and listing.
// Preserves the exact MVP endpoint contract.
//
// Place at: src/consent/consent.controller.ts
// ============================================================

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ConsentService } from './consent.service';
import { GrantLinkDto } from './dto/grant-link.dto';
import { RevokeLinkDto } from './dto/revoke-link.dto';

@Controller('api/users/:root_id/links')
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  /**
   * POST /api/users/:root_id/links
   *
   * Grant a new source link (consent receipt).
   *
   * MVP contract preserved:
   *   Request:  { source_id, granted_by, scope? }
   *   Response: { link_id, source_id, source_name, scope, granted_by, granted_at }
   */
  @Post()
  async grantLink(
    @Param('root_id') rootId: string,
    @Body() dto: GrantLinkDto,
  ) {
    return this.consentService.grantLink(rootId, dto);
  }

  /**
   * GET /api/users/:root_id/links
   *
   * List all source links for a user (active and revoked).
   *
   * MVP contract preserved:
   *   Response: [ { link_id, source_id, source_name, scope, status, granted_by, ... } ]
   */
  @Get()
  async getLinks(@Param('root_id') rootId: string) {
    return this.consentService.getLinks(rootId);
  }

  /**
   * DELETE /api/users/:root_id/links/:link_id
   *
   * Revoke a source link. Existing progression is preserved —
   * the kernel is append-only. Only future events are blocked.
   *
   * MVP contract preserved:
   *   Request:  { revoked_by? }
   *   Response: { link_id, source_id, source_name, status, revoked_by, revoked_at }
   */
  @Delete(':link_id')
  async revokeLink(
    @Param('root_id') rootId: string,
    @Param('link_id') linkId: string,
    @Body() dto: RevokeLinkDto,
  ) {
    return this.consentService.revokeLink(rootId, linkId, dto);
  }
}
