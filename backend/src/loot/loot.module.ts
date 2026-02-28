// ============================================================
// PIK — Loot Module (Sprint 6)
// Place at: src/loot/loot.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { LootController } from './loot.controller';
import { LootService } from './loot.service';
import { EventsModule } from '../events/events.module';
import { AuthModule } from '../auth/auth.module';
import { GearModule } from '../gear/gear.module';

@Module({
  imports: [EventsModule, AuthModule, GearModule],
  controllers: [LootController],
  providers: [LootService],
  exports: [LootService],
})
export class LootModule {}
