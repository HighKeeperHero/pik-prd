// ============================================================
// PIK — Identity Admin Module
// Standalone module for operator identity management actions.
// Registered directly in AppModule — does NOT touch IdentityModule.
//
// Place at: src/identity/identity-admin.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { IdentityAdminController } from './identity-admin.controller';
import { IdentityService } from './identity.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [IdentityAdminController],
  providers: [IdentityService],
})
export class IdentityAdminModule {}
