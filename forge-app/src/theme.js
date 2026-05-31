// ============================================================
// The Forge — visual language
// Mirrors the Heroes' Veritas / PIK portal: ink-black ground,
// ember-amber accent (The Forge's signature), restrained
// surfaces. Brand display fonts (Crimson Pro / DM Sans) can be
// layered in later via @expo-google-fonts; we fall back to the
// platform system font so the app runs with zero font assets.
// ============================================================

export const colors = {
  bg:        '#08080f',
  surface:   'rgba(255,255,255,0.03)',
  surface2:  'rgba(255,255,255,0.05)',
  border:    'rgba(255,255,255,0.08)',
  text:      '#ffffff',
  dim:       'rgba(255,255,255,0.55)',
  muted:     'rgba(255,255,255,0.35)',
  faint:     'rgba(255,255,255,0.18)',
  ember:     '#f59e0b',
  emberDark: '#d97706',
  green:     '#22c55e',
  red:       '#ef4444',
};

export const radius = { sm: 8, md: 11, lg: 14, xl: 20 };

export const CATS = [
  { key: 'chest', label: 'Chest' },
  { key: 'back', label: 'Back' },
  { key: 'legs', label: 'Legs' },
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'arms', label: 'Arms' },
  { key: 'core', label: 'Core' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'other', label: 'Other' },
];
export const CAT_LABEL = Object.fromEntries(CATS.map((c) => [c.key, c.label]));

export const REC_LABEL = {
  max_weight: 'Heaviest',
  est_1rm: 'Est. 1RM',
  max_reps: 'Most Reps',
  best_duration: 'Longest Hold',
  best_distance: 'Farthest',
};

export const LOG_TYPES = [
  ['weight_reps', 'Weight × Reps'],
  ['reps', 'Reps'],
  ['duration', 'Duration'],
  ['distance', 'Distance'],
];

// ── formatting helpers ──
export const fmtDur = (sec) => {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m >= 60) { const h = Math.floor(m / 60); return `${h}h ${m % 60}m`; }
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};
export const fmtClock = (sec) => {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
export const fmtVol = (kg) => (kg == null ? '0' : Math.round(kg).toLocaleString());
export const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
export const recValue = (r) => {
  if (r.record_type === 'max_weight') return `${r.value} kg × ${r.reps ?? '—'}`;
  if (r.record_type === 'est_1rm') return `${Math.round(r.value)} kg`;
  if (r.record_type === 'max_reps') return `${r.value} reps`;
  if (r.record_type === 'best_duration') return fmtDur(r.value);
  if (r.record_type === 'best_distance') return `${(r.value / 1000).toFixed(2)} km`;
  return String(r.value);
};
