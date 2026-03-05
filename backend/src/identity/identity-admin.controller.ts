// ============================================================
// PIK — Identity Admin Controller
// Operator-facing routes for identity management.
//
// Uses /api/admin/users to avoid route conflicts with the
// existing IdentityController at /api/users.
//
// Place at: src/identity/identity-admin.controller.ts
// ============================================================

import {
  Controller,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IdentityService } from './identity.service';

@Controller('api/admin/users')
export class IdentityAdminController {
  constructor(private readonly identityService: IdentityService) {}

  /**
   * DELETE /api/admin/users/:id
   * Hard-deletes a root identity and all associated records.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteIdentity(@Param('id') id: string) {
    const data = await this.identityService.deleteIdentity(id);
    return { status: 'ok', data };
  }
}
