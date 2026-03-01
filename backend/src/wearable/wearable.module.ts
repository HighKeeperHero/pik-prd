// ============================================================
// PIK — Wearable Module (Sprint 7.2 — Wearable Bridge)
// Place at: src/wearable/wearable.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { WearableService } from './wearable.service';
import { WearableController } from './wearable.controller';
import { EventsModule } from '../events/events.module';
import { SseModule } from '../sse/sse.module';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [EventsModule, SseModule, SessionModule],
  controllers: [WearableController],
  providers: [WearableService],
  exports: [WearableService],
})
export class WearableModule {}
