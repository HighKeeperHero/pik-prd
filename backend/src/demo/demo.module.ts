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

@Module({
  imports: [EventsModule, LootModule, SessionModule, WearableModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
