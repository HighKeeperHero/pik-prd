// ============================================================
// LootEngineService — Sprint Loot-A
//
// Implements the Phase 1 Base Item Library and Phase 4 Drop
// Table Families from the Elysendar loot design documents.
//
// This sits ALONGSIDE the existing LootService/LootTable system.
// The existing system continues to work for backward compatibility.
// New veil drops graduate to this engine once seeded.
//
// Phase 2A (ItemPower stats) and Phase 2B (Affixes) are deferred
// until stat display UI is built in Sprint 22+.
// Phase 3 (Class Crystals) deferred until post-40 system (Sprint 22+).
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// ── Phase 2A: Base Power per level band ───────────────────────────────────────
const BASE_POWER: Record<string, number> = {
  T1: 10, T2: 20, T3: 35, T4: 55,
  T5: 80, T6: 110, T7: 150, T8: 200,
};

// ── Phase 2A: Rarity multipliers ─────────────────────────────────────────────
const RARITY_MULTIPLIER: Record<string, number> = {
  common: 1.0, uncommon: 1.15, rare: 1.3,
  'rare+': 1.45, epic: 1.65, legendary: 2.0,
};

// ── Phase 2A: Slot stat budget weights ───────────────────────────────────────
const SLOT_WEIGHT: Record<string, number> = {
  Chest: 0.30, Weapon: 0.25, Legs: 0.20,
  Helm: 0.15, Hands: 0.10, Rune: 0.60, // Rune uses RunePower = IP × 0.60
};

// ── Phase 4: Drop table family definitions ───────────────────────────────────
// category_weights: slot → relative weight (sums to 100)
// rarity_weights:   rarity → relative weight (sums to 100)

export const DROP_TABLE_FAMILIES: Record<string, {
  category_weights: Record<string, number>;
  rarity_weights:   Record<string, number>;
  guaranteed_currency: boolean;
}> = {
  cache_pre40: {
    category_weights: { Helm: 10, Chest: 10, Hands: 10, Legs: 10, Weapon: 16, Rune: 10, Currency: 34 },
    rarity_weights:   { common: 45, uncommon: 30, rare: 17, epic: 6, legendary: 2 },
    guaranteed_currency: false,
  },
  standard_pre40: {
    category_weights: { Helm: 10, Chest: 10, Hands: 12, Legs: 12, Weapon: 18, Rune: 8, Currency: 30 },
    rarity_weights:   { common: 58, uncommon: 27, rare: 11, epic: 3, legendary: 1 },
    guaranteed_currency: false,
  },
  elite_pre40: {
    category_weights: { Helm: 11, Chest: 11, Hands: 11, Legs: 11, Weapon: 20, Rune: 10, Currency: 26 },
    rarity_weights:   { common: 35, uncommon: 34, rare: 20, epic: 7, legendary: 3, artifact: 1 },
    guaranteed_currency: false,
  },
  boss_pre40: {
    category_weights: { Helm: 12, Chest: 12, Hands: 12, Legs: 12, Weapon: 22, Rune: 12, Currency: 18 },
    rarity_weights:   { common: 0, uncommon: 35, rare: 35, epic: 18, legendary: 9, artifact: 3 },
    guaranteed_currency: true,
  },
  quest_pre40: {
    category_weights: { Helm: 14, Chest: 14, Hands: 14, Legs: 14, Weapon: 20, Rune: 0, Currency: 24 },
    rarity_weights:   { common: 0, uncommon: 50, rare: 30, epic: 14, legendary: 5, artifact: 1 },
    guaranteed_currency: false,
  },
};

// ── Phase 4: Map veil cache types to drop families ───────────────────────────
const CACHE_TYPE_TO_FAMILY: Record<string, string> = {
  veil_minor:   'cache_pre40',
  veil_shade:   'cache_pre40',
  veil_dormant: 'elite_pre40',
  veil_double:  'boss_pre40',
  quest_reward: 'quest_pre40',
};

