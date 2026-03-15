// ============================================================
// PIK — Loot Service (Sprint 6)
//
// Fate Cache system: grant sealed caches on progression
// milestones, open them with weighted random rolls from
// the LootTable, and apply rewards to the player identity.
//
// Place at: src/loot/loot.service.ts
// ============================================================

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';
import { SseService } from '../sse/sse.service';
import { GearService } from '../gear/gear.service';

/** Cache rarity determines the visual treatment and drop pool weighting */
const CACHE_RARITIES: Record<string, { minLevel: number; label: string }> = {
  common:    { minLevel: 1,  label: 'Fate Cache' },
  uncommon:  { minLevel: 2,  label: 'Gleaming Fate Cache' },
  rare:      { minLevel: 4,  label: 'Radiant Fate Cache' },
  epic:      { minLevel: 7,  label: 'Mythic Fate Cache' },
  legendary: { minLevel: 10, label: 'Legendary Fate Cache' },
};

/** Determine cache rarity based on player level and trigger type */
function determineCacheRarity(level: number, trigger: string): string {
  // Boss kills with high damage get rarity bumps
  const isBoss = trigger.startsWith('boss_kill');
  const bossPct = isBoss ? parseInt(trigger.split(':')[1] || '0') : 0;

  // Weighted roll for rarity
  const roll = Math.random() * 100;

  if (level >= 10 && bossPct >= 100 && roll < 5)  return 'legendary';
  if (level >= 7  && bossPct >= 75  && roll < 12)  return 'epic';
  if (level >= 4  && roll < 20)                     return 'rare';
  if (level >= 2  && roll < 45)                     return 'uncommon';
  return 'common';
}

@Injectable()
export class LootService {
  private readonly logger = new Logger(LootService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly sse: SseService,
    private readonly gear: GearService,
  ) {}

  // ── DEBUG ────────────────────────────────────────────────────────────────────

  async debugLootTable() {
    const [lootRows, gearItems] = await Promise.all([
      this.prisma.lootTable.findMany({
        select: { cacheType: true, rewardType: true, rewardValue: true, displayName: true, rarityTier: true, weight: true },
        orderBy: [{ cacheType: 'asc' }, { rewardType: 'asc' }],
      }),
      this.prisma.gearItem.findMany({
        select: { id: true, name: true, slot: true, rarityTier: true, minLevel: true },
        orderBy: [{ rarityTier: 'asc' }, { slot: 'asc' }],
      }),
    ]);
    const byRewardType: Record<string, number> = {};
    for (const r of lootRows) {
      byRewardType[r.rewardType] = (byRewardType[r.rewardType] ?? 0) + 1;
    }
    const gearInLootTable = lootRows.filter(r => r.rewardType === 'gear');
    const gearIdsInTable  = new Set(gearInLootTable.map(r => r.rewardValue));
    const gearNotInTable  = gearItems.filter(g => !gearIdsInTable.has(g.id));
    return {
      loot_table_total_rows:        lootRows.length,
      by_reward_type:               byRewardType,
      gear_items_in_db:             gearItems.length,
      gear_entries_in_loot_table:   gearInLootTable.length,
      gear_items_NOT_in_loot_table: gearNotInTable,
      gear_loot_entries:            gearInLootTable,
    };
  }

  async patchMinLevels() {
    const RARITY_MIN: Record<string, number> = {
      common: 1, uncommon: 7, rare: 14, epic: 22, legendary: 30,
    };
    const results: Record<string, number> = {};
    for (const [rarityTier, minLevel] of Object.entries(RARITY_MIN)) {
      const updated = await this.prisma.lootTable.updateMany({
        where: { rarityTier },
        data:  { minLevel },
      });
      results[rarityTier] = updated.count;
    }
    this.logger.log(`MinLevel patch: ${JSON.stringify(results)}`);
    return { patched: results };
  }

