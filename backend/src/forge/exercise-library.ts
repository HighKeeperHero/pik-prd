// ============================================================
// The Forge — Global Movement Library (Sprint 33)
//
// The starter catalogue of movements every hero shares. Real
// exercise names (so the logger is genuinely useful, on par with
// Hevy/Strong) carry an in-world `themeName` for flavour. Seeded
// into `forge_exercises` with a stable `slug` so re-seeding is
// idempotent. Custom hero-authored movements live alongside these
// rows with `isCustom = true` and a non-null `rootId`.
//
// logType:
//   weight_reps — load × reps (most lifts)
//   reps        — bodyweight reps (pull-ups, push-ups)
//   duration    — held / timed (plank, cardio by time)
//   distance    — covered distance (run, row, ruck)
// ============================================================

export type ForgeLogType = 'weight_reps' | 'reps' | 'duration' | 'distance';

export interface ForgeExerciseSeed {
  slug: string;
  name: string;
  themeName: string;
  category: string;     // chest | back | legs | shoulders | arms | core | cardio | other
  equipment: string;    // barbell | dumbbell | machine | cable | bodyweight | kettlebell | other
  logType: ForgeLogType;
  instructions?: string;
}

export const EXERCISE_CATEGORIES = [
  'chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio', 'other',
] as const;

export const EXERCISE_EQUIPMENT = [
  'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'other',
] as const;

