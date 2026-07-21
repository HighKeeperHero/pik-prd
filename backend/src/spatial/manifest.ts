// ============================================================
// HEP Phase 2 Slice 4 — the room manifest
//
// What an experience NEEDS from a room. The room configuration says how
// that fits into one specific venue; keeping the two apart is what lets
// an experience be re-deployed to a second venue without re-authoring.
//
// ── Why this file is strict ───────────────────────────────────
// Tier C is partnered out. This schema is the document an external team
// implements against, months before we integrate with them. Every
// ambiguity here becomes a support call and a renegotiation later, so
// validation rejects loudly rather than coercing — a manifest that is
// "probably fine" is the expensive kind of fine.
//
// Place at: src/spatial/manifest.ts
// ============================================================

/**
 * Current manifest schema version.
 *
 * Bump on any BREAKING change to the shape below. `Experience` stores
 * the version each manifest was authored against, so an old client and a
 * new server can both know they disagree instead of silently
 * misinterpreting fields.
 */
export const MANIFEST_SCHEMA_VERSION = 1;

/** Metres. Poses are [x, y, z]; rotations are euler degrees [x, y, z]. */
export type Vec3 = [number, number, number];

export type AnchorRole = 'content' | 'verification' | 'marker';
export const ANCHOR_ROLES: AnchorRole[] = ['content', 'verification', 'marker'];

export type ZoneKind = 'player_start' | 'interaction' | 'safety' | 'clearance';
export const ZONE_KINDS: ZoneKind[] = [
  'player_start',
  'interaction',
  'safety',
  'clearance',
];

export type ZoneShape = 'circle' | 'box' | 'polygon';

export interface ManifestAnchor {
  name: string;
  type: AnchorRole;
  /** Suggested pose in an idealised room. A calibration may override it. */
  localPosition: Vec3;
  localRotation: Vec3;
}

export interface ManifestZone {
  name: string;
  kind: ZoneKind;
  shape: ZoneShape;
  /** Keyed by shape: {radius} | {size:[x,y,z]} | {points:[[x,z],…]} */
  geometry: Record<string, unknown>;
}

