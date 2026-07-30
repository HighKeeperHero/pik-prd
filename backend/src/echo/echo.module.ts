// ============================================================
// PIK — Hero Echo Module (canon §13.9 unification)
// FateAccountModule imported because the register route uses
// AccountGuard (which injects FateAccountService — the doctrine
// 4a DI lesson).
// ============================================================
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EchoService } from './echo.service';
import { EchoController } from './echo.controller';
import { FateAccountModule } from '../fate-account/fate-account.module';
import { AccountGuard } from '../auth/guards/account.guard';

@Module({
  imports:     [FateAccountModule],
  controllers: [EchoController],
  providers:   [EchoService, PrismaService, AccountGuard],
  exports:     [EchoService],
})
export class EchoModule {}
