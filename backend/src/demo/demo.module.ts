// ============================================================
// PIK — Demo Module (Sprint 6 — Track A)
// Place at: src/demo/demo.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { EventsModule } from '../events/events.module';
import { LootModule } from '../loot/loot.module';

@Module({
  imports: [EventsModule, LootModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
