// ventures.module.ts
// Drop at: src/quest/ventures.module.ts
// @Global() ensures HuntTrackerService is a true singleton —
// all modules (GearModule, VeilModule, etc.) share the same ACTIVE_HUNTS instance.

import { Module, Global } from '@nestjs/common';
import { VenturesController } from './ventures.controller';
import { HuntTrackerService } from './hunt-tracker.service';

@Global()
@Module({
  controllers: [VenturesController],
  providers:   [HuntTrackerService],
  exports:     [HuntTrackerService],
})
export class VenturesModule {}
