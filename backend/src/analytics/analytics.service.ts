// ============================================================
// PIK — Analytics Service
// Aggregate stats for the dashboard and API consumers
//
// Matches the exact response shape from the Python MVP's
// GET /api/analytics endpoint.
//
// Place at: src/analytics/analytics.service.ts
// ============================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  /**
   * Build the full analytics response.
   * Matches MVP contract:
   * {
   *   total_enrolled, total_events, active_links,
   *   avg_fate_xp, avg_fate_level,
   *   event_type_counts: { ... },
   *   top_heroes: [ ... ]
   * }
   */
  async getAnalytics() {
    // Run all queries in parallel for speed
    const [
      totalEnrolled,
      totalEvents,
      activeLinks,
      xpAggregates,
      eventTypeCounts,
      topHeroes,
    ] = await Promise.all([
      // Total enrolled identities
      this.prisma.rootIdentity.count({
        where: { status: 'active' },
      }),

      // Total events in the ledger
      this.events.totalCount(),

      // Active source links
      this.prisma.sourceLink.count({
        where: { status: 'active' },
      }),

      // Average XP and level across all active users
      this.prisma.rootIdentity.aggregate({
        where: { status: 'active' },
        _avg: {
          fateXp: true,
          fateLevel: true,
        },
      }),

      // Event counts grouped by type
      this.events.getEventTypeCounts(),

      // Top heroes by Fate XP
      this.prisma.rootIdentity.findMany({
        where: { status: 'active' },
        orderBy: { fateXp: 'desc' },
        take: 10,
        select: {
          heroName: true,
          fateXp: true,
          fateLevel: true,
          fateAlignment: true,
        },
      }),
    ]);

    return {
      total_enrolled: totalEnrolled,
      total_events: totalEvents,
      active_links: activeLinks,
      avg_fate_xp: round(xpAggregates._avg.fateXp ?? 0, 1),
      avg_fate_level: round(xpAggregates._avg.fateLevel ?? 0, 1),
      event_type_counts: eventTypeCounts,
      top_heroes: topHeroes.map((h) => ({
        hero_name: h.heroName,
        fate_xp: h.fateXp,
        fate_level: h.fateLevel,
        fate_alignment: h.fateAlignment,
      })),
    };
  }
}

/** Round to N decimal places */
function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
