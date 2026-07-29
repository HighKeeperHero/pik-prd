// ============================================================
// PIK — Job Module (canon §13.4)
// ============================================================
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JobService } from './job.service';
import { JobController } from './job.controller';

@Module({
  controllers: [JobController],
  providers:   [JobService, PrismaService],
  exports:     [JobService],
})
export class JobModule {}
