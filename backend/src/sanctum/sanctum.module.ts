import { Module } from '@nestjs/common';
import { SanctumController } from './sanctum.controller';
import { SanctumService } from './sanctum.service';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';
import { FateAccountModule } from '../fate-account/fate-account.module';
import { AccountGuard } from '../auth/guards/account.guard';
import { LevelingModule } from '../leveling/leveling.module';
import { LoreModule } from '../lore/lore.module';

@Module({
  imports:     [AuthModule, FateAccountModule, LevelingModule, LoreModule],
  controllers: [SanctumController],
  providers:   [SanctumService, PrismaService, AccountGuard],
  exports:     [SanctumService],
})
export class SanctumModule {}
