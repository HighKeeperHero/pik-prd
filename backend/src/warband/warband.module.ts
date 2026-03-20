// src/warband/warband.module.ts
import { Module } from '@nestjs/common';
import { WarbandController } from './warband.controller';
import { WarbandService }    from './warband.service';

@Module({
  controllers: [WarbandController],
  providers:   [WarbandService],
  exports:     [WarbandService],
})
export class WarbandModule {}
