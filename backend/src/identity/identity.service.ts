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

  // ── GET USER ──────────────────────────────────────────────

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

    const config = await this.getProgressionConfig();
    const nextLevelThreshold = Math.floor(
      config.xpBaseThreshold *
        Math.pow(config.xpLevelMultiplier, user.fateLevel - 1),
    );

    return {
      root_id: user.id,
      hero_name: user.heroName,
      fate_alignment: user.fateAlignment,
      origin: user.origin,
      fate_xp: user.fateXp,
      fate_level: user.fateLevel,
      fate_xp_next_level: nextLevelThreshold,
      status: user.status,
      enrolled_by: user.enrolledBy,
      enrolled_at: user.enrolledAt.toISOString(),
      personas: user.personas.map((p) => ({
        persona_id: p.id,
        display_name: p.displayName,
        status: p.status,
        created_at: p.createdAt.toISOString(),
      })),
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
      titles: user.titles.map((t) => ({
        title_id: t.titleId,
        display_name: t.title.displayName,
        category: t.title.category,
        granted_at: t.grantedAt.toISOString(),
      })),
      fate_markers: user.fateMarkers.map((m) => ({
        marker: m.marker,
        source_id: m.sourceId,
        created_at: m.createdAt.toISOString(),
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
