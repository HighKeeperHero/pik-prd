// ============================================================
// HEP — Platform Admin Guard (Phase 2, Slice 0)
//
// Protects Heroes-internal operator routes: source/partner
// administration, runtime config writes, manual loot grants,
// operator impersonation, and the cross-tenant session views.
//
// These are NOT partner-facing. Partners authenticate with
// ApiKeyGuard (X-PIK-API-Key, scoped to one Source). This guard
// is the Heroes staff key and has no tenant scoping at all —
// it sees every venue.
//
// FAIL CLOSED: if HV_PLATFORM_ADMIN_KEY is unset the guard denies
// every request. An unconfigured deployment must not silently
// leave operator routes open, which is exactly how these routes
// shipped before Phase 2.
//
// This is a deliberate stopgap. Slice 2 (Partner Portal) replaces
// it with real staff accounts and Owner/Manager/Operator/read-only
// RBAC per the Phase 2 brief; a single shared key cannot express
// per-venue roles or attribute an action to a person.
//
// Place at: src/auth/guards/platform-admin.guard.ts
// ============================================================

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  private readonly logger = new Logger(PlatformAdminGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.HV_PLATFORM_ADMIN_KEY;

    if (!expected) {
      this.logger.error(
        'HV_PLATFORM_ADMIN_KEY is not set — denying all platform admin requests. ' +
          'Set it in the Railway environment to enable operator routes.',
      );
      throw new ServiceUnavailableException(
        'Platform admin access is not configured',
      );
    }

    const request = context.switchToHttp().getRequest();
    const provided = request.headers['x-hv-admin-key'];

    if (typeof provided !== 'string' || !constantTimeEquals(provided, expected)) {
      const route = `${request.method} ${request.originalUrl ?? request.url}`;
      this.logger.warn(`Rejected platform admin request: ${route}`);
      throw new ForbiddenException('Invalid or missing X-HV-Admin-Key header');
    }

    // Marks the request as operator-originated so services can
    // attribute writes (the `operator:<id>` convention already used
    // by enrolledBy / grantedBy / revokedBy).
    request.platformAdmin = true;

    return true;
  }
}

/**
 * Length-independent constant-time comparison. Comparing the SHA-256
 * digests rather than the raw strings keeps both buffers the same
 * size, so timingSafeEqual never throws on a length mismatch and the
 * comparison leaks no information about the expected key's length.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a).digest();
  const digestB = createHash('sha256').update(b).digest();
  return timingSafeEqual(digestA, digestB);
}
