// ============================================================
// HEP — partner scope vocabulary
//
// A partner's effective permission is the INTERSECTION of two things:
//   • Source.scopes    — what this venue is licensed to do at all
//   • SourceLink.scope — what this player consented to for this venue
//
// Either side can narrow; neither can widen. Extracted from
// ingest.service.ts in Slice 1 so the ingest path and the partner run
// API cannot drift apart on how permission is computed.
//
// Place at: src/auth/scopes.ts
// ============================================================

/** Known scope values. Unknown strings are ignored, never inherited. */
export const SCOPES = {
  /** Grant Fate XP via progression events. */
  XP: 'xp',
  /** Grant titles. */
  TITLES: 'titles',
  /** Write narrative fate markers. */
  FATE_MARKERS: 'fate_markers',
  /** Start, complete, and fail experience runs (Slice 1). */
  RUNS: 'runs',
  /** Pay out rewards on run completion (Slice 1). */
  REWARDS: 'rewards',
  /** Issue claim tokens for unidentified guest seats (Slice 1). */
  GUESTS: 'guests',
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

export function splitScope(scope: string | null | undefined): string[] {
  return (scope ?? '').split(/\s+/).filter(Boolean);
}

/**
 * Effective scope for a partner write against one player.
 *
 * Pass only the source scopes (omitting linkScope) for venue-level actions
 * that are not tied to a specific player's consent — starting a run, reading
 * venue status. Player-affecting writes must always pass both.
 */
export function intersectScopes(
  sourceScopes: string,
  linkScope?: string | null,
): Set<string> {
  const partner = new Set(splitScope(sourceScopes));
  if (linkScope === undefined) return partner;

  return new Set(splitScope(linkScope).filter((s) => partner.has(s)));
}

export function describeScopes(granted: Set<string>): string {
  return [...granted].sort().join(' ') || '(none)';
}
