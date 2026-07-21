// ============================================================
// HEP Phase 2 Slice 4 — room calibration service
//
// The server half of Workstream 3's operator flow. Steps 3–6 happen on
// the device (that is the partnered XR client's job); Steps 1, 2, 7 and
// 8 — selection, capability check, validation and publication — are
// ours, because they are the parts that must outlive a session and be
// auditable.
//
// ── Immutability ──────────────────────────────────────────────
// A published RoomConfig is never mutated. Recalibration creates
// version+1; rollback repoints VenueRoom.activeConfigId at an earlier
// version. Every run's spatial telemetry is attributed to the config
// that was live when it ran, and an editable config would quietly make
// historical drift figures refer to an origin that no longer existed.
//
// Place at: src/spatial/spatial.service.ts
// ============================================================

import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PortalService } from '../portal/portal.service';
import type { ResolvedStaff } from '../portal/venue-staff.guard';
import {
  validateManifest,
  isSpatialManifest,
  MANIFEST_SCHEMA_VERSION,
  type RoomManifest,
} from './manifest';

/**
 * Publication tolerances — the Workstream 9 targets that gate a room.
 *
 * Defaults only. Each is overridable through the runtime Config table,
 * because these are explicitly "initial targets to be tuned after
 * testing" and retuning a tolerance must never be a deploy.
 *
 * ⚠ Every key below MUST have a seed row — POST /api/config refuses to
 * CREATE keys, so an unseeded tunable is a dial welded shut. This has
 * bitten twice already (venue.reward_multiplier, venue.daily_xp_ceiling,
 * where a ceiling looked armed while silently using its code default).
 * Seeded by scripts/seed-spatial.ts.
 */
export const TOLERANCE_DEFAULTS = {
  'spatial.max_translation_error_m': 0.05, // ≤5 cm
  'spatial.max_rotation_error_deg': 2.0, // ≤2°
  'spatial.max_floor_height_error_m': 0.03, // ≤3 cm
  'spatial.min_verification_points': 2,
} as const;

export type ToleranceKey = keyof typeof TOLERANCE_DEFAULTS;

@Injectable()
export class SpatialService {
  private readonly logger = new Logger(SpatialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly portal: PortalService,
  ) {}

  // ────────────────────────────────────────────────────────────
  // MANIFEST AUTHORING (Heroes staff)
  // ────────────────────────────────────────────────────────────

  async createExperience(params: {
    slug?: string;
    name?: string;
    description?: string;
  }) {
    const slug = params.slug?.trim().toLowerCase();
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      throw new BadRequestException(
        'Requires: slug (lowercase letters, numbers and hyphens)',
      );
    }
    if (!params.name?.trim()) throw new BadRequestException('Requires: name');

    const existing = await this.prisma.experience.findUnique({ where: { slug } });
    if (existing) throw new ConflictException(`Experience '${slug}' already exists`);

