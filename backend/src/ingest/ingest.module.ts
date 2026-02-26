// ============================================================
// PIK — Ingest Module
//
// Progression event processing. Depends on:
//   - EventsModule:    to log events to the append-only ledger
//   - ConsentModule:   to validate active source links
//   - IdentityModule:  to read progression config
//
// Place at: src/ingest/ingest.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { EventsModule } from '../events/events.module';
import { ConsentModule } from '../consent/consent.module';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [EventsModule, ConsentModule, IdentityModule],
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}
