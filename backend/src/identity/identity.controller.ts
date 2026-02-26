// ============================================================
// PIK — Identity Controller
// Routes: /api/users/*
//
// Preserves the exact endpoint contract from the Python MVP.
// The dashboard and HV connector call these paths directly.
//
// Place at: src/identity/identity.controller.ts
// ============================================================

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
} from '@nestjs/common';
import { IdentityService } from './identity.service';
import { EnrollUserDto } from './dto/enroll-user.dto';

@Controller('api/users')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  /**
   * POST /api/users/enroll
   *
   * Create a new RootID + PersonaID.
   * Optionally links to a source immediately.
   *
   * MVP contract preserved:
   *   Request:  { hero_name, fate_alignment, origin?, enrolled_by, source_id? }
   *   Response: { root_id, persona_id, hero_name, fate_alignment, link_id?, enrolled_at }
   *   Wrapped:  { status: "ok", data: { ... } }
   */
  @Post('enroll')
  async enroll(@Body() dto: EnrollUserDto) {
    return this.identityService.enroll(dto);
  }

  /**
   * GET /api/users
   *
   * List all enrolled identities.
   * Used by the dashboard left panel to render user cards.
   *
   * MVP contract preserved:
   *   Response: [ { root_id, hero_name, fate_alignment, fate_xp, fate_level, active_sources } ]
   */
  @Get()
  async listUsers() {
    return this.identityService.listUsers();
  }

  /**
   * GET /api/users/:root_id
   *
   * Full identity profile including personas, source links,
   * titles, and fate markers.
   * Used by the dashboard detail view.
   *
   * MVP contract preserved:
   *   Response: { root_id, hero_name, ..., personas, source_links, titles, fate_markers }
   */
  @Get(':root_id')
  async getUser(@Param('root_id') rootId: string) {
    return this.identityService.getUser(rootId);
  }

  /**
   * GET /api/users/:root_id/timeline
   *
   * Append-only event ledger for a single identity.
   * Newest events first.
   *
   * MVP contract preserved:
   *   Response: [ { event_id, event_type, source_id, source_name, payload, changes_applied, created_at } ]
   */
  @Get(':root_id/timeline')
  async getTimeline(@Param('root_id') rootId: string) {
    return this.identityService.getTimeline(rootId);
  }
}
