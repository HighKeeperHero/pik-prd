// ============================================================
// PIK — Fate Fox module (the Calling + Silent Witness piping,
// 2026-07-09). Gate: Fate 50. The Sprint 31 bond row is the
// storage; this module grows it into the full companion.
// ============================================================
import { Module } from '@nestjs/common';
import { QuestModule } from '../quest/quest.module';
import { FateAccountModule } from '../fate-account/fate-account.module';
import { AccountGuard } from '../auth/guards/account.guard';
import { FoxController } from './fox.controller';
import { FoxService } from './fox.service';

@Module({
  // FateAccountModule exports FateAccountService — AccountGuard's
  // dependency. Omitting it crashed Nest bootstrap on 2026-07-09
  // (Railway healthcheck failure; builds were green, boot was not).
  imports:     [QuestModule, FateAccountModule],
  controllers: [FoxController],
  providers:   [FoxService, AccountGuard],
})
export class FoxModule {}
