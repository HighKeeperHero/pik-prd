// ============================================================
// PIK — Identity Admin Module
// Standalone module for operator identity management actions.
// Registered directly in AppModule — does NOT touch IdentityModule.
//
// Place at: src/identity/identity-admin.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { IdentityAdminController } from './identity-admin.controller';
import { IdentityModule } from './identity.module';

@Module({
  imports: [IdentityModule],
  controllers: [IdentityAdminController],
})
export class IdentityAdminModule {}
