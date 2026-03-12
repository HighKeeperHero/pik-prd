// ventures.module.ts — Sprint 20.3
// Drop in: src/quest/ventures.module.ts
import { Module } from '@nestjs/common';
import { VenturesController } from './ventures.controller';

@Module({
  controllers: [VenturesController],
})
export class VenturesModule {}
