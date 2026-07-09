// ============================================================
// Fate Fox catalog — the Calling's questions, virtue scoring,
// archetypes, immutable traits, customization options, and the
// mythic-name generator (Tim's companion-creator design,
// 2026-07-09). Scoring stays server-side and is NEVER sent to
// the client — the player answers with their gut, not a build
// guide.
// ============================================================

export type Virtue =
  | 'courage' | 'wisdom' | 'compassion' | 'resolve'
  | 'honor' | 'humility' | 'curiosity' | 'discipline';

export const VIRTUES: Virtue[] = [
  'courage', 'wisdom', 'compassion', 'resolve',
  'honor', 'humility', 'curiosity', 'discipline',
];

export interface CallingOption {
  id:     string;
  text:   string;
  scores: Partial<Record<Virtue, number>>;   // hidden from client
}
export interface CallingQuestion {
  id:      string;
  memory:  string;   // the scene set before the choice
  prompt:  string;
  options: CallingOption[];
}

// The shrine does not ask questions — it shows memories, and the
// player simply chooses what they do. No right answers.
export const CALLING_QUESTIONS: CallingQuestion[] = [
  {
    id: 'stranger',
    memory: 'A stranger is dragged down by a Veil creature at the tree line. ' +
            'Others stand frozen. The mist is thickening.',
    prompt: 'What do you do?',
    options: [
      { id: 'rush',    text: 'Rush forward immediately',            scores: { courage: 2 } },
      { id: 'draw',    text: 'Draw the creature away from them',    scores: { compassion: 1, courage: 1 } },
      { id: 'gather',  text: 'Gather the others first',             scores: { wisdom: 2 } },
      { id: 'shield',  text: 'Shield the helpless nearby',          scores: { honor: 1, compassion: 1 } },
    ],
  },
  {
    id: 'child',
    memory: 'A frightened child grips your sleeve as the village burns behind you. ' +
            'She asks if everything will be all right.',
    prompt: 'What do you tell her?',
    options: [
      { id: 'truth',   text: 'The truth — it is bad, and you will face it together', scores: { honor: 2 } },
      { id: 'comfort', text: 'What she needs to hear tonight',      scores: { compassion: 2 } },
      { id: 'task',    text: 'Give her a task, so her hands stop shaking', scores: { wisdom: 1, discipline: 1 } },
      { id: 'carry',   text: 'Nothing — you pick her up and keep moving', scores: { resolve: 2 } },
    ],
  },
  {
    id: 'enemy',
    memory: 'A wounded enemy lies where the fight left them, watching you approach. ' +
            'Their weapon is within their reach — and yours.',
    prompt: 'What do you do?',
    options: [
      { id: 'mercy',   text: 'Bind their wounds',                   scores: { compassion: 2 } },
      { id: 'disarm',  text: 'Kick the weapon away and walk on',    scores: { discipline: 1, wisdom: 1 } },
      { id: 'question',text: 'Ask them why they fought',            scores: { curiosity: 2 } },
      { id: 'guard',   text: 'Stand guard until their own find them', scores: { honor: 2 } },
    ],
  },
  {
    id: 'oath',
    memory: 'An oath you swore in better days now binds you to something ' +
            'that no longer deserves it.',
    prompt: 'What is an oath, broken by time?',
    options: [
      { id: 'keep',    text: 'Still an oath. You keep it',          scores: { honor: 2 } },
      { id: 'weigh',   text: 'A question — you weigh who it protects now', scores: { wisdom: 2 } },
      { id: 'remake',  text: 'A seed — you renegotiate it openly',  scores: { humility: 1, honor: 1 } },
      { id: 'burden',  text: 'A burden you carry without complaint', scores: { resolve: 1, discipline: 1 } },
    ],
  },
  {
    id: 'door',
    memory: 'Deep in the ruins, a sealed door hums with something old. ' +
            'Your torch is half spent. No one knows you are here.',
    prompt: 'What do you do?',
    options: [
      { id: 'open',    text: 'Open it. You must know',              scores: { curiosity: 2 } },
      { id: 'mark',    text: 'Mark it, map it, return prepared',    scores: { discipline: 2 } },
      { id: 'listen',  text: 'Sit and listen to the hum until the torch dims', scores: { wisdom: 1, curiosity: 1 } },
      { id: 'leave',   text: 'Some doors are sealed for a reason. Leave', scores: { humility: 2 } },
    ],
  },
  {
    id: 'praise',
    memory: 'The town square fills with cheers for a victory that was ' +
            'mostly yours — and partly another\'s, who stands unnoticed.',
    prompt: 'What do you do?',
    options: [
      { id: 'defer',   text: 'Turn the crowd toward them',          scores: { humility: 2 } },
      { id: 'share',   text: 'Pull them up beside you',             scores: { honor: 1, compassion: 1 } },
      { id: 'accept',  text: 'Accept it — and repay them privately, in full', scores: { discipline: 1, honor: 1 } },
      { id: 'slip',    text: 'Slip away before the speeches',       scores: { humility: 1, curiosity: 1 } },
    ],
  },
];

// ── Archetypes — top-2 virtues pick the soul ─────────────────
export interface FoxArchetype {
  id:        string;
  title:     string;
  virtues:   [Virtue, Virtue];
  nature:    string;   // reveal-card line
  posture:   string;
  traits: {
    earShape:  string;
    faceShape: string;
    tailType:  string;
    build:     string;
    eyeShape:  string;
  };
  personalitySeed: string;
}

