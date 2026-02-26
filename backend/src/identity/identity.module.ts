// ============================================================
// PIK — Identity Module
//
// The core identity kernel: enrollment, lookup, profiles.
// Imports EventsModule to log all identity state transitions
// to the append-only ledger.
//
// Place at: src/identity/identity.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [IdentityService],       // IngestService will need getProgressionConfig()
})
export class IdentityModule {}
