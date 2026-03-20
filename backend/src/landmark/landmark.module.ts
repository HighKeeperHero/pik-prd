import { Module, Global } from '@nestjs/common';
import { LandmarkController } from './landmark.controller';
import { LandmarkService } from './landmark.service';
import { PrismaService } from '../prisma.service';

@Global()
@Module({
  imports:     [],
  controllers: [LandmarkController],
  providers:   [LandmarkService, PrismaService],
  exports:     [LandmarkService],
})
export class LandmarkModule {}
