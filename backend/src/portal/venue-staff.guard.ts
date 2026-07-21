// ============================================================
// HEP Phase 2 Slice 2 — venue staff auth + RBAC
//
// Guards /api/portal/v1/*. Validates an opaque staff bearer token
// against venue_staff_sessions and attaches the resolved staff member,
// then enforces the @RequirePermission() declared on the handler.
//
// ── The boundary this enforces ─────────────────────────────────
// This guard reads venue_staff_sessions ONLY. It never consults
// account_sessions or session_tokens, so a player's Codex token
// cannot reach any portal route no matter how it is presented.
// The reverse holds too: AccountGuard never reads this table.
//
// The Partner Portal is connective tissue into the platform, not a
// screen inside Heroes' Codex, and these two identity systems are
// deliberately unbridgeable.
//
// Place at: src/portal/venue-staff.guard.ts
// ============================================================

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma.service';
import { can, permissionsFor, type Permission } from './roles';

export const PERMISSION_KEY = 'hep:permission';

/** Declare the permission a portal handler requires. */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);

export interface ResolvedStaff {
  id: string;
  sourceId: string;
  email: string;
  role: string;
  displayName: string | null;
}

@Injectable()
export class VenueStaffGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers['authorization'];

    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing staff session');
    }

    const tokenHash = createHash('sha256')
      .update(header.slice(7))
      .digest('hex');

    const session = await this.prisma.venueStaffSession.findUnique({
      where: { tokenHash },
      include: { staff: true },
    });

    // One message for every failure mode below — an unknown token, an
    // expired one, and a suspended account must be indistinguishable, or
    // the response becomes an oracle for probing valid sessions.
    if (!session || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Session expired or invalid');
    }
    if (session.staff.status !== 'active') {
      throw new UnauthorizedException('Session expired or invalid');
    }

    const staff: ResolvedStaff = {
      id: session.staff.id,
      sourceId: session.staff.sourceId,
      email: session.staff.email,
      role: session.staff.role,
      displayName: session.staff.displayName,
    };
    request.staff = staff;

    // Handlers without a declared permission are authenticated-only
    // (e.g. /me, logout). Everything else states what it needs.
    const required = this.reflector.getAllAndOverride<Permission | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    if (!can(staff.role, required)) {
      throw new ForbiddenException(
        `Role '${staff.role}' cannot ${required}. Granted: ${
          permissionsFor(staff.role).join(', ') || '(none)'
        }`,
      );
    }

    return true;
  }
}
