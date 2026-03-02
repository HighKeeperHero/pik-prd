// ============================================================
// PIK — Demo Module (Sprint 6 — Track A)
// Place at: src/demo/demo.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { EventsModule } from '../events/events.module';
import { LootModule } from '../loot/loot.module';
import { SessionModule } from '../session/session.module';
import { WearableModule } from '../wearable/wearable.module';
import { QuestModule } from '../quest/quest.module';

@Module({
  imports: [EventsModule, LootModule, SessionModule, WearableModule, QuestModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
