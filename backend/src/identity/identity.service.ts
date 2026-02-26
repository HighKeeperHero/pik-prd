// ============================================================
// PIK — Identity Service
// Place at: src/identity/identity.service.ts
// ============================================================

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma, SourceLink } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';
import { EnrollUserDto } from './dto/enroll-user.dto';

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  // ── ENROLL ────────────────────────────────────────────────

  async enroll(dto: EnrollUserDto) {
    if (dto.source_id) {
      const source = await this.prisma.source.findUnique({
        where: { id: dto.source_id },
      });
      if (!source || source.status !== 'active') {
        throw new BadRequestException(
          `Unknown or inactive source: ${dto.source_id}`,
        );
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const root = await tx.rootIdentity.create({
        data: {
          heroName: dto.hero_name,
          fateAlignment: dto.fate_alignment,
          origin: dto.origin ?? null,
          enrolledBy: dto.enrolled_by,
        },
      });

      const persona = await tx.persona.create({
        data: {
          rootId: root.id,
          displayName: dto.hero_name,
        },
      });

      let link: SourceLink | null = null;
      if (dto.source_id) {
        link = await tx.sourceLink.create({
          data: {
            rootId: root.id,
            sourceId: dto.source_id,
            grantedBy: dto.enrolled_by,
          },
        });
      }

      await tx.identityEvent.create({
        data: {
          rootId: root.id,
          eventType: 'identity.enrolled',
          payload: {
            enrolled_by: dto.enrolled_by,
            hero_name: dto.hero_name,
            fate_alignment: dto.fate_alignment,
            origin: dto.origin ?? null,
          } as Prisma.InputJsonValue,
        },
      });

      if (link) {
        await tx.identityEvent.create({
          data: {
            rootId: root.id,
            eventType: 'source.link_granted',
            sourceId: dto.source_id!,
            payload: {
              link_id: link.id,
              source_id: dto.source_id!,
              granted_by: dto.enrolled_by,
              scope: link.scope,
            } as Prisma.InputJsonValue,
          },
        });
      }

      return { root, persona, link };
    });

    this.logger.log(
      `Enrolled: ${dto.hero_name} (${result.root.id}) by ${dto.enrolled_by}`,
    );

    return {
      root_id: result.root.id,
      persona_id: result.persona.id,
      hero_name: result.root.heroName,
      fate_alignment: result.root.fateAlignment,
      ...(result.link ? { link_id: result.link.id } : {}),
      enrolled_at: result.root.enrolledAt.toISOString(),
    };
  }

  // ── LIST ──────────────────────────────────────────────────

  async listUsers() {
    const users = await this.prisma.rootIdentity.findMany({
      where: { status: 'active' },
      include: {
        sourceLinks: {
          where: { status: 'active' },
          select: { id: true },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });

    return users.map((u) => ({
      root_id: u.id,
      hero_name: u.heroName,
      fate_alignment: u.fateAlignment,
      fate_xp: u.fateXp,
      fate_level: u.fateLevel,
      active_sources: u.sourceLinks.length,
    }));
  }

  // ── GET USER (nested format for dashboard) ────────────────

  async getUser(rootId: string) {
    const user = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      include: {
        personas: {
          select: { id: true, displayName: true, status: true, createdAt: true },
        },
        sourceLinks: {
          include: { source: { select: { name: true } } },
          orderBy: { grantedAt: 'desc' },
        },
        titles: {
          include: { title: { select: { displayName: true, category: true } } },
          orderBy: { grantedAt: 'desc' },
        },
        fateMarkers: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!user) {
      throw new NotFoundException(`Identity not found: ${rootId}`);
    }

    // Get progression config for XP calculations
    const config = await this.getProgressionConfig();
    const nextLevelThreshold = Math.floor(
      config.xpBaseThreshold *
        Math.pow(config.xpLevelMultiplier, user.fateLevel - 1),
    );

    // Calculate XP within current level
    // Sum all thresholds up to current level to find how much XP was "spent" on previous levels
    let xpSpentOnPreviousLevels = 0;
    for (let i = 1; i < user.fateLevel; i++) {
      xpSpentOnPreviousLevels += Math.floor(
        config.xpBaseThreshold * Math.pow(config.xpLevelMultiplier, i - 1),
      );
    }
    const xpInCurrentLevel = user.fateXp - xpSpentOnPreviousLevels;

    // Count sessions from events
    const totalSessions = await this.prisma.identityEvent.count({
      where: { rootId, eventType: 'progression.session_completed' },
    });

    // Get recent events for timeline
    const recentEvents = await this.prisma.identityEvent.findMany({
      where: { rootId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Dashboard expects this nested structure:
    // { identity, persona, progression, source_links, recent_events }
    return {
      identity: {
        root_id: user.id,
        status: user.status,
        enrolled_by: user.enrolledBy,
        enrolled_at: user.enrolledAt.toISOString(),
      },
      persona: {
        persona_id: user.personas[0]?.id ?? null,
        hero_name: user.heroName,
        origin: user.origin,
        fate_alignment: user.fateAlignment,
      },
      progression: {
        fate_xp: user.fateXp,
        fate_level: user.fateLevel,
        xp_in_current_level: Math.max(0, xpInCurrentLevel),
        xp_needed_for_next: nextLevelThreshold,
        total_sessions: totalSessions,
        titles: user.titles.map((t) => t.titleId),
        fate_markers: user.fateMarkers.map((m) => m.marker),
      },
      source_links: user.sourceLinks.map((l) => ({
        link_id: l.id,
        source_id: l.sourceId,
        source_name: l.source.name,
        scope: l.scope,
        status: l.status,
        granted_by: l.grantedBy,
        granted_at: l.grantedAt.toISOString(),
        revoked_at: l.revokedAt?.toISOString() ?? null,
        revoked_by: l.revokedBy ?? null,
      })),
      recent_events: recentEvents.map((e) => ({
        event_id: e.id,
        event_type: e.eventType,
        source_id: e.sourceId,
        payload: e.payload,
        changes: e.changes,
        created_at: e.createdAt.toISOString(),
      })),
    };
  }

  // ── TIMELINE ──────────────────────────────────────────────

  async getTimeline(rootId: string) {
    const exists = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException(`Identity not found: ${rootId}`);
    }
    return this.events.getTimeline(rootId);
  }

  // ── HELPERS ───────────────────────────────────────────────

  async getProgressionConfig() {
    const configs = await this.prisma.config.findMany({
      where: {
        key: {
          in: [
            'fate.xp_base_threshold',
            'fate.xp_level_multiplier',
            'fate.xp_per_session_normal',
            'fate.xp_per_session_hard',
            'fate.xp_node_completion',
            'fate.xp_boss_tier_pct',
            'fate.event_xp_multiplier',
          ],
        },
      },
    });

    const map = new Map(configs.map((c) => [c.key, c.value]));

    return {
      xpBaseThreshold: parseFloat(map.get('fate.xp_base_threshold') ?? '200'),
      xpLevelMultiplier: parseFloat(map.get('fate.xp_level_multiplier') ?? '1.2'),
      xpPerSessionNormal: parseFloat(map.get('fate.xp_per_session_normal') ?? '100'),
      xpPerSessionHard: parseFloat(map.get('fate.xp_per_session_hard') ?? '150'),
      xpNodeCompletion: parseFloat(map.get('fate.xp_node_completion') ?? '15'),
      xpBossTierPct: parseFloat(map.get('fate.xp_boss_tier_pct') ?? '0.5'),
      eventXpMultiplier: parseFloat(map.get('fate.event_xp_multiplier') ?? '1.0'),
    };
  }
}
