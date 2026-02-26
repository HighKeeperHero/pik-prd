// ============================================================
// PIK — Analytics Module
//
// Aggregate stats. Imports EventsModule for event counts.
//
// Place at: src/analytics/analytics.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
