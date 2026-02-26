// ============================================================
// PIK — Analytics Controller
// Route: GET /api/analytics
//
// Aggregate stats for the dashboard right panel.
// Preserves the exact MVP endpoint contract.
//
// Place at: src/analytics/analytics.controller.ts
// ============================================================

import { Controller, Get } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('api/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * GET /api/analytics
   *
   * MVP contract preserved:
   *   Response: {
   *     total_enrolled, total_events, active_links,
   *     avg_fate_xp, avg_fate_level,
   *     event_type_counts: { "identity.enrolled": 4, ... },
   *     top_heroes: [ { hero_name, fate_xp, fate_level, fate_alignment } ]
   *   }
   */
  @Get()
  async getAnalytics() {
    return this.analyticsService.getAnalytics();
  }
}