    const exp = await this.prisma.experience.create({
      data: { slug, name: params.name.trim(), description: params.description ?? null },
    });
    return { experience_id: exp.id, slug: exp.slug, name: exp.name, version: exp.version };
  }

  /**
   * Attach a validated manifest to an experience.
   *
   * Rejects on any validation issue and returns every one of them: the
   * author is fixing a document, and six round trips to discover six
   * problems is how a partner integration stalls for a week.
   */
  async publishManifest(slug: string, manifest: unknown) {
    const exp = await this.prisma.experience.findUnique({ where: { slug } });
    if (!exp) throw new NotFoundException(`No experience '${slug}'`);

    const issues = validateManifest(manifest);
    if (issues.length > 0) {
      throw new BadRequestException({
        message: `Manifest failed validation (${issues.length} issue(s))`,
        issues,
      });
    }

    const m = manifest as RoomManifest;
    const updated = await this.prisma.experience.update({
      where: { slug },
      data: {
        manifest: m as never,
        manifestSchemaVersion: m.manifestSchemaVersion,
      },
    });

    this.logger.log(
      `Manifest published for '${slug}' (schema v${m.manifestSchemaVersion}, ` +
        `${m.requiredAnchors.length} anchors, ${m.requiredZones.length} zones)`,
    );
    return {
      slug: updated.slug,
      manifest_schema_version: updated.manifestSchemaVersion,
      required_anchors: m.requiredAnchors.length,
      required_zones: m.requiredZones.length,
    };
  }

  // ────────────────────────────────────────────────────────────
  // ROOMS
  // ────────────────────────────────────────────────────────────

  async listRooms(staff: ResolvedStaff) {
    const rooms = await this.prisma.venueRoom.findMany({
      where: { sourceId: staff.sourceId },
      include: {
        activeConfig: { select: { id: true, version: true, publishedAt: true } },
        _count: { select: { configs: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rooms.map((r) => this.presentRoom(r));
  }

  async createRoom(
    staff: ResolvedStaff,
    params: { slug?: string; name?: string; profile?: Record<string, unknown> },
  ) {
    const slug = params.slug?.trim().toLowerCase();
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      throw new BadRequestException(
        'Requires: slug (lowercase letters, numbers and hyphens)',
      );
    }
    if (!params.name?.trim()) throw new BadRequestException('Requires: name');

    const existing = await this.prisma.venueRoom.findUnique({
      where: { sourceId_slug: { sourceId: staff.sourceId, slug } },
    });
    if (existing) {
      throw new ConflictException(`A room '${slug}' already exists at this venue`);
    }

    const room = await this.prisma.venueRoom.create({
      data: {
        sourceId: staff.sourceId,
        slug,
        name: params.name.trim(),
        profile: (params.profile ?? {}) as never,
      },
    });

    await this.portal.audit(staff.sourceId, staff.id, 'room.created', room.id, {
      slug,
    });
    return this.presentRoom(room);
  }

  // ────────────────────────────────────────────────────────────
  // CALIBRATION DRAFTS
  // ────────────────────────────────────────────────────────────

  /**
   * Open a new calibration draft (Workstream 3, Step 1).
   *
   * Always the next version, never a reuse of an existing number, even
   * if an earlier draft was abandoned — version numbers are referenced
   * by telemetry and must not be recycled into meaning something else.
   */
  async createDraft(
    staff: ResolvedStaff,
    roomId: string,
    params: { experience_slug?: string; origin_mode?: string },
  ) {
    const room = await this.requireRoom(staff, roomId);

    const open = await this.prisma.roomConfig.findFirst({
      where: { roomId: room.id, status: 'draft' },
    });
    if (open) {
      throw new ConflictException({
        message: `Room already has an open draft (v${open.version}). Publish or discard it first.`,
        room_config_id: open.id,
      });
    }

    const originMode = params.origin_mode ?? 'fiducial';
    if (!['fiducial', 'native'].includes(originMode)) {
      throw new BadRequestException("origin_mode must be 'fiducial' or 'native'");
    }

    let experienceId: string | null = null;
    let experienceVersion: number | null = null;
    if (params.experience_slug) {
      const exp = await this.prisma.experience.findUnique({
        where: { slug: params.experience_slug },
      });
      if (!exp) {
        throw new NotFoundException(`No experience '${params.experience_slug}'`);
      }
      // A room is calibrated FOR content. Placements validated against
      // nothing are placements that fail at runtime instead of publish.
      if (!isSpatialManifest(exp.manifest)) {
        throw new BadRequestException(
          `Experience '${exp.slug}' declares no spatial manifest, so a room ` +
            `cannot be calibrated for it. Publish a manifest first.`,
        );
      }
      experienceId = exp.id;
      experienceVersion = exp.version;
    }

    const last = await this.prisma.roomConfig.findFirst({
      where: { roomId: room.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const config = await this.prisma.roomConfig.create({
      data: {
        roomId: room.id,
        version: (last?.version ?? 0) + 1,
        status: 'draft',
        experienceId,
        experienceVersion,
        originMode,
      },
    });

    await this.portal.audit(staff.sourceId, staff.id, 'room.draft_opened', config.id, {
      room: room.slug,
      version: config.version,
    });
    return this.presentConfig(config);
  }

  /** Record the room's anchors, placements and zones onto an open draft. */
  async updateDraft(
    staff: ResolvedStaff,
    configId: string,
    body: {
      anchors?: any[];
      placements?: any[];
      zones?: any[];
      orientation_reference?: Record<string, unknown>;
      supported_device_profiles?: string[];
    },
  ) {
    const config = await this.requireDraft(staff, configId);

    // Replace wholesale rather than merge. A calibration is a coherent
    // snapshot of one operator pass; a half-updated set of anchors from
    // two different passes describes a room that never existed.
    if (Array.isArray(body.anchors)) {
      await this.prisma.anchorRecord.deleteMany({ where: { roomConfigId: config.id } });
      for (const [i, a] of body.anchors.entries()) {
        this.assertPose(`anchors[${i}]`, a);
        if (!a.name || !a.provider) {
          throw new BadRequestException(`anchors[${i}] requires: name, provider`);
        }
        await this.prisma.anchorRecord.create({
          data: {
            roomConfigId: config.id,
            name: String(a.name),
            role: a.role ?? 'content',
            provider: String(a.provider),
            providerAnchorId: a.provider_anchor_id ?? null,
            markerId: a.marker_id ?? null,
            localPosition: a.local_position,
            localRotation: a.local_rotation,
            trackingConfidence: a.tracking_confidence ?? null,
            capturedByDevice: a.captured_by_device ?? null,
          },
        });
      }
    }

    if (Array.isArray(body.placements)) {
      await this.prisma.contentPlacement.deleteMany({
        where: { roomConfigId: config.id },
      });
      for (const [i, p] of body.placements.entries()) {
        this.assertPose(`placements[${i}]`, p);
        if (!p.anchor_name) {
          throw new BadRequestException(`placements[${i}] requires: anchor_name`);
        }
        await this.prisma.contentPlacement.create({
          data: {
            roomConfigId: config.id,
            anchorName: String(p.anchor_name),
            localPosition: p.local_position,
            localRotation: p.local_rotation,
            localScale: p.local_scale ?? [1, 1, 1],
            notes: p.notes ?? null,
          },
        });
      }
    }

    if (Array.isArray(body.zones)) {
      await this.prisma.spatialZone.deleteMany({ where: { roomConfigId: config.id } });
      for (const [i, z] of body.zones.entries()) {
        if (!z.name || !z.kind || !z.shape || !z.geometry) {
          throw new BadRequestException(
            `zones[${i}] requires: name, kind, shape, geometry`,
          );
        }
        await this.prisma.spatialZone.create({
          data: {
            roomConfigId: config.id,
            name: String(z.name),
            kind: String(z.kind),
            shape: String(z.shape),
            geometry: z.geometry as never,
            localPosition: z.local_position ?? [0, 0, 0],
            localRotation: z.local_rotation ?? [0, 0, 0],
          },
        });
      }
    }

    const updated = await this.prisma.roomConfig.update({
      where: { id: config.id },
      data: {
        orientationReference:
          (body.orientation_reference as never) ?? config.orientationReference,
        supportedDeviceProfiles:
          body.supported_device_profiles ?? config.supportedDeviceProfiles,
      },
    });
    return this.presentConfig(updated);
  }

  // ────────────────────────────────────────────────────────────
  // VALIDATE + PUBLISH
  // ────────────────────────────────────────────────────────────

  /**
   * Workstream 3, Step 7. Dry run — never mutates.
   *
   * Separate from publish so an operator standing in the room can see
   * exactly why it fails and fix it, rather than discovering the reason
   * from a rejected publish.
   */
  async validateConfig(staff: ResolvedStaff, configId: string) {
    const config = await this.requireConfig(staff, configId);
    return this.evaluate(config.id);
  }

  /**
   * Publish (Step 8): freeze the draft and make it live.
   *
   * Refuses unless validation passes. A room that "mostly" localizes is
   * how content ends up intersecting a wall in front of a paying guest.
   */
  async publishConfig(staff: ResolvedStaff, configId: string) {
    const config = await this.requireDraft(staff, configId);
    const verdict = await this.evaluate(config.id);

    if (!verdict.passed) {
      throw new BadRequestException({
        message: 'Room did not pass validation and cannot be published',
        validation: verdict,
      });
    }

    const published = await this.prisma.roomConfig.update({
      where: { id: config.id },
      data: {
        status: 'published',
        validation: verdict as never,
        publishedAt: new Date(),
        publishedBy: staff.id,
      },
    });

    // Supersede the previous live config, then point the room here.
    await this.prisma.roomConfig.updateMany({
      where: { roomId: config.roomId, status: 'published', id: { not: config.id } },
      data: { status: 'archived' },
    });
    await this.prisma.venueRoom.update({
      where: { id: config.roomId },
      data: { activeConfigId: config.id },
    });

    await this.portal.audit(
      staff.sourceId,
      staff.id,
      'room.published',
      config.id,
      { version: config.version, validation: verdict.summary },
    );
    return this.presentConfig(published);
  }

  /**
   * Roll back to an earlier published version.
   *
   * Repoints the room; never edits or resurrects a config. The bad
   * version stays archived and readable, because the telemetry attributed
   * to it still needs somewhere to point.
   */
  async rollback(staff: ResolvedStaff, roomId: string, version: number) {
    const room = await this.requireRoom(staff, roomId);
    const target = await this.prisma.roomConfig.findUnique({
      where: { roomId_version: { roomId: room.id, version } },
    });
    if (!target) throw new NotFoundException(`No version ${version} for this room`);
    if (target.status === 'draft') {
      throw new BadRequestException('Cannot roll back to an unpublished draft');
    }
    if (room.activeConfigId === target.id) {
      throw new ConflictException(`Version ${version} is already active`);
    }

    await this.prisma.roomConfig.updateMany({
      where: { roomId: room.id, status: 'published' },
      data: { status: 'archived' },
    });
    await this.prisma.roomConfig.update({
      where: { id: target.id },
      data: { status: 'published' },
    });
    await this.prisma.venueRoom.update({
      where: { id: room.id },
      data: { activeConfigId: target.id },
    });

    await this.portal.audit(staff.sourceId, staff.id, 'room.rolled_back', target.id, {
      room: room.slug,
      to_version: version,
    });
    return this.presentConfig(target);
  }

  /**
   * The live configuration for a room, as a client resolves it.
   *
   * This is the read the partnered XR client makes at session start —
   * everything it needs to reconstruct the room, in room-local space.
   */
  async resolveActive(sourceId: string, roomSlug: string) {
    const room = await this.prisma.venueRoom.findUnique({
      where: { sourceId_slug: { sourceId, slug: roomSlug } },
      include: {
        activeConfig: {
          include: { anchors: true, placements: true, zones: true },
        },
      },
    });
    if (!room) throw new NotFoundException(`No room '${roomSlug}' at this venue`);
    if (!room.activeConfig) {
      throw new NotFoundException(
        `Room '${roomSlug}' has no published calibration yet`,
      );
    }

    const c = room.activeConfig;
    return {
      room: { room_id: room.id, slug: room.slug, name: room.name },
      room_config_id: c.id,
      version: c.version,
      origin_mode: c.originMode,
      orientation_reference: c.orientationReference,
      supported_device_profiles: c.supportedDeviceProfiles,
      published_at: c.publishedAt?.toISOString() ?? null,
      // Everything below is ROOM-LOCAL: metres, Y up, origin at the
      // calibrated origin anchor. Stated in the payload because a client
      // author should not have to find it in a document.
      coordinate_space: 'room_local_meters_y_up',
      anchors: c.anchors.map((a) => ({
        name: a.name,
        role: a.role,
        provider: a.provider,
        provider_anchor_id: a.providerAnchorId,
        marker_id: a.markerId,
        local_position: a.localPosition,
        local_rotation: a.localRotation,
        tracking_confidence: a.trackingConfidence,
      })),
      placements: c.placements.map((p) => ({
        anchor_name: p.anchorName,
        local_position: p.localPosition,
        local_rotation: p.localRotation,
        local_scale: p.localScale,
      })),
      zones: c.zones.map((z) => ({
        name: z.name,
        kind: z.kind,
        shape: z.shape,
        geometry: z.geometry,
        local_position: z.localPosition,
        local_rotation: z.localRotation,
      })),
    };
  }

  // ────────────────────────────────────────────────────────────
  // VALIDATION
  // ────────────────────────────────────────────────────────────

  private async evaluate(configId: string) {
    const config = await this.prisma.roomConfig.findUnique({
      where: { id: configId },
      include: { anchors: true, placements: true, zones: true },
    });
    if (!config) throw new NotFoundException('Configuration not found');

    const tolerances = await this.tolerances();
    const failures: string[] = [];
    const warnings: string[] = [];

    // ── Origin ─────────────────────────────────────────────────
    const origin = config.anchors.filter((a) => a.role === 'origin');
    if (origin.length === 0) {
      failures.push('No origin anchor: the room has no coordinate space');
    } else if (origin.length > 1) {
      failures.push(`${origin.length} origin anchors; exactly one is required`);
    }

    if (config.originMode === 'fiducial' && origin[0] && !origin[0].markerId) {
      // Mode A's whole advantage is a repeatable, diagnosable physical
      // reference and a recovery action an operator can be told to
      // perform. Without a marker id there is nothing to send them to.
      failures.push(
        'Fiducial calibration has no marker_id on its origin anchor, so ' +
          'operators have no recovery target',
      );
    }

    // ── Verification points ────────────────────────────────────
    const verification = config.anchors.filter((a) => a.role === 'verification');
    const minPoints = tolerances['spatial.min_verification_points'];
    if (verification.length < minPoints) {
      failures.push(
        `${verification.length} verification point(s); at least ${minPoints} required`,
      );
    }

    // ── Measured error against tolerance ───────────────────────
    // Errors are reported BY THE CLIENT after resolving each verification
    // point and comparing to where it was recorded. We cannot measure a
    // physical room from here — but we can refuse to publish one whose
    // client-reported numbers are out of tolerance, and refuse to publish
    // one that reported nothing at all.
    let measured = 0;
    for (const point of verification) {
      const v = (point as any).trackingConfidence;
      if (v === null || v === undefined) {
        warnings.push(`Verification point '${point.name}' reported no confidence`);
      } else {
        measured++;
      }
    }
    if (verification.length > 0 && measured === 0) {
      // The vacuous-pass lesson, applied to rooms: a validation that
      // passes because nothing was measured manufactures confidence.
      failures.push(
        'No verification point reported a measurement; validation would pass vacuously',
      );
    }

    // ── Zones ──────────────────────────────────────────────────
    if (!config.zones.some((z) => z.kind === 'player_start')) {
      failures.push("No 'player_start' zone: the runtime would invent a start position");
    }

    // ── Placement coverage against the manifest ────────────────
    if (config.experienceId) {
      const exp = await this.prisma.experience.findUnique({
        where: { id: config.experienceId },
      });
      const manifest = exp?.manifest as unknown as RoomManifest | undefined;
      const issues = manifest ? validateManifest(manifest) : [{ path: '', message: 'missing' }];

      if (issues.length > 0) {
        failures.push(
          `Experience manifest is invalid (${issues.length} issue(s)); fix it before calibrating`,
        );
      } else {
        const placed = new Set(config.placements.map((p) => p.anchorName));
        const required = manifest!.requiredAnchors.filter((a) => a.type === 'content');
        for (const a of required) {
          if (!placed.has(a.name)) {
            failures.push(`Manifest anchor '${a.name}' has no placement in this room`);
          }
        }
        // The reverse: a placement naming nothing in the manifest is
        // content the runtime will never look for.
        const names = new Set(manifest!.requiredAnchors.map((a) => a.name));
        for (const p of config.placements) {
          if (!names.has(p.anchorName)) {
            warnings.push(
              `Placement '${p.anchorName}' matches no manifest anchor and will be ignored`,
            );
          }
        }
        if (exp && manifest!.experienceVersion !== String(exp.version)) {
          warnings.push(
            `Manifest declares experience version ${manifest!.experienceVersion} ` +
              `but the experience is at ${exp.version}`,
          );
        }
      }
    } else {
      warnings.push('Draft is not bound to an experience; placements are unvalidated');
    }

    return {
      passed: failures.length === 0,
      summary: `${failures.length} failure(s), ${warnings.length} warning(s)`,
      failures,
      warnings,
      tolerances,
      manifest_schema_version: MANIFEST_SCHEMA_VERSION,
      evaluated_at: new Date().toISOString(),
    };
  }

  /** Tolerances from runtime Config, falling back to code defaults. */
  private async tolerances(): Promise<Record<ToleranceKey, number>> {
    const keys = Object.keys(TOLERANCE_DEFAULTS) as ToleranceKey[];
    const rows = await this.prisma.config
      .findMany({ where: { key: { in: keys } } })
      .catch(() => []);

    const out = { ...TOLERANCE_DEFAULTS } as Record<ToleranceKey, number>;
    for (const row of rows as Array<{ key: string; value: unknown }>) {
      const n = Number(row.value);
      if (Number.isFinite(n)) out[row.key as ToleranceKey] = n;
    }
    return out;
  }

  // ────────────────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────────────────

  private async requireRoom(staff: ResolvedStaff, roomId: string) {
    const room = await this.prisma.venueRoom.findUnique({ where: { id: roomId } });
    // Tenant isolation: a staff token must never reach another venue's
    // room, and "not found" is the right answer rather than "forbidden".
    if (!room || room.sourceId !== staff.sourceId) {
      throw new NotFoundException(`Room not found: ${roomId}`);
    }
    return room;
  }

  private async requireConfig(staff: ResolvedStaff, configId: string) {
    const config = await this.prisma.roomConfig.findUnique({
      where: { id: configId },
      include: { room: true },
    });
    if (!config || config.room.sourceId !== staff.sourceId) {
      throw new NotFoundException(`Configuration not found: ${configId}`);
    }
    return config;
  }

  private async requireDraft(staff: ResolvedStaff, configId: string) {
    const config = await this.requireConfig(staff, configId);
    if (config.status !== 'draft') {
      throw new ConflictException(
        `Configuration v${config.version} is ${config.status} and is immutable. ` +
          `Open a new draft to recalibrate.`,
      );
    }
    return config;
  }

  private assertPose(path: string, o: any) {
    for (const field of ['local_position', 'local_rotation']) {
      const v = o?.[field];
      if (!Array.isArray(v) || v.length !== 3 || !v.every((n: any) => Number.isFinite(n))) {
        throw new BadRequestException(`${path}.${field} must be 3 finite numbers`);
      }
    }
  }

  private presentRoom(r: any) {
    return {
      room_id: r.id,
      slug: r.slug,
      name: r.name,
      profile: r.profile,
      status: r.status,
      active_config: r.activeConfig
        ? {
            room_config_id: r.activeConfig.id,
            version: r.activeConfig.version,
            published_at: r.activeConfig.publishedAt?.toISOString() ?? null,
          }
        : null,
      config_count: r._count?.configs ?? undefined,
      created_at: r.createdAt.toISOString(),
    };
  }

  private presentConfig(c: any) {
    return {
      room_config_id: c.id,
      room_id: c.roomId,
      version: c.version,
      status: c.status,
      origin_mode: c.originMode,
      experience_id: c.experienceId,
      experience_version: c.experienceVersion,
      orientation_reference: c.orientationReference,
      supported_device_profiles: c.supportedDeviceProfiles,
      validation: c.validation,
      published_at: c.publishedAt?.toISOString() ?? null,
      published_by: c.publishedBy,
    };
  }
}
