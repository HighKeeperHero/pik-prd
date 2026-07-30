// src/warband/warband.module.ts
// FateAccountModule imported because the mutating routes use
// AccountGuard (injects FateAccountService — the doctrine 4a DI
// lesson: omitting it crash-loops the app at boot).
import { Module } from '@nestjs/common';
import { WarbandController } from './warband.controller';
import { WarbandService }    from './warband.service';
import { FateAccountModule } from '../fate-account/fate-account.module';
import { AccountGuard } from '../auth/guards/account.guard';

@Module({
  imports:     [FateAccountModule],
  controllers: [WarbandController],
  providers:   [WarbandService, AccountGuard],
  exports:     [WarbandService],
})
export class WarbandModule {}
