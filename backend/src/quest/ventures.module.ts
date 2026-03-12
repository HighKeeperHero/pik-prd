// ventures.module.ts
// Drop at: src/quest/ventures.module.ts

import { Module } from '@nestjs/common';
import { VenturesController } from './ventures.controller';
import { HuntTrackerService } from './hunt-tracker.service';

@Module({
  controllers: [VenturesController],
  providers:   [HuntTrackerService],
  exports:     [HuntTrackerService],  // exported so GearModule can inject it
})
export class VenturesModule {}