export const FORGE_LIBRARY: ForgeExerciseSeed[] = [
  // ── Chest ──────────────────────────────────────────────────────────────────
  { slug: 'barbell-bench-press', name: 'Barbell Bench Press', themeName: 'The Iron Press', category: 'chest', equipment: 'barbell', logType: 'weight_reps', instructions: 'Lower the bar to mid-chest, drive it back to lockout. Keep the shoulder blades pinned.' },
  { slug: 'incline-dumbbell-press', name: 'Incline Dumbbell Press', themeName: 'Rising Bulwark', category: 'chest', equipment: 'dumbbell', logType: 'weight_reps' },
  { slug: 'dumbbell-fly', name: 'Dumbbell Fly', themeName: 'Spread-Wing', category: 'chest', equipment: 'dumbbell', logType: 'weight_reps' },
  { slug: 'push-up', name: 'Push-Up', themeName: 'The Ground Oath', category: 'chest', equipment: 'bodyweight', logType: 'reps' },
  { slug: 'cable-crossover', name: 'Cable Crossover', themeName: 'Crossing Veil', category: 'chest', equipment: 'cable', logType: 'weight_reps' },

  // ── Back ───────────────────────────────────────────────────────────────────
  { slug: 'deadlift', name: 'Deadlift', themeName: 'The Worldlift', category: 'back', equipment: 'barbell', logType: 'weight_reps', instructions: 'Hinge, brace, and pull the bar up the shins to a tall lockout. The signature Forge feat.' },
  { slug: 'pull-up', name: 'Pull-Up', themeName: 'Ascension', category: 'back', equipment: 'bodyweight', logType: 'reps' },
  { slug: 'bent-over-row', name: 'Bent-Over Barbell Row', themeName: 'Reaver Pull', category: 'back', equipment: 'barbell', logType: 'weight_reps' },
  { slug: 'lat-pulldown', name: 'Lat Pulldown', themeName: 'Draw of the Deep', category: 'back', equipment: 'cable', logType: 'weight_reps' },
  { slug: 'seated-cable-row', name: 'Seated Cable Row', themeName: 'Tideward Haul', category: 'back', equipment: 'cable', logType: 'weight_reps' },

  // ── Legs ───────────────────────────────────────────────────────────────────
  { slug: 'back-squat', name: 'Barbell Back Squat', themeName: 'The Pillar', category: 'legs', equipment: 'barbell', logType: 'weight_reps', instructions: 'Bar on the upper back, descend below parallel, drive through mid-foot. The root of all strength.' },
  { slug: 'front-squat', name: 'Front Squat', themeName: 'Standing Ward', category: 'legs', equipment: 'barbell', logType: 'weight_reps' },
  { slug: 'romanian-deadlift', name: 'Romanian Deadlift', themeName: 'The Hinge', category: 'legs', equipment: 'barbell', logType: 'weight_reps' },
  { slug: 'leg-press', name: 'Leg Press', themeName: 'Siege Engine', category: 'legs', equipment: 'machine', logType: 'weight_reps' },
  { slug: 'walking-lunge', name: 'Walking Lunge', themeName: 'The Long March', category: 'legs', equipment: 'dumbbell', logType: 'weight_reps' },
  { slug: 'leg-curl', name: 'Leg Curl', themeName: 'Coiled Sinew', category: 'legs', equipment: 'machine', logType: 'weight_reps' },
  { slug: 'standing-calf-raise', name: 'Standing Calf Raise', themeName: 'Stone Tread', category: 'legs', equipment: 'machine', logType: 'weight_reps' },

  // ── Shoulders ──────────────────────────────────────────────────────────────
  { slug: 'overhead-press', name: 'Overhead Press', themeName: 'Skyward Oath', category: 'shoulders', equipment: 'barbell', logType: 'weight_reps', instructions: 'Press the bar overhead to lockout without leaning back. Crowns the upper body.' },
  { slug: 'dumbbell-shoulder-press', name: 'Dumbbell Shoulder Press', themeName: 'Twin Spires', category: 'shoulders', equipment: 'dumbbell', logType: 'weight_reps' },
  { slug: 'lateral-raise', name: 'Lateral Raise', themeName: 'Wing-Spread', category: 'shoulders', equipment: 'dumbbell', logType: 'weight_reps' },
  { slug: 'face-pull', name: 'Face Pull', themeName: 'Veilward Draw', category: 'shoulders', equipment: 'cable', logType: 'weight_reps' },

  // ── Arms ───────────────────────────────────────────────────────────────────
  { slug: 'barbell-curl', name: 'Barbell Curl', themeName: 'The Reckoning Curl', category: 'arms', equipment: 'barbell', logType: 'weight_reps' },
  { slug: 'dumbbell-curl', name: 'Dumbbell Curl', themeName: 'Forge-Hammer', category: 'arms', equipment: 'dumbbell', logType: 'weight_reps' },
  { slug: 'tricep-pushdown', name: 'Tricep Pushdown', themeName: 'Anvil Strike', category: 'arms', equipment: 'cable', logType: 'weight_reps' },
  { slug: 'skullcrusher', name: 'Skullcrusher', themeName: 'Reaver End', category: 'arms', equipment: 'barbell', logType: 'weight_reps' },
  { slug: 'hammer-curl', name: 'Hammer Curl', themeName: 'Smiths Grip', category: 'arms', equipment: 'dumbbell', logType: 'weight_reps' },
  { slug: 'dip', name: 'Dip', themeName: 'The Descent', category: 'arms', equipment: 'bodyweight', logType: 'reps' },

  // ── Core ───────────────────────────────────────────────────────────────────
  { slug: 'plank', name: 'Plank', themeName: 'The Still Point', category: 'core', equipment: 'bodyweight', logType: 'duration', instructions: 'Hold a rigid line from heel to crown. Stillness under load — the Veil approves.' },
  { slug: 'hanging-leg-raise', name: 'Hanging Leg Raise', themeName: 'Suspended Trial', category: 'core', equipment: 'bodyweight', logType: 'reps' },
  { slug: 'cable-crunch', name: 'Cable Crunch', themeName: 'Bowing Reed', category: 'core', equipment: 'cable', logType: 'weight_reps' },
  { slug: 'russian-twist', name: 'Russian Twist', themeName: 'Turning Glass', category: 'core', equipment: 'bodyweight', logType: 'reps' },

  // ── Cardio ─────────────────────────────────────────────────────────────────
  { slug: 'run', name: 'Run', themeName: 'The Long Road', category: 'cardio', equipment: 'bodyweight', logType: 'distance', instructions: 'Cover ground at a steady effort. The body that endures is the body that survives.' },
  { slug: 'row-erg', name: 'Rowing Machine', themeName: 'Riverguard', category: 'cardio', equipment: 'machine', logType: 'distance' },
  { slug: 'cycling', name: 'Cycling', themeName: 'Wheel of Fate', category: 'cardio', equipment: 'machine', logType: 'distance' },
  { slug: 'jump-rope', name: 'Jump Rope', themeName: 'Skipping Veil', category: 'cardio', equipment: 'other', logType: 'duration' },
  { slug: 'incline-walk', name: 'Incline Walk', themeName: 'The Climb', category: 'cardio', equipment: 'machine', logType: 'duration' },
];
