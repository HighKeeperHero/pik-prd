// ============================================================
// PIK — Events Service
// Append-Only Identity Event Ledger
// Place at: src/events/events.service.ts
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export interface LogEventParams {
  rootId: string;
  eventType: string;
  sourceId?: string;
  payload?: Record<string, unknown>;
  changes?: Record<string, unknown>;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: LogEventParams) {
    const event = await this.prisma.identityEvent.create({
      data: {
        rootId: params.rootId,
        eventType: params.eventType,
        sourceId: params.sourceId ?? null,
        payload: (params.payload ?? {}) as Prisma.InputJsonValue,
        changes: params.changes
          ? (params.changes as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    this.logger.debug(
      `Event logged: ${params.eventType} for ${params.rootId}` +
        (params.sourceId ? ` from ${params.sourceId}` : ''),
    );

    return event;
  }

  async getTimeline(rootId: string): Promise<TimelineEntry[]> {
    const events = await this.prisma.identityEvent.findMany({
      where: { rootId },
      orderBy: { createdAt: 'desc' },
    });

    const sourceIds = [
      ...new Set(events.map((e) => e.sourceId).filter(Boolean)),
    ] as string[];

    const sources =
      sourceIds.length > 0
        ? await this.prisma.source.findMany({
            where: { id: { in: sourceIds } },
            select: { id: true, name: true },
          })
        : [];

    const sourceMap = new Map(sources.map((s) => [s.id, s.name]));

    return events.map((e) => ({
      event_id: e.id,
      event_type: e.eventType,
      source_id: e.sourceId,
      source_name: e.sourceId ? (sourceMap.get(e.sourceId) ?? null) : null,
      payload: e.payload,
      changes_applied: e.changes,
      created_at: e.createdAt.toISOString(),
    }));
  }

  async countByType(rootId: string, eventType: string): Promise<number> {
    return this.prisma.identityEvent.count({
      where: { rootId, eventType },
    });
  }

  async getEventTypeCounts(): Promise<Record<string, number>> {
    const results = await this.prisma.identityEvent.groupBy({
      by: ['eventType'],
      _count: { id: true },
    });

    const counts: Record<string, number> = {};
    for (const row of results) {
      counts[row.eventType] = row._count.id;
    }
    return counts;
  }

  async totalCount(): Promise<number> {
    return this.prisma.identityEvent.count();
  }
}

export interface TimelineEntry {
  event_id: string;
  event_type: string;
  source_id: string | null;
  source_name: string | null;
  payload: unknown;
  changes_applied: unknown;
  created_at: string;
}
