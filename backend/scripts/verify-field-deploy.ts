// ============================================================
// Heroes Field Deploy — offline manifest verification
//
// The Nov 1 Field Deploy kit (§27) says the experience must run "entirely
// from a venue manifest + template", and §21 GATE 3 says "from template
// data, not hard-coded scene coordinates". This script is what makes that
// checkable before a single line of Unity exists: the Veil Breach —
// Portable manifest is a real file, validated by the SAME validator that
// gates a room publish in production.
//
// Two layers of checking, and the second is the point:
//
//   1. `validateManifest()` — the shipped platform contract. Shape only.
//   2. The kit's own rules — the seven required slots (§4/§10), and the
//      SAFETY requirements in §24 that no schema can express: nothing
//      required outside the boundary, no backward walking, the rift is
//      on a wall. The platform validator checks a polygon is a polygon;
//      it does not check that the relic is inside it. A manifest can be
//      perfectly valid and still walk a prospect into a wall.
//
// Needs no server, no database, no Unity. `npm run verify:field-deploy`.
//
// Usage:
//   npx ts-node scripts/verify-field-deploy.ts
// ============================================================

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  MANIFEST_SCHEMA_VERSION,
  RoomManifest,
  validateManifest,
} from '../src/spatial/manifest';

const MANIFEST_PATH = join(
  __dirname,
  '..',
  '..',
  'docs',
  'hep',
  'manifests',
  'veil-breach-portable.v1.json',
);

let failures = 0;

function check(name: string, passed: boolean, detail?: unknown) {
  if (passed) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`);
    if (detail !== undefined) console.error(`      ${JSON.stringify(detail)}`);
  }
}

const raw = readFileSync(MANIFEST_PATH, 'utf8');
const manifest = JSON.parse(raw) as RoomManifest;

console.log('\nVeil Breach — Portable :: field deploy manifest\n');

// ── 1. The shipped platform contract ─────────────────────────
console.log('Platform contract (src/spatial/manifest.ts)');
const issues = validateManifest(manifest);
check('validateManifest reports no issues', issues.length === 0, issues);
check(
  `manifestSchemaVersion is the server's (${MANIFEST_SCHEMA_VERSION})`,
  manifest.manifestSchemaVersion === MANIFEST_SCHEMA_VERSION,
  manifest.manifestSchemaVersion,
);

// ── 2. The kit's seven slots ─────────────────────────────────
//
// Kit §4 step 7 and §10 step 5 name the slots an operator places in the
// field. The names here are the join key between the manifest and every
// RoomConfig placement, so renaming one silently half-places a room —
// pin them.
console.log('\nRequired slots (kit §4.7)');
const REQUIRED_SLOTS = [
  'origin',
  'fate_fox_spawn',
  'rune_pedestal',
  'veil_rift',
  'relic',
  'hero_echo',
  'end_point',
];
const anchorsByName = new Map(manifest.requiredAnchors.map((a) => [a.name, a]));
for (const slot of REQUIRED_SLOTS) {
  check(`slot '${slot}' is declared`, anchorsByName.has(slot));
}
check(
  'no undeclared extra slots (the operator places exactly seven)',
  manifest.requiredAnchors.length === REQUIRED_SLOTS.length,
  manifest.requiredAnchors.map((a) => a.name),
);
check(
  "'origin' is a verification anchor, not content",
  anchorsByName.get('origin')?.type === 'verification',
);

// ── 3. Safety, which the schema cannot express (kit §24) ─────
console.log('\nSafety (kit §24)');

const boundary = manifest.requiredZones.find((z) => z.name === 'play_boundary');
check('a play_boundary safety zone exists', !!boundary && boundary.kind === 'safety');

/** Even-odd point-in-polygon on the room-local XZ plane. */
function insidePolygon(pt: [number, number], poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    const straddles = zi > pt[1] !== zj > pt[1];
    if (straddles && pt[0] < ((xj - xi) * (pt[1] - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shortest distance from a room-local XZ point to a polygon's edges. */
function distanceToPolygon(pt: [number, number], poly: [number, number][]) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j];
    const [bx, bz] = poly[i];
    const dx = bx - ax;
    const dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    const t =
      lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((pt[0] - ax) * dx + (pt[1] - az) * dz) / lenSq));
    const cx = ax + t * dx;
    const cz = az + t * dz;
    best = Math.min(best, Math.hypot(pt[0] - cx, pt[1] - cz));
  }
  return best;
}

