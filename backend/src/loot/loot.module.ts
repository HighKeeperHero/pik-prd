// src/loot/loot.module.ts
import { Module } from '@nestjs/common';
import { LootController } from './loot.controller';
import { LootService } from './loot.service';
import { EventsModule } from '../events/events.module';
import { AuthModule } from '../auth/auth.module';
import { GearModule } from '../gear/gear.module';
import { FateAccountModule } from '../fate-account/fate-account.module';
import { AccountGuard } from '../auth/guards/account.guard';

@Module({
  imports: [EventsModule, AuthModule, GearModule, FateAccountModule],
  controllers: [LootController],
  providers: [LootService, AccountGuard],
  exports: [LootService],
})
export class LootModule {}
