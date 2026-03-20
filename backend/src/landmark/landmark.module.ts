import { Module } from '@nestjs/common';
import { LandmarkController } from './landmark.controller';
import { LandmarkService } from './landmark.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  controllers: [LandmarkController],
  providers:   [LandmarkService],
  exports:     [LandmarkService],   // exported so identity.service.ts can inject it
})
export class LandmarkModule {}
