// ============================================================
// HEP Phase 2 Slice 4 — room calibration API
//
// Routes: /api/portal/v1/rooms/*   (venue staff, the operator app)
//         /api/partner/v1/rooms/*  (API key, the XR client at runtime)
//
// Two surfaces because there are two consumers with different auth and
// different needs: a human calibrating with a headset, and a client
// resolving a published room at session start. The partner surface is
// read-only by construction — a runtime that could republish a room
// could invalidate a calibration mid-session.
//
// Place at: src/spatial/spatial.controller.ts
// ============================================================

import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiKeyGuard, type ResolvedSource } from '../auth/guards/api-key.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import {
  VenueStaffGuard,
  RequirePermission,
  type ResolvedStaff,
} from '../portal/venue-staff.guard';
import { SpatialService } from './spatial.service';
import { TelemetryService } from './telemetry.service';
import { MANIFEST_SCHEMA_VERSION, validateManifest } from './manifest';

type StaffRequest = Request & { staff: ResolvedStaff };
type PartnerRequest = Request & { source: ResolvedSource };

@Controller('api/portal/v1/rooms')
export class SpatialPortalController {
  constructor(private readonly spatial: SpatialService) {}

  @Get()
  @UseGuards(VenueStaffGuard)
  @RequirePermission('analytics.read')
  list(@Req() req: StaffRequest) {
    return this.spatial.listRooms(req.staff);
  }

  @Post()
  @UseGuards(VenueStaffGuard)
  @RequirePermission('rooms.calibrate')
  create(
    @Req() req: StaffRequest,
    @Body() body: { slug?: string; name?: string; profile?: Record<string, unknown> },
  ) {
    return this.spatial.createRoom(req.staff, body);
  }

  // ── Calibration ───────────────────────────────────────────────

  @Post(':roomId/drafts')
  @UseGuards(VenueStaffGuard)
  @RequirePermission('rooms.calibrate')
  openDraft(
    @Req() req: StaffRequest,
    @Param('roomId') roomId: string,
    @Body() body: { experience_slug?: string; origin_mode?: string },
  ) {
    return this.spatial.createDraft(req.staff, roomId, body);
  }

  @Patch('drafts/:configId')
  @UseGuards(VenueStaffGuard)
  @RequirePermission('rooms.calibrate')
  updateDraft(
    @Req() req: StaffRequest,
    @Param('configId') configId: string,
    @Body() body: Record<string, any>,
  ) {
    return this.spatial.updateDraft(req.staff, configId, body);
  }

  /** Dry run. An operator standing in the room needs the reasons. */
  @Get('configs/:configId/validation')
  @UseGuards(VenueStaffGuard)
  @RequirePermission('rooms.calibrate')
  validate(@Req() req: StaffRequest, @Param('configId') configId: string) {
    return this.spatial.validateConfig(req.staff, configId);
  }

  /** Sign-off: makes the room live for guests. Manager and above. */
  @Post('configs/:configId/publish')
  @UseGuards(VenueStaffGuard)
  @RequirePermission('rooms.publish')
  @HttpCode(200)
  publish(@Req() req: StaffRequest, @Param('configId') configId: string) {
    return this.spatial.publishConfig(req.staff, configId);
  }

  @Post(':roomId/rollback')
  @UseGuards(VenueStaffGuard)
  @RequirePermission('rooms.publish')
  @HttpCode(200)
  rollback(
    @Req() req: StaffRequest,
    @Param('roomId') roomId: string,
    @Body() body: { version?: number },
  ) {
    return this.spatial.rollback(req.staff, roomId, Number(body?.version));
  }
}

/**
 * The runtime surface.
 *
 * What the partnered XR client calls at session start to reconstruct a
 * room. Read-only, API-key authed, scoped to the calling venue.
 */
@Controller('api/partner/v1/rooms')
@UseGuards(ApiKeyGuard)
export class SpatialPartnerController {
  constructor(private readonly spatial: SpatialService) {}

  @Get(':roomSlug')
  resolve(@Req() req: PartnerRequest, @Param('roomSlug') roomSlug: string) {
    return this.spatial.resolveActive(req.source.id, roomSlug);
  }
}

