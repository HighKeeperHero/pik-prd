// src/trials/trials.module.ts
// FateAccountModule imported because the submit route uses
// AccountGuard (injects FateAccountService — omitting the module
// crash-loops the app at boot; see warband.module.ts).

import { Module } from '@nestjs/common';
import { TrialsController } from './trials.controller';
import { TrialsService } from './trials.service';
import { PrismaService } from '../prisma.service';
import { EventsModule } from '../events/events.module';
import { FateAccountModule } from '../fate-account/fate-account.module';
import { AccountGuard } from '../auth/guards/account.guard';

@Module({
  imports: [EventsModule, FateAccountModule],
  controllers: [TrialsController],
  providers: [TrialsService, PrismaService, AccountGuard],
  exports: [TrialsService],
})
export class TrialsModule {}
