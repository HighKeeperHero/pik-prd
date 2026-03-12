// backend/src/veil/veil.service.ts
// Phase 2: loot cache drops, quest progress tracking, convergence events
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { HuntTrackerService } from '../quest/hunt-tracker.service';

export interface RecordEncounterDto {
  tearType: string;   // minor | wander | dormant | double
  tearName: string;
  outcome: 'won' | 'fled';
  shards: number;
  lat?: number;
  lon?: number;
}

// ── Loot drop config per tier ─────────────────────────────────────────────────
const DROP_CONFIG: Record<string, { chance: number; cacheType: string; rarity: string }> = {
  minor:   { chance: 0.15, cacheType: 'veil_minor',   rarity: 'common'   },
  wander:  { chance: 0.25, cacheType: 'veil_shade',   rarity: 'uncommon' },
  dormant: { chance: 0.40, cacheType: 'veil_dormant', rarity: 'rare'     },
  double:  { chance: 0.60, cacheType: 'veil_double',  rarity: 'epic'     },
};

const TIER_ORDER = ['minor', 'wander', 'dormant', 'double'];

interface QuestObjective {
  type: 'seal_any' | 'seal_type' | 'win_streak';
  tearType?: string;
  target: number;
}

interface QuestRewards {
  xp: number;
  cache: { cacheType: string; rarity: string } | null;
}

