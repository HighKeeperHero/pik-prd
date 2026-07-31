// ============================================================
// oaths.ts — Oath v2 preset catalog (2026-07-31, Tim's locks)
//
// Three decisions this encodes:
//   1. WEEKLY surface; the daily vow is deprecated.
//   2. A broken oath costs NOTHING. It simply pays nothing and the
//      week ends. No debt, no guilt — the same ethic as the Warband
//      flame that carries you.
//   3. PRESETS, each bound to a mechanism that already exists in
//      the app — so an oath is about something the hero can
//      actually do, and the system can verify it without asking.
//
// Because every preset counts real rows (DailyRite completions,
// TrainingEntry logs), an oath AUTO-RESOLVES the moment it is met.
// Nobody self-reports; nobody is punished for a hard week.
// ============================================================

import type { Pillar } from './dto/training.dto';

/** What the oath counts. Both metrics are already recorded. */
export type OathMetric =
  | 'rites'       // DailyRite completions this week (pillar-scoped)
  | 'activities'  // TrainingEntry rows this week (pillar-scoped)
  | 'minutes';    // TrainingEntry duration summed this week (pillar-scoped)

export interface OathPreset {
  id:          string;
  pillar:      Pillar;
  /** The vow in the hero's own voice — what gets written to the Codex. */
  declaration: string;
  metric:      OathMetric;
  target:      number;
  /** Plain-language restatement so the ask is never ambiguous. */
  measure:     string;
}

export const OATH_PRESETS: OathPreset[] = [
  // ── PHYSICAL (forge) ────────────────────────────────────
  {
    id: 'oath_forge_rites_3', pillar: 'forge',
    declaration: 'I will keep the body three days this week.',
    metric: 'rites', target: 3,
    measure: 'Complete 3 Physical rites',
  },
  {
    id: 'oath_forge_logs_4', pillar: 'forge',
    declaration: 'I will move four times, and log each one honestly.',
    metric: 'activities', target: 4,
    measure: 'Log 4 Physical practices',
  },
  {
    id: 'oath_forge_minutes_120', pillar: 'forge',
    declaration: 'I will give two hours to this body before the week turns.',
    metric: 'minutes', target: 120,
    measure: 'Log 120 minutes of Physical practice',
  },
  // ── MENTAL (lore) ───────────────────────────────────────
  {
    id: 'oath_lore_rites_3', pillar: 'lore',
    declaration: 'I will feed the mind three days this week.',
    metric: 'rites', target: 3,
    measure: 'Complete 3 Mental rites',
  },
  {
    id: 'oath_lore_logs_4', pillar: 'lore',
    declaration: 'I will study four times, however briefly.',
    metric: 'activities', target: 4,
    measure: 'Log 4 Mental practices',
  },
  {
    id: 'oath_lore_minutes_150', pillar: 'lore',
    declaration: 'I will give two and a half hours to learning.',
    metric: 'minutes', target: 150,
    measure: 'Log 150 minutes of Mental practice',
  },
  // ── SPIRITUAL (veil) ────────────────────────────────────
  {
    id: 'oath_veil_rites_3', pillar: 'veil',
    declaration: 'I will hold the stillness three days this week.',
    metric: 'rites', target: 3,
    measure: 'Complete 3 Spiritual rites',
  },
  {
    id: 'oath_veil_logs_5', pillar: 'veil',
    declaration: 'I will return to the quiet five times.',
    metric: 'activities', target: 5,
    measure: 'Log 5 Spiritual practices',
  },
  {
    id: 'oath_veil_minutes_75', pillar: 'veil',
    declaration: 'I will sit with it for an hour and a quarter, all told.',
    metric: 'minutes', target: 75,
    measure: 'Log 75 minutes of Spiritual practice',
  },
];

export function oathPresetById(id: string): OathPreset | undefined {
  return OATH_PRESETS.find(p => p.id === id);
}
