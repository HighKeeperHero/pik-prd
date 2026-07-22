// ============================================================
// HEP Phase 2 Slice 9 — venue certification (P12)
//
// Is this venue fit to run this experience, in this room, for a paying
// guest? Today that judgement lives in a Heroes engineer's head.
//
// ── The gate ───────────────────────────────────────────────────
// A gate with no override strands a pilot mid-event and teaches everyone
// to fear it. An override with no record is not a gate at all. So:
// platform admin, reason required, time-boxed, audited — the same shape
// as reward reversal, because it is the same class of decision.
//
// ── no_data BLOCKS, but not indiscriminately ───────────────────
// Treating "no telemetry yet" as satisfied would certify a venue because
// nothing had been measured — this project's recurring bug in the worst
// possible place. So no_data blocks by default.
//
// But "have you measured anything?" and "has history accumulated yet?"
// are different questions, and conflating them deadlocked the gate: a
// new venue has no payout history, payout history needs runs, and runs
// need certification. See CheckResult.blocksWhenMissing.
//
// Place at: src/certification/certification.service.ts
// ============================================================

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma.service';
import { TelemetryService } from '../spatial/telemetry.service';
import { PortalService } from '../portal/portal.service';
import { validateManifest } from '../spatial/manifest';

export interface CheckResult {
  key: string;
  label: string;
  /** pass | fail | no_data — no_data is NOT a pass. */
  status: 'pass' | 'fail' | 'no_data';
  detail?: string;
  /**
   * Whether `no_data` blocks certification for THIS check.
   *
   * The distinction matters and the first version of this file got it
   * wrong: "have you measured anything?" and "has history accumulated
   * yet?" are different questions.
   *
   * `telemetry.reporting` must block on no_data — a venue that has
   * reported nothing has demonstrated nothing.
   *
   * `rewards.sync` must NOT. A venue that has never paid anyone has not
   * failed to pay anyone, and requiring it created a deadlock: you
   * cannot accumulate payout history until you can run, and you could
   * not run until certified. The harness caught it.
   */
  blocksWhenMissing?: boolean;
}

/** Telemetry window certification looks at. */
const TELEMETRY_WINDOW_DAYS = 30;

/** Longest an override may run. Permanent overrides are disabled gates. */
const MAX_OVERRIDE_DAYS = 30;

@Injectable()
export class CertificationService {
  private readonly logger = new Logger(CertificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetry: TelemetryService,
    private readonly portal: PortalService,
  ) {}

  // ────────────────────────────────────────────────────────────
  // EVALUATION
  // ────────────────────────────────────────────────────────────

