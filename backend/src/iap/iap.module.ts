import { Module } from '@nestjs/common';
import { IapController } from './iap.controller';
import { IapService } from './iap.service';
import { GooglePlayVerifier } from './google-play.verifier';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';
import { FateAccountModule } from '../fate-account/fate-account.module';
import { AccountGuard } from '../auth/guards/account.guard';

@Module({
  imports:     [AuthModule, FateAccountModule],
  controllers: [IapController],
  providers:   [IapService, GooglePlayVerifier, PrismaService, AccountGuard],
  exports:     [IapService],
})
export class IapModule {}
