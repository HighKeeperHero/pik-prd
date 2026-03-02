// ============================================================
// PIK — Quest Module (Sprint 7.3 — Quest Engine)
// Place at: src/quest/quest.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { QuestService } from './quest.service';
import { QuestController } from './quest.controller';
import { EventsModule } from '../events/events.module';
import { SseModule } from '../sse/sse.module';

@Module({
  imports: [EventsModule, SseModule],
  controllers: [QuestController],
  providers: [QuestService],
  exports: [QuestService],
})
export class QuestModule {}
