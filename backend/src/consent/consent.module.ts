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
import { FateAccountModule } from '../fate-account/fate-account.module';
import { AccountGuard } from '../auth/guards/account.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { SelfOrAdminGuard } from '../auth/guards/self-or-admin.guard';

@Module({
  // FateAccountModule exports FateAccountService — AccountGuard's
  // dependency, which SelfOrAdminGuard composes. Omitting it crashes
  // Nest bootstrap at runtime while the build stays green (see the
  // same note in fox.module.ts, 2026-07-09).
  imports: [EventsModule, FateAccountModule],
  controllers: [ConsentController],
  providers: [
    ConsentService,
    AccountGuard,
    PlatformAdminGuard,
    SelfOrAdminGuard,
  ],
  exports: [ConsentService],        // IngestService needs validateActiveLink()
})
export class ConsentModule {}