  /**
   * Run every check. Never mutates — an operator needs to see exactly
   * what is failing before deciding whether to certify or to fix.
   */
  async evaluate(sourceId: string, experienceSlug: string, roomId: string) {
    const { source, experience, room } = await this.load(
      sourceId,
      experienceSlug,
      roomId,
    );

    const checks: CheckResult[] = [];
    const add = (
      key: string,
      label: string,
      status: CheckResult['status'],
      detail?: string,
      blocksWhenMissing = true,
    ) => checks.push({ key, label, status, detail, blocksWhenMissing });

    // ── The venue ────────────────────────────────────────────
    add(
      'venue.active',
      'Venue is active',
      source.status === 'active' ? 'pass' : 'fail',
      `status=${source.status}`,
    );

    const scopes = (source.scopes ?? '').split(/\s+/).filter(Boolean);
    add(
      'venue.scope_runs',
      'Venue is licensed to run experiences',
      scopes.includes('runs') ? 'pass' : 'fail',
      source.scopes,
    );

    // Not a failure — a rehearsal venue licensed to run but not pay is a
    // deliberate configuration, and certifying it should be possible.
    // Recorded so nobody is surprised when it pays nothing.
    add(
      'venue.scope_rewards',
      'Venue may mint rewards',
      scopes.includes('rewards') ? 'pass' : 'no_data',
      scopes.includes('rewards')
        ? undefined
        : 'venue cannot pay — rehearsal configuration',
      // A rehearsal venue licensed to run but not pay is a deliberate,
      // certifiable configuration.
      false,
    );

    const owners = await this.prisma.venueStaff.count({
      where: { sourceId, role: 'owner', status: 'active' },
    });
    add(
      'venue.has_active_owner',
      'Venue has an active owner',
      owners > 0 ? 'pass' : 'fail',
      // An invited-but-never-accepted owner reads as "has an owner" to a
      // human glancing at the staff list. It is not one.
      `${owners} active owner(s)`,
    );

    // ── The experience ───────────────────────────────────────
    const assignment = await this.prisma.venueExperience.findUnique({
      where: {
        sourceId_experienceId: { sourceId, experienceId: experience.id },
      },
    });
    const inSeason =
      !!assignment &&
      assignment.enabled &&
      (!assignment.availableFrom || assignment.availableFrom <= new Date()) &&
      (!assignment.availableUntil || assignment.availableUntil >= new Date());
    add(
      'experience.assigned',
      'Experience is assigned and in season',
      inSeason ? 'pass' : 'fail',
      !assignment ? 'not assigned to this venue' : assignment.enabled ? 'out of season' : 'disabled',
    );

    const manifestIssues = validateManifest(experience.manifest);
    const spatial =
      !!experience.manifest &&
      Array.isArray((experience.manifest as any).requiredAnchors) &&
      (experience.manifest as any).requiredAnchors.length > 0;
    add(
      'experience.manifest_valid',
      'Experience manifest is valid',
      !spatial ? 'no_data' : manifestIssues.length === 0 ? 'pass' : 'fail',
      !spatial
        ? 'experience declares no spatial manifest'
        : manifestIssues.length
          ? `${manifestIssues.length} issue(s)`
          : undefined,
    );

    // ── The room ─────────────────────────────────────────────
    const config = room.activeConfig;
    add(
      'room.published',
      'Room has a published calibration',
      config ? 'pass' : 'fail',
      config ? `v${config.version}` : 'never published',
    );

    const verdict = (config?.validation ?? {}) as any;
    add(
      'room.validation_passed',
      'That calibration passed validation',
      !config ? 'no_data' : verdict?.passed === true ? 'pass' : 'fail',
      Array.isArray(verdict?.failures) && verdict.failures.length
        ? verdict.failures[0]
        : undefined,
    );

    add(
      'room.device_profile',
      'Room is certified for at least one device profile',
      !config
        ? 'no_data'
        : (config.supportedDeviceProfiles ?? []).length > 0
          ? 'pass'
          : 'fail',
      (config?.supportedDeviceProfiles ?? []).join(', ') || undefined,
    );

    // ── Measured quality ─────────────────────────────────────
    const telemetry = await this.telemetry.summary(sourceId, TELEMETRY_WINDOW_DAYS);

    // The check this whole design exists to get right. A venue that has
    // reported nothing has not demonstrated anything, and certifying it
    // would be the vacuous pass wearing a certificate.
    add(
      'telemetry.reporting',
      'Telemetry is arriving from this venue',
      telemetry.total_samples > 0 ? 'pass' : 'no_data',
      `${telemetry.total_samples} sample(s) in ${TELEMETRY_WINDOW_DAYS}d`,
    );

    const failing = (telemetry.thresholds ?? []).filter(
      (t: any) => t.status === 'fail',
    );
    add(
      'telemetry.thresholds',
      'No spatial quality threshold is failing',
      telemetry.total_samples === 0
        ? 'no_data'
        : failing.length === 0
          ? 'pass'
          : 'fail',
      failing.length ? failing.map((f: any) => f.metric).join(', ') : undefined,
    );

    const rewardSync = (telemetry.thresholds ?? []).find(
      (t: any) => t.metric === 'rewards.sync_success',
    );
    add(
      'rewards.sync',
      'Rewards are reaching players',
      (rewardSync?.status as CheckResult['status']) ?? 'no_data',
      rewardSync?.detail ? JSON.stringify(rewardSync.detail) : undefined,
      // See CheckResult.blocksWhenMissing. A venue with no payout history
      // has not failed to pay anyone — blocking here deadlocked the gate.
      false,
    );

    const failed = checks.filter((c) => c.status === 'fail');
    // Only the missing data that actually blocks. Everything else is
    // reported but does not stand in the way.
    const missing = checks.filter(
      (c) => c.status === 'no_data' && c.blocksWhenMissing !== false,
    );
    const missingNonBlocking = checks.filter(
      (c) => c.status === 'no_data' && c.blocksWhenMissing === false,
    );

    return {
      source_id: sourceId,
      experience: experience.slug,
      room: room.slug,
      // Blocking checks are failures AND missing data. Named explicitly
      // so a caller cannot read `failed.length === 0` as "certifiable".
      certifiable: failed.length === 0 && missing.length === 0,
      blocking: [...failed, ...missing].map((c) => c.key),
      checks,
      summary: {
        pass: checks.filter((c) => c.status === 'pass').length,
        fail: failed.length,
        no_data_blocking: missing.length,
        no_data_informational: missingNonBlocking.length,
      },
      fingerprint: this.fingerprint(source.scopes, experience.version, config?.id ?? null),
    };
  }

