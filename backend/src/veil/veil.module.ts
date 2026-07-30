// backend/src/veil/veil.module.ts
import { Module } from '@nestjs/common';
import { VeilController } from './veil.controller';
import { VeilService } from './veil.service';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '../config/config.service';
import { TearGenService } from './tear-gen.service';
import { VenturesModule } from '../quest/ventures.module';
import { QuestModule } from '../quest/quest.module';
import { LevelingModule } from '../leveling/leveling.module';
import { LoreModule } from '../lore/lore.module';
// B2 hardening — AccountGuard on /encounter injects
// FateAccountService, so FateAccountModule must be imported here
// (omitting it crash-loops the app at boot; see doctrine.module).
import { FateAccountModule } from '../fate-account/fate-account.module';
import { AccountGuard } from '../auth/guards/account.guard';

@Module({
  imports:     [VenturesModule, QuestModule, LevelingModule, LoreModule, FateAccountModule],
  controllers: [VeilController],
  providers:   [VeilService, PrismaService, ConfigService, TearGenService, AccountGuard],
  exports:     [VeilService],
})
export class VeilModule {}
