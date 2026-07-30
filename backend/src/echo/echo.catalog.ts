// ============================================================
// PIK — Hero Echo Catalog (canon §13.9 unification, 2026-07-30)
//
// DATA, not schema: the heroes of Elysendar whose echoes drift in
// the Veil. New heroes (including seasonal "Master Echoes") ship by
// editing this file — no migration. Player fragment progress lives
// in player_echo_fragments.
//
// Design of record: docs/rift-fauna-differentiation.md §3 — echoes
// are pieces of Elysendar's history FIRST; permanent progression is
// the secondary reward. Higher rarities require MORE fragments to
// complete registration at the Altar. A fully-registered Echo is a
// v4 "Master Echo": it grants rarity-keyed Resonance (canon §13.2
// additive layer, ladder 2/3/5/8/12) and feeds the Vocation echo
// signal via its jobLean.
//
// First-pass content: names/lore are tunable; [ART SLOT — Tim] per
// hero when portrait plates land (silhouettes until then).
// ============================================================

export type EchoRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface HeroEchoDef {
  id:        string;
  name:      string;
  epithet:   string;
  rarity:    EchoRarity;
  element:   'order' | 'chaos' | 'dark' | 'light';
  /** Which Job this hero's manner of living leans toward — the
   *  Vocation echo signal reads the heroes you chose to restore. */
  jobLean:   'AEGIS' | 'SCALESWORN' | 'DRYADIC' | 'HARVESTER';
  lore:      string;
}

/** Fragments to complete a registration, by rarity (Tim's rarity
 *  extension: higher rarities need MORE echoes of the same hero). */
export const ECHO_FRAGMENTS_REQUIRED: Record<EchoRarity, number> = {
  common: 2, uncommon: 3, rare: 4, epic: 5, legendary: 6,
};

/** Resonance granted on registration (canon §13.9 proposed ladder,
 *  tunable; sized against Doctrine's ≈51 full build). */
export const ECHO_RESONANCE: Record<EchoRarity, number> = {
  common: 2, uncommon: 3, rare: 5, epic: 8, legendary: 12,
};

/** Drop-pick weights by rarity (common heroes surface first). */
export const ECHO_DROP_WEIGHT: Record<EchoRarity, number> = {
  common: 40, uncommon: 30, rare: 17, epic: 9, legendary: 4,
};

export const HERO_ECHO_CATALOG: HeroEchoDef[] = [
  // ── COMMON — the remembered rank-and-file ────────────────
  { id: 'echo_bram_wallwright', name: 'Bram Wallwright', epithet: 'the Gate That Held', rarity: 'common', element: 'order', jobLean: 'AEGIS',
    lore: 'A mason who took up a door-bar when the first tear opened in Lochmaw. The bar broke. He did not.' },
  { id: 'echo_serra_quickknife', name: 'Serra Quickknife', epithet: 'of the Nine Markets', rarity: 'common', element: 'chaos', jobLean: 'HARVESTER',
    lore: 'She could empty your purse and fill your larder in the same afternoon. The Veil took her mid-bargain; she has not stopped haggling.' },
  { id: 'echo_tomm_greenhand', name: 'Tomm Greenhand', epithet: 'the Orchard Warden', rarity: 'common', element: 'light', jobLean: 'DRYADIC',
    lore: 'Planted a tree for every neighbor buried. The grove that stands north of Folsom is his census.' },
  // ── UNCOMMON — names a barrow-keeper would know ──────────
  { id: 'echo_ilsa_emberveil', name: 'Ilsa Emberveil', epithet: 'Lantern of the Deep Road', rarity: 'uncommon', element: 'light', jobLean: 'AEGIS',
    lore: 'Walked the Deep Road end to end with a lamp of veilfire, marking every seam. Her map is why the road still carries travelers.' },
  { id: 'echo_corvin_ashmane', name: 'Corvin Ashmane', epithet: 'the Wyrm-Baiter', rarity: 'uncommon', element: 'chaos', jobLean: 'SCALESWORN',
    lore: 'Fought a Veil-wyrm to a standstill with a broken spear and worse manners. The wyrm still avoids that valley.' },
  { id: 'echo_maren_tidecall', name: 'Maren Tidecall', epithet: 'Keeper of the Salt Oath', rarity: 'uncommon', element: 'dark', jobLean: 'HARVESTER',
    lore: 'Every drowned thing the sea gave back, she catalogued and returned to its kin. The sea, in time, began to trade fairly with her.' },
  // ── RARE — the ballad tier ───────────────────────────────
  { id: 'echo_dain_thornshield', name: 'Dain Thornshield', epithet: 'the Living Rampart', rarity: 'rare', element: 'order', jobLean: 'AEGIS',
    lore: 'Stood in the Kingvale breach for a night and a day while the wall was rebuilt behind him. The masons set his name in the keystone.' },
  { id: 'echo_lyra_veilsong', name: 'Lyra Veilsong', epithet: 'Who Sang the Seam Shut', rarity: 'rare', element: 'light', jobLean: 'DRYADIC',
    lore: 'The only recorded sealing performed without a blade. The tear is said to have closed the way an audience goes quiet.' },
  { id: 'echo_hakon_grimtally', name: 'Hakon Grimtally', epithet: 'the Debt of the Wastes', rarity: 'rare', element: 'dark', jobLean: 'HARVESTER',
    lore: 'Kept ledger of everything the Veil stole from Solara — and went, item by item, to take it back.' },
  // ── EPIC — the founding stories ──────────────────────────
  { id: 'echo_aelith_dawnsworn', name: 'Aelith Dawnsworn', epithet: 'First Blade of the Vigil', rarity: 'epic', element: 'order', jobLean: 'SCALESWORN',
    lore: 'Founded the Watch that never ended. Her oath is still administered in her exact words; no one has improved on them.' },
  { id: 'echo_veyra_rootmother', name: 'Veyra Rootmother', epithet: 'of the First Grove', rarity: 'epic', element: 'light', jobLean: 'DRYADIC',
    lore: 'Where she is buried, the World Tree took. The Grove-tenders say it is not a grave at all — it is a planting.' },
  // ── LEGENDARY — the age-defining ─────────────────────────
  { id: 'echo_kelrand_veilbreaker', name: 'Kelrand', epithet: 'the First Champion', rarity: 'legendary', element: 'chaos', jobLean: 'SCALESWORN',
    lore: 'The first to defy the Veil and walk back out of it. Every Awakened since has followed a road he opened barefoot.' },
];

export function echoById(id: string): HeroEchoDef | undefined {
  return HERO_ECHO_CATALOG.find(e => e.id === id);
}

/** Pure: Resonance total from REGISTERED fragment rows — the Master
 *  Echo half of the §13.2 additive layer. Callers pass rows already
 *  filtered to registeredAt != null. */
export function echoResonanceFromRows(rows: Array<{ echoId: string }>): number {
  return rows.reduce((sum, r) => {
    const def = echoById(r.echoId);
    return def ? sum + ECHO_RESONANCE[def.rarity] : sum;
  }, 0);
}

/** Pure: rarity-weighted jobLean shares from registered rows — the
 *  Vocation echo signal's input. */
export function echoJobSharesFromRows(rows: Array<{ echoId: string }>): Record<string, number> {
  const shares: Record<string, number> = {};
  for (const r of rows) {
    const def = echoById(r.echoId);
    if (!def) continue;
    shares[def.jobLean] = (shares[def.jobLean] ?? 0) + ECHO_RESONANCE[def.rarity];
  }
  return shares;
}
