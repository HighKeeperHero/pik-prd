// src/workshop/workshop.module.ts
import { Module } from '@nestjs/common';
import { WorkshopController } from './workshop.controller';
import { WorkshopService } from './workshop.service';
import { GearModule } from '../gear/gear.module';
import { AuthModule } from '../auth/auth.module';
import { FateAccountModule } from '../fate-account/fate-account.module';
import { AccountGuard } from '../auth/guards/account.guard';

@Module({
  imports: [GearModule, AuthModule, FateAccountModule],
  controllers: [WorkshopController],
  providers: [WorkshopService, AccountGuard],
})
export class WorkshopModule {}