@Injectable()
export class VeilService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly huntTracker: HuntTrackerService,
  ) {}

  // ── Record a battle outcome ───────────────────────────────────────────────
  async recordEncounter(rootId: string, dto: RecordEncounterDto) {
    const { tearType, tearName, outcome, shards: rawShards, lat, lon } = dto;

    const hero = await this.prisma.rootIdentity.findUnique({ where: { id: rootId } });
    if (!hero) throw new NotFoundException('Hero not found');

    // 1. Check active convergence events for this tear tier
    const now = new Date();
    const activeEvents = await this.prisma.convergenceEvent.findMany({
      where: {
        status:   'active',
        startsAt: { lte: now },
        endsAt:   { gte: now },
        affectedTiers: { has: tearType },
      },
    });

    const multiplier        = activeEvents.reduce((max, e) => Math.max(max, e.shardMultiplier), 1.0);
    const shards            = outcome === 'won' ? Math.round(rawShards * multiplier) : 0;
    const convergenceCacheBonus = activeEvents.some(e => e.cacheBonus);

    // 2. Write encounter row
    const encounter = await this.prisma.tearEncounter.create({
      data: { rootId, tearType, tearName, outcome, shards, lat, lon },
    });

    // 3. Update shard balance
    if (outcome === 'won' && shards > 0) {
      await this.prisma.veilShard.upsert({
        where:  { rootId },
        create: { rootId, balance: shards },
        update: { balance: { increment: shards } },
      });
    }

    // 4. Loot cache drop
    let cacheEarned: { cache_id: string; cache_type: string; rarity: string } | null = null;
    if (outcome === 'won') {
      const cfg  = DROP_CONFIG[tearType] ?? DROP_CONFIG.minor;
      const roll = Math.random();
      if (convergenceCacheBonus || roll < cfg.chance) {
        const cache = await this.prisma.fateCache.create({
          data: {
            rootId,
            cacheType: cfg.cacheType,
            rarity:    cfg.rarity,
            trigger:   convergenceCacheBonus ? 'veil_convergence' : 'veil_victory',
            status:    'sealed',
          },
        });
        cacheEarned = { cache_id: cache.id, cache_type: cache.cacheType, rarity: cache.rarity };
      }
    }

    // 5. Quest progress
    const questsCompleted = await this._updateQuestProgress(rootId, tearType, outcome);

    // 6. Hunt tracker — veil_tear_sealed event (fires for every won encounter)
    if (outcome === 'won') {
      this.huntTracker.recordEvent(rootId, 'veil_tear_sealed', { tear_type: tearType, tear_name: tearName });
    }

    return {
      encounter_id:      encounter.id,
      outcome,
      shards,
      multiplier:        multiplier !== 1.0 ? multiplier : undefined,
      convergence_event: activeEvents.length > 0 ? activeEvents[0].name : undefined,
      cache_earned:      cacheEarned,
      quests_completed:  questsCompleted,
    };
  }

  // ── Quest progress engine ─────────────────────────────────────────────────
  private async _updateQuestProgress(rootId: string, tearType: string, outcome: string) {
    if (outcome !== 'won') return [];

    // Auto-enroll hero in veil quests they haven't started yet
    const existing = await this.prisma.playerQuest.findMany({
      where: { rootId },
      select: { questId: true },
    });
    await this._autoEnrollVeilQuests(rootId, existing.map(e => e.questId));

    // Load active veil quests
    const playerQuests = await this.prisma.playerQuest.findMany({
      where:   { rootId, status: 'active' },
      include: { quest: true },
    });
    const veilQuests = playerQuests.filter(pq =>
      (pq.quest.questType as string).startsWith('veil')
    );

    const completed: Array<{ quest_id: string; name: string; cache: object | null }> = [];

    for (const pq of veilQuests) {
      const objectives = pq.quest.objectives as unknown as QuestObjective[];
      const progress   = (pq.progress as any[]) ?? [];

      const updatedProgress = objectives.map((obj, i) => {
        const current = (progress[i] as any)?.current ?? 0;
        let inc = 0;
        if (obj.type === 'seal_any')                                        inc = 1;
        else if (obj.type === 'seal_type' && obj.tearType === tearType)     inc = 1;
        else if (obj.type === 'win_streak')                                 inc = 1;
        return { type: obj.type, tearType: obj.tearType, current: current + inc, target: obj.target };
      });

      const allMet     = updatedProgress.every(p => p.current >= p.target);
      const nowComplete = allMet;

      await this.prisma.playerQuest.update({
        where: { id: pq.id },
        data:  {
          progress:    updatedProgress as any,
          status:      nowComplete ? 'completed' : 'active',
          completedAt: nowComplete ? new Date()  : undefined,
        },
      });

      if (nowComplete) {
        const rewards = pq.quest.rewards as unknown as QuestRewards;
        let rewardCache: object | null = null;

        if (rewards.cache) {
          const cache = await this.prisma.fateCache.create({
            data: {
              rootId,
              cacheType: rewards.cache.cacheType,
              rarity:    rewards.cache.rarity,
              trigger:   'quest_complete',
              status:    'sealed',
            },
          });
          rewardCache = { cache_id: cache.id, cache_type: cache.cacheType, rarity: cache.rarity };
        }

        if (rewards.xp > 0) {
          await this.prisma.identityEvent.create({
            data: {
              rootId,
              eventType: 'veil_quest_complete',
              payload:   { questId: pq.questId, questName: pq.quest.name, xpGranted: rewards.xp },
            },
          });
          await this.prisma.rootIdentity.update({
            where: { id: rootId },
            data:  { heroXp: { increment: rewards.xp } },
          });
        }

        completed.push({ quest_id: pq.questId, name: pq.quest.name, cache: rewardCache });
      }
    }

    return completed;
  }

  private async _autoEnrollVeilQuests(rootId: string, alreadyStarted: string[]) {
    const hero = await this.prisma.rootIdentity.findUnique({
      where:  { id: rootId },
      select: { heroLevel: true },
    });
    const templates = await this.prisma.questTemplate.findMany({
      where: {
        status:    'active',
        questType: { startsWith: 'veil' },
        id:        { notIn: alreadyStarted },
        minLevel:  { lte: hero?.heroLevel ?? 1 },
      },
    });
    for (const t of templates) {
      await this.prisma.playerQuest.upsert({
        where:  { rootId_questId: { rootId, questId: t.id } },
        create: { rootId, questId: t.id, status: 'active', progress: [] },
        update: {},
      });
    }
  }

  // ── Veil quests for a hero ────────────────────────────────────────────────
  async getVeilQuests(rootId: string) {
    const existing = await this.prisma.playerQuest.findMany({
      where:  { rootId },
      select: { questId: true },
    });
    await this._autoEnrollVeilQuests(rootId, existing.map(e => e.questId));

    const playerQuests = await this.prisma.playerQuest.findMany({
      where:   { rootId },
      include: { quest: true },
      orderBy: { quest: { sortOrder: 'asc' } },
    });

    return playerQuests
      .filter(pq => (pq.quest.questType as string).startsWith('veil'))
      .map(pq => {
        const objectives = pq.quest.objectives as unknown as QuestObjective[];
        const progress   = (pq.progress as any[]) ?? [];
        const rewards    = pq.quest.rewards as unknown as QuestRewards;
        return {
          quest_id:     pq.questId,
          name:         pq.quest.name,
          description:  pq.quest.description,
          status:       pq.status,
          objectives:   objectives.map((obj, i) => ({
            label:   this._objectiveLabel(obj),
            current: (progress[i] as any)?.current ?? 0,
            target:  obj.target,
          })),
          rewards:      { xp: rewards.xp, cache: rewards.cache },
          completed_at: pq.completedAt,
        };
      });
  }

  private _objectiveLabel(obj: QuestObjective): string {
    const names: Record<string, string> = {
      minor: 'Minor Threats', wander: 'Wandering Shades',
      dormant: 'Dormant Rifts', double: 'Double Rift Events',
    };
    if (obj.type === 'seal_type' && obj.tearType) return `Seal ${obj.target} ${names[obj.tearType] ?? obj.tearType}`;
    if (obj.type === 'seal_any')    return `Seal ${obj.target} tear${obj.target !== 1 ? 's' : ''}`;
    if (obj.type === 'win_streak')  return `Win ${obj.target} battles without retreating`;
    return `Complete ${obj.target}`;
  }

  // ── Active Convergence Events ─────────────────────────────────────────────
  async getActiveEvents() {
    const now = new Date();
    const events = await this.prisma.convergenceEvent.findMany({
      where: { status: 'active', startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { endsAt: 'asc' },
    });
    return events.map(e => ({
      event_id:         e.id,
      name:             e.name,
      description:      e.description,
      flavor_text:      e.flavorText,
      affected_tiers:   e.affectedTiers,
      shard_multiplier: e.shardMultiplier,
      cache_bonus:      e.cacheBonus,
      ends_at:          e.endsAt.getTime(),
    }));
  }

  // ── Paginated battle history ──────────────────────────────────────────────
  async getEncounters(rootId: string, limit = 20) {
    const rows = await this.prisma.tearEncounter.findMany({
      where:   { rootId },
      orderBy: { createdAt: 'desc' },
      take:    Math.min(limit, 100),
    });
    return rows.map(r => ({
      encounter_id: r.id,
      tear_type:    r.tearType,
      tear_name:    r.tearName,
      outcome:      r.outcome,
      shards:       r.shards,
      lat:          r.lat,
      lon:          r.lon,
      ts:           r.createdAt.getTime(),
    }));
  }

  // ── Aggregate stats ───────────────────────────────────────────────────────
  async getStats(rootId: string) {
    const [encounters, shardRow] = await Promise.all([
      this.prisma.tearEncounter.findMany({
        where:  { rootId },
        select: { tearType: true, outcome: true, shards: true },
      }),
      this.prisma.veilShard.findUnique({ where: { rootId } }),
    ]);
    const wins        = encounters.filter(e => e.outcome === 'won').length;
    const losses      = encounters.filter(e => e.outcome === 'fled').length;
    const total       = encounters.length;
    const totalShards = encounters.filter(e => e.outcome === 'won').reduce((s, e) => s + e.shards, 0);
    const byTier: Record<string, { battles: number; wins: number }> = {};
    for (const e of encounters) {
      if (!byTier[e.tearType]) byTier[e.tearType] = { battles: 0, wins: 0 };
      byTier[e.tearType].battles++;
      if (e.outcome === 'won') byTier[e.tearType].wins++;
    }
    return {
      total,
      wins,
      losses,
      win_rate:      total > 0 ? Math.round((wins / total) * 100) : 0,
      total_shards:  totalShards,
      shard_balance: shardRow?.balance ?? 0,
      by_tier:       TIER_ORDER.map(k => ({
        tear_type: k, battles: byTier[k]?.battles ?? 0, wins: byTier[k]?.wins ?? 0,
      })).filter(t => t.battles > 0),
    };
  }

  // ── Shard balance ─────────────────────────────────────────────────────────
  async getShardBalance(rootId: string) {
    const row = await this.prisma.veilShard.findUnique({ where: { rootId } });
    return { root_id: rootId, balance: row?.balance ?? 0 };
  }
}