  async seedVeilLoot() {
    const entries = [
      { cacheType: 'veil_minor', rewardType: 'gear', rewardValue: 'weapon_rusted_blade',      displayName: 'Rusted Blade',           rarityTier: 'common',   weight: 40, minLevel: 1 },
      { cacheType: 'veil_minor', rewardType: 'gear', rewardValue: 'helm_leather_cap',         displayName: 'Leather Cap',            rarityTier: 'common',   weight: 40, minLevel: 1 },
      { cacheType: 'veil_minor', rewardType: 'gear', rewardValue: 'helm_iron_visor',          displayName: 'Iron Visor',             rarityTier: 'common',   weight: 35, minLevel: 1 },
      { cacheType: 'veil_minor', rewardType: 'gear', rewardValue: 'chest_hide_vest',          displayName: 'Hide Vest',              rarityTier: 'common',   weight: 40, minLevel: 1 },
      { cacheType: 'veil_minor', rewardType: 'gear', rewardValue: 'arms_leather_wraps',       displayName: 'Leather Wraps',          rarityTier: 'common',   weight: 40, minLevel: 1 },
      { cacheType: 'veil_minor', rewardType: 'gear', rewardValue: 'legs_travel_boots',        displayName: 'Travel Boots',           rarityTier: 'common',   weight: 40, minLevel: 1 },
      { cacheType: 'veil_minor', rewardType: 'gear', rewardValue: 'rune_faded_glyph',         displayName: 'Faded Glyph',            rarityTier: 'common',   weight: 40, minLevel: 1 },
      { cacheType: 'veil_shade', rewardType: 'gear', rewardValue: 'weapon_rusted_blade',      displayName: 'Rusted Blade',           rarityTier: 'common',   weight: 30, minLevel: 1 },
      { cacheType: 'veil_shade', rewardType: 'gear', rewardValue: 'helm_iron_visor',          displayName: 'Iron Visor',             rarityTier: 'common',   weight: 25, minLevel: 1 },
      { cacheType: 'veil_shade', rewardType: 'gear', rewardValue: 'chest_hide_vest',          displayName: 'Hide Vest',              rarityTier: 'common',   weight: 30, minLevel: 1 },
      { cacheType: 'veil_shade', rewardType: 'gear', rewardValue: 'weapon_ashbrand',          displayName: 'Ashbrand',               rarityTier: 'uncommon', weight: 25, minLevel: 7 },
      { cacheType: 'veil_shade', rewardType: 'gear', rewardValue: 'helm_seekers_circlet',     displayName: "Seeker's Circlet",       rarityTier: 'uncommon', weight: 25, minLevel: 7 },
      { cacheType: 'veil_shade', rewardType: 'gear', rewardValue: 'rune_ember_sigil',         displayName: 'Ember Sigil',            rarityTier: 'uncommon', weight: 25, minLevel: 7 },
      { cacheType: 'veil_shade', rewardType: 'gear', rewardValue: 'legs_windstride_greaves',  displayName: 'Windstride Greaves',     rarityTier: 'uncommon', weight: 25, minLevel: 7 },
      { cacheType: 'veil_shade', rewardType: 'gear', rewardValue: 'arms_singing_stone_wraps', displayName: 'Singing Stone Wraps',    rarityTier: 'uncommon', weight: 20, minLevel: 7 },
      { cacheType: 'veil_shade', rewardType: 'gear', rewardValue: 'chest_ashcloak',           displayName: 'Ashcloak',               rarityTier: 'uncommon', weight: 20, minLevel: 7 },
      { cacheType: 'veil_shade', rewardType: 'gear', rewardValue: 'legs_wasteland_wrappings', displayName: 'Wasteland Wrappings',    rarityTier: 'uncommon', weight: 20, minLevel: 7 },
      { cacheType: 'veil_shade', rewardType: 'gear', rewardValue: 'rune_echo_stone',          displayName: 'Echo Stone',             rarityTier: 'uncommon', weight: 20, minLevel: 7 },
      { cacheType: 'veil_dormant', rewardType: 'gear', rewardValue: 'weapon_ashbrand',           displayName: 'Ashbrand',               rarityTier: 'uncommon', weight: 20, minLevel: 7 },
      { cacheType: 'veil_dormant', rewardType: 'gear', rewardValue: 'arms_singing_stone_wraps',  displayName: 'Singing Stone Wraps',    rarityTier: 'uncommon', weight: 18, minLevel: 7 },
      { cacheType: 'veil_dormant', rewardType: 'gear', rewardValue: 'chest_ashcloak',            displayName: 'Ashcloak',               rarityTier: 'uncommon', weight: 18, minLevel: 7 },
      { cacheType: 'veil_dormant', rewardType: 'gear', rewardValue: 'weapon_bonereaper',         displayName: 'Bonereaper',             rarityTier: 'rare',     weight: 15, minLevel: 14 },
      { cacheType: 'veil_dormant', rewardType: 'gear', rewardValue: 'arms_bone_garden_bracers',  displayName: 'Bone Garden Bracers',    rarityTier: 'rare',     weight: 15, minLevel: 14 },
      { cacheType: 'veil_dormant', rewardType: 'gear', rewardValue: 'chest_stormguard',          displayName: 'Stormguard Cuirass',     rarityTier: 'rare',     weight: 15, minLevel: 14 },
      { cacheType: 'veil_dormant', rewardType: 'gear', rewardValue: 'helm_wardens_gaze',         displayName: "Warden's Gaze",          rarityTier: 'rare',     weight: 15, minLevel: 14 },
      { cacheType: 'veil_dormant', rewardType: 'gear', rewardValue: 'legs_deeproad_sabatons',    displayName: 'Deep Road Sabatons',     rarityTier: 'rare',     weight: 15, minLevel: 14 },
      { cacheType: 'veil_dormant', rewardType: 'gear', rewardValue: 'rune_threshold_mark',       displayName: 'Threshold Mark',         rarityTier: 'rare',     weight: 12, minLevel: 14 },
      { cacheType: 'veil_dormant', rewardType: 'gear', rewardValue: 'rune_shattered_stars',      displayName: 'Rune of Shattered Stars', rarityTier: 'rare',    weight: 10, minLevel: 14 },
      { cacheType: 'veil_double',  rewardType: 'gear', rewardValue: 'weapon_bonereaper',         displayName: 'Bonereaper',             rarityTier: 'rare',     weight: 20, minLevel: 14 },
      { cacheType: 'veil_double',  rewardType: 'gear', rewardValue: 'chest_stormguard',          displayName: 'Stormguard Cuirass',     rarityTier: 'rare',     weight: 20, minLevel: 14 },
      { cacheType: 'veil_double',  rewardType: 'gear', rewardValue: 'helm_wardens_gaze',         displayName: "Warden's Gaze",          rarityTier: 'rare',     weight: 20, minLevel: 14 },
      { cacheType: 'veil_double',  rewardType: 'gear', rewardValue: 'legs_deeproad_sabatons',    displayName: 'Deep Road Sabatons',     rarityTier: 'rare',     weight: 20, minLevel: 14 },
      { cacheType: 'veil_double',  rewardType: 'gear', rewardValue: 'rune_threshold_mark',       displayName: 'Threshold Mark',         rarityTier: 'rare',     weight: 18, minLevel: 14 },
      { cacheType: 'veil_double',  rewardType: 'gear', rewardValue: 'chest_veilshroud',          displayName: 'Veilshroud Mantle',      rarityTier: 'epic',     weight: 8,  minLevel: 22 },
      { cacheType: 'veil_double',  rewardType: 'gear', rewardValue: 'legs_greaves_first_war',    displayName: 'Greaves of the First War', rarityTier: 'epic',   weight: 8,  minLevel: 22 },
      { cacheType: 'veil_double',  rewardType: 'gear', rewardValue: 'arms_shade_captains_grip',  displayName: "Shade Captain's Grip",   rarityTier: 'epic',     weight: 8,  minLevel: 22 },
      { cacheType: 'veil_double',  rewardType: 'gear', rewardValue: 'weapon_veilcleaver',        displayName: 'Veilcleaver',            rarityTier: 'epic',     weight: 8,  minLevel: 22 },
      { cacheType: 'veil_double',  rewardType: 'gear', rewardValue: 'arms_hands_of_the_weave',   displayName: 'Hands of the Weave',     rarityTier: 'legendary', weight: 2, minLevel: 30 },
      { cacheType: 'veil_double',  rewardType: 'gear', rewardValue: 'helm_visage_of_aethon',     displayName: 'Visage of Aethon',       rarityTier: 'legendary', weight: 2, minLevel: 30 },
      { cacheType: 'veil_double',  rewardType: 'gear', rewardValue: 'legs_stride_of_eternity',   displayName: 'Stride of Eternity',     rarityTier: 'legendary', weight: 2, minLevel: 30 },
      { cacheType: 'veil_double',  rewardType: 'gear', rewardValue: 'weapon_fateforged_blade',   displayName: 'Fate-Forged Blade',      rarityTier: 'legendary', weight: 1, minLevel: 30 },
    ];
    const result = await this.prisma.lootTable.createMany({ data: entries, skipDuplicates: true });
    this.logger.log(`Loot seed: inserted ${result.count} new entries`);
    return { inserted: result.count, attempted: entries.length };
  }

