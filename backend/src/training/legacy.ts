// ============================================================
// legacy.ts — the Legacy Development System's data spine
// (2026-07-30, Tim's Developer Deployment Brief).
//
// Four layers:
//   Legacy      — permanent, derives from TOTAL discipline XP,
//                 never resets.
//   Disciplines — forge=Physical / lore=Mental / veil=Reflective
//                 (PillarProgress rows: XP, level, streak).
//   Attributes  — 18, six per discipline, independent XP+levels.
//   Activities  — what you actually did; each grants XP to
//                 multiple attributes; discipline XP = the sum.
//
// "Activities are what you do. Attributes are who you become.
//  Disciplines represent growth in each domain. Legacy is the
//  lifelong sum of that growth."
//
// XP anchors from the brief (kept exact):
//   45-min strength → +18 Strength +6 Resolve +3 Vitality (= 27)
//   30 pages read   → +14 Knowledge +5 Focus +2 Wisdom    (= 21)
//   15-min prayer   → +12 Faith +4 Presence +2 Character  (= 18)
// Each activity carries its own baseMinutes (a typical session);
// XP scales duration/baseMinutes, clamped to [0.25, 2].
// ============================================================

import type { Pillar } from './dto/training.dto';

export interface AttributeDef {
  id:    string;
  name:  string;
  theme: string;
}

export const DISCIPLINE_ATTRIBUTES: Record<Pillar, AttributeDef[]> = {
  forge: [
    { id: 'strength',  name: 'Strength',  theme: 'Power and capability' },
    { id: 'endurance', name: 'Endurance', theme: 'Persistence' },
    { id: 'vitality',  name: 'Vitality',  theme: 'Recovery and health' },
    { id: 'agility',   name: 'Agility',   theme: 'Speed and coordination' },
    { id: 'mobility',  name: 'Mobility',  theme: 'Freedom of movement' },
    { id: 'resolve',   name: 'Resolve',   theme: 'Mental toughness' },
  ],
  lore: [
    { id: 'knowledge',  name: 'Knowledge',  theme: 'Learning' },
    { id: 'wisdom',     name: 'Wisdom',     theme: 'Application' },
    { id: 'focus',      name: 'Focus',      theme: 'Attention' },
    { id: 'creativity', name: 'Creativity', theme: 'Creation' },
    { id: 'curiosity',  name: 'Curiosity',  theme: 'Discovery' },
    { id: 'mastery',    name: 'Mastery',    theme: 'Long-term skill' },
  ],
  veil: [
    { id: 'faith',      name: 'Faith',      theme: 'Hope and devotion' },
    { id: 'presence',   name: 'Presence',   theme: 'Mindfulness' },
    { id: 'gratitude',  name: 'Gratitude',  theme: 'Thankfulness' },
    { id: 'character',  name: 'Character',  theme: 'Virtuous action' },
    { id: 'reflection', name: 'Reflection', theme: 'Self-examination' },
    { id: 'purpose',    name: 'Purpose',    theme: 'Intentional direction' },
  ],
};

export interface ActivityDef {
  id:          string;
  pillar:      Pillar;
  name:        string;
  baseMinutes: number;                  // a typical session; XP anchors assume it
  grants:      Record<string, number>;  // attribute id → XP at baseMinutes
}

