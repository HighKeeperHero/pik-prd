// ============================================================
// Veil Fauna catalog (2026-07-10) — what escaped the rifts.
// Six alpha species, tear-tier themed. The catalog is code (same
// pattern as the fox catalog): new species ship by deploy, the
// client renders from this via the API. Mastery tiers are the
// bestiary's identity ladder: Sighted 1 · Studied 5 · Mastered 15.
// ============================================================

export interface FaunaSpecies {
  id:      string;
  name:    string;
  tier:    1 | 2 | 3 | 4;   // matches tear tiers T1-T4
  reads:   number;           // correct gesture reads to banish
  xp:      number;
  habitat: string;
  lore:    string;
}

export const FAUNA_SPECIES: FaunaSpecies[] = [
  {
    id: 'veilmoth', name: 'Veilmoth', tier: 1, reads: 2, xp: 15,
    habitat: 'Drifts near fresh minor tears at dusk.',
    lore: 'It eats the light that leaks through. Harmless, mostly — but nothing that comes through is only what it seems.',
  },
  {
    id: 'emberkit', name: 'Emberkit', tier: 1, reads: 2, xp: 15,
    habitat: 'Warm stone near recently sealed seams.',
    lore: 'Small, quick, and burning with borrowed fire. It does not know it is a wound. Few things do.',
  },
  {
    id: 'shardhound', name: 'Shardhound', tier: 2, reads: 3, xp: 25,
    habitat: 'Circles wander tears in widening loops.',
    lore: 'It carries splinters of the Veil in its hide and grief in its gait. Banishing it is a mercy twice over.',
  },
  {
    id: 'mistfeather', name: 'Mistfeather', tier: 2, reads: 3, xp: 25,
    habitat: 'Roosts above tear sites; scatters when watched.',
    lore: 'A bird the fog dreamed of. Its call sounds like a door you should not have left open.',
  },
  {
    id: 'hollow_stag', name: 'Hollow Stag', tier: 3, reads: 3, xp: 35,
    habitat: 'Stands sentinel near dormant tears.',
    lore: 'Antlers like a shrine burned hollow. It watches the seam as if it remembers standing guard on the other side.',
  },
  {
    id: 'duskwyrm', name: 'Duskwyrm', tier: 4, reads: 4, xp: 50,
    habitat: 'Coils beneath double tears; surfaces at convergence.',
    lore: 'The oldest thing that slips through. It does not escape the rifts — the rifts escape around it.',
  },
];

export const FAUNA_BY_ID: Record<string, FaunaSpecies> =
  Object.fromEntries(FAUNA_SPECIES.map(s => [s.id, s]));

/** Mastery ladder — identity, never power. */
export function masteryFor(count: number): 'sighted' | 'studied' | 'mastered' {
  if (count >= 15) return 'mastered';
  if (count >= 5)  return 'studied';
  return 'sighted';
}
