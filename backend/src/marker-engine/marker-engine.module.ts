// ============================================================
// PIK — Marker Engine Module
//
// Place at: src/marker-engine/marker-engine.module.ts
// ============================================================

import { Module }              from '@nestjs/common';
import { MarkerEngineService } from './marker-engine.service';
import { PrismaService }       from '../prisma.service';
import { EventsService }       from '../events/events.service';
import { LootModule }          from '../loot/loot.module';

@Module({
  imports:   [LootModule],          // gives us LootService
  providers: [MarkerEngineService, PrismaService, EventsService],
  exports:   [MarkerEngineService], // IngestModule imports this
})
export class MarkerEngineModule {}
