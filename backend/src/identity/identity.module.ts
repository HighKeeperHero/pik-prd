// ============================================================
// PIK — Identity Module
// Place at: src/identity/identity.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { IdentityController } from './identity.controller';
import { IdentityAdminController } from './identity-admin.controller';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [IdentityController, IdentityAdminController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
