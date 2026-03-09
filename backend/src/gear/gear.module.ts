// src/gear/gear.module.ts
import { Module } from '@nestjs/common';
import { GearController } from './gear.controller';
import { GearService } from './gear.service';
import { EventsModule } from '../events/events.module';
import { AuthModule } from '../auth/auth.module';
import { FateAccountModule } from '../fate-account/fate-account.module';
import { AccountGuard } from '../auth/guards/account.guard';

@Module({
  imports: [EventsModule, AuthModule, FateAccountModule],
  controllers: [GearController],
  providers: [GearService, AccountGuard],
  exports: [GearService],
})
export class GearModule {}
