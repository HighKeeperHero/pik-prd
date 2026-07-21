// ============================================================
// HEP Phase 2 Slice 2 — venue staff roles
//
// The whole permission matrix in one readable place. Scattering
// role checks across handlers is how a portal ends up with a
// manager who can quietly rotate the venue's API key.
//
// Roles are per-venue, not global: the same person may be an owner
// at one venue and a viewer at another, and the two never mix.
//
// NOTE ON THE BOUNDARY: these roles govern the Partner Portal only.
// They are unrelated to player identity — a VenueStaff is not a
// RootIdentity and holds no hero. Nothing here grants any access to
// Heroes' Codex, and nothing in Codex grants any access to these.
//
// Place at: src/portal/roles.ts
// ============================================================

export const ROLES = ['owner', 'manager', 'operator', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/** Every distinct thing a staff member can attempt in the portal. */
export type Permission =
  | 'analytics.read'
  | 'runs.operate'
  | 'experiences.manage'
  | 'assets.generate'
  | 'venue.edit'
  | 'staff.manage'
  | 'apikey.rotate';

/**
 * Explicit grants per role — no inheritance chain.
 *
 * A hierarchy ("manager inherits operator") reads well until someone
 * needs an exception, and then the exception is invisible. Listing each
 * role's grants means the matrix can be read straight off the page and
 * compared against the scope doc.
 */
const MATRIX: Record<Role, Permission[]> = {
  owner: [
    'analytics.read',
    'runs.operate',
    'experiences.manage',
    'assets.generate',
    'venue.edit',
    'staff.manage',
    'apikey.rotate',
  ],
  manager: [
    'analytics.read',
    'runs.operate',
    'experiences.manage',
    'assets.generate',
    'venue.edit',
  ],
  operator: ['analytics.read', 'runs.operate'],
  viewer: ['analytics.read'],
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function can(role: string, permission: Permission): boolean {
  if (!isRole(role)) return false;
  return MATRIX[role].includes(permission);
}

export function permissionsFor(role: string): Permission[] {
  return isRole(role) ? [...MATRIX[role]] : [];
}
