// ============================================================
// PIK — Consent Service
// Place at: src/consent/consent.service.ts
// ============================================================

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';
import { GrantLinkDto } from './dto/grant-link.dto';
import { RevokeLinkDto } from './dto/revoke-link.dto';

@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  // ── GRANT ─────────────────────────────────────────────────

  async grantLink(rootId: string, dto: GrantLinkDto) {
    const user = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      select: { id: true, status: true },
    });
    if (!user) {
      throw new NotFoundException(`Identity not found: ${rootId}`);
    }
    if (user.status !== 'active') {
      throw new BadRequestException(`Identity is ${user.status}`);
    }

    const source = await this.prisma.source.findUnique({
      where: { id: dto.source_id },
    });
    if (!source || source.status !== 'active') {
      throw new BadRequestException(
        `Unknown or inactive source: ${dto.source_id}`,
      );
    }

    const existingLink = await this.prisma.sourceLink.findFirst({
      where: { rootId, sourceId: dto.source_id, status: 'active' },
    });
    if (existingLink) {
      throw new ConflictException(
        `Active link already exists for this user and source`,
      );
    }

    let scope = dto.scope;
    if (!scope) {
      const defaultScope = await this.prisma.config.findUnique({
        where: { key: 'pik.default_link_scope' },
      });
      scope = defaultScope?.value ?? 'xp fate_markers titles';
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const link = await tx.sourceLink.create({
        data: {
          rootId,
          sourceId: dto.source_id,
          scope,
          grantedBy: dto.granted_by,
        },
      });

      await tx.identityEvent.create({
        data: {
          rootId,
          eventType: 'source.link_granted',
          sourceId: dto.source_id,
          payload: {
            link_id: link.id,
            source_id: dto.source_id,
            granted_by: dto.granted_by,
            scope,
          },
        },
      });

      return link;
    });

    this.logger.log(
      `Link granted: ${rootId} → ${dto.source_id} by ${dto.granted_by}`,
    );

    return {
      link_id: result.id,
      source_id: result.sourceId,
      source_name: source.name,
      scope: result.scope,
      granted_by: result.grantedBy,
      granted_at: result.grantedAt.toISOString(),
    };
  }

  // ── REVOKE ────────────────────────────────────────────────

  async revokeLink(rootId: string, linkId: string, dto: RevokeLinkDto) {
    const link = await this.prisma.sourceLink.findFirst({
      where: { id: linkId, rootId },
      include: { source: { select: { name: true } } },
    });

    if (!link) {
      throw new NotFoundException(
        `Source link not found: ${linkId} for identity ${rootId}`,
      );
    }

    if (link.status === 'revoked') {
      throw new ConflictException('Link is already revoked');
    }

    const revokedBy = dto.revoked_by ?? 'user';

    await this.prisma.$transaction(async (tx) => {
      await tx.sourceLink.update({
        where: { id: linkId },
        data: {
          status: 'revoked',
          revokedAt: new Date(),
          revokedBy,
        },
      });

      await tx.identityEvent.create({
        data: {
          rootId,
          eventType: 'source.link_revoked',
          sourceId: link.sourceId,
          payload: {
            link_id: linkId,
            source_id: link.sourceId,
            revoked_by: revokedBy,
          },
        },
      });
    });

    this.logger.log(
      `Link revoked: ${rootId} ✕ ${link.sourceId} by ${revokedBy}`,
    );

    return {
      link_id: linkId,
      source_id: link.sourceId,
      source_name: link.source.name,
      status: 'revoked',
      revoked_by: revokedBy,
      revoked_at: new Date().toISOString(),
    };
  }

  // ── LIST ──────────────────────────────────────────────────

  async getLinks(rootId: string) {
    const user = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException(`Identity not found: ${rootId}`);
    }

    const links = await this.prisma.sourceLink.findMany({
      where: { rootId },
      include: { source: { select: { name: true } } },
      orderBy: { grantedAt: 'desc' },
    });

    return links.map((l) => ({
      link_id: l.id,
      source_id: l.sourceId,
      source_name: l.source.name,
      scope: l.scope,
      status: l.status,
      granted_by: l.grantedBy,
      granted_at: l.grantedAt.toISOString(),
      revoked_at: l.revokedAt?.toISOString() ?? null,
      revoked_by: l.revokedBy ?? null,
    }));
  }

  // ── VALIDATE ACTIVE LINK (used by IngestService) ──────────

  async validateActiveLink(
    rootId: string,
    sourceId: string,
  ): Promise<{ linkId: string; scope: string } | null> {
    const link = await this.prisma.sourceLink.findFirst({
      where: { rootId, sourceId, status: 'active' },
    });

    if (!link) {
      return null;
    }

    return { linkId: link.id, scope: link.scope };
  }
}