export interface RoomManifest {
  experienceId: string;
  experienceVersion: string;
  manifestSchemaVersion: number;
  roomProfile: string;
  requiredAnchors: ManifestAnchor[];
  requiredZones: ManifestZone[];
  minimumClearanceMeters: number;
  supportedPlayers: { minimum: number; maximum: number };
  /** Device profile slugs this experience can run on. */
  supportedDeviceProfiles?: string[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Validate a manifest.
 *
 * Returns every problem rather than throwing on the first: an operator
 * fixing a manifest wants the whole list, not six round trips.
 */
export function validateManifest(input: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fail = (path: string, message: string) => issues.push({ path, message });

  if (!input || typeof input !== 'object') {
    return [{ path: '', message: 'Manifest must be an object' }];
  }
  const m = input as Record<string, any>;

  // ── Version ──────────────────────────────────────────────────
  if (typeof m.manifestSchemaVersion !== 'number') {
    fail('manifestSchemaVersion', 'Required (number)');
  } else if (m.manifestSchemaVersion > MANIFEST_SCHEMA_VERSION) {
    // Forward-incompatible, and we must say so rather than guess. A
    // partner shipping ahead of us is a coordination problem; silently
    // ignoring fields we do not understand is a spatial bug in a room.
    fail(
      'manifestSchemaVersion',
      `Manifest is version ${m.manifestSchemaVersion}; this server understands ${MANIFEST_SCHEMA_VERSION}`,
    );
  }

  for (const field of ['experienceId', 'experienceVersion', 'roomProfile']) {
    if (typeof m[field] !== 'string' || !m[field].trim()) {
      fail(field, 'Required (non-empty string)');
    }
  }

  if (typeof m.minimumClearanceMeters !== 'number' || m.minimumClearanceMeters < 0) {
    fail('minimumClearanceMeters', 'Required (non-negative number)');
  }

  // ── Players ──────────────────────────────────────────────────
  const players = m.supportedPlayers;
  if (!players || typeof players !== 'object') {
    fail('supportedPlayers', 'Required ({ minimum, maximum })');
  } else {
    const { minimum, maximum } = players;
    if (!Number.isInteger(minimum) || minimum < 1) {
      fail('supportedPlayers.minimum', 'Must be an integer >= 1');
    }
    if (!Number.isInteger(maximum) || maximum < 1) {
      fail('supportedPlayers.maximum', 'Must be an integer >= 1');
    }
    if (Number.isInteger(minimum) && Number.isInteger(maximum) && maximum < minimum) {
      fail('supportedPlayers', `maximum (${maximum}) is below minimum (${minimum})`);
    }
  }

  // ── Anchors ──────────────────────────────────────────────────
  if (!Array.isArray(m.requiredAnchors)) {
    fail('requiredAnchors', 'Required (array)');
  } else {
    if (m.requiredAnchors.length === 0) {
      // An experience needing no anchors is not spatial, and shipping it
      // through the spatial pipeline means a calibration nobody can fail
      // and a room nobody can validate.
      fail('requiredAnchors', 'A spatial experience must declare at least one anchor');
    }
    const seen = new Set<string>();
    m.requiredAnchors.forEach((a: any, i: number) => {
      const p = `requiredAnchors[${i}]`;
      if (!a || typeof a !== 'object') return fail(p, 'Must be an object');

      if (typeof a.name !== 'string' || !a.name.trim()) {
        fail(`${p}.name`, 'Required (non-empty string)');
      } else if (seen.has(a.name)) {
        // Placements join on name, so a duplicate makes the join
        // ambiguous and the room silently half-placed.
        fail(`${p}.name`, `Duplicate anchor name '${a.name}'`);
      } else {
        seen.add(a.name);
      }

      if (!ANCHOR_ROLES.includes(a.type)) {
        fail(`${p}.type`, `Must be one of: ${ANCHOR_ROLES.join(', ')}`);
      }
      checkVec3(`${p}.localPosition`, a.localPosition, fail);
      checkVec3(`${p}.localRotation`, a.localRotation, fail);
    });
  }

  // ── Zones ────────────────────────────────────────────────────
  if (!Array.isArray(m.requiredZones)) {
    fail('requiredZones', 'Required (array)');
  } else {
    const seen = new Set<string>();
    let hasStart = false;
    m.requiredZones.forEach((z: any, i: number) => {
      const p = `requiredZones[${i}]`;
      if (!z || typeof z !== 'object') return fail(p, 'Must be an object');

      if (typeof z.name !== 'string' || !z.name.trim()) {
        fail(`${p}.name`, 'Required (non-empty string)');
      } else if (seen.has(z.name)) {
        fail(`${p}.name`, `Duplicate zone name '${z.name}'`);
      } else {
        seen.add(z.name);
      }

      if (!ZONE_KINDS.includes(z.kind)) {
        fail(`${p}.kind`, `Must be one of: ${ZONE_KINDS.join(', ')}`);
      }
      if (z.kind === 'player_start') hasStart = true;

      validateZoneGeometry(p, z, fail);
    });

    // Where the player stands is not optional. Without it the runtime
    // has to invent a start position, which is how someone begins an
    // encounter inside a wall.
    if (!hasStart) {
      fail('requiredZones', "Must include a zone of kind 'player_start'");
    }
  }

  return issues;
}

function validateZoneGeometry(
  p: string,
  z: any,
  fail: (path: string, message: string) => void,
) {
  const g = z.geometry;
  if (!g || typeof g !== 'object') {
    return fail(`${p}.geometry`, 'Required (object)');
  }

  switch (z.shape) {
    case 'circle':
      if (typeof g.radius !== 'number' || g.radius <= 0) {
        fail(`${p}.geometry.radius`, 'circle requires a positive radius');
      }
      break;
    case 'box':
      checkVec3(`${p}.geometry.size`, g.size, fail);
      if (Array.isArray(g.size) && g.size.some((n: any) => typeof n === 'number' && n <= 0)) {
        fail(`${p}.geometry.size`, 'box dimensions must be positive');
      }
      break;
    case 'polygon':
      if (!Array.isArray(g.points) || g.points.length < 3) {
        fail(`${p}.geometry.points`, 'polygon requires at least 3 points');
      } else if (
        !g.points.every(
          (pt: any) => Array.isArray(pt) && pt.length === 2 && pt.every(Number.isFinite),
        )
      ) {
        fail(`${p}.geometry.points`, 'each point must be [x, z] numbers');
      }
      break;
    default:
      fail(`${p}.shape`, "Must be one of: circle, box, polygon");
  }
}

function checkVec3(
  path: string,
  v: unknown,
  fail: (path: string, message: string) => void,
) {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((n) => Number.isFinite(n))) {
    fail(path, 'Must be 3 finite numbers [x, y, z]');
  }
}

/** True when an experience declares spatial requirements at all. */
export function isSpatialManifest(manifest: unknown): boolean {
  return (
    !!manifest &&
    typeof manifest === 'object' &&
    Array.isArray((manifest as any).requiredAnchors) &&
    (manifest as any).requiredAnchors.length > 0
  );
}
