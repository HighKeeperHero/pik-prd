// ============================================================
// PIK — Identity Admin Controller
// Operator-facing routes for identity management.
//
// Place at: src/identity/identity-admin.controller.ts
// ============================================================

import {
  Controller,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { IdentityService } from './identity.service';

@Controller('api/users')
export class IdentityAdminController {
  private readonly logger = new Logger(IdentityAdminController.name);

  constructor(private readonly identityService: IdentityService) {}

  /**
   * DELETE /api/users/:id
   *
   * Hard-deletes a root identity and all associated records:
   * gear, sessions, wearables, quests, fate caches, markers,
   * titles, source links, events, personas, and the root record.
   *
   * Operator-only — no player-facing auth guard required
   * (dashboard sits behind Railway private networking / basic auth).
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteIdentity(@Param('id') id: string) {
    const result = await this.identityService.deleteIdentity(id);
    return {
      status: 'ok',
      data: result,
    };
  }
}
