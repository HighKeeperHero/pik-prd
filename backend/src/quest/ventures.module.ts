// ventures.module.ts
// Drop at: src/quest/ventures.module.ts

import { Module } from '@nestjs/common';
import { VenturesController } from './ventures.controller';
import { HuntTrackerService } from './hunt-tracker.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VenturesController],
  providers: [HuntTrackerService],
  exports: [HuntTrackerService],   // exported so GearModule, VeilTearModule etc. can inject it
})
export class VenturesModule {}
