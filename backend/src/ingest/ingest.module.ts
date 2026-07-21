// ============================================================
// PIK — Ingest Module
//
// Progression event processing. Depends on:
//   - EventsModule:       to log events to the append-only ledger
//   - ConsentModule:      to validate active source links
//   - IdentityModule:     to read progression config
//   - MarkerEngineModule: to evaluate milestone thresholds on fate_marker events
//   - LevelingModule:     canonical Fate XP curve (Phase 2 Slice 0 — ingest
//                         no longer reimplements level math)
//
// Place at: src/ingest/ingest.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { EventsModule } from '../events/events.module';
import { ConsentModule } from '../consent/consent.module';
import { IdentityModule } from '../identity/identity.module';
import { LootModule } from '../loot/loot.module';
import { QuestModule } from '../quest/quest.module';
import { MarkerEngineModule } from '../marker-engine/marker-engine.module'; // ← ADDED
import { LevelingModule } from '../leveling/leveling.module';

@Module({
  imports: [EventsModule, ConsentModule, IdentityModule, LootModule, QuestModule, MarkerEngineModule, LevelingModule], // ← ADDED
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}
