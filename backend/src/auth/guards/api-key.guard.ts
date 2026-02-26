// ============================================================
// PIK — API Key Guard
//
// Validates the X-PIK-API-Key header on ingest requests.
// Looks up the SHA-256 hash of the provided key against the
// sources table. Attaches the resolved source to the request
// object for downstream use by IngestService.
//
// Place at: src/auth/guards/api-key.guard.ts
// ============================================================

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma.service';

/**
 * Shape attached to request.source by the guard.
 */
export interface ResolvedSource {
  id: string;
  name: string;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-pik-api-key'];

    if (!apiKey) {
      throw new ForbiddenException('Missing X-PIK-API-Key header');
    }

    // Hash the provided key and look it up
    const hash = createHash('sha256').update(apiKey).digest('hex');

    const source = await this.prisma.source.findFirst({
      where: {
        apiKeyHash: hash,
        status: 'active',
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!source) {
      throw new ForbiddenException('Invalid API key');
    }

    // Attach the resolved source to the request so IngestService
    // can access it without re-querying.
    request.source = source;

    return true;
  }
}
