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
          data: { fateXp: { increment: xp } },
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
            data: { fateXp: { increment: 100 } },
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
