import { Module, Global } from '@nestjs/common';
import { LandmarkController } from './landmark.controller';
import { LandmarkService } from './landmark.service';

@Global()
@Module({
  imports:     [],
  controllers: [LandmarkController],
  providers:   [LandmarkService],
  exports:     [LandmarkService],
})
export class LandmarkModule {}
