// ============================================================
// PIK — Quest Module (Sprint 7.3 — Quest Engine)
// Place at: src/quest/quest.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { QuestService } from './quest.service';
import { QuestController } from './quest.controller';
import { QuestLogService } from './quest-log.service';
import { QuestLogController, ChaptersController } from './quest-log.controller';
import { EventsModule } from '../events/events.module';
import { SseModule } from '../sse/sse.module';
import { LevelingModule } from '../leveling/leveling.module';
import { AuthModule } from '../auth/auth.module';
import { FateAccountModule } from '../fate-account/fate-account.module';
import { AccountGuard } from '../auth/guards/account.guard';

@Module({
  imports: [EventsModule, SseModule, LevelingModule, AuthModule, FateAccountModule],
  controllers: [QuestController, QuestLogController, ChaptersController],
  providers: [QuestService, QuestLogService, AccountGuard],
  exports: [QuestService, QuestLogService],
})
export class QuestModule {}
