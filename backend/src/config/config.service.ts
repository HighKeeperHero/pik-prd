// ============================================================
// PIK — Config Service
// Live-tunable system configuration
//
// All 11 config keys are seeded by seed.ts. New keys cannot
// be created via the API — only existing keys can be updated.
// Changes take effect immediately for all subsequent requests.
//
// Place at: src/config/config.service.ts
// ============================================================

import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/config
   * Returns all config key-value pairs as a flat object.
   * Matches the MVP response shape.
   */
  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.config.findMany({
      orderBy: { key: 'asc' },
    });

    const result: Record<string, unknown> = {};
    for (const row of rows) {
      // Attempt numeric parse to match MVP behavior
      // (MVP returns numbers as numbers, not strings)
      const num = Number(row.value);
      result[row.key] = isNaN(num) ? row.value : num;
    }

    return result;
  }

  /**
   * POST /api/config
   * Update a single config value. Rejects unknown keys.
   */
  async update(
    configKey: string,
    configValue: unknown,
  ): Promise<{ config_key: string; config_value: unknown; updated_at: string }> {
    // Verify the key exists (no new keys via API)
    const existing = await this.prisma.config.findUnique({
      where: { key: configKey },
    });

    if (!existing) {
      throw new BadRequestException(
        `Unknown config key: ${configKey}. Only pre-existing keys can be updated.`,
      );
    }

    const stringValue = String(configValue);

    const updated = await this.prisma.config.update({
      where: { key: configKey },
      data: {
        value: stringValue,
      },
    });

    this.logger.log(`Config updated: ${configKey} = ${stringValue}`);

    const num = Number(updated.value);
    return {
      config_key: updated.key,
      config_value: isNaN(num) ? updated.value : num,
      updated_at: updated.updatedAt.toISOString(),
    };
  }

  /**
   * GET /api/sources
   * Returns all registered sources.
   * Placed here since it's a small read-only lookup that
   * doesn't warrant its own module.
   */
  async getSources() {
    const sources = await this.prisma.source.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return sources.map((s) => ({
      source_id: s.id,
      source_name: s.name,
      status: s.status,
      created_at: s.createdAt.toISOString(),
    }));
  }

  /**
   * Quick diagnostic: check if a database table exists by running a count query.
   * Throws if the table doesn't exist.
   */
  async checkTable(tableName: string) {
    await this.prisma.$queryRawUnsafe(`SELECT COUNT(*) FROM "${tableName}" LIMIT 1`);
  }
}
