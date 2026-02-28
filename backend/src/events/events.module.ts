// ============================================================
// PIK — Events Module
//
// The append-only identity event ledger.
// Exported so every other module can inject EventsService
// to log identity state transitions.
//
// Place at: src/events/events.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { SseModule } from '../sse/sse.module';

@Module({
  imports: [SseModule],
  providers: [EventsService],
  exports: [EventsService],        // Identity, Consent, Ingest, Auth all need this
})
export class EventsModule {}
