// ============================================================
// PIK — Gear Module (Sprint 6)
// Place at: src/gear/gear.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { GearController } from './gear.controller';
import { GearService } from './gear.service';
import { EventsModule } from '../events/events.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [EventsModule, AuthModule],
  controllers: [GearController],
  providers: [GearService],
  exports: [GearService],
})
export class GearModule {}
