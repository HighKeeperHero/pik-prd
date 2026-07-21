// ============================================================
// HEP Phase 2 Slice 6 — the metric vocabulary and its thresholds
//
// Workstream 9's table, expressed as something a machine can check.
// "Looks aligned" is not an acceptable test result, and neither is a
// threshold that lives only in a document nobody queries.
//
// ── Documented, not enforced ──────────────────────────────────
// The names below are the vocabulary we evaluate. A client may report a
// metric that is NOT here and it will be stored and returned — it simply
// has no threshold. That asymmetry is deliberate: an external partner
// learning something new mid-pilot should not have to wait on us to ship
// a migration before they can record it.
//
// Place at: src/spatial/metrics.ts
// ============================================================

export type Direction = 'lower_is_better' | 'higher_is_better';

export interface ThresholdSpec {
  metric: string;
  unit: string;
  direction: Direction;
  /** Config key holding the target, when it is tunable at runtime. */
  configKey?: string;
  /** Fallback when there is no config row. */
  target: number;
  label: string;
}

/**
 * The Workstream 9 initial targets.
 *
 * Explicitly starting points: the spec says to tune them after testing,
 * and the ones with a `configKey` can be moved without a deploy. The
 * rest are here so the shape is agreed with the partner now; they get
 * config keys when someone actually wants to turn them, because an
 * unseeded key is a dial welded shut.
 */
export const THRESHOLDS: ThresholdSpec[] = [
  {
    metric: 'anchor.localization_success',
    unit: 'ratio',
    direction: 'higher_is_better',
    target: 0.95,
    label: 'Room localization success ≥95%',
  },
  {
    metric: 'anchor.localization_time_s',
    unit: 's',
    direction: 'lower_is_better',
    target: 15,
    label: 'Localization time ≤15s',
  },
  {
    metric: 'anchor.translation_error_m',
    unit: 'm',
    direction: 'lower_is_better',
    configKey: 'spatial.max_translation_error_m',
    target: 0.05,
    label: 'Origin translation error ≤5cm',
  },
  {
    metric: 'anchor.rotation_error_deg',
    unit: 'deg',
    direction: 'lower_is_better',
    configKey: 'spatial.max_rotation_error_deg',
    target: 2,
    label: 'Rotation error ≤2°',
  },
  {
    metric: 'anchor.floor_height_error_m',
    unit: 'm',
    direction: 'lower_is_better',
    configKey: 'spatial.max_floor_height_error_m',
    target: 0.03,
    label: 'Floor-height error ≤3cm',
  },
  {
    metric: 'anchor.drift_m.20min',
    unit: 'm',
    direction: 'lower_is_better',
    target: 0.10,
    label: 'Drift over a 20-minute session ≤10cm',
  },
  {
    metric: 'runtime.crash_free_sessions',
    unit: 'ratio',
    direction: 'higher_is_better',
    target: 0.99,
    label: 'Crash-free sessions ≥99%',
  },
  {
    metric: 'player.operator_interventions',
    unit: 'ratio',
    direction: 'lower_is_better',
    target: 0.05,
    label: 'Operator intervention ≤1 per 20 sessions',
  },
  {
    metric: 'ops.room_reset_time_s',
    unit: 's',
    direction: 'lower_is_better',
    target: 300,
    label: 'Room reset time ≤5 minutes',
  },
  {
    metric: 'rewards.sync_success',
    unit: 'ratio',
    direction: 'higher_is_better',
    target: 0.995,
    label: 'Reward synchronization ≥99.5%',
  },
];

export const THRESHOLD_BY_METRIC = new Map(THRESHOLDS.map((t) => [t.metric, t]));

export function judge(spec: ThresholdSpec, value: number, target: number) {
  return spec.direction === 'lower_is_better' ? value <= target : value >= target;
}

/**
 * Percentile from an unsorted sample.
 *
 * p95 rather than a mean for the error metrics, and this is the whole
 * point of measuring: a mean translation error of 3cm hides the one
 * session in twenty that localized 20cm out and put a guest's hand
 * through a wall. Averages describe the median guest; tails describe the
 * one who complains.
 */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