  // ── GRANT A CACHE ─────────────────────────────────────────────────────────────
  // ── GRANT A CACHE ─────────────────────────────────────────

  /**
   * Grant a sealed Fate Cache to a player.
   * Called by IngestService on level-ups, boss kills, milestones.
   */
  async grantCache(params: {
    rootId: string;
    cacheType: string;    // 'level_up' | 'boss_kill' | 'milestone'
    sourceId?: string;
    trigger: string;      // e.g. 'level_up:5', 'boss_kill:100'
    level: number;
    rarityOverride?: string; // force a specific rarity (for demo)
  }) {
    const rarity = params.rarityOverride
      || determineCacheRarity(params.level, params.trigger);

    const cache = await this.prisma.fateCache.create({
      data: {
        rootId: params.rootId,
        cacheType: params.cacheType,
        rarity,
        sourceId: params.sourceId || null,
        trigger: params.trigger,
      },
    });

    const label = CACHE_RARITIES[rarity]?.label || 'Fate Cache';

    // Log event
    await this.events.log({
      rootId: params.rootId,
      eventType: 'loot.cache_granted',
      sourceId: params.sourceId,
      payload: {
        cache_id: cache.id,
        cache_type: params.cacheType,
        rarity,
        trigger: params.trigger,
      },
      changes: {
        cache_id: cache.id,
        cache_label: label,
        rarity,
      },
    });

    this.logger.log(
      `Cache granted: ${label} (${rarity}) to ${params.rootId} via ${params.trigger}`,
    );

    return {
      cache_id: cache.id,
      cache_type: params.cacheType,
      rarity,
      label,
      status: 'sealed',
    };
  }

