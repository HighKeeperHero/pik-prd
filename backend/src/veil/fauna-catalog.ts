// ============================================================
// Veil Fauna catalog — what escaped the rifts.
//
// TWENTY species (2026-07-24 expansion), five per Realm, spread
// across the four tear tiers. The catalog is code (same pattern
// as the fox catalog): new species ship by deploy, the client
// renders from this via the API. Mastery tiers are the bestiary's
// identity ladder: Sighted 1 · Studied 5 · Mastered 15.
//
// TIER is threat/tear band (T1-T4); encounter spawns filter on it
// (veil.service.getNearbyFauna). REALM is identity — the four
// cosmic alignments plus the Veil-touched Neutral — carried for
// the bestiary and future realm mechanics; it never touches the
// tier ladder or the accent colour (that guardrail lives in the
// visual briefs). reads/xp are a flat per-tier ladder (faunaTier
// helper): retune the ladder, not the rows.
// ============================================================

export type FaunaRealm = 'order' | 'chaos' | 'light' | 'dark' | 'neutral';
export type FaunaTierNum = 1 | 2 | 3 | 4;

export interface FaunaSpecies {
  id:      string;
  name:    string;
  realm:   FaunaRealm;
  tier:    FaunaTierNum;      // matches tear tiers T1-T4
  reads:   number;           // correct gesture reads to banish
  xp:      number;
  habitat: string;
  lore:    string;
}

// One place to tune banish difficulty + reward per threat band.
// Kept at the pre-expansion values so re-tiered species inherit
// balance already play-tested at their new tier.
const TIER_LADDER: Record<FaunaTierNum, { reads: number; xp: number }> = {
  1: { reads: 2, xp: 15 },
  2: { reads: 3, xp: 25 },
  3: { reads: 3, xp: 35 },
  4: { reads: 4, xp: 50 },
};

type Row = Omit<FaunaSpecies, 'reads' | 'xp'>;

