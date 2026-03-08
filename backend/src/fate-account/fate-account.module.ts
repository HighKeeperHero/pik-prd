// src/fate-account/fate-account.module.ts

import { Module } from '@nestjs/common';
import { FateAccountController } from './fate-account.controller';
import { FateAccountService } from './fate-account.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [FateAccountController],
  providers: [FateAccountService, PrismaService],
  exports: [FateAccountService], // Exported so AccountGuard can inject it
})
export class FateAccountModule {}
