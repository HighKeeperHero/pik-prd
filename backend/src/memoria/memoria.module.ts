// ============================================================
// PIK — Memoria Module
// Sprint 32 / Tier 2 identity-collection axis.
// Place at: src/memoria/memoria.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { MemoriaService } from './memoria.service';
import { MemoriaController } from './memoria.controller';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [MemoriaController],
  providers: [MemoriaService],
  exports: [MemoriaService],
})
export class MemoriaModule {}