// Minimum rarity floor per cache type
// Must align with DROP_CONFIG rarity intent AND rarity_allowed on T5+ items
// T5+ items don't allow common/uncommon — floors must be rare+ for higher tiers
const CACHE_RARITY_FLOOR: Record<string, string> = {
  veil_minor:   'common',
  veil_shade:   'uncommon',
  veil_dormant: 'rare',
  veil_double:  'epic',
};

// ── Phase 4: Pity thresholds ──────────────────────────────────────────────────
const PITY_CONFIG: Record<string, { threshold: number; bonusPct: number }> = {
  epic_pity:      { threshold: 15, bonusPct: 5  },
  legendary_pity: { threshold: 25, bonusPct: 3  },
};

// ── Phase 1: Full Base Item Library ──────────────────────────────────────────
// 8 level bands × 6 slots = 48 base items
// Region themes: Wylds, Kingvale, Lochmaw, Origin Sands, Desolate Peaks, Veil

export const BASE_ITEM_LIBRARY = [
  // ── HELMS ─────────────────────────────────────────────────────────────────
  { id:'HLM_001', name:'Ashworn Cap',         slot:'Helm',   level_min:1,  level_max:5,  level_band:'T1', region_theme:'Wylds',          item_family:'Light Helm',  rarity_allowed:['common','uncommon','rare'],                   pre40_only:true,  lore_tags:['frontier','starter'] },
  { id:'HLM_002', name:'Valeguard Coif',      slot:'Helm',   level_min:6,  level_max:10, level_band:'T2', region_theme:'Kingvale',       item_family:'Medium Helm', rarity_allowed:['common','uncommon','rare','rare+'],           pre40_only:true,  lore_tags:['militia','order'] },
  { id:'HLM_003', name:'Mirewatch Hood',      slot:'Helm',   level_min:11, level_max:15, level_band:'T3', region_theme:'Lochmaw',        item_family:'Light Helm',  rarity_allowed:['uncommon','rare','rare+'],                    pre40_only:true,  lore_tags:['fog','scout'] },
  { id:'HLM_004', name:'Sandveil Cowl',       slot:'Helm',   level_min:16, level_max:20, level_band:'T4', region_theme:'Origin Sands',   item_family:'Cloth Helm',  rarity_allowed:['uncommon','rare','rare+'],                    pre40_only:true,  lore_tags:['desert','arcane'] },
  { id:'HLM_005', name:'Ironbriar Helm',      slot:'Helm',   level_min:21, level_max:25, level_band:'T5', region_theme:'Wylds',          item_family:'Heavy Helm',  rarity_allowed:['rare','rare+','epic'],                        pre40_only:true,  lore_tags:['thorn','hunt'] },
  { id:'HLM_006', name:'Embercrest Visor',    slot:'Helm',   level_min:26, level_max:30, level_band:'T6', region_theme:'Kingvale',       item_family:'Heavy Helm',  rarity_allowed:['rare','rare+','epic'],                        pre40_only:true,  lore_tags:['forge','discipline'] },
  { id:'HLM_007', name:'Frostvein Greathelm', slot:'Helm',   level_min:31, level_max:35, level_band:'T7', region_theme:'Desolate Peaks', item_family:'Heavy Helm',  rarity_allowed:['rare+','epic','legendary'],                   pre40_only:true,  lore_tags:['frost','endurance'] },
  { id:'HLM_008', name:'Veilmarked Crownhelm',slot:'Helm',   level_min:36, level_max:40, level_band:'T8', region_theme:'Veil',           item_family:'Hybrid Helm', rarity_allowed:['epic','legendary'],                           pre40_only:true,  lore_tags:['veil','prisming'] },
  // ── CHEST ─────────────────────────────────────────────────────────────────
  { id:'CHT_001', name:"Wayfarer's Jerkin",    slot:'Chest',  level_min:1,  level_max:5,  level_band:'T1', region_theme:'Wylds',          item_family:'Light Chest', rarity_allowed:['common','uncommon','rare'],                   pre40_only:true,  lore_tags:['travel','light'] },
  { id:'CHT_002', name:'Oathstitched Brigandine',slot:'Chest',level_min:6,  level_max:10, level_band:'T2', region_theme:'Kingvale',       item_family:'Medium Chest',rarity_allowed:['common','uncommon','rare','rare+'],           pre40_only:true,  lore_tags:['order','stitched'] },
  { id:'CHT_003', name:'Fenrunner Coat',        slot:'Chest',  level_min:11, level_max:15, level_band:'T3', region_theme:'Lochmaw',       item_family:'Light Chest', rarity_allowed:['uncommon','rare','rare+'],                    pre40_only:true,  lore_tags:['fen','runner'] },
  { id:'CHT_004', name:'Sunscoured Vestments',  slot:'Chest',  level_min:16, level_max:20, level_band:'T4', region_theme:'Origin Sands',  item_family:'Cloth Chest', rarity_allowed:['uncommon','rare','rare+'],                    pre40_only:true,  lore_tags:['sun','relic'] },
  { id:'CHT_005', name:'Thornhide Cuirass',     slot:'Chest',  level_min:21, level_max:25, level_band:'T5', region_theme:'Wylds',         item_family:'Heavy Chest', rarity_allowed:['rare','rare+','epic'],                        pre40_only:true,  lore_tags:['thorn','hunt'] },
  { id:'CHT_006', name:'Emberplate Harness',    slot:'Chest',  level_min:26, level_max:30, level_band:'T6', region_theme:'Kingvale',      item_family:'Heavy Chest', rarity_allowed:['rare','rare+','epic'],                        pre40_only:true,  lore_tags:['ember','forge'] },
  { id:'CHT_007', name:'Wyrmback Hauberk',      slot:'Chest',  level_min:31, level_max:35, level_band:'T7', region_theme:'Desolate Peaks',item_family:'Heavy Chest', rarity_allowed:['rare+','epic','legendary'],                   pre40_only:true,  lore_tags:['wyrm','peak'] },
  { id:'CHT_008', name:'Prismbound Raiment',    slot:'Chest',  level_min:36, level_max:40, level_band:'T8', region_theme:'Veil',          item_family:'Hybrid Chest',rarity_allowed:['epic','legendary'],                           pre40_only:true,  lore_tags:['veil','prism'] },
  // ── HANDS ─────────────────────────────────────────────────────────────────
  { id:'HND_001', name:'Dustgrip Wraps',        slot:'Hands',  level_min:1,  level_max:5,  level_band:'T1', region_theme:'Wylds',          item_family:'Light Hands', rarity_allowed:['common','uncommon','rare'],                  pre40_only:true,  lore_tags:['grip','dust'] },
  { id:'HND_002', name:"Watchman's Grips",      slot:'Hands',  level_min:6,  level_max:10, level_band:'T2', region_theme:'Kingvale',       item_family:'Medium Hands',rarity_allowed:['common','uncommon','rare','rare+'],          pre40_only:true,  lore_tags:['watch','guard'] },
  { id:'HND_003', name:'Boghide Gloves',         slot:'Hands',  level_min:11, level_max:15, level_band:'T3', region_theme:'Lochmaw',       item_family:'Light Hands', rarity_allowed:['uncommon','rare','rare+'],                   pre40_only:true,  lore_tags:['bog','hide'] },
  { id:'HND_004', name:'Sunthread Bindings',     slot:'Hands',  level_min:16, level_max:20, level_band:'T4', region_theme:'Origin Sands',  item_family:'Cloth Hands', rarity_allowed:['uncommon','rare','rare+'],                   pre40_only:true,  lore_tags:['sun','thread'] },
  { id:'HND_005', name:'Briarhide Gauntlets',    slot:'Hands',  level_min:21, level_max:25, level_band:'T5', region_theme:'Wylds',         item_family:'Heavy Hands', rarity_allowed:['rare','rare+','epic'],                       pre40_only:true,  lore_tags:['briar','hunt'] },
  { id:'HND_006', name:'Forgewake Gauntlets',    slot:'Hands',  level_min:26, level_max:30, level_band:'T6', region_theme:'Kingvale',      item_family:'Heavy Hands', rarity_allowed:['rare','rare+','epic'],                       pre40_only:true,  lore_tags:['forge','wake'] },
  { id:'HND_007', name:'Rimeshield Graspers',    slot:'Hands',  level_min:31, level_max:35, level_band:'T7', region_theme:'Desolate Peaks',item_family:'Heavy Hands', rarity_allowed:['rare+','epic','legendary'],                  pre40_only:true,  lore_tags:['rime','ice'] },
  { id:'HND_008', name:'Veiltouch Gauntlets',    slot:'Hands',  level_min:36, level_max:40, level_band:'T8', region_theme:'Veil',          item_family:'Hybrid Hands',rarity_allowed:['epic','legendary'],                          pre40_only:true,  lore_tags:['veil','touch'] },
  // ── LEGS ──────────────────────────────────────────────────────────────────
  { id:'LGS_001', name:'Trailworn Trousers',     slot:'Legs',   level_min:1,  level_max:5,  level_band:'T1', region_theme:'Wylds',          item_family:'Light Legs',  rarity_allowed:['common','uncommon','rare'],                 pre40_only:true,  lore_tags:['trail','travel'] },
  { id:'LGS_002', name:'Bastion Greaves',         slot:'Legs',   level_min:6,  level_max:10, level_band:'T2', region_theme:'Kingvale',      item_family:'Medium Legs', rarity_allowed:['common','uncommon','rare','rare+'],         pre40_only:true,  lore_tags:['bastion','order'] },
  { id:'LGS_003', name:'Tidemuck Legwraps',       slot:'Legs',   level_min:11, level_max:15, level_band:'T3', region_theme:'Lochmaw',       item_family:'Light Legs',  rarity_allowed:['uncommon','rare','rare+'],                  pre40_only:true,  lore_tags:['tide','muck'] },
  { id:'LGS_004', name:'Dunebound Leggings',      slot:'Legs',   level_min:16, level_max:20, level_band:'T4', region_theme:'Origin Sands',  item_family:'Cloth Legs',  rarity_allowed:['uncommon','rare','rare+'],                  pre40_only:true,  lore_tags:['dune','bound'] },
  { id:'LGS_005', name:'Brackenhide Chausses',    slot:'Legs',   level_min:21, level_max:25, level_band:'T5', region_theme:'Wylds',         item_family:'Heavy Legs',  rarity_allowed:['rare','rare+','epic'],                      pre40_only:true,  lore_tags:['bracken','hunt'] },
  { id:'LGS_006', name:'Cinderstep Greaves',      slot:'Legs',   level_min:26, level_max:30, level_band:'T6', region_theme:'Kingvale',      item_family:'Heavy Legs',  rarity_allowed:['rare','rare+','epic'],                      pre40_only:true,  lore_tags:['cinder','step'] },
  { id:'LGS_007', name:'Icefang Legplates',       slot:'Legs',   level_min:31, level_max:35, level_band:'T7', region_theme:'Desolate Peaks',item_family:'Heavy Legs',  rarity_allowed:['rare+','epic','legendary'],                 pre40_only:true,  lore_tags:['ice','fang'] },
  { id:'LGS_008', name:'Veilstride Legguards',    slot:'Legs',   level_min:36, level_max:40, level_band:'T8', region_theme:'Veil',          item_family:'Hybrid Legs', rarity_allowed:['epic','legendary'],                         pre40_only:true,  lore_tags:['veil','stride'] },
  // ── WEAPONS ───────────────────────────────────────────────────────────────
  { id:'WPN_001', name:'Ashwood Short Blade',     slot:'Weapon', level_min:1,  level_max:5,  level_band:'T1', region_theme:'Wylds',          item_family:'Sword',       rarity_allowed:['common','uncommon','rare'],                 pre40_only:true,  lore_tags:['starter','blade'] },
  { id:'WPN_002', name:'Kingvale Militia Sword',  slot:'Weapon', level_min:1,  level_max:5,  level_band:'T1', region_theme:'Kingvale',       item_family:'Sword',       rarity_allowed:['common','uncommon','rare'],                 pre40_only:true,  lore_tags:['militia','iron'] },
  { id:'WPN_003', name:'Bog Cleaver',              slot:'Weapon', level_min:6,  level_max:10, level_band:'T2', region_theme:'Lochmaw',       item_family:'Axe',         rarity_allowed:['common','uncommon','rare','rare+'],         pre40_only:true,  lore_tags:['bog','heavy'] },
  { id:'WPN_004', name:'Oathbrand Longsword',      slot:'Weapon', level_min:6,  level_max:10, level_band:'T2', region_theme:'Kingvale',      item_family:'Sword',       rarity_allowed:['uncommon','rare','rare+'],                  pre40_only:true,  lore_tags:['oath','order'] },
  { id:'WPN_005', name:'Sandsinger Staff',          slot:'Weapon', level_min:11, level_max:15, level_band:'T3', region_theme:'Origin Sands',  item_family:'Staff',       rarity_allowed:['uncommon','rare','rare+'],                  pre40_only:true,  lore_tags:['sand','arcane'] },
  { id:'WPN_006', name:'Fenwatch Crossbow',         slot:'Weapon', level_min:11, level_max:15, level_band:'T3', region_theme:'Lochmaw',       item_family:'Bow',         rarity_allowed:['uncommon','rare','rare+'],                  pre40_only:true,  lore_tags:['fen','precision'] },
  { id:'WPN_007', name:'Thornrend Dagger Pair',     slot:'Weapon', level_min:16, level_max:20, level_band:'T4', region_theme:'Wylds',         item_family:'Dagger',      rarity_allowed:['uncommon','rare','rare+'],                  pre40_only:true,  lore_tags:['thorn','dual'] },
  { id:'WPN_008', name:'Dustfire Mace',             slot:'Weapon', level_min:16, level_max:20, level_band:'T4', region_theme:'Origin Sands',  item_family:'Mace',        rarity_allowed:['uncommon','rare','rare+'],                  pre40_only:true,  lore_tags:['dust','fire'] },
  { id:'WPN_009', name:'Ironvale Greatblade',       slot:'Weapon', level_min:21, level_max:25, level_band:'T5', region_theme:'Kingvale',      item_family:'Sword',       rarity_allowed:['rare','rare+','epic'],                      pre40_only:true,  lore_tags:['martial','heavy'] },
  { id:'WPN_010', name:'Briar Recurve',             slot:'Weapon', level_min:21, level_max:25, level_band:'T5', region_theme:'Wylds',         item_family:'Bow',         rarity_allowed:['rare','rare+','epic'],                      pre40_only:true,  lore_tags:['briar','hunt'] },
  { id:'WPN_011', name:'Emberstrike Warhammer',     slot:'Weapon', level_min:26, level_max:30, level_band:'T6', region_theme:'Kingvale',      item_family:'Mace',        rarity_allowed:['rare','rare+','epic'],                      pre40_only:true,  lore_tags:['ember','strike'] },
  { id:'WPN_012', name:'Riftbone Polearm',          slot:'Weapon', level_min:26, level_max:30, level_band:'T6', region_theme:'Veil',          item_family:'Polearm',     rarity_allowed:['rare','rare+','epic'],                      pre40_only:true,  lore_tags:['rift','bone'] },
  { id:'WPN_013', name:'Frostfang War Axe',         slot:'Weapon', level_min:31, level_max:35, level_band:'T7', region_theme:'Desolate Peaks',item_family:'Axe',         rarity_allowed:['rare+','epic','legendary'],                 pre40_only:true,  lore_tags:['frost','brutal'] },
  { id:'WPN_014', name:'Veilsever Blade',           slot:'Weapon', level_min:31, level_max:35, level_band:'T7', region_theme:'Veil',          item_family:'Sword',       rarity_allowed:['rare+','epic','legendary'],                 pre40_only:true,  lore_tags:['veil','sever'] },
  { id:'WPN_015', name:'Prismcaller Focus',         slot:'Weapon', level_min:36, level_max:40, level_band:'T8', region_theme:'Veil',          item_family:'Focus',       rarity_allowed:['epic','legendary'],                         pre40_only:true,  lore_tags:['prism','arcane'] },
  { id:'WPN_016', name:'Shattersong Greataxe',      slot:'Weapon', level_min:36, level_max:40, level_band:'T8', region_theme:'Desolate Peaks',item_family:'Axe',         rarity_allowed:['epic','legendary'],                         pre40_only:true,  lore_tags:['shatter','peak'] },
  // ── RUNE SIGILS (pre-40 only) ─────────────────────────────────────────────
  { id:'RUN_001', name:'Faded Border Sigil',        slot:'Rune',   level_min:1,  level_max:5,  level_band:'T1', region_theme:'Wylds',          item_family:'Rune Sigil',  rarity_allowed:['common','uncommon'],                       pre40_only:true,  lore_tags:['faint','starter'] },
  { id:'RUN_002', name:'Sigil of the Ordered Gate', slot:'Rune',   level_min:6,  level_max:10, level_band:'T2', region_theme:'Kingvale',       item_family:'Rune Sigil',  rarity_allowed:['common','uncommon','rare'],                 pre40_only:true,  lore_tags:['order','gate'] },
  { id:'RUN_003', name:'Drowned Mark',               slot:'Rune',   level_min:11, level_max:15, level_band:'T3', region_theme:'Lochmaw',       item_family:'Rune Sigil',  rarity_allowed:['uncommon','rare','rare+'],                  pre40_only:true,  lore_tags:['drowned','mark'] },
  { id:'RUN_004', name:'Suncarved Seal',             slot:'Rune',   level_min:16, level_max:20, level_band:'T4', region_theme:'Origin Sands',  item_family:'Rune Sigil',  rarity_allowed:['uncommon','rare','rare+'],                  pre40_only:true,  lore_tags:['sun','seal'] },
  { id:'RUN_005', name:'Sigil of Gale Thread',       slot:'Rune',   level_min:21, level_max:25, level_band:'T5', region_theme:'Wylds',         item_family:'Rune Sigil',  rarity_allowed:['uncommon','rare','rare+','epic'],            pre40_only:true,  lore_tags:['speed','flow'] },
  { id:'RUN_006', name:'Forgemark Brand',             slot:'Rune',   level_min:26, level_max:30, level_band:'T6', region_theme:'Kingvale',      item_family:'Rune Sigil',  rarity_allowed:['rare','rare+','epic'],                      pre40_only:true,  lore_tags:['forge','brand'] },
  { id:'RUN_007', name:'Rimecalm Sigil',              slot:'Rune',   level_min:31, level_max:35, level_band:'T7', region_theme:'Desolate Peaks',item_family:'Rune Sigil',  rarity_allowed:['rare+','epic','legendary'],                 pre40_only:true,  lore_tags:['frost','calm'] },
  { id:'RUN_008', name:'Prisming Seal',               slot:'Rune',   level_min:36, level_max:40, level_band:'T8', region_theme:'Veil',          item_family:'Rune Sigil',  rarity_allowed:['epic','legendary'],                         pre40_only:true,  lore_tags:['veil','prisming'] },
];