/**
 * Telemetry ingestion.
 *
 * Separate controller because it is a WRITE from the runtime, and the
 * room surface above is deliberately read-only. Keeping them apart makes
 * it obvious which one a future change is widening.
 */
@Controller('api/partner/v1/telemetry')
@UseGuards(ApiKeyGuard)
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Post()
  @HttpCode(202)
  record(
    @Req() req: PartnerRequest,
    @Body() body: { run_id?: string; room_config_id?: string; metrics?: any[] },
  ) {
    return this.telemetry.record(req.source.id, body);
  }
}

/**
 * The venue's view of its own spatial quality.
 *
 * Its own controller rather than a route on the rooms one: these numbers
 * are per-VENUE, not per-room, and hanging them off /rooms would have
 * meant a relative path that Nest does not support and that fails
 * silently as a 404.
 */
@Controller('api/portal/v1/spatial')
export class SpatialMetricsController {
  constructor(private readonly telemetry: TelemetryService) {}

  /** The Workstream 9 table, evaluated against real samples. */
  @Get('metrics')
  @UseGuards(VenueStaffGuard)
  @RequirePermission('analytics.read')
  metrics(@Req() req: StaffRequest, @Query('days') days?: string) {
    return this.telemetry.summary(req.staff.sourceId, days ? parseInt(days, 10) : 30);
  }
}

/**
 * Manifest authoring — Heroes staff only.
 *
 * Canonical Experiences is a Phase 2 principle: partners *configure*
 * experiences, they never author them. So a manifest is published with
 * the platform admin key, not a venue's staff token — a venue declaring
 * its own spatial requirements would be authoring content by the back
 * door.
 */
@Controller('api/experiences')
@UseGuards(PlatformAdminGuard)
export class SpatialAdminController {
  constructor(private readonly spatial: SpatialService) {}

  @Post()
  createExperience(
    @Body() body: { slug?: string; name?: string; description?: string },
  ) {
    return this.spatial.createExperience(body);
  }

  /**
   * Attach a manifest, validated at publish.
   *
   * Validating here rather than at runtime is the entire point: a
   * malformed manifest discovered by an XR client is discovered in a
   * room, in front of a guest, by the party least able to fix it.
   */
  @Put(':slug/manifest')
  @HttpCode(200)
  putManifest(@Param('slug') slug: string, @Body() body: unknown) {
    return this.spatial.publishManifest(slug, body);
  }
}

/**
 * Manifest schema self-description.
 *
 * Unauthenticated and deliberately so: this is documentation a partner's
 * engineer reads while writing a client, it contains nothing venue
 * specific, and making them authenticate to learn the shape of the
 * contract is friction with no security value.
 */
@Controller('api/spatial')
export class SpatialSchemaController {
  @Get('manifest-schema')
  schema() {
    return {
      manifest_schema_version: MANIFEST_SCHEMA_VERSION,
      coordinate_space: 'room_local_meters_y_up',
      notes: [
        'All poses are room-local: metres, Y up, origin at the calibrated origin anchor.',
        'Rotations are euler degrees [x, y, z].',
        'requiredAnchors[].name is the join key to a room configuration placement.',
      ],
      anchor_roles: ['content', 'verification', 'marker'],
      zone_kinds: ['player_start', 'interaction', 'safety', 'clearance'],
      zone_shapes: {
        circle: '{ radius: number }',
        box: '{ size: [x, y, z] }',
        polygon: '{ points: [[x, z], …] }  // >= 3',
      },
      required_fields: [
        'experienceId',
        'experienceVersion',
        'manifestSchemaVersion',
        'roomProfile',
        'requiredAnchors',
        'requiredZones',
        'minimumClearanceMeters',
        'supportedPlayers',
      ],
    };
  }

  /**
   * Check a manifest without needing an experience to attach it to.
   *
   * Exists so the partner can validate in CI from day one, before they
   * have a venue, an API key, or anything of ours deployed alongside
   * them. A contract you cannot test against is a contract you discover
   * you have broken at integration.
   */
  @Post('manifest-schema/validate')
  @HttpCode(200)
  validate(@Body() body: unknown) {
    const issues = validateManifest(body);
    return { valid: issues.length === 0, issue_count: issues.length, issues };
  }
}
