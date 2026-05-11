import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';
import { FateAccountModule } from '../fate-account/fate-account.module';
import { AccountGuard } from '../auth/guards/account.guard';

@Module({
  imports:     [AuthModule, FateAccountModule],
  controllers: [PushController],
  providers:   [PushService, PrismaService, AccountGuard],
  exports:     [PushService],
})
export class PushModule {}