  // ────────────────────────────────────────────────────────────
  // CERTIFY / OVERRIDE / REVOKE
  // ────────────────────────────────────────────────────────────

  async certify(
    sourceId: string,
    experienceSlug: string,
    roomId: string,
    actor: string,
  ) {
    const verdict = await this.evaluate(sourceId, experienceSlug, roomId);
    if (!verdict.certifiable) {
      throw new BadRequestException({
        message: 'Venue does not meet certification requirements',
        blocking: verdict.blocking,
        checks: verdict.checks.filter((c) => c.status !== 'pass'),
      });
    }

    const { experience } = await this.load(sourceId, experienceSlug, roomId);

    const row = await this.prisma.venueCertification.upsert({
      where: {
        sourceId_experienceId_roomId: {
          sourceId,
          experienceId: experience.id,
          roomId,
        },
      },
      create: {
        sourceId,
        experienceId: experience.id,
        roomId,
        status: 'certified',
        checks: verdict as never,
        fingerprint: verdict.fingerprint as never,
        certifiedBy: actor,
      },
      update: {
        status: 'certified',
        checks: verdict as never,
        fingerprint: verdict.fingerprint as never,
        certifiedAt: new Date(),
        certifiedBy: actor,
        reason: null,
        expiresAt: null,
      },
    });

    await this.portal.audit(sourceId, null, 'venue.certified', row.id, {
      experience: experienceSlug,
      room: roomId,
      by: actor,
    });
    return this.present(row);
  }

  /**
   * Let a venue run despite failing certification.
   *
   * Deliberately awkward: a reason is required, it expires, and it is
   * written to the audit ledger. The awkwardness is the point — an
   * override should be a decision someone owns, not a shortcut.
   */
  async override(
    sourceId: string,
    experienceSlug: string,
    roomId: string,
    params: { reason?: string; days?: number },
    actor: string,
  ) {
    const reason = params.reason?.trim();
    if (!reason || reason.length < 10) {
      throw new BadRequestException(
        'An override requires a reason of at least 10 characters. It is recorded.',
      );
    }
    const days = params.days ?? 7;
    if (!Number.isFinite(days) || days <= 0 || days > MAX_OVERRIDE_DAYS) {
      throw new BadRequestException(
        `Override must expire within ${MAX_OVERRIDE_DAYS} days; a permanent override is a disabled gate`,
      );
    }

    const { experience } = await this.load(sourceId, experienceSlug, roomId);
    const verdict = await this.evaluate(sourceId, experienceSlug, roomId);

    const row = await this.prisma.venueCertification.upsert({
      where: {
        sourceId_experienceId_roomId: {
          sourceId, experienceId: experience.id, roomId,
        },
      },
      create: {
        sourceId, experienceId: experience.id, roomId,
        status: 'override',
        // The verdict at override time is frozen too. "What were we
        // overriding?" must be answerable afterwards.
        checks: verdict as never,
        fingerprint: verdict.fingerprint as never,
        reason,
        expiresAt: new Date(Date.now() + days * 86400_000),
        certifiedBy: actor,
      },
      update: {
        status: 'override',
        checks: verdict as never,
        fingerprint: verdict.fingerprint as never,
        reason,
        expiresAt: new Date(Date.now() + days * 86400_000),
        certifiedAt: new Date(),
        certifiedBy: actor,
      },
    });

    this.logger.warn(
      `Certification OVERRIDDEN for ${sourceId}/${experienceSlug}: ${reason}`,
    );
    await this.portal.audit(sourceId, null, 'venue.certification_overridden', row.id, {
      experience: experienceSlug,
      room: roomId,
      reason,
      expires_at: row.expiresAt?.toISOString(),
      blocking: verdict.blocking,
      by: actor,
    });
    return this.present(row);
  }

  async revoke(
    sourceId: string,
    experienceSlug: string,
    roomId: string,
    reason: string | undefined,
    actor: string,
  ) {
    if (!reason?.trim()) {
      throw new BadRequestException('Revoking requires a reason');
    }
    const { experience } = await this.load(sourceId, experienceSlug, roomId);
    const existing = await this.prisma.venueCertification.findUnique({
      where: {
        sourceId_experienceId_roomId: {
          sourceId, experienceId: experience.id, roomId,
        },
      },
    });
    if (!existing) throw new NotFoundException('No certification to revoke');
    if (existing.status === 'revoked') {
      throw new ConflictException('Already revoked');
    }

    const row = await this.prisma.venueCertification.update({
      where: { id: existing.id },
      data: { status: 'revoked', reason: reason.trim(), expiresAt: null },
    });
    await this.portal.audit(sourceId, null, 'venue.certification_revoked', row.id, {
      experience: experienceSlug, reason, by: actor,
    });
    return this.present(row);
  }

