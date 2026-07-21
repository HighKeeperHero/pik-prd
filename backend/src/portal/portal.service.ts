// ============================================================
// HEP Phase 2 Slice 2 — Partner Portal service
//
// Venue staff authentication, staff administration, venue profile,
// and experience scheduling. Every mutation writes an audit entry.
//
// Place at: src/portal/portal.service.ts
// ============================================================

import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma.service';
import { ROLES, isRole, permissionsFor, type Role } from './roles';
import type { ResolvedStaff } from './venue-staff.guard';

const BCRYPT_ROUNDS = 12;
const SESSION_TTL_HOURS = 12;
const INVITE_TTL_DAYS = 14;

/** Minimum viable password. Venue staff share terminals; short is not fine. */
const MIN_PASSWORD = 10;

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ────────────────────────────────────────────────────────────
  // AUTH
  // ────────────────────────────────────────────────────────────

  /**
   * Sign in a staff member.
   *
   * Email is unique per venue, not globally, so the same address may exist
   * at several venues. We match the password against every candidate and
   * ask for disambiguation only when more than one genuinely matches —
   * which avoids making the operator memorise a venue id in the common case.
   */
  async login(email: string, password: string, sourceId?: string) {
    if (!email || !password) {
      throw new BadRequestException('Requires: email, password');
    }

    const candidates = await this.prisma.venueStaff.findMany({
      where: {
        email: email.toLowerCase().trim(),
        status: 'active',
        ...(sourceId ? { sourceId } : {}),
      },
    });

    const matched: typeof candidates = [];
    for (const c of candidates) {
      if (c.passwordHash && (await bcrypt.compare(password, c.passwordHash))) {
        matched.push(c);
      }
    }

    // Same message whether the email is unknown or the password is wrong —
    // a portal login should not confirm which venues employ whom.
    if (matched.length === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (matched.length > 1) {
      throw new ConflictException({
        message: 'This account exists at several venues; specify source_id',
        venues: matched.map((m) => m.sourceId),
      });
    }

    const staff = matched[0];
    const session = await this.issueSession(staff.id);

    await this.prisma.venueStaff.update({
      where: { id: staff.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit(staff.sourceId, staff.id, 'staff.login');

    return {
      session_token: session.token,
      expires_at: session.expiresAt.toISOString(),
      staff: this.presentStaff(staff),
      permissions: permissionsFor(staff.role),
    };
  }

  async logout(staff: ResolvedStaff, rawToken: string) {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await this.prisma.venueStaffSession
      .delete({ where: { tokenHash } })
      .catch(() => undefined);
    await this.audit(staff.sourceId, staff.id, 'staff.logout');
    return { ok: true };
  }

  async me(staff: ResolvedStaff) {
    const venue = await this.prisma.source.findUnique({
      where: { id: staff.sourceId },
      select: { id: true, name: true, status: true, scopes: true },
    });
    return {
      staff: {
        staff_id: staff.id,
        email: staff.email,
        display_name: staff.displayName,
        role: staff.role,
      },
      venue: {
        source_id: venue?.id,
        name: venue?.name,
        status: venue?.status,
        scopes: venue?.scopes,
      },
      permissions: permissionsFor(staff.role),
    };
  }

  /**
   * Accept an invite: set a password and activate the account.
   *
   * Unauthenticated by necessity — the invitee has no session yet. The
   * single-use hashed token is the credential.
   */
  async acceptInvite(inviteToken: string, password: string, displayName?: string) {
    if (!inviteToken) throw new BadRequestException('Missing invite token');
    if (!password || password.length < MIN_PASSWORD) {
      throw new BadRequestException(
        `Password must be at least ${MIN_PASSWORD} characters`,
      );
    }

    const inviteHash = createHash('sha256').update(inviteToken).digest('hex');
    const staff = await this.prisma.venueStaff.findUnique({
      where: { inviteHash },
    });

    if (!staff || staff.status !== 'invited') {
      throw new UnauthorizedException('Invite not found or already used');
    }
    if (staff.inviteExpires && staff.inviteExpires.getTime() < Date.now()) {
      throw new UnauthorizedException('Invite has expired');
    }

    const updated = await this.prisma.venueStaff.update({
      where: { id: staff.id },
      data: {
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        displayName: displayName ?? staff.displayName,
        status: 'active',
        // Burn the invite so the link cannot be replayed.
        inviteHash: null,
        inviteExpires: null,
      },
    });

    await this.audit(updated.sourceId, updated.id, 'staff.invite_accepted');
    const session = await this.issueSession(updated.id);

    return {
      session_token: session.token,
      expires_at: session.expiresAt.toISOString(),
      staff: this.presentStaff(updated),
      permissions: permissionsFor(updated.role),
    };
  }

  // ────────────────────────────────────────────────────────────
  // STAFF ADMINISTRATION
  // ────────────────────────────────────────────────────────────

  async listStaff(staff: ResolvedStaff) {
    const rows = await this.prisma.venueStaff.findMany({
      where: { sourceId: staff.sourceId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.presentStaff(r));
  }

  /**
   * Invite a colleague. Returns the plaintext invite token exactly once —
   * it is stored hashed and is not recoverable afterward.
   */
  async inviteStaff(
    actor: ResolvedStaff | null,
    sourceId: string,
    params: { email: string; role: string; display_name?: string },
  ) {
    const email = params.email?.toLowerCase().trim();
    if (!email) throw new BadRequestException('Requires: email');
    if (!isRole(params.role)) {
      throw new BadRequestException(
        `Invalid role '${params.role}'. One of: ${ROLES.join(', ')}`,
      );
    }

    const existing = await this.prisma.venueStaff.findUnique({
      where: { sourceId_email: { sourceId, email } },
    });
    if (existing) {
      throw new ConflictException(
        `${email} already has an account at this venue`,
      );
    }

    const inviteToken = randomBytes(32).toString('base64url');

    const created = await this.prisma.venueStaff.create({
      data: {
        sourceId,
        email,
        role: params.role,
        displayName: params.display_name ?? null,
        status: 'invited',
        invitedBy: actor ? `staff:${actor.id}` : 'platform',
        inviteHash: createHash('sha256').update(inviteToken).digest('hex'),
        inviteExpires: new Date(Date.now() + INVITE_TTL_DAYS * 86400000),
      },
    });

    await this.audit(sourceId, actor?.id ?? null, 'staff.invited', created.id, {
      email,
      role: params.role,
    });

    return {
      ...this.presentStaff(created),
      // Shown once. The inviter passes it on; we cannot re-derive it.
      invite_token: inviteToken,
      invite_expires: created.inviteExpires?.toISOString(),
    };
  }

  async updateStaff(
    actor: ResolvedStaff,
    staffId: string,
    params: { role?: string; status?: string },
  ) {
    const target = await this.prisma.venueStaff.findUnique({
      where: { id: staffId },
    });
    if (!target || target.sourceId !== actor.sourceId) {
      throw new NotFoundException(`Staff member not found: ${staffId}`);
    }

    if (params.role && !isRole(params.role)) {
      throw new BadRequestException(`Invalid role '${params.role}'`);
    }
    if (params.status && !['active', 'suspended'].includes(params.status)) {
      throw new BadRequestException(`Invalid status '${params.status}'`);
    }

    // A venue must never be left without an owner — otherwise nobody can
    // manage staff or rotate the key, and recovery needs Heroes support.
    const losingOwner =
      target.role === 'owner' &&
      ((params.role && params.role !== 'owner') || params.status === 'suspended');
    if (losingOwner) {
      const owners = await this.prisma.venueStaff.count({
        where: { sourceId: actor.sourceId, role: 'owner', status: 'active' },
      });
      if (owners <= 1) {
        throw new ConflictException(
          'This is the venue\'s only active owner; promote another owner first',
        );
      }
    }

    const updated = await this.prisma.venueStaff.update({
      where: { id: staffId },
      data: {
        ...(params.role ? { role: params.role } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
    });

    // Revoking access must take effect now, not when the token expires.
    if (params.status === 'suspended') {
      await this.prisma.venueStaffSession.deleteMany({
        where: { staffId },
      });
    }

    await this.audit(actor.sourceId, actor.id, 'staff.updated', staffId, params);
    return this.presentStaff(updated);
  }

  // ────────────────────────────────────────────────────────────
  // VENUE PROFILE
  // ────────────────────────────────────────────────────────────

  async getVenue(staff: ResolvedStaff) {
    const venue = await this.prisma.source.findUnique({
      where: { id: staff.sourceId },
    });
    if (!venue) throw new NotFoundException('Venue not found');

    const profile = (venue.profile ?? {}) as Record<string, unknown>;
    return {
      source_id: venue.id,
      name: venue.name,
      status: venue.status,
      scopes: venue.scopes,
      created_at: venue.createdAt.toISOString(),
      ...profile,
    };
  }

  /**
   * Update the venue's descriptive profile.
   *
   * Deliberately cannot touch `scopes` or `status` — those are the
   * commercial terms of the partnership and belong to Heroes, not to the
   * partner. A venue editing its own scopes would be self-granting.
   */
  async updateVenue(staff: ResolvedStaff, patch: Record<string, unknown>) {
    const allowed = [
      'display_name',
      'contact_email',
      'contact_phone',
      'address',
      'timezone',
      'operating_hours',
      'geo',
    ];
    const rejected = Object.keys(patch).filter((k) => !allowed.includes(k));
    if (rejected.length > 0) {
      throw new ForbiddenException(
        `Not editable by a venue: ${rejected.join(', ')}. Contact Heroes to change commercial terms.`,
      );
    }

    const venue = await this.prisma.source.findUnique({
      where: { id: staff.sourceId },
    });
    const merged = { ...((venue?.profile ?? {}) as object), ...patch };

    await this.prisma.source.update({
      where: { id: staff.sourceId },
      data: { profile: merged as never },
    });

    await this.audit(staff.sourceId, staff.id, 'venue.updated', null, {
      fields: Object.keys(patch),
    });
    return this.getVenue(staff);
  }

  // ────────────────────────────────────────────────────────────
  // EXPERIENCES
  // ────────────────────────────────────────────────────────────

  async listExperiences(staff: ResolvedStaff) {
    const rows = await this.prisma.venueExperience.findMany({
      where: { sourceId: staff.sourceId },
      include: { experience: true },
    });
    return rows.map((r) => ({
      slug: r.experience.slug,
      name: r.experience.name,
      version: r.experience.version,
      enabled: r.enabled,
      min_players: r.experience.minPlayers,
      max_players: r.experience.maxPlayers,
      target_duration_sec: r.experience.targetDurationSec,
      available_from: r.availableFrom?.toISOString() ?? null,
      available_until: r.availableUntil?.toISOString() ?? null,
    }));
  }

  /**
   * Enable/disable or window an assigned experience.
   *
   * A venue schedules what it has been granted; it cannot grant itself a
   * new experience. Assignment stays a Heroes action — partners configure
   * experiences, they never acquire them.
   */
  async updateExperience(
    staff: ResolvedStaff,
    slug: string,
    patch: { enabled?: boolean; available_from?: string; available_until?: string },
  ) {
    const experience = await this.prisma.experience.findUnique({
      where: { slug },
    });
    if (!experience) throw new NotFoundException(`Unknown experience: ${slug}`);

    const assignment = await this.prisma.venueExperience.findUnique({
      where: {
        sourceId_experienceId: {
          sourceId: staff.sourceId,
          experienceId: experience.id,
        },
      },
    });
    if (!assignment) {
      throw new NotFoundException(
        `${slug} is not assigned to this venue. Contact Heroes to add it.`,
      );
    }

    await this.prisma.venueExperience.update({
      where: { id: assignment.id },
      data: {
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.available_from !== undefined
          ? { availableFrom: patch.available_from ? new Date(patch.available_from) : null }
          : {}),
        ...(patch.available_until !== undefined
          ? { availableUntil: patch.available_until ? new Date(patch.available_until) : null }
          : {}),
      },
    });

    await this.audit(staff.sourceId, staff.id, 'experience.updated', slug, patch);
    return this.listExperiences(staff);
  }

  // ────────────────────────────────────────────────────────────
  // AUDIT
  // ────────────────────────────────────────────────────────────

  async listAudit(staff: ResolvedStaff, limit = 50) {
    const rows = await this.prisma.venueAuditEntry.findMany({
      where: { sourceId: staff.sourceId },
      include: { staff: { select: { email: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
    return rows.map((r) => ({
      entry_id: r.id,
      action: r.action,
      target: r.target,
      by: r.staff?.email ?? 'Heroes platform',
      metadata: r.metadata,
      at: r.createdAt.toISOString(),
    }));
  }

  /** Audit writes must never break the action they record. */
  async audit(
    sourceId: string,
    staffId: string | null,
    action: string,
    target: string | null = null,
    metadata: Record<string, unknown> = {},
  ) {
    try {
      await this.prisma.venueAuditEntry.create({
        data: { sourceId, staffId, action, target, metadata: metadata as never },
      });
    } catch (err) {
      this.logger.warn(`Audit write failed (${action}): ${err}`);
    }
  }

  // ────────────────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────────────────

  private async issueSession(staffId: string) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);
    await this.prisma.venueStaffSession.create({
      data: {
        staffId,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt,
      },
    });
    return { token, expiresAt };
  }

  private presentStaff(s: {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
    status: string;
    lastLoginAt: Date | null;
    createdAt: Date;
  }) {
    return {
      staff_id: s.id,
      email: s.email,
      display_name: s.displayName,
      role: s.role as Role,
      status: s.status,
      last_login_at: s.lastLoginAt?.toISOString() ?? null,
      created_at: s.createdAt.toISOString(),
    };
  }
}
