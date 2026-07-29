// ============================================================
// PIK — Job Controller (canon §13.4)
// GET /api/users/:root_id/job — Job progress (rank, level, next).
// ============================================================
import { Controller, Get, Param } from '@nestjs/common';
import { JobService } from './job.service';

@Controller('api')
export class JobController {
  constructor(private readonly job: JobService) {}

  @Get('users/:root_id/job')
  async getJob(@Param('root_id') rootId: string) {
    return this.job.getJobProgress(rootId);
  }
}
