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
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma.service';
import { MailService } from '../mail/mail.service';
import { ROLES, isRole, permissionsFor, type Role } from './roles';
import type { ResolvedStaff } from './venue-staff.guard';

const BCRYPT_ROUNDS = 12;
const SESSION_TTL_HOURS = 12;
const INVITE_TTL_DAYS = 14;

/** Minimum viable password. Venue staff share terminals; short is not fine. */
const MIN_PASSWORD = 10;

/**
 * Reset links are short-lived — far shorter than an invite. An invite is
 * an arrangement made in advance ("start Monday"); a reset is someone
 * standing at a terminal right now.
 */
const RESET_TTL_MINUTES = 60;

/** Minimum gap between reset mails to one account. */
const RESET_COOLDOWN_MS = 60_000;

/**
 * Where the portal is served, for links in mail.
 *
 * The portal ships inside the backend (`/venue.html`), so the API's own
 * public domain is the right default and there is no second URL to keep
 * in sync. PORTAL_BASE_URL overrides it for a custom domain.
 */
function portalBaseUrl(): string {
  const explicit = process.env.PORTAL_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) return `https://${railway}`;
  return `http://localhost:${process.env.PORT ?? '8080'}`;
}

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

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
  // PASSWORD RESET
  //
  // The point of this whole seam: a venue owner who forgets their
  // password recovers on their own. Without it, recovery is a Heroes
  // engineer with database access — which is precisely the per-venue
  // custom engineering Phase 2 exists to remove.
  // ────────────────────────────────────────────────────────────

  /**
   * Begin a reset. Always succeeds from the caller's point of view.
   *
   * The response is identical whether the address is unknown, invited,
   * suspended, or active — for the same reason `login` returns one
   * message for both failure modes: this endpoint is unauthenticated and
   * must not become an oracle for which venues employ whom.
   */
  async requestPasswordReset(email: string, sourceId?: string) {
    const normalized = email?.toLowerCase().trim();

    // The uniform reply, returned on every path below including the
    // failures. Built once so no branch can accidentally differ.
    const ack = {
      ok: true,
      message:
        'If that address has an active staff account, a reset link is on its way.',
    };

    if (!normalized) return ack;

    // Only 'active' accounts. An 'invited' member has no password to
    // reset (their invite is the credential, and honouring a reset here
    // would be a second, weaker path to activation); a 'suspended' one
    // must not be able to reset their way back into a session.
    const candidates = await this.prisma.venueStaff.findMany({
      where: {
        email: normalized,
        status: 'active',
        ...(sourceId ? { sourceId } : {}),
      },
      include: { source: { select: { name: true } } },
    });

    for (const staff of candidates) {
      // Cooldown, so this endpoint cannot be used to mailbomb a member.
      // Silent: a "too soon" reply would leak that the account exists.
      const last = staff.resetRequestedAt?.getTime() ?? 0;
      if (Date.now() - last < RESET_COOLDOWN_MS) {
        this.logger.log(
          `Reset re-requested within cooldown for staff:${staff.id} — not resending`,
        );
        continue;
      }

      const token = randomBytes(32).toString('base64url');
      await this.prisma.venueStaff.update({
        where: { id: staff.id },
        data: {
          // A new request invalidates the previous link.
          resetHash: createHash('sha256').update(token).digest('hex'),
          resetExpires: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
          resetRequestedAt: new Date(),
        },
      });

      const result = await this.mail.passwordReset({
        to: staff.email,
        venueName: staff.source.name,
        link: `${portalBaseUrl()}/venue.html#reset=${token}`,
        ttlMinutes: RESET_TTL_MINUTES,
      });

      await this.audit(staff.sourceId, staff.id, 'staff.reset_requested', staff.id, {
        delivered: result.delivered,
        transport: result.transport,
      });
    }

    // A caller who supplies an address held at several venues gets one
    // link per venue. That is correct: they are separate grants, and the
    // mail names the venue.
    return ack;
  }

  /**
   * Finish a reset: set the new password and burn the token.
   *
   * Every existing session for the member is destroyed. A reset is what
   * someone does when they believe their account is compromised, so
   * leaving the attacker's 12-hour session alive would defeat the act.
   */
  async resetPassword(token: string, password: string) {
    if (!token) throw new BadRequestException('Missing reset token');
    if (!password || password.length < MIN_PASSWORD) {
      throw new BadRequestException(
        `Password must be at least ${MIN_PASSWORD} characters`,
      );
    }

    const resetHash = createHash('sha256').update(token).digest('hex');
    const staff = await this.prisma.venueStaff.findUnique({ where: { resetHash } });

    // One message for "no such token", "already used" and "wrong status",
    // matching the non-disclosure of the request half.
    if (!staff || staff.status !== 'active') {
      throw new UnauthorizedException('Reset link is invalid or already used');
    }
    if (!staff.resetExpires || staff.resetExpires.getTime() < Date.now()) {
      throw new UnauthorizedException('Reset link has expired');
    }

    const updated = await this.prisma.venueStaff.update({
      where: { id: staff.id },
      data: {
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        resetHash: null,
        resetExpires: null,
        // resetRequestedAt deliberately left standing: it is the cooldown
        // clock, and clearing it would let a completed reset be
        // immediately re-requested.
      },
    });

    // Evict everyone, including whoever prompted the reset.
    const { count } = await this.prisma.venueStaffSession.deleteMany({
      where: { staffId: staff.id },
    });

    await this.audit(updated.sourceId, updated.id, 'staff.password_reset', updated.id, {
      sessions_revoked: count,
    });

    // A fresh session, so the operator lands signed in rather than being
    // bounced to a login screen holding a password they just invented.
    const session = await this.issueSession(updated.id);

    return {
      session_token: session.token,
      expires_at: session.expiresAt.toISOString(),
      staff: this.presentStaff(updated),
      permissions: permissionsFor(updated.role),
      sessions_revoked: count,
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

    // An account that was invited and never accepted is a DEAD END, not a
    // conflict. Its invite token was shown once and is stored hashed, so
    // if it was lost or expired there is no way back: reset does not apply
    // (there is no password yet) and a second invite used to throw here.
    // The only remaining route was a Heroes engineer editing the database
    // — which is exactly the per-venue custom engineering this phase
    // exists to remove. Found in production: heroes-demo-venue's founding
    // owner sat 'invited' with no way to ever sign in.
    //
    // Re-inviting is safe precisely because the account is inert: no
    // password, no sessions, nothing to hijack. Re-issuing also BURNS the
    // previous token, so this narrows the window rather than widening it.
    const reissuing = existing?.status === 'invited';

    if (existing && !reissuing) {
      // 'active' or 'suspended' — a real account. Still a conflict, and
      // deliberately so: re-inviting an active member would be a way to
      // hand out a credential for someone else's live account.
      throw new ConflictException(
        `${email} already has an account at this venue`,
      );
    }

    const inviteToken = randomBytes(32).toString('base64url');
    const inviteData = {
      role: params.role,
      displayName: params.display_name ?? existing?.displayName ?? null,
      status: 'invited',
      inviteHash: createHash('sha256').update(inviteToken).digest('hex'),
      inviteExpires: new Date(Date.now() + INVITE_TTL_DAYS * 86400000),
    };

    const created = reissuing
      ? await this.prisma.venueStaff.update({
          where: { id: existing!.id },
          data: inviteData,
        })
      : await this.prisma.venueStaff.create({
          data: {
            sourceId,
            email,
            invitedBy: actor ? `staff:${actor.id}` : 'platform',
            ...inviteData,
          },
        });

    const venue = await this.prisma.source.findUnique({
      where: { id: sourceId },
      select: { name: true },
    });

    const delivery = await this.mail.staffInvite({
      to: email,
      venueName: venue?.name ?? 'the venue',
      role: params.role,
      inviterName: actor?.displayName || actor?.email || 'Heroes',
      // `#accept=` — the fragment venue.html already listens for. A
      // different name here would send a live invite to a page that
      // silently ignores it.
      link: `${portalBaseUrl()}/venue.html#accept=${inviteToken}`,
      ttlDays: INVITE_TTL_DAYS,
    });

    await this.audit(
      sourceId,
      actor?.id ?? null,
      reissuing ? 'staff.invite_reissued' : 'staff.invited',
      created.id,
      { email, role: params.role, delivered: delivery.delivered },
    );

    return {
      ...this.presentStaff(created),
      // Still returned, and still shown once. Mail delivery is now the
      // primary path, but the hand-carry must not disappear: it is the
      // fallback when the provider is down or the address bounces, and
      // it is the only path at all while the transport is `log`.
      invite_token: inviteToken,
      invite_expires: created.inviteExpires?.toISOString(),
      // So the portal can say "emailed" or "copy this link" honestly
      // rather than claiming a delivery that did not happen.
      invite_emailed: delivery.delivered,
      // True when this replaced a stale unaccepted invite. The caller
      // should know it burned the previous link rather than issuing a
      // second valid one.
      reissued: reissuing,
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

  /**
   * Recent runs for this venue's own dashboard.
   *
   * Separate from the partner API's history even though the data is the
   * same: that one answers a machine holding an API key, this one answers
   * a person holding a session. Collapsing them would mean one auth
   * change silently altering the other surface.
   */
  async listRuns(staff: ResolvedStaff, limit = 15) {
    const runs = await this.prisma.experienceRun.findMany({
      where: { sourceId: staff.sourceId },
      include: { participants: true, experience: { select: { name: true, slug: true } } },
      orderBy: { startedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return runs.map((r) => ({
      run_id: r.id,
      experience: r.experience.name,
      status: r.status,
      started_at: r.startedAt.toISOString(),
      ended_at: r.endedAt?.toISOString() ?? null,
      duration_sec: r.durationSec,
      payout_multiplier: r.payoutMultiplier,
      failure_reason: r.failureReason,
      participants: r.participants.map((p) => ({
        root_id: p.rootId,
        guest_label: p.guestLabel,
        reward_state: p.rewardState,
      })),
    }));
  }

  // ────────────────────────────────────────────────────────────
  // PRINTABLE ASSETS
  // ────────────────────────────────────────────────────────────

  /**
   * What the venue prints and puts on the wall. Returns the payload, not
   * an image — rendering belongs to whatever produces the physical asset,
   * and a venue's print shop wants the string, not our PNG.
   */
  async venueQrPayload(staff: ResolvedStaff) {
    const venue = await this.prisma.source.findUnique({
      where: { id: staff.sourceId },
      select: { id: true, name: true, status: true },
    });
    if (!venue) throw new NotFoundException('Venue not found');

    await this.audit(staff.sourceId, staff.id, 'assets.venue_qr_generated');

    const deepLink = `heroescodex://venue/${venue.id}`;

    // SVG rather than PNG: a venue prints this at whatever size the wall
    // needs, and vector survives being scaled up by a print shop. Error
    // correction 'M' tolerates a scuffed or partly-obscured sign, which
    // is the realistic failure mode for something mounted at a door.
    const svg = await QRCode.toString(deepLink, {
      type: 'svg',
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#06080F', light: '#FFFFFF' },
    });

    return {
      source_id: venue.id,
      venue_name: venue.name,
      /** What the QR encodes. */
      deep_link: deepLink,
      /** Ready to print. Scales without loss. */
      qr_svg: svg,
      /** Shown beneath it, for a player who cannot scan. */
      instructions:
        'Scan to let this venue record your deeds, or open Heroes\' Codex and check in manually.',
      active: venue.status === 'active',
    };
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