  // ────────────────────────────────────────────────────────────
  // THE GATE
  // ────────────────────────────────────────────────────────────

  /**
   * May this venue start a run of this experience?
   *
   * Returns a reason on refusal rather than a bare false. A gate that
   * will not say why it closed is the kind operators route around.
   */
  async mayRun(sourceId: string, experienceId: string) {
    const rows = await this.prisma.venueCertification.findMany({
      where: { sourceId, experienceId },
      include: { room: { select: { slug: true, activeConfigId: true } } },
    });

    if (rows.length === 0) {
      return {
        ok: false,
        reason: 'no_certification',
        message:
          'This venue has no certified room for this experience. ' +
          'Certify a room, or request a platform override.',
      };
    }

    const now = Date.now();
    const source = await this.prisma.source.findUnique({
      where: { id: sourceId },
      select: { scopes: true },
    });
    const experience = await this.prisma.experience.findUnique({
      where: { id: experienceId },
      select: { version: true },
    });

    for (const row of rows) {
      if (row.status === 'revoked') continue;

      if (row.status === 'override') {
        if (row.expiresAt && row.expiresAt.getTime() > now) {
          return { ok: true, via: 'override', reason: row.reason ?? undefined };
        }
        continue; // expired override is no override
      }

      // Staleness is computed, never stored — a stored flag would need
      // something to remember to set it, and the thing that changes the
      // inputs (publishing a room config) should not have to know
      // certification exists.
      const current = this.fingerprint(
        source?.scopes ?? '',
        experience?.version ?? 0,
        row.room.activeConfigId,
      );
      const stored = (row.fingerprint ?? {}) as Record<string, unknown>;
      const stale =
        stored.hash !== current.hash;

      if (!stale) return { ok: true, via: 'certification', room: row.room.slug };
    }

    return {
      ok: false,
      reason: 'stale_or_revoked',
      message:
        'Certification is stale — the room, experience version or venue ' +
        'scopes have changed since it was granted. Recertify the room.',
    };
  }

  async statusFor(sourceId: string) {
    const rows = await this.prisma.venueCertification.findMany({
      where: { sourceId },
      include: {
        experience: { select: { slug: true, version: true } },
        room: { select: { slug: true, activeConfigId: true } },
      },
    });
    const source = await this.prisma.source.findUnique({
      where: { id: sourceId },
      select: { scopes: true },
    });

    return rows.map((row) => {
      const current = this.fingerprint(
        source?.scopes ?? '',
        row.experience.version,
        row.room.activeConfigId,
      );
      const stored = (row.fingerprint ?? {}) as Record<string, unknown>;
      const stale = row.status === 'certified' && stored.hash !== current.hash;
      return {
        ...this.present(row),
        experience: row.experience.slug,
        room: row.room.slug,
        // Reported as `stale` even though the row still says `certified`:
        // the row records what we decided, this reports what is true now.
        effective_status: stale ? 'stale' : row.status,
      };
    });
  }

  // ────────────────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────────────────

  private fingerprint(scopes: string, experienceVersion: number, roomConfigId: string | null) {
    const parts = {
      scopes: (scopes ?? '').split(/\s+/).filter(Boolean).sort().join(' '),
      experience_version: experienceVersion,
      room_config_id: roomConfigId,
    };
    return {
      ...parts,
      hash: createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16),
    };
  }

  private async load(sourceId: string, experienceSlug: string, roomId: string) {
    const source = await this.prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) throw new NotFoundException(`No venue '${sourceId}'`);

    const experience = await this.prisma.experience.findUnique({
      where: { slug: experienceSlug },
    });
    if (!experience) throw new NotFoundException(`No experience '${experienceSlug}'`);

    const room = await this.prisma.venueRoom.findUnique({
      where: { id: roomId },
      include: { activeConfig: true },
    });
    if (!room || room.sourceId !== sourceId) {
      throw new NotFoundException(`No room '${roomId}' at this venue`);
    }
    return { source, experience, room };
  }

  private present(row: any) {
    return {
      certification_id: row.id,
      status: row.status,
      reason: row.reason,
      expires_at: row.expiresAt?.toISOString() ?? null,
      certified_at: row.certifiedAt.toISOString(),
      certified_by: row.certifiedBy,
      fingerprint: row.fingerprint,
    };
  }
}
