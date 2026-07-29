// ============================================================
// PIK — Doctrine Module (canon §13.5)
//
// FateAccountModule is imported because DoctrineController's
// choose/respec routes use AccountGuard, which injects
// FateAccountService — omitting it crash-loops the whole app at
// boot (Nest DI failure, caught on the 4a staging deploy).
// ============================================================
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DoctrineService } from './doctrine.service';
import { DoctrineController } from './doctrine.controller';
import { FateAccountModule } from '../fate-account/fate-account.module';
import { AccountGuard } from '../auth/guards/account.guard';

@Module({
  imports:     [FateAccountModule],
  controllers: [DoctrineController],
  providers:   [DoctrineService, PrismaService, AccountGuard],
  exports:     [DoctrineService],
})
export class DoctrineModule {}