  // ── OPEN A CACHE ──────────────────────────────────────────

  /**
   * Open a sealed Fate Cache. Performs a weighted random roll
   * against the LootTable for the cache's type and player's
   * level, then applies the reward.
   */
  async openCache(rootId: string, cacheId: string) {
    // 1. Find the cache
    const cache = await this.prisma.fateCache.findUnique({
      where: { id: cacheId },
    });

    if (!cache) {
      throw new NotFoundException(`Cache not found: ${cacheId}`);
    }
    if (cache.rootId !== rootId) {
      throw new BadRequestException('This cache does not belong to you');
    }
    if (cache.status !== 'sealed') {
      throw new BadRequestException('This cache has already been opened');
    }

    // 2. Get player level
    const user = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      select: { fateLevel: true, fateXp: true },
    });
    if (!user) throw new NotFoundException('Identity not found');

    // 3. Load eligible loot table entries
    const entries = await this.prisma.lootTable.findMany({
      where: {
        cacheType: cache.cacheType,
        minLevel: { lte: user.fateLevel },
      },
    });

    if (entries.length === 0) {
      throw new BadRequestException(
        `No loot table entries for cache type: ${cache.cacheType}`,
      );
    }

    // 4. Weighted random roll
    const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
    let roll = Math.random() * totalWeight;
    let selected = entries[0];
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll <= 0) {
        selected = entry;
        break;
      }
    }

    // 5. Apply the reward
    await this.applyReward(rootId, selected, cache.sourceId);

    // 6. Update cache record
    const opened = await this.prisma.fateCache.update({
      where: { id: cacheId },
      data: {
        status: 'opened',
        openedAt: new Date(),
        rewardType: selected.rewardType,
        rewardValue: selected.rewardValue,
        rewardName: selected.displayName,
        rewardRarity: selected.rarityTier,
      },
    });

    // 7. Log event
    await this.events.log({
      rootId,
      eventType: 'loot.cache_opened',
      sourceId: cache.sourceId || undefined,
      payload: {
        cache_id: cacheId,
        cache_type: cache.cacheType,
        cache_rarity: cache.rarity,
      },
      changes: {
        reward_type: selected.rewardType,
        reward_value: selected.rewardValue,
        reward_name: selected.displayName,
        reward_rarity: selected.rarityTier,
        roll_weight: selected.weight,
        total_weight: totalWeight,
      },
    });

    this.logger.log(
      `Cache opened: ${cache.rarity} ${cache.cacheType} → ${selected.rarityTier} ${selected.displayName} (${rootId})`,
    );

    return {
      cache_id: cacheId,
      cache_type: cache.cacheType,
      cache_rarity: cache.rarity,
      reward: {
        type: selected.rewardType,
        value: selected.rewardValue,
        name: selected.displayName,
        rarity: selected.rarityTier,
      },
    };
  }

  // ── LIST CACHES ───────────────────────────────────────────

  /**
   * Get all caches for a player, optionally filtered by status.
   */
  async getCaches(rootId: string, status?: string) {
    const where: Record<string, unknown> = { rootId };
    if (status) where.status = status;

    const caches = await this.prisma.fateCache.findMany({
      where,
      orderBy: { grantedAt: 'desc' },
    });

    return caches.map((c) => ({
      cache_id: c.id,
      cache_type: c.cacheType,
      rarity: c.rarity,
      label: CACHE_RARITIES[c.rarity]?.label || 'Fate Cache',
      status: c.status,
      trigger: c.trigger,
      granted_at: c.grantedAt.toISOString(),
      opened_at: c.openedAt?.toISOString() || null,
      reward: c.status === 'opened'
        ? { type: c.rewardType, value: c.rewardValue, name: c.rewardName, rarity: c.rewardRarity }
        : null,
    }));
  }

  // ── LOOT TABLE (operator view) ────────────────────────────

  async getLootTable() {
    const entries = await this.prisma.lootTable.findMany({
      orderBy: [{ cacheType: 'asc' }, { weight: 'desc' }],
    });

    // Group by cache_type for easier operator reading
    const grouped: Record<string, unknown[]> = {};
    for (const e of entries) {
      if (!grouped[e.cacheType]) grouped[e.cacheType] = [];
      grouped[e.cacheType].push({
        id: e.id,
        reward_type: e.rewardType,
        reward_value: e.rewardValue,
        display_name: e.displayName,
        weight: e.weight,
        rarity_tier: e.rarityTier,
        min_level: e.minLevel,
      });
    }

    // Also compute probabilities per pool
    const pools: Record<string, unknown> = {};
    for (const [cacheType, items] of Object.entries(grouped)) {
      const totalWeight = (items as any[]).reduce((s, i) => s + i.weight, 0);
      pools[cacheType] = {
        total_weight: totalWeight,
        entries: (items as any[]).map((i) => ({
          ...i,
          probability: `${((i.weight / totalWeight) * 100).toFixed(1)}%`,
        })),
      };
    }

    return pools;
  }

  // ── MANUAL GRANT (operator action) ────────────────────────

  async grantCacheManual(params: {
    root_id: string;
    cache_type: string;
    rarity?: string;
  }) {
    // Verify user exists
    const user = await this.prisma.rootIdentity.findUnique({
      where: { id: params.root_id },
      select: { id: true, fateLevel: true },
    });
    if (!user) {
      throw new NotFoundException(`Identity not found: ${params.root_id}`);
    }

    return this.grantCache({
      rootId: params.root_id,
      cacheType: params.cache_type,
      trigger: `operator_grant`,
      level: user.fateLevel,
      rarityOverride: params.rarity,
    });
  }

  // ── APPLY REWARD ──────────────────────────────────────────

  private async applyReward(
    rootId: string,
    entry: { rewardType: string; rewardValue: string; displayName: string },
    sourceId: string | null,
  ) {
    switch (entry.rewardType) {
      case 'xp_boost': {
        const xp = parseInt(entry.rewardValue) || 0;
        await this.prisma.rootIdentity.update({
          where: { id: rootId },
          data: { heroXp: { increment: xp } },
        });
        break;
      }

      case 'title': {
        try {
          await this.prisma.userTitle.create({
            data: { rootId, titleId: entry.rewardValue, sourceId },
          });
        } catch {
          // Already holds the title — xp_boost fallback
          await this.prisma.rootIdentity.update({
            where: { id: rootId },
            data: { heroXp: { increment: 100 } },
          });
        }
        break;
      }

      case 'marker': {
        await this.prisma.fateMarker.create({
          data: { rootId, marker: entry.rewardValue, sourceId },
        });
        break;
      }

      case 'gear': {
        await this.gear.addToInventory({
          rootId,
          itemId: entry.rewardValue,
          acquiredVia: 'cache',
          sourceId: sourceId || undefined,
        });
        break;
      }

      default:
        this.logger.warn(`Unknown reward type: ${entry.rewardType}`);
    }
  }
}