export const ARCHETYPES: FoxArchetype[] = [
  {
    id: 'guardian', title: 'Guardian Fox', virtues: ['courage', 'honor'],
    nature: 'Loyal, alert, protective — it stands where you would fall.',
    posture: 'upright_protective',
    traits: { earShape: 'tall', faceShape: 'noble', tailType: 'heavy_brush', build: 'strong', eyeShape: 'focused' },
    personalitySeed: 'protective_steadfast',
  },
  {
    id: 'seeker', title: 'Seeker Fox', virtues: ['curiosity', 'wisdom'],
    nature: 'Curious, nimble, playful — it finds what was never lost.',
    posture: 'low_playful',
    traits: { earShape: 'large_fennec', faceShape: 'keen', tailType: 'long_plume', build: 'lean', eyeShape: 'bright' },
    personalitySeed: 'curious_restless',
  },
  {
    id: 'sage', title: 'Sage Fox', virtues: ['wisdom', 'humility'],
    nature: 'Calm, ancient, observant — it has seen this before, and waits.',
    posture: 'seated_still',
    traits: { earShape: 'swept', faceShape: 'elder', tailType: 'wrapped', build: 'slight', eyeShape: 'half_lidded' },
    personalitySeed: 'calm_observant',
  },
  {
    id: 'ember', title: 'Ember Fox', virtues: ['courage', 'resolve'],
    nature: 'Intense, brave, restless — it burns toward what others flee.',
    posture: 'forward_coiled',
    traits: { earShape: 'pinned', faceShape: 'sharp', tailType: 'flame_brush', build: 'athletic', eyeShape: 'burning' },
    personalitySeed: 'fierce_unyielding',
  },
  {
    id: 'hearth', title: 'Hearth Fox', virtues: ['compassion', 'humility'],
    nature: 'Warm, nurturing, gentle — it keeps the fire you forget to tend.',
    posture: 'curled_open',
    traits: { earShape: 'rounded', faceShape: 'soft', tailType: 'blanket_curl', build: 'plush', eyeShape: 'warm' },
    personalitySeed: 'gentle_present',
  },
  {
    id: 'warden', title: 'Warden Fox', virtues: ['discipline', 'honor'],
    nature: 'Disciplined, still, watchful — nothing passes that it permits.',
    posture: 'sentinel_square',
    traits: { earShape: 'cropped', faceShape: 'stern', tailType: 'banner_straight', build: 'square', eyeShape: 'unblinking' },
    personalitySeed: 'watchful_measured',
  },
];

// ── Customization catalogs (expression only — never the soul) ─
export const FUR_PALETTES = [
  { id: 'ash_white',   label: 'Ash White',   primary: '#E8E4DC', secondary: '#B9B4A8' },
  { id: 'ember_red',   label: 'Ember Red',   primary: '#C8503C', secondary: '#7A2E22' },
  { id: 'dusk_silver', label: 'Dusk Silver', primary: '#ADB3BF', secondary: '#5E6470' },
  { id: 'veil_black',  label: 'Veil Black',  primary: '#2A2C34', secondary: '#111318' },
  { id: 'harvest_gold',label: 'Harvest Gold',primary: '#D9A441', secondary: '#8A6320' },
  { id: 'moss_fawn',   label: 'Moss Fawn',   primary: '#A9915F', secondary: '#5F5638' },
];
export const EYE_COLORS = [
  { id: 'gold',    label: 'Gold',    hex: '#F0B040' },
  { id: 'amber',   label: 'Amber',   hex: '#D97E28' },
  { id: 'veil_blue', label: 'Veil Blue', hex: '#3AC9F2' },
  { id: 'violet',  label: 'Violet',  hex: '#8040C8' },
  { id: 'jade',    label: 'Jade',    hex: '#3FA872' },
  { id: 'moon_gray', label: 'Moon Gray', hex: '#C9CED6' },
];
export const COLLARS = [
  { id: 'none',            label: 'Unadorned' },
  { id: 'braided_leather', label: 'Braided Leather' },
  { id: 'crown_links',     label: 'Crown Links' },
  { id: 'rune_cord',       label: 'Rune Cord' },
];
export const PENDANTS = [
  { id: 'none',         label: 'None' },
  { id: 'veil_crystal', label: 'Veil Crystal' },
  { id: 'fate_diamond', label: 'Fate Diamond' },
  { id: 'old_coin',     label: 'The Old Coin' },
];
export const AURA_COLORS = [
  { id: 'gold',   label: 'Gold',   hex: '#C8900A' },
  { id: 'blue',   label: 'Blue',   hex: '#3AC9F2' },
  { id: 'violet', label: 'Violet', hex: '#8040C8' },
  { id: 'ember',  label: 'Ember',  hex: '#C8503C' },
];

// ── Mythic names — procedural, accepted or renamed at the bond ─
const NAME_HEADS = ['Au', 'Vae', 'Nhy', 'Sae', 'Tha', 'Ky', 'Or', 'Ely', 'Fen', 'Isk'];
const NAME_HEARTS = ['re', 'li', 'ra', 'lo', 'le', 'ri', 'va', 'na', ''];
const NAME_TAILS = ['n', 's', 'th', 'r', 'l', 'is', 'or', 'en'];

export function mythicName(seed: number): string {
  const pick = <T>(arr: T[], n: number) => arr[Math.abs(n) % arr.length];
  return (
    pick(NAME_HEADS, seed) +
    pick(NAME_HEARTS, Math.floor(seed / 10)) +
    pick(NAME_TAILS, Math.floor(seed / 100))
  );
}