const ROWS: Row[] = [
  // ── Tier I · Common ─────────────────────────────────────────
  {
    id: 'emberkit', name: 'Ember Yip', realm: 'chaos', tier: 1,
    habitat: 'Warm stone near recently sealed seams; runs in packs.',
    lore: 'A scavenger loping on borrowed fire, cackling sparks. Quick, mischievous, rarely alone — it teaches you to answer a flurry before it teaches you anything else. It does not know it is a wound. Few things do.',
  },
  {
    id: 'mistfeather', name: 'Mist Feather', realm: 'light', tier: 1,
    habitat: 'Glides above tear sites; scatters when watched.',
    lore: 'A bird the fog dreamed of. Luminous feathers blur into weather at the edges, so the eye keeps losing it. Its call sounds like a door you should not have left open.',
  },
  {
    id: 'shardhound', name: 'Shard Hound', realm: 'order', tier: 1,
    habitat: 'Circles minor tears in disciplined, widening loops.',
    lore: 'A pack hunter plated in crystalline growth, mineral blades ridging its spine. Precise, patient, grief in its gait. Banishing it is a mercy twice over.',
  },
  {
    id: 'whisper_shade', name: 'Whisper Shade', realm: 'dark', tier: 1,
    habitat: 'Stalks the edge of vision near fresh minor tears.',
    lore: 'A shadow-born thing that is more unsettling than large. It waits at the corner of the eye and closes the distance in a single held breath. Read the sudden strike, not the stillness.',
  },
  {
    id: 'hollow_stag', name: 'Hollow Stag', realm: 'neutral', tier: 1,
    habitat: 'Stands sentinel at the threshold of a first tear.',
    lore: 'Once a woodland guardian, now hollowed by the Veil, its crystal antlers a shrine burned candle-bare. It does not run — it charges, and it remembers standing guard on the other side. The introductory boss: the first creature to make you answer everything it has.',
  },

  // ── Tier II · Rare ──────────────────────────────────────────
  {
    id: 'shatterhorn_ram', name: 'Shatterhorn Ram', realm: 'chaos', tier: 2,
    habitat: 'High broken ground above wandering tears.',
    lore: 'A mountain beast whose fractured horns splinter and regrow without pause, each charge fed by the last thing it broke. Chaos made muscle: never quite the same silhouette twice.',
  },
  {
    id: 'lattice_lynx', name: 'Lattice Lynx', realm: 'order', tier: 2,
    habitat: 'Hunts wandering tears with impossible economy.',
    lore: 'An apex predator of translucent, crystalline musculature and perfect symmetry. It wastes no motion; every strike is the shortest line between intent and wound. Read the geometry.',
  },
  {
    id: 'bastion_tortoise', name: 'Bastion Tortoise', realm: 'order', tier: 2,
    habitat: 'Anchors itself at wandering tears; seldom moves.',
    lore: 'A walking fortress, its shell a lattice of interlocking stone and crystal architecture. Nearly immovable, endlessly patient — you do not outlast it, you find the seam in its defence and answer through it.',
  },
  {
    id: 'halo_manta', name: 'Halo Manta', realm: 'light', tier: 2,
    habitat: 'Swims the air above wandering tears at height.',
    lore: 'A celestial ray gliding through open sky as if through water, trailing radiant arcs that light the whole field. Serene until it banks — and then the light itself is the blade.',
  },
  {
    id: 'veilmoth', name: 'Veilmoth', realm: 'dark', tier: 2,
    habitat: 'Drawn to unstable Veil energy near wandering tears.',
    lore: 'A great moth that should not be, pale wings drinking the light and scattering reality-distorting dust that clouds the eye. What it clouds, it comes through. Nothing that slips the Veil is only what it seems.',
  },

  // ── Tier III · Epic ─────────────────────────────────────────
  {
    id: 'compass_roc', name: 'Compass Roc', realm: 'order', tier: 3,
    habitat: 'Rules the high air above dormant tears and old peaks.',
    lore: 'A colossal eagle whose flight traces impossible geometric precision, as though the sky were ruled and measured for it. Guardian of forgotten temples; it does not stoop so much as arrive along a line already drawn.',
  },
  {
    id: 'dawn_seraph_elk', name: 'Dawn Seraph Elk', realm: 'light', tier: 3,
    habitat: 'Walks the quiet ground around dormant tears at first light.',
    lore: 'A majestic elk crowned with radiant, living antlers — revered on the other side as a sign of hope and renewal. It grieves what the Veil has done, and grief in a thing this bright is a hard weight to answer.',
  },
  {
    id: 'chaos_drake', name: 'Chaos Drake', realm: 'chaos', tier: 3,
    habitat: 'Nests in the heat-shimmer above dormant tears.',
    lore: 'A draconic predator born of unstable Veil energy, shedding molten scales as its own body mutates mid-fight. The tells you learned last breath may not be the tells you need this one.',
  },
  {
    id: 'umbral_widow', name: 'Umbral Widow', realm: 'dark', tier: 3,
    habitat: 'Webs the hollows beneath dormant tears.',
    lore: 'An ancient spider woven from obsidian and shadow, patient in webs spun from condensed darkness. It does not rush. It waits for the read you will get wrong.',
  },
  {
    id: 'barrier_sentinel', name: 'Barrier Sentinel', realm: 'order', tier: 3,
    habitat: 'Guards leyline anchors near dormant tears.',
    lore: 'A monumental guardian construct in the shape of a quadrupedal beast, raised to defend sacred sites and hold the ley-anchors shut. It knows only its charge, and the Veil has made its charge you.',
  },

  // ── Tier IV · Legendary ─────────────────────────────────────
  {
    id: 'fracture_hydra', name: 'Fracture Hydra', realm: 'chaos', tier: 4,
    habitat: 'Surfaces where double tears feed each other.',
    lore: 'A monstrous hydra whose heads split, regenerate, and mutate without end — every encounter a different shape of the same hunger. There is no rhythm to settle into. There is only the next read.',
  },
  {
    id: 'mosaic_chimera', name: 'Mosaic Chimera', realm: 'chaos', tier: 4,
    habitat: 'Prowls the convergence of double tears.',
    lore: 'A living patchwork of apex predators, its anatomy reshuffling mid-battle so no two encounters feel alike. Whatever it was last, it is answering with something else now.',
  },
  {
    id: 'duskwyrm', name: 'Dusk Wyrm', realm: 'dark', tier: 4,
    habitat: 'Swims the shadow beneath double tears; surfaces at convergence.',
    lore: 'The oldest thing that slips through — a colossal serpent that moves through darkness the way others move through earth or sky, appearing wherever the dark gathers. It does not escape the rifts. The rifts escape around it.',
  },
  {
    id: 'sol_phoenix', name: 'Sol Phoenix', realm: 'light', tier: 4,
    habitat: 'Circles the highest air above double tears.',
    lore: 'A divine bird whose radiant plumage burns with life rather than fire. To banish it is not to end it: the light is said to gather again, elsewhere, and rise. You are not its death. You are its turning.',
  },
  {
    id: 'eclipse_leviathan', name: 'Eclipse Leviathan', realm: 'dark', tier: 4,
    habitat: 'Passes over double-tear convergence; the stars go out beneath it.',
    lore: 'An immense sky-whale whose passage extinguishes the stars overhead — one of the oldest and least understood things in existence. It does not notice you until you make it. Then the sky is very small.',
  },
];

export const FAUNA_SPECIES: FaunaSpecies[] = ROWS.map(r => ({
  ...r,
  reads: TIER_LADDER[r.tier].reads,
  xp:    TIER_LADDER[r.tier].xp,
}));

export const FAUNA_BY_ID: Record<string, FaunaSpecies> =
  Object.fromEntries(FAUNA_SPECIES.map(s => [s.id, s]));

/** Human-facing realm label (bestiary badge). */
export const REALM_LABEL: Record<FaunaRealm, string> = {
  order:   'Order',
  chaos:   'Chaos',
  light:   'Light',
  dark:    'Dark',
  neutral: 'Veil-Touched',
};

/** Mastery ladder — identity, never power. */
export function masteryFor(count: number): 'sighted' | 'studied' | 'mastered' {
  if (count >= 15) return 'mastered';
  if (count >= 5)  return 'studied';
  return 'sighted';
}
