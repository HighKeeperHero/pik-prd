// src/titles/titles.module.ts
import { Module } from '@nestjs/common';
import { TitlesService } from './titles.service';
import { TitlesController } from './titles.controller';
import { PrismaService } from '../prisma.service';
import { FateAccountModule } from '../fate-account/fate-account.module';
import { AccountGuard } from '../auth/guards/account.guard';

@Module({
  imports:     [FateAccountModule],
  controllers: [TitlesController],
  providers:   [TitlesService, PrismaService, AccountGuard],
  exports:     [TitlesService],
})
export class TitlesModule {}