export const ACTIVITY_CATALOG: ActivityDef[] = [
  // ── FORGE (Physical) ────────────────────────────────────
  { id: 'workout',    pillar: 'forge', name: 'Strength Training',                    baseMinutes: 45, grants: { strength: 18, resolve: 6, vitality: 3 } },
  { id: 'cardio',     pillar: 'forge', name: 'Cardio — Run · Cycle · Swim',          baseMinutes: 30, grants: { endurance: 12, vitality: 4, resolve: 2 } },
  { id: 'walking',    pillar: 'forge', name: 'Walking & Hiking',                     baseMinutes: 30, grants: { endurance: 9, vitality: 3 } },
  { id: 'sport',      pillar: 'forge', name: 'Sports & Play',                        baseMinutes: 45, grants: { agility: 14, endurance: 5, resolve: 3 } },
  { id: 'stretching', pillar: 'forge', name: 'Mobility — Stretch · Yoga · PT',       baseMinutes: 20, grants: { mobility: 10, vitality: 3, agility: 2 } },
  { id: 'nutrition',  pillar: 'forge', name: 'Recovery — Nutrition · Sleep · Water', baseMinutes: 15, grants: { vitality: 8, resolve: 2 } },
  { id: 'challenge',  pillar: 'forge', name: 'A Hard Thing Done',                    baseMinutes: 30, grants: { resolve: 12, strength: 4, endurance: 4 } },
  // ── LORE (Mental) ───────────────────────────────────────
  { id: 'reading',    pillar: 'lore', name: 'Reading',                               baseMinutes: 30, grants: { knowledge: 14, focus: 5, wisdom: 2 } },
  { id: 'learning',   pillar: 'lore', name: 'Courses & Audiobooks',                  baseMinutes: 30, grants: { knowledge: 10, curiosity: 5, mastery: 3 } },
  { id: 'studying',   pillar: 'lore', name: 'Deep Work & Study',                     baseMinutes: 45, grants: { focus: 16, knowledge: 5, mastery: 3 } },
  { id: 'writing',    pillar: 'lore', name: 'Writing',                               baseMinutes: 30, grants: { creativity: 12, focus: 4, wisdom: 2 } },
  { id: 'art',        pillar: 'lore', name: 'Art · Design · Music',                  baseMinutes: 30, grants: { creativity: 12, curiosity: 4, mastery: 3 } },
  { id: 'research',   pillar: 'lore', name: 'Research & Exploration',                baseMinutes: 30, grants: { curiosity: 12, knowledge: 4, wisdom: 2 } },
  { id: 'practice',   pillar: 'lore', name: 'Skill Practice — Language · Code',      baseMinutes: 30, grants: { mastery: 13, focus: 4, knowledge: 3 } },
  { id: 'teaching',   pillar: 'lore', name: 'Teaching & Problem-Solving',            baseMinutes: 30, grants: { wisdom: 12, knowledge: 4, focus: 2 } },
  // ── VEIL (Spiritual / Reflective) ───────────────────────
  { id: 'prayer',     pillar: 'veil', name: 'Prayer & Devotion',                     baseMinutes: 15, grants: { faith: 12, presence: 4, character: 2 } },
  { id: 'meditation', pillar: 'veil', name: 'Meditation & Stillness',                baseMinutes: 15, grants: { presence: 12, faith: 3, reflection: 3 } },
  { id: 'journaling', pillar: 'veil', name: 'Journaling & Daily Review',             baseMinutes: 15, grants: { reflection: 12, gratitude: 3, character: 2 } },
  { id: 'gratitude',  pillar: 'veil', name: 'Gratitude Practice',                    baseMinutes: 10, grants: { gratitude: 10, presence: 3, faith: 2 } },
  { id: 'service',    pillar: 'veil', name: 'Service & Kept Commitments',            baseMinutes: 30, grants: { character: 14, purpose: 4, gratitude: 3 } },
  { id: 'planning',   pillar: 'veil', name: 'Goal & Mission Review',                 baseMinutes: 20, grants: { purpose: 12, reflection: 4, character: 2 } },
];

export function activityById(id: string): ActivityDef | undefined {
  return ACTIVITY_CATALOG.find(a => a.id === id);
}

/** Scale an activity's grants by session length. Clamp [0.25, 2]. */
export function scaledGrants(def: ActivityDef, durationMin?: number): Record<string, number> {
  const scale = Math.min(2, Math.max(0.25, (durationMin ?? def.baseMinutes) / def.baseMinutes));
  const out: Record<string, number> = {};
  for (const [attr, xp] of Object.entries(def.grants)) {
    const g = Math.round(xp * scale);
    if (g > 0) out[attr] = g;
  }
  return out;
}

// Each seeded daily rite IS an activity — completing it grants the
// activity's base-session attribute XP on top of the rite's
// discipline XP (streak/resonance math unchanged).
export const RITE_ACTIVITY: Record<string, string> = {
  'rite-forge-001': 'cardio',
  'rite-forge-002': 'workout',
  'rite-forge-003': 'sport',
  'rite-forge-004': 'walking',
  'rite-forge-005': 'workout',
  'rite-forge-006': 'challenge',
  'rite-forge-007': 'stretching',
  'rite-forge-008': 'challenge',
  'rite-lore-001':  'reading',
  'rite-lore-002':  'writing',
  'rite-lore-003':  'learning',
  'rite-lore-004':  'teaching',
  'rite-lore-005':  'learning',
  'rite-lore-006':  'practice',
  'rite-lore-007':  'teaching',
  'rite-lore-008':  'teaching',
  'rite-veil-001':  'meditation',
  'rite-veil-002':  'service',
  'rite-veil-003':  'prayer',
  'rite-veil-004':  'meditation',
  'rite-veil-005':  'gratitude',
  'rite-veil-006':  'service',
  'rite-veil-007':  'meditation',
  'rite-veil-008':  'journaling',
};

// ── Curves ────────────────────────────────────────────────

/** Attribute levels 1–11 (cumulative XP). */
export const ATTR_LEVELS = [0, 100, 250, 500, 900, 1500, 2300, 3300, 4600, 6200, 8000];

/** Legacy levels 1–10 from TOTAL discipline XP (the brief: "Legacy
 *  level derives from total discipline XP" — permanent, never
 *  resets). Level 10 lights the whole Arena. The native client
 *  mirrors this table in computeLegacyLevel — keep in sync. */
export const LEGACY_LEVELS = [0, 300, 900, 2000, 4000, 7000, 11000, 16000, 22000, 30000];

export function levelFromXp(xp: number, table: number[]): number {
  const idx = table.findIndex(t => t > xp);
  return idx === -1 ? table.length : Math.max(1, idx);
}
