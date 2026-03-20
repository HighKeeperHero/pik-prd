import { Module } from '@nestjs/common';
import { LandmarkController } from './landmark.controller';
import { LandmarkService } from './landmark.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports:     [],
  controllers: [LandmarkController],
  providers:   [LandmarkService, PrismaService],
  exports:     [LandmarkService],   // exported so identity.service.ts can inject it
})
export class LandmarkModule {}
