// ============================================================
// PIK — Source Admin Service (Sprint 5)
//
// Manages source lifecycle: create, rotate API keys,
// suspend/activate, and list with metadata.
//
// API keys are generated as random hex strings, hashed with
// SHA-256 before storage. The plaintext key is returned ONCE
// at creation/rotation — it cannot be recovered afterward.
//
// Place at: src/config/source-admin.service.ts
// ============================================================

import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma.service';
import { SCOPES } from '../auth/scopes';

@Injectable()
export class SourceAdminService {
  private readonly logger = new Logger(SourceAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a new API key and its SHA-256 hash.
   * Returns { plaintext, hash } — plaintext shown once, hash stored.
   */
  private generateApiKey(): { plaintext: string; hash: string } {
    const plaintext = `pik_${randomBytes(24).toString('hex')}`;
    const hash = createHash('sha256').update(plaintext).digest('hex');
    return { plaintext, hash };
  }

  /**
   * Create a new source with a generated API key.
   */
  async createSource(dto: {
    source_id: string;
    source_name: string;
  }): Promise<{
    source_id: string;
    source_name: string;
    api_key: string;
    status: string;
    created_at: string;
  }> {
    // Validate source_id format
    if (!/^[a-z0-9][a-z0-9\-]{2,48}[a-z0-9]$/.test(dto.source_id)) {
      throw new BadRequestException(
        'source_id must be 4-50 chars: lowercase letters, numbers, hyphens. Must start/end with letter or number.',
      );
    }

    // Check for duplicate
    const existing = await this.prisma.source.findUnique({
      where: { id: dto.source_id },
    });
    if (existing) {
      throw new ConflictException(
        `Source "${dto.source_id}" already exists`,
      );
    }

    const { plaintext, hash } = this.generateApiKey();

    const source = await this.prisma.source.create({
      data: {
        id: dto.source_id,
        name: dto.source_name,
        apiKeyHash: hash,
        status: 'active',
      },
    });

    this.logger.log(`Source created: ${source.id} (${source.name})`);

    return {
      source_id: source.id,
      source_name: source.name,
      api_key: plaintext, // Shown ONCE
      status: source.status,
      created_at: source.createdAt.toISOString(),
    };
  }

  /**
   * Rotate the API key for an existing source.
   * Invalidates the old key immediately.
   */
  async rotateApiKey(sourceId: string): Promise<{
    source_id: string;
    api_key: string;
    rotated_at: string;
  }> {
    const source = await this.prisma.source.findUnique({
      where: { id: sourceId },
    });
    if (!source) {
      throw new NotFoundException(`Source "${sourceId}" not found`);
    }

    const { plaintext, hash } = this.generateApiKey();

    await this.prisma.source.update({
      where: { id: sourceId },
      data: { apiKeyHash: hash },
    });

    this.logger.log(`API key rotated for source: ${sourceId}`);

    return {
      source_id: sourceId,
      api_key: plaintext, // Shown ONCE
      rotated_at: new Date().toISOString(),
    };
  }

  /**
   * Update source status (active, suspended, deactivated).
   */
  /**
   * Set a venue's capability ceiling (Slice 1).
   *
   * A partner's effective permission is this intersected with each player's
   * consent grant, so widening here can never bypass a player's choice. The
   * separation matters commercially: a pilot venue can be licensed to RUN
   * experiences without being licensed to PAY OUT for them.
   */
  async setScopes(
    sourceId: string,
    scopes: string[],
  ): Promise<{ source_id: string; scopes: string; updated_at: string }> {
    const valid = Object.values(SCOPES) as string[];
    const requested = [...new Set(scopes.map((s) => s.trim()).filter(Boolean))];
    const unknown = requested.filter((s) => !valid.includes(s));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown scope(s): ${unknown.join(', ')}. Valid: ${valid.join(', ')}`,
      );
    }

    const source = await this.prisma.source.findUnique({
      where: { id: sourceId },
    });
    if (!source) {
      throw new NotFoundException(`Source "${sourceId}" not found`);
    }

    const updated = await this.prisma.source.update({
      where: { id: sourceId },
      data: { scopes: requested.join(' ') },
    });

    this.logger.log(`Source ${sourceId} scopes → ${updated.scopes}`);

    return {
      source_id: updated.id,
      scopes: updated.scopes,
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Assign a canonical experience to a venue, optionally windowed (Slice 1).
   *
   * This is the Partner Portal's "Experience Assignment" / "Schedule content
   * availability" in primitive form. Partners never author experiences —
   * they are granted the right to run one Heroes already wrote.
   */
  async assignExperience(
    sourceId: string,
    params: {
      experience_slug: string;
      enabled?: boolean;
      available_from?: string;
      available_until?: string;
    },
  ) {
    const source = await this.prisma.source.findUnique({
      where: { id: sourceId },
    });
    if (!source) {
      throw new NotFoundException(`Source "${sourceId}" not found`);
    }

    const experience = await this.prisma.experience.findUnique({
      where: { slug: params.experience_slug },
    });
    if (!experience) {
      throw new NotFoundException(
        `Unknown experience: "${params.experience_slug}". Seed it first (npm run seed:experiences).`,
      );
    }

    const data = {
      enabled: params.enabled ?? true,
      availableFrom: params.available_from ? new Date(params.available_from) : null,
      availableUntil: params.available_until ? new Date(params.available_until) : null,
    };

    const assignment = await this.prisma.venueExperience.upsert({
      where: {
        sourceId_experienceId: { sourceId, experienceId: experience.id },
      },
      create: { sourceId, experienceId: experience.id, ...data },
      update: data,
    });

    this.logger.log(
      `Experience ${experience.slug} → ${sourceId} (enabled=${assignment.enabled})`,
    );

    return {
      source_id: sourceId,
      experience_slug: experience.slug,
      experience_version: experience.version,
      enabled: assignment.enabled,
      available_from: assignment.availableFrom?.toISOString() ?? null,
      available_until: assignment.availableUntil?.toISOString() ?? null,
    };
  }

  async setStatus(
    sourceId: string,
    status: string,
  ): Promise<{
    source_id: string;
    status: string;
    updated_at: string;
  }> {
    const valid = ['active', 'suspended', 'deactivated'];
    if (!valid.includes(status)) {
      throw new BadRequestException(
        `Invalid status: "${status}". Must be one of: ${valid.join(', ')}`,
      );
    }

    const source = await this.prisma.source.findUnique({
      where: { id: sourceId },
    });
    if (!source) {
      throw new NotFoundException(`Source "${sourceId}" not found`);
    }

    const updated = await this.prisma.source.update({
      where: { id: sourceId },
      data: { status },
    });

    this.logger.log(`Source ${sourceId} status → ${status}`);

    return {
      source_id: updated.id,
      status: updated.status,
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Get detailed info about a single source (with link count).
   */
  async getSourceDetail(sourceId: string) {
    const source = await this.prisma.source.findUnique({
      where: { id: sourceId },
    });
    if (!source) {
      throw new NotFoundException(`Source "${sourceId}" not found`);
    }

    const linkCount = await this.prisma.sourceLink.count({
      where: { sourceId, status: 'active' },
    });

    const eventCount = await this.prisma.identityEvent.count({
      where: { sourceId },
    });

    return {
      source_id: source.id,
      source_name: source.name,
      status: source.status,
      active_links: linkCount,
      total_events: eventCount,
      created_at: source.createdAt.toISOString(),
    };
  }

  /**
   * List all sources with link and event counts.
   */
  async listSourcesDetailed() {
    const sources = await this.prisma.source.findMany({
      orderBy: { createdAt: 'asc' },
    });

    const details = await Promise.all(
      sources.map(async (s) => {
        const linkCount = await this.prisma.sourceLink.count({
          where: { sourceId: s.id, status: 'active' },
        });
        const eventCount = await this.prisma.identityEvent.count({
          where: { sourceId: s.id },
        });
        return {
          source_id: s.id,
          source_name: s.name,
          status: s.status,
          active_links: linkCount,
          total_events: eventCount,
          created_at: s.createdAt.toISOString(),
        };
      }),
    );

    return details;
  }
}
