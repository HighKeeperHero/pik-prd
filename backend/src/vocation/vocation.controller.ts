// ============================================================
// PIK — Vocation Controller (canon §13.6, Phase 5)
// GET /api/users/:root_id/vocation — advisory Job recommendation.
// Read-only; the actual (permanent) choice goes through the
// existing POST /api/users/:root_id/class.
// ============================================================
import { Controller, Get, Param } from '@nestjs/common';
import { VocationService } from './vocation.service';

@Controller('api')
export class VocationController {
  constructor(private readonly vocation: VocationService) {}

  @Get('users/:root_id/vocation')
  async getVocation(@Param('root_id') rootId: string) {
    return this.vocation.getRecommendation(rootId);
  }
}