if (boundary) {
  const poly = (boundary.geometry as { points: [number, number][] }).points;

  // §24: "No required interaction may spawn outside the boundary."
  //
  // The boundary is the floor the GUEST may walk on, so it cannot simply
  // contain every anchor: the rift is mounted on a wall, and the wall is
  // by definition the edge of the walkable area. Enforcing containment on
  // everything would force the rift into the middle of the room.
  //
  // So the rule splits by how the guest reaches the thing:
  //   - approached (floor level) — must be strictly inside; the guest
  //     walks to it, and walking outside the boundary is the hazard §24
  //     exists to prevent.
  //   - mounted (wall height)    — sealed at range, so it may sit on the
  //     boundary edge, but not floating in the car park beyond it.
  const MOUNTED_MIN_HEIGHT_M = 1.0;
  const MOUNTED_MAX_OVERHANG_M = 0.75;

  for (const a of manifest.requiredAnchors) {
    if (a.type === 'verification') continue; // the origin is a survey mark, not a destination
    const xz: [number, number] = [a.localPosition[0], a.localPosition[2]];
    const mounted = a.localPosition[1] >= MOUNTED_MIN_HEIGHT_M;

    if (mounted) {
      const overhang = insidePolygon(xz, poly) ? 0 : distanceToPolygon(xz, poly);
      check(
        `'${a.name}' is wall-mounted on the boundary, not beyond it`,
        overhang <= MOUNTED_MAX_OVERHANG_M,
        { position: a.localPosition, overhang_m: Number(overhang.toFixed(3)) },
      );
    } else {
      check(
        `'${a.name}' is walked to from inside the play boundary`,
        insidePolygon(xz, poly),
        a.localPosition,
      );
    }
  }
}

// §24: "Do not require backward walking." The player starts at the origin
// facing −Z (room_local_meters_y_up, see spatial-integration-guide §1), so
// every required interaction must be at or ahead of the start plane.
for (const a of manifest.requiredAnchors) {
  if (a.name === 'origin') continue;
  check(
    `'${a.name}' is ahead of the player start (no backward walking)`,
    a.localPosition[2] <= 0,
    a.localPosition[2],
  );
}

// The rift is wall-mounted (kit §12) — a rift at ankle height reads as a
// puddle and puts a prospect's face at floor level on a trade show carpet.
const rift = anchorsByName.get('veil_rift');
check(
  'veil_rift sits at wall height (>= 1.0 m)',
  !!rift && rift.localPosition[1] >= 1.0,
  rift?.localPosition,
);

// Convention check: −Z is forward, so a rift on the far wall faces back
// toward the player. A rift facing away is the classic handedness tell.
check(
  'veil_rift faces the player (yaw ~180°)',
  !!rift && Math.abs(Math.abs(rift.localRotation[1]) - 180) < 1e-6,
  rift?.localRotation,
);

// ── 4. Field-deploy shape ────────────────────────────────────
console.log('\nField deploy shape');
check(
  'single-player — the operator hands over one device (kit §4.11)',
  manifest.supportedPlayers.minimum === 1 && manifest.supportedPlayers.maximum === 1,
  manifest.supportedPlayers,
);
check(
  'clearance is a small-room figure (<= 3 m, kit §22 "small office")',
  manifest.minimumClearanceMeters > 0 && manifest.minimumClearanceMeters <= 3,
  manifest.minimumClearanceMeters,
);
check(
  'declares the mobile device profiles it runs on',
  Array.isArray(manifest.supportedDeviceProfiles) &&
    manifest.supportedDeviceProfiles.length > 0,
  manifest.supportedDeviceProfiles,
);

// Both interactive props need a reach zone, or the runtime invents a
// trigger radius and the operator cannot see why the rune never fires.
console.log('\nInteraction zones');
for (const zone of ['rune_reach', 'relic_reach']) {
  const z = manifest.requiredZones.find((q) => q.name === zone);
  check(`'${zone}' is an interaction zone`, z?.kind === 'interaction');
}

console.log(
  failures === 0
    ? '\nAll field deploy manifest checks passed.\n'
    : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