// ── Phase 4: Tier label from hero level ──────────────────────────────────────
function getTierForLevel(level: number): string {
  if (level <= 5)  return 'T1';
  if (level <= 10) return 'T2';
  if (level <= 15) return 'T3';
  if (level <= 20) return 'T4';
  if (level <= 25) return 'T5';
  if (level <= 30) return 'T6';
  if (level <= 35) return 'T7';
  return 'T8';
}

// ── Weighted random roll ──────────────────────────────────────────────────────
function weightedRoll<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function rollFromWeights(weights: Record<string, number>): string {
  const entries = Object.entries(weights);
  return weightedRoll(entries.map(([key, weight]) => ({ key, weight }))).key;
}

// ── Apply rarity floor ────────────────────────────────────────────────────────
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'rare+', 'epic', 'legendary', 'artifact'];
function applyRarityFloor(rolled: string, floor: string): string {
  const rolledIdx = RARITY_ORDER.indexOf(rolled);
  const floorIdx  = RARITY_ORDER.indexOf(floor);
  return rolledIdx >= floorIdx ? rolled : floor;
}

@Injectable()
export class LootEngineService {
  private readonly logger = new Logger(LootEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Seed Phase 1 base items ───────────────────────────────────────────────
  // Now writes to base_items table via Prisma (schema updated in Sprint B).
  // Idempotent — uses upsert, safe to run multiple times.
  async seedBaseItems(): Promise<{ seeded: number; skipped: number }> {
    let seeded = 0;
    let skipped = 0;
    for (const item of BASE_ITEM_LIBRARY) {
      try {
        const result = await this.prisma.baseItem.upsert({
          where:  { id: item.id },
          create: {
            id:           item.id,
            name:         item.name,
            slot:         item.slot,
            levelMin:     item.level_min,
            levelMax:     item.level_max,
            levelBand:    item.level_band,
            regionTheme:  item.region_theme,
            itemFamily:   item.item_family,
            rarityAllowed: item.rarity_allowed,
            pre40Only:    item.pre40_only,
            loreTags:     item.lore_tags,
          },
          update: {
            name:         item.name,
            regionTheme:  item.region_theme,
            loreTags:     item.lore_tags,
          },
        });
        seeded++;
      } catch (err) {
        this.logger.warn(`Seed skip ${item.id}: ${(err as any).message}`);
        skipped++;
      }
    }
    this.logger.log(`Base item seed: ${seeded} upserted, ${skipped} failed`);
    return { seeded, skipped };
  }

  // ── Debug: get base item counts by band ──────────────────────────────────
  async debugBaseItems() {
    const byBand: Record<string, number> = {};
    const bySlot: Record<string, number> = {};
    for (const item of BASE_ITEM_LIBRARY) {
      byBand[item.level_band] = (byBand[item.level_band] ?? 0) + 1;
      bySlot[item.slot]       = (bySlot[item.slot]       ?? 0) + 1;
    }
    return {
      total: BASE_ITEM_LIBRARY.length,
      by_band: byBand,
      by_slot: bySlot,
      families: Object.keys(DROP_TABLE_FAMILIES),
    };
  }

  // ── Phase 4: Roll a reward from a drop table family ───────────────────────
  async rollFromFamily(params: {
    rootId:        string;
    cacheType:     string;
    heroLevel:     number;
    regionHint?:   string;  // optional — biases region weighting
  }): Promise<{
    slot:         string;
    rarity:       string;
    region_theme: string;
    level_band:   string;
    base_item_id: string;
    base_item_name: string;
    item_power:   number;
    slot_budget:  number;
  } | null> {
    const { rootId, cacheType, heroLevel, regionHint } = params;

    const familyKey = CACHE_TYPE_TO_FAMILY[cacheType] ?? 'cache_pre40';
    const family    = DROP_TABLE_FAMILIES[familyKey];
    if (!family) return null;

    const tier = getTierForLevel(heroLevel);

    // Step 1 — Roll category (slot)
    const rawSlot = rollFromWeights(family.category_weights);
    if (rawSlot === 'Currency') {
      // Currency/crafting drop — not a base item roll
      return null;
    }

    // Step 2 — Roll rarity with pity
    let rarityWeights = { ...family.rarity_weights };
    rarityWeights = await this._applyPity(rootId, rarityWeights);

    let rarity = rollFromWeights(rarityWeights);

    // Step 3 — Apply rarity floor for this cache type
    const floor = CACHE_RARITY_FLOOR[cacheType] ?? 'common';
    rarity = applyRarityFloor(rarity, floor);

    // Step 4 — Roll region theme
    const region = this._rollRegion(regionHint);

    // Step 5 — Select base item (prefer region match, fallback to any in tier+slot)
    const candidates = BASE_ITEM_LIBRARY.filter(item =>
      item.slot === rawSlot &&
      item.level_band === tier &&
      item.rarity_allowed.includes(rarity as any)
    );

    // Region preference — try to match, fall back to any candidate
    const regionMatch = candidates.filter(i => i.region_theme === region);
    const pool = regionMatch.length > 0 ? regionMatch : candidates;

    // If still no candidates, loosen tier restriction — allow adjacent bands
    const finalPool = pool.length > 0 ? pool :
      BASE_ITEM_LIBRARY.filter(i => i.slot === rawSlot);

    if (finalPool.length === 0) return null;

    const selected = finalPool[Math.floor(Math.random() * finalPool.length)];

    // Step 6 — Calculate ItemPower (Phase 2A — compute, not yet surfaced in UI)
    const basePower  = BASE_POWER[selected.level_band] ?? BASE_POWER.T1;
    const rarityMult = RARITY_MULTIPLIER[rarity] ?? 1.0;
    const itemPower  = Math.round(basePower * rarityMult);
    const slotBudget = Math.round(itemPower * (SLOT_WEIGHT[rawSlot] ?? 0.15));

    // Step 7 — Update pity counters (reset on epic/legendary, increment otherwise)
    await this._updatePity(rootId, rarity);

    this.logger.log(
      `LootEngine roll: ${cacheType} (${familyKey}) → ${rawSlot} ${rarity} ${selected.name} [IP:${itemPower}]`
    );

    return {
      slot:            rawSlot,
      rarity,
      region_theme:    selected.region_theme,
      level_band:      selected.level_band,
      base_item_id:    selected.id,
      base_item_name:  selected.name,
      item_power:      itemPower,
      slot_budget:     slotBudget,
    };
  }

  // ── Region weighting ──────────────────────────────────────────────────────
  private _rollRegion(hint?: string): string {
    const regions = ['Wylds', 'Kingvale', 'Lochmaw', 'Origin Sands', 'Desolate Peaks', 'Veil'];
    if (hint && regions.includes(hint)) {
      // 60% chance to get the hinted region
      if (Math.random() < 0.6) return hint;
    }
    return regions[Math.floor(Math.random() * regions.length)];
  }

  // ── Pity counter management ───────────────────────────────────────────────
  private async _applyPity(
    rootId: string,
    weights: Record<string, number>,
  ): Promise<Record<string, number>> {
    try {
      const counters = await this.prisma.pityCounter.findMany({
        where: { rootId },
      }) ?? [];

      const result = { ...weights };

      for (const counter of counters) {
        const config = PITY_CONFIG[counter.pityType];
        if (!config) continue;
        if (counter.counter >= config.threshold) {
          if (counter.pityType === 'epic_pity'      && 'epic'      in result) result['epic']      += config.bonusPct;
          if (counter.pityType === 'legendary_pity' && 'legendary' in result) result['legendary'] += config.bonusPct;
        }
      }

      return result;
    } catch {
      return weights;
    }
  }

  private async _updatePity(rootId: string, rarity: string): Promise<void> {
    // Pity is non-critical — never let a pity failure break a cache open
    try {
      const isEpicPlus = rarity === 'epic' || rarity === 'legendary' || rarity === 'artifact';
      const isLegPlus  = rarity === 'legendary' || rarity === 'artifact';

      // epic_pity: reset on epic+, increment otherwise
      await this.prisma.pityCounter.upsert({
        where:  { rootId_pityType: { rootId, pityType: 'epic_pity' } },
        create: { rootId, pityType: 'epic_pity', counter: isEpicPlus ? 0 : 1 },
        update: { counter: isEpicPlus ? 0 : { increment: 1 } },
      });

      // legendary_pity: reset on legendary+, increment otherwise
      await this.prisma.pityCounter.upsert({
        where:  { rootId_pityType: { rootId, pityType: 'legendary_pity' } },
        create: { rootId, pityType: 'legendary_pity', counter: isLegPlus ? 0 : 1 },
        update: { counter: isLegPlus ? 0 : { increment: 1 } },
      });
    } catch (err) {
      this.logger.warn(`Pity counter update failed (non-critical): ${(err as any).message}`);
    }
  }
}
