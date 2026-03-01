// ============================================================
// PIK — Session Service (Sprint 7.1 — Live Sessions)
//
// Manages real-time player presence at venues.
// Lifecycle: check_in → heartbeat → check_out
//
// Active sessions visible on operator dashboard in real time.
// Stale sessions (no heartbeat for 5 min) auto-expire.
//
// Place at: src/session/session.service.ts
// ============================================================

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';
import { EventsService } from '../events/events.service';
import { SseService } from '../sse/sse.service';

/** How long before a session with no heartbeat is considered stale */
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly sse: SseService,
  ) {
    // Run stale session cleanup every 60 seconds
    setInterval(() => this.expireStaleSessions(), 60_000);
  }

  // ── CHECK IN ─────────────────────────────────────────────

  async checkIn(params: {
    rootId: string;
    sourceId: string;
    zone?: string;
  }) {
    // Verify user exists
    const user = await this.prisma.rootIdentity.findUnique({
      where: { id: params.rootId },
      select: { id: true, heroName: true, fateLevel: true, status: true },
    });
    if (!user) throw new NotFoundException(`Identity not found: ${params.rootId}`);
    if (user.status !== 'active') throw new BadRequestException(`Identity is ${user.status}`);

    // Check for existing active session at this source
    const existing = await this.prisma.playerSession.findFirst({
      where: {
        rootId: params.rootId,
        sourceId: params.sourceId,
        status: 'active',
      },
    });
    if (existing) {
      throw new ConflictException(
        `Player already checked in at this venue (session: ${existing.id}). Check out first.`,
      );
    }

    // Create session
    const session = await this.prisma.playerSession.create({
      data: {
        rootId: params.rootId,
        sourceId: params.sourceId,
        zone: params.zone || null,
      },
    });

    // Log event
    await this.events.log({
      rootId: params.rootId,
      eventType: 'session.check_in',
      sourceId: params.sourceId,
      payload: {
        session_id: session.id,
        zone: params.zone || null,
      },
    });

    // Broadcast live presence
    this.sse.emit('session.check_in', {
      session_id: session.id,
      root_id: params.rootId,
      hero_name: user.heroName,
      fate_level: user.fateLevel,
      source_id: params.sourceId,
      zone: params.zone || null,
    });

    this.logger.log(`Check-in: ${user.heroName} → ${params.sourceId}${params.zone ? ` (${params.zone})` : ''}`);

    return {
      session_id: session.id,
      root_id: params.rootId,
      source_id: params.sourceId,
      zone: params.zone || null,
      status: 'active',
      checked_in_at: session.checkedInAt.toISOString(),
    };
  }

  // ── HEARTBEAT ────────────────────────────────────────────

  async heartbeat(sessionId: string, zone?: string) {
    const session = await this.prisma.playerSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException(`Session not found: ${sessionId}`);
    if (session.status !== 'active') {
      throw new BadRequestException(`Session is ${session.status}, cannot heartbeat`);
    }

    const data: any = { lastHeartbeat: new Date() };
    if (zone !== undefined) data.zone = zone;

    await this.prisma.playerSession.update({
      where: { id: sessionId },
      data,
    });

    // Broadcast zone change if applicable
    if (zone && zone !== session.zone) {
      this.sse.emit('session.zone_changed', {
        session_id: sessionId,
        root_id: session.rootId,
        source_id: session.sourceId,
        previous_zone: session.zone,
        new_zone: zone,
      });
    }

    return { session_id: sessionId, status: 'active', last_heartbeat: new Date().toISOString() };
  }

  // ── CHECK OUT ────────────────────────────────────────────

  async checkOut(sessionId: string, summary?: Record<string, unknown>) {
    const session = await this.prisma.playerSession.findUnique({
      where: { id: sessionId },
      include: {
        root: { select: { heroName: true, fateLevel: true } },
      },
    });
    if (!session) throw new NotFoundException(`Session not found: ${sessionId}`);
    if (session.status !== 'active') {
      throw new BadRequestException(`Session is ${session.status}, cannot check out`);
    }

    const now = new Date();
    const durationSec = Math.round((now.getTime() - session.checkedInAt.getTime()) / 1000);

    const updated = await this.prisma.playerSession.update({
      where: { id: sessionId },
      data: {
        status: 'completed',
        checkedOutAt: now,
        durationSec,
        summary: summary ? (summary as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    // Log event
    await this.events.log({
      rootId: session.rootId,
      eventType: 'session.check_out',
      sourceId: session.sourceId,
      payload: {
        session_id: sessionId,
        zone: session.zone,
        duration_sec: durationSec,
        summary: summary || null,
      },
    });

    // Broadcast departure
    this.sse.emit('session.check_out', {
      session_id: sessionId,
      root_id: session.rootId,
      hero_name: session.root.heroName,
      fate_level: session.root.fateLevel,
      source_id: session.sourceId,
      zone: session.zone,
      duration_sec: durationSec,
      summary: summary || null,
    });

    this.logger.log(
      `Check-out: ${session.root.heroName} ← ${session.sourceId} (${Math.round(durationSec / 60)}min)`,
    );

    return {
      session_id: sessionId,
      status: 'completed',
      checked_in_at: session.checkedInAt.toISOString(),
      checked_out_at: now.toISOString(),
      duration_sec: durationSec,
    };
  }

  // ── LIVE QUERIES ─────────────────────────────────────────

  /** All currently active sessions across all sources */
  async getActiveSessions() {
    const sessions = await this.prisma.playerSession.findMany({
      where: { status: 'active' },
      include: {
        root: { select: { heroName: true, fateLevel: true, fateAlignment: true, equippedTitle: true } },
      },
      orderBy: { checkedInAt: 'desc' },
    });

    return sessions.map((s) => ({
      session_id: s.id,
      root_id: s.rootId,
      hero_name: s.root.heroName,
      fate_level: s.root.fateLevel,
      fate_alignment: s.root.fateAlignment,
      equipped_title: s.root.equippedTitle,
      source_id: s.sourceId,
      zone: s.zone,
      checked_in_at: s.checkedInAt.toISOString(),
      last_heartbeat: s.lastHeartbeat.toISOString(),
      duration_sec: Math.round((Date.now() - s.checkedInAt.getTime()) / 1000),
    }));
  }

  /** Active sessions at a specific source */
  async getActiveBySource(sourceId: string) {
    const sessions = await this.prisma.playerSession.findMany({
      where: { sourceId, status: 'active' },
      include: {
        root: { select: { heroName: true, fateLevel: true, fateAlignment: true } },
      },
      orderBy: { checkedInAt: 'desc' },
    });

    return sessions.map((s) => ({
      session_id: s.id,
      root_id: s.rootId,
      hero_name: s.root.heroName,
      fate_level: s.root.fateLevel,
      fate_alignment: s.root.fateAlignment,
      source_id: s.sourceId,
      zone: s.zone,
      checked_in_at: s.checkedInAt.toISOString(),
      duration_sec: Math.round((Date.now() - s.checkedInAt.getTime()) / 1000),
    }));
  }

  /** Recent completed sessions (for history view) */
  async getRecentSessions(limit = 20) {
    const sessions = await this.prisma.playerSession.findMany({
      where: { status: { in: ['completed', 'abandoned', 'expired'] } },
      include: {
        root: { select: { heroName: true, fateLevel: true } },
      },
      orderBy: { checkedOutAt: 'desc' },
      take: limit,
    });

    return sessions.map((s) => ({
      session_id: s.id,
      root_id: s.rootId,
      hero_name: s.root.heroName,
      fate_level: s.root.fateLevel,
      source_id: s.sourceId,
      zone: s.zone,
      status: s.status,
      checked_in_at: s.checkedInAt.toISOString(),
      checked_out_at: s.checkedOutAt?.toISOString() ?? null,
      duration_sec: s.durationSec,
      summary: s.summary,
    }));
  }

  /** Session history for a specific player */
  async getPlayerSessions(rootId: string) {
    const sessions = await this.prisma.playerSession.findMany({
      where: { rootId },
      orderBy: { checkedInAt: 'desc' },
      take: 50,
    });

    return sessions.map((s) => ({
      session_id: s.id,
      source_id: s.sourceId,
      zone: s.zone,
      status: s.status,
      checked_in_at: s.checkedInAt.toISOString(),
      checked_out_at: s.checkedOutAt?.toISOString() ?? null,
      duration_sec: s.durationSec ?? Math.round((Date.now() - s.checkedInAt.getTime()) / 1000),
      summary: s.summary,
    }));
  }

  /** Live counts for dashboard overview */
  async getLiveCounts() {
    const [totalActive, bySource] = await Promise.all([
      this.prisma.playerSession.count({ where: { status: 'active' } }),
      this.prisma.playerSession.groupBy({
        by: ['sourceId'],
        where: { status: 'active' },
        _count: true,
      }),
    ]);

    return {
      total_active: totalActive,
      by_source: bySource.map((g) => ({
        source_id: g.sourceId,
        active_count: g._count,
      })),
    };
  }

  // ── STALE SESSION CLEANUP ────────────────────────────────

  async expireStaleSessions() {
    const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);

    const stale = await this.prisma.playerSession.findMany({
      where: {
        status: 'active',
        lastHeartbeat: { lt: cutoff },
      },
      include: {
        root: { select: { heroName: true } },
      },
    });

    for (const session of stale) {
      const now = new Date();
      const durationSec = Math.round((now.getTime() - session.checkedInAt.getTime()) / 1000);

      await this.prisma.playerSession.update({
        where: { id: session.id },
        data: {
          status: 'expired',
          checkedOutAt: now,
          durationSec,
        },
      });

      await this.events.log({
        rootId: session.rootId,
        eventType: 'session.expired',
        sourceId: session.sourceId,
        payload: {
          session_id: session.id,
          reason: 'heartbeat_timeout',
          duration_sec: durationSec,
        },
      });

      this.sse.emit('session.expired', {
        session_id: session.id,
        root_id: session.rootId,
        hero_name: session.root.heroName,
        source_id: session.sourceId,
        duration_sec: durationSec,
      });

      this.logger.warn(`Session expired (no heartbeat): ${session.root.heroName} at ${session.sourceId}`);
    }

    if (stale.length > 0) {
      this.logger.log(`Expired ${stale.length} stale session(s)`);
    }
  }
}
