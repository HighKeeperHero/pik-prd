// ============================================================
// PIK — Consent Module
//
// Source links and consent receipts.
// Exports ConsentService so IngestModule can validate links.
//
// Place at: src/consent/consent.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [ConsentController],
  providers: [ConsentService],
  exports: [ConsentService],        // IngestService needs validateActiveLink()
})
export class ConsentModule {}
