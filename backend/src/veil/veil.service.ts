// backend/src/veil/veil.service.ts
// Phase 2: loot cache drops, quest progress tracking, convergence events
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { HuntTrackerService } from '../quest/hunt-tracker.service';
import { LevelingService, type XpAward } from '../leveling/leveling.service';
import { ConfigService } from '../config/config.service';
import { TearGenService, type GenParams, type GenTear } from './tear-gen.service';
import { LoreService, type LoreFound } from '../lore/lore.service';
import { QuestLogService, type QuestProgressUpdate } from '../quest/quest-log.service';
import { cellIndices, cellKey as makeCellKey, CELL_DEG_DEFAULT } from './tear-gen.util';

// Phase 2 Arc A — XP granted per tear tier on a successful seal.
// Source of truth: docs/roadmap/phase-2.md.
const XP_BY_TEAR_TIER: Record<string, number> = {
  minor:   50,
  wander:  100,
  dormant: 250,
  double:  500,
};

// Sprint 32 — numeric tier rank for cadence quest objectives
// (seal_tears tier_min gates: dormant-or-stronger = tier_min 3).
const TEAR_TIER_RANK: Record<string, number> = {
  minor:   1,
  wander:  2,
  dormant: 3,
  double:  4,
};

// Phase 2 Arc B — Geo rift density (level-banded tier weights).
// Source of truth: docs/roadmap/phase-2.md § Locked design parameters.
// `total` is the target number of tears returned for a player in
// the band; `mix` is the per-tier fraction; `radius_km` is the
// default search radius if the client doesn't override.
interface RiftBand {
  total:     number;
  radius_km: number;
  mix:       { T1: number; T2: number; T3: number; T4: number };
}
const RIFT_BANDS: RiftBand[] = [
  { total:  9, radius_km: 2, mix: { T1: 0.60, T2: 0.30, T3: 0.08, T4: 0.02 } },  // L1-5
  { total: 13, radius_km: 3, mix: { T1: 0.45, T2: 0.35, T3: 0.15, T4: 0.05 } },  // L6-15
  { total: 20, radius_km: 4, mix: { T1: 0.30, T2: 0.35, T3: 0.25, T4: 0.10 } },  // L16-30
  { total: 23, radius_km: 5, mix: { T1: 0.20, T2: 0.30, T3: 0.30, T4: 0.20 } },  // L31+
];
function bandForFateLevel(level: number): RiftBand {
  if (level <=  5) return RIFT_BANDS[0];
  if (level <= 15) return RIFT_BANDS[1];
  if (level <= 30) return RIFT_BANDS[2];
  return RIFT_BANDS[3];
}

const TIER_TO_TYPE: Record<string, string> = {
  T1: 'minor', T2: 'wander', T3: 'dormant', T4: 'double',
};

// City centers for tear respawning. Must stay in sync with the
// seed migration's VALUES list (20260514010000_reseed_world_tears).
// If a city is added/removed in the seed, mirror the change here.
const CITY_CENTERS: Record<string, { lat: number; lon: number }> = {
  'folsom-ca':  { lat: 38.6779, lon: -121.1761 },
  'sf-ca':      { lat: 37.7749, lon: -122.4194 },
  'nyc-ny':     { lat: 40.7128, lon:  -74.0060 },
  'la-ca':      { lat: 34.0522, lon: -118.2437 },
  'seattle-wa': { lat: 47.6062, lon: -122.3321 },
  'austin-tx':  { lat: 30.2672, lon:  -97.7431 },
  'chicago-il': { lat: 41.8781, lon:  -87.6298 },
  'london-uk':  { lat: 51.5074, lon:   -0.1278 },
  'tokyo-jp':   { lat: 35.6762, lon:  139.6503 },
};

// Per-tier radial bands (degrees from city center). Used when
// respawning a sealed/expired tear at a fresh random location.
// Must align with the seed migration's tier-banded layout —
// keeps post-seal density consistent with the initial placement.
const TIER_RADIAL_BANDS: Record<string, { min: number; max: number }> = {
  T1: { min: 0.005, max: 0.014 },
  T2: { min: 0.013, max: 0.022 },
  T3: { min: 0.018, max: 0.034 },
  T4: { min: 0.025, max: 0.045 },
};

const TEAR_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24h

// Phase 2 Arc B slice 4 — procedural generation defaults. These are
// fallbacks only; live values come from ConfigService (veil.* keys)
// so ops can tune density / cooldown without a redeploy. The seed
// script scales `pop_cell.weight` to ≈ desired tears-per-cell, so
// densityFactor is just a global multiplier (default 1.0).
const PROC_DEFAULTS = {
  enabled:       true,
  cellDeg:       CELL_DEG_DEFAULT, // 0.05° (~5.5 km)
  densityFactor: 1.0,
  floorTears:    3,   // min tears for any cell that has a pop_cell row
  maxPerCell:    40,  // payload cap for dense metros
  cooldownHours: 6,   // sealed tear stays gone this long
  rotationHours: 24,  // position-rotation window
};

/** Great-circle distance between two lat/lon points, km. */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R    = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a    = Math.sin(dLat / 2) ** 2 +
               Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface RecordEncounterDto {
  tearType: string;   // minor | wander | dormant | double
  tearName: string;
  outcome: 'won' | 'fled';
  shards: number;
  lat?: number;
  lon?: number;
  /** Sprint 29 Arc B — world_tears row UUID. When provided and the
   *  outcome is 'won', the row is marked sealed and a replacement
   *  is spawned in the same region + tier. Omit for legacy /
   *  unmoored encounters that don't map to a server tear. */
  worldTearId?: string;
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
  private readonly logger = new Logger(VeilService.name);

  constructor(
    private readonly prisma:       PrismaService,
    private readonly huntTracker:  HuntTrackerService,
    private readonly leveling:     LevelingService,
    private readonly config:       ConfigService,
    private readonly tearGen:      TearGenService,
    private readonly lore:         LoreService,
    private readonly questLog:    QuestLogService,
  ) {}

  // ── Record a battle outcome ───────────────────────────────────────────────
  async recordEncounter(rootId: string, dto: RecordEncounterDto) {
    const { tearType, tearName, outcome, shards: rawShards, lat, lon, worldTearId } = dto;

    const hero = await this.prisma.rootIdentity.findUnique({ where: { id: rootId } });
    if (!hero) throw new NotFoundException('Hero not found');

    // Sprint 28 — first-seal detection. We count prior wins BEFORE
    // inserting this encounter; if zero and the current outcome is
    // 'won', this seal is the player's first. The iOS client uses
    // this flag to play the Reliquary-remembers cinematic on the
    // BattleResult screen exactly once per hero. Done early so the
    // count isn't affected by any subsequent writes in this method.
    const priorWins = await this.prisma.tearEncounter.count({
      where: { rootId, outcome: 'won' },
    });
    const isFirstSeal = outcome === 'won' && priorWins === 0;

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

    // 2.5. Sprint 29 Arc B — seal the world_tear row + spawn a
    // replacement when this encounter ties to a server tear and the
    // hero won. Silent no-op when worldTearId is missing (legacy
    // procedural encounters) or the tear is already sealed.
    if (outcome === 'won' && worldTearId) {
      await this.sealWorldTear(worldTearId, rootId).catch((err) => {
        // Don't fail the encounter if the seal-side bookkeeping
        // glitches — the player still won the fight.
        this.logger.warn(`sealWorldTear failed for ${worldTearId}: ${err}`);
      });
    }

    // 3. Update shard balance
    if (outcome === 'won' && shards > 0) {
      await this.prisma.veilShard.upsert({
        where:  { rootId },
        create: { rootId, balance: shards },
        update: { balance: { increment: shards } },
      });

      // Sprint 28 — Veil Essence is the iOS app's unified daily-loop
      // currency (hearth drip + battle reward → same balance). Mirror
      // the shard award into sanctum_state so the iOS Sanctum reflects
      // the win immediately. The legacy veil_shards table above stays
      // intact for the web client.
      await this.prisma.sanctumState.upsert({
        where:  { rootId },
        create: { rootId, veilEssence: shards },
        update: { veilEssence: { increment: shards } },
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

    // 6. Hunt tracker + Convergence contribution
    if (outcome === 'won') {
      this.huntTracker.recordEvent(rootId, 'veil_tear_sealed', { tear_type: tearType, tear_name: tearName });

      // Sprint 24 — increment global + per-hero contribution counter for active events
      if (activeEvents.length > 0) {
        const membership = await this.prisma.warbandMembership.findFirst({
          where: { rootId }, select: { warbandId: true },
        }).catch(() => null);
        const warbandId = membership?.warbandId ?? null;

        for (const event of activeEvents) {
          // Per-hero contribution (for leaderboard)
          await this.prisma.convergenceContribution.upsert({
            where:  { eventId_rootId: { eventId: event.id, rootId } },
            create: { eventId: event.id, rootId, warbandId, count: 1 },
            update: { count: { increment: 1 }, warbandId },
          }).catch(() => {});

          // Global counter on the event
          await this.prisma.convergenceEvent.update({
            where: { id: event.id },
            data:  { contributionCount: { increment: 1 } },
          }).catch(() => {});
        }
      }
      // 22.2 — Grant 'first_veil_seal' title on first ever win
      await this._maybeGrantTitle(rootId, 'first_veil_seal');
      // Grant tear-type specific title on first seal of that type
      const tierTitles: Record<string, string> = {
        dormant: 'dormant_rift_sealed',
        double:  'convergence_survived',
      };
      if (tierTitles[tearType]) {
        await this._maybeGrantTitle(rootId, tierTitles[tearType]);
      }
    }

    // Phase 2 Arc A — grant XP on a successful seal. Tier-keyed
    // table is the source of truth for amount. Result rides on
    // the response so the client can render the level-up beat
    // inline with the standard reward block.
    let xpAward: XpAward | null = null;
    if (outcome === 'won') {
      const xpAmount = XP_BY_TEAR_TIER[tearType] ?? 0;
      if (xpAmount > 0) {
        xpAward = await this.leveling.grantXp(rootId, xpAmount);
      }
    }

    // Lore Archive drop — a won seal may recover a lore entry
    // (tier-keyed chance, rarity-weighted pick; never throws).
    let loreFound: LoreFound | null = null;
    if (outcome === 'won') {
      loreFound = await this.lore.maybeDropOnSeal(rootId, tearType);
    }

    // Sprint 32 — cadence quest progress (daily/weekly/story log).
    // Tear tiers: minor 1 · wander 2 · dormant 3 · double 4.
    const questUpdates: QuestProgressUpdate[] = [];
    if (outcome === 'won') {
      const tier = TEAR_TIER_RANK[tearType] ?? 1;
      questUpdates.push(...await this.questLog.recordEvent(rootId, { type: 'tear_seal', tier }));
      if (loreFound) {
        questUpdates.push(...await this.questLog.recordEvent(rootId, { type: 'lore_find' }));
      }
    }

    return {
      encounter_id:      encounter.id,
      outcome,
      shards,
      multiplier:        multiplier !== 1.0 ? multiplier : undefined,
      convergence_event: activeEvents.length > 0 ? activeEvents[0].name : undefined,
      cache_earned:      cacheEarned,
      quests_completed:  questsCompleted,
      quest_updates:     questUpdates,
      is_first_seal:     isFirstSeal,
      xp_award:          xpAward,
      lore_found:        loreFound,
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
            data:  { fateXp: { increment: rewards.xp } },
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
      select: { fateLevel: true },
    });
    const templates = await this.prisma.questTemplate.findMany({
      where: {
        status:    'active',
        questType: { startsWith: 'veil' },
        id:        { notIn: alreadyStarted },
        minLevel:  { lte: hero?.fateLevel ?? 1 },
      },
    });
    for (const t of templates) {
      await this.prisma.playerQuest.upsert({
        where:  { rootId_questId_periodKey: { rootId, questId: t.id, periodKey: 'once' } },
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

  // ── Title grant utility (22.2) ───────────────────────────────────────────
  private async _maybeGrantTitle(rootId: string, titleId: string) {
    try {
      const existing = await this.prisma.userTitle.findFirst({ where: { rootId, titleId } });
      if (existing) return;
      await this.prisma.userTitle.create({ data: { rootId, titleId } });
      await this.prisma.identityEvent.create({
        data: {
          rootId,
          eventType: 'identity.title_earned',
          payload: { title_id: titleId, source: 'veil_encounter' },
        },
      });
    } catch {
      // Non-critical — title may already exist
    }
  }

  // ── Sprint 24: Global event progress ────────────────────────────────────────
  async getGlobalProgress() {
    const now = new Date();
    const events = await this.prisma.convergenceEvent.findMany({
      where: { status: 'active', startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { endsAt: 'asc' },
    });
    return events.map(e => ({
      event_id:           e.id,
      name:               e.name,
      description:        e.description,
      flavor_text:        e.flavorText,
      affected_tiers:     e.affectedTiers,
      shard_multiplier:   e.shardMultiplier,
      cache_bonus:        e.cacheBonus,
      contribution_count: e.contributionCount,
      target_count:       e.targetCount,
      progress_pct:       e.targetCount > 0 ? Math.min(100, Math.round((e.contributionCount / e.targetCount) * 100)) : 0,
      ends_at:            e.endsAt.getTime(),
    }));
  }

  async getContributionLeaderboard(eventId: string, limit = 20) {
    const contributions = await this.prisma.convergenceContribution.findMany({
      where:   { eventId },
      orderBy: { count: 'desc' },
      take:    Math.min(limit, 100),
      include: { hero: { select: { heroName: true, fateAlignment: true } } },
    });

    // Warband aggregation
    const warbandTotals: Record<string, { warbandId: string; count: number }> = {};
    for (const c of contributions) {
      if (c.warbandId) {
        if (!warbandTotals[c.warbandId]) warbandTotals[c.warbandId] = { warbandId: c.warbandId, count: 0 };
        warbandTotals[c.warbandId].count += c.count;
      }
    }

    return {
      heroes: contributions.map((c, i) => ({
        rank:       i + 1,
        root_id:    c.rootId,
        hero_name:  c.hero.heroName,
        alignment:  c.hero.fateAlignment,
        warband_id: c.warbandId,
        count:      c.count,
      })),
      warbands: Object.values(warbandTotals)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map((w, i) => ({ rank: i + 1, warband_id: w.warbandId, count: w.count })),
    };
  }

  // ── Operator: create event ────────────────────────────────────────────────
  async createEvent(dto: {
    name:            string;
    description?:    string;
    flavor_text?:    string;
    affected_tiers:  string[];
    shard_multiplier?: number;
    cache_bonus?:    boolean;
    target_count?:   number;
    starts_at:       string;
    ends_at:         string;
  }) {
    const event = await this.prisma.convergenceEvent.create({
      data: {
        name:           dto.name,
        description:    dto.description,
        flavorText:     dto.flavor_text,
        affectedTiers:  dto.affected_tiers,
        shardMultiplier: dto.shard_multiplier ?? 1.5,
        cacheBonus:     dto.cache_bonus ?? true,
        targetCount:    dto.target_count ?? 10000,
        startsAt:       new Date(dto.starts_at),
        endsAt:         new Date(dto.ends_at),
        status:         'active',
      },
    });
    return { event_id: event.id, name: event.name, starts_at: event.startsAt, ends_at: event.endsAt };
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

  // ── Phase 2 Arc B — Geo-aware rifts ──────────────────────────────────────
  /** Returns a tier-weighted slice of nearby active world tears
   *  per the level-banded rules in docs/roadmap/phase-2.md.
   *
   *  Algorithm:
   *    1. Look up the player's band (radius + tier-mix) by Fate level.
   *    2. Bounding-box prefilter via Prisma indexes (lat/lon range).
   *    3. Distance-filter to true radius via haversine.
   *    4. Group by tier; per tier, take the closest floor(total · pct)
   *       tears. Total is fixed per band; mix is fixed per band.
   *    5. Return union sorted by distance for client convenience.
   *
   *  No randomization in the selection — the data layer is static
   *  (seeded) so the response is deterministic for a given lat/lon/
   *  fate_level until lifecycle (slice 3) introduces spawn/expire. */
  async getNearbyTears(
    lat:           number,
    lon:           number,
    fateLevel:     number,
    radiusKmOverride?: number,
  ) {
    const cfg = await this.config.getAll().catch(() => ({} as Record<string, unknown>));
    const enabledRaw = cfg['veil.procedural_enabled'];
    const proceduralOn =
      enabledRaw === undefined
        ? PROC_DEFAULTS.enabled
        : enabledRaw === true || enabledRaw === 'true' || enabledRaw === 1;
    if (!proceduralOn) {
      return this.getNearbyTearsStored(lat, lon, fateLevel, radiusKmOverride);
    }

    const num = (k: string, d: number) => {
      const v = cfg[k];
      return typeof v === 'number' && !Number.isNaN(v) ? v : d;
    };
    const cellDeg = num('veil.cell_deg', PROC_DEFAULTS.cellDeg);
    const params: GenParams = {
      cellDeg,
      densityFactor: num('veil.density_factor', PROC_DEFAULTS.densityFactor),
      floorTears:    num('veil.floor_tears', PROC_DEFAULTS.floorTears),
      maxPerCell:    PROC_DEFAULTS.maxPerCell,
      rotationMs:    num('veil.rotation_hours', PROC_DEFAULTS.rotationHours) * 3_600_000,
    };

    const band      = bandForFateLevel(fateLevel);
    const radius_km = radiusKmOverride ?? band.radius_km;

    // Bounding box → grid cell index ranges (same overshoot as the
    // stored path so the haversine filter doesn't clip edge tears).
    const latDelta = (radius_km / 111) * 1.05;
    const lonDelta = (radius_km / (111 * Math.cos((lat * Math.PI) / 180))) * 1.05;
    const lo = cellIndices(lat - latDelta, lon - lonDelta, cellDeg);
    const hi = cellIndices(lat + latDelta, lon + lonDelta, cellDeg);
    const latIdxMin = Math.min(lo.latIdx, hi.latIdx);
    const latIdxMax = Math.max(lo.latIdx, hi.latIdx);
    const lonIdxMin = Math.min(lo.lonIdx, hi.lonIdx);
    const lonIdxMax = Math.max(lo.lonIdx, hi.lonIdx);

    const idxByKey = new Map<string, { latIdx: number; lonIdx: number }>();
    for (let li = latIdxMin; li <= latIdxMax; li++) {
      for (let oi = lonIdxMin; oi <= lonIdxMax; oi++) {
        idxByKey.set(makeCellKey(li, oi), { latIdx: li, lonIdx: oi });
      }
    }
    const cellKeys = [...idxByKey.keys()];

    // Population weights for the overlapping cells. No rows ⇒ this area
    // isn't covered by the grid (open ocean, or the grid isn't seeded
    // yet) ⇒ fall back to the stored-row path so the map is never empty
    // where it shouldn't be.
    const popCells = await this.prisma.popCell.findMany({
      where: { cellKey: { in: cellKeys } },
    });
    if (popCells.length === 0) {
      return this.getNearbyTearsStored(lat, lon, fateLevel, radiusKmOverride);
    }

    // Generate per cell, then drop tears whose seal is still cooling.
    const nowMs = Date.now();
    let generated: GenTear[] = [];
    for (const pc of popCells) {
      const idx = idxByKey.get(pc.cellKey);
      if (!idx) continue;
      generated = generated.concat(
        this.tearGen.genCellTears(idx.latIdx, idx.lonIdx, pc.weight, pc.regionLabel, params, nowMs),
      );
    }
    const seals = await this.prisma.tearSeal.findMany({
      where: { cellKey: { in: cellKeys }, cooldownUntil: { gt: new Date(nowMs) } },
      select: { tearId: true },
    });
    const sealed = new Set(seals.map((s) => s.tearId));

    // Distance filter + per-tier slice by the fate band's mix —
    // identical selection logic to the stored path below.
    const RADIUS_TOLERANCE_KM = 0.05;
    const withDist = generated
      .filter((t) => !sealed.has(t.tearId))
      .map((t) => ({ ...t, distance_km: haversineKm(lat, lon, t.lat, t.lon) }))
      .filter((t) => t.distance_km <= radius_km + RADIUS_TOLERANCE_KM);

    const byTier: Record<string, typeof withDist> = { T1: [], T2: [], T3: [], T4: [] };
    for (const t of withDist) if (byTier[t.tier]) byTier[t.tier].push(t);
    for (const tier of Object.keys(byTier)) {
      byTier[tier].sort((a, b) => a.distance_km - b.distance_km);
    }
    const tiers: Array<keyof typeof band.mix> = ['T1', 'T2', 'T3', 'T4'];
    const selected = tiers.flatMap((tier) => {
      const target = Math.round(band.total * band.mix[tier]);
      return byTier[tier].slice(0, target);
    });
    selected.sort((a, b) => a.distance_km - b.distance_km);

    const spawnedIso = new Date(nowMs).toISOString();
    return {
      tears: selected.map((t) => ({
        tear_id:      t.tearId,
        lat:          t.lat,
        lon:          t.lon,
        tier:         t.tier,
        type:         TIER_TO_TYPE[t.tier] ?? 'minor',
        status:       'active',
        distance_km:  Math.round(t.distance_km * 100) / 100,
        region_label: t.regionLabel,
        spawned_at:   spawnedIso,
        expires_at:   null as string | null,
      })),
      total:     selected.length,
      radius_km,
      band_mix:  band.mix,
    };
  }

  /** Legacy stored-row path. Used as the fallback when procedural
   *  generation is disabled (veil.procedural_enabled=false) or no
   *  population grid covers the queried area. Unchanged from the
   *  original implementation. */
  private async getNearbyTearsStored(
    lat:           number,
    lon:           number,
    fateLevel:     number,
    radiusKmOverride?: number,
  ) {
    const band      = bandForFateLevel(fateLevel);
    const radius_km = radiusKmOverride ?? band.radius_km;

    // Bounding-box prefilter. 1 deg lat ≈ 111 km; lon scales by cos(lat).
    // Slight overshoot via `* 1.05` so the haversine filter doesn't clip
    // tears right at the edge of the radius.
    const latDelta = (radius_km / 111) * 1.05;
    const lonDelta = (radius_km / (111 * Math.cos((lat * Math.PI) / 180))) * 1.05;

    const now = new Date();
    const candidates = await this.prisma.worldTear.findMany({
      where: {
        status: 'active',
        lat:    { gte: lat - latDelta, lte: lat + latDelta },
        lon:    { gte: lon - lonDelta, lte: lon + lonDelta },
        // Filter expired tears (slice 3 lifecycle). NULL means
        // "never expires" — preserves legacy seed semantics for
        // tears spawned before this slice.
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
    });

    // Compute true distance + filter to radius. Tolerance of 50m
    // covers the gap between the seed's `radial × 111` placement
    // and the actual haversine great-circle distance — a tear seeded
    // at radial 0.045 deg lands at ~5.01 km haversine, which the
    // player perceives as "right at the edge" of a 5 km radius.
    const RADIUS_TOLERANCE_KM = 0.05;
    const withDist = candidates
      .map((t) => ({
        ...t,
        distance_km: haversineKm(lat, lon, t.lat, t.lon),
      }))
      .filter((t) => t.distance_km <= radius_km + RADIUS_TOLERANCE_KM);

    // Group by tier, sort each group by distance ascending
    const byTier: Record<string, typeof withDist> = { T1: [], T2: [], T3: [], T4: [] };
    for (const t of withDist) {
      if (byTier[t.tier]) byTier[t.tier].push(t);
    }
    for (const tier of Object.keys(byTier)) {
      byTier[tier].sort((a, b) => a.distance_km - b.distance_km);
    }

    // Per-tier slice using the band's mix. Round (not floor) so the
    // returned totals match phase-2.md's documented band ranges
    // (8-10 / 12-15 / 18-22 / 22-25) — flooring consistently
    // under-delivers on the upper bands and on rare-tier counts.
    const tiers: Array<keyof typeof band.mix> = ['T1', 'T2', 'T3', 'T4'];
    const selected = tiers.flatMap((tier) => {
      const target = Math.round(band.total * band.mix[tier]);
      return byTier[tier].slice(0, target);
    });

    // Final sort by distance for client display order
    selected.sort((a, b) => a.distance_km - b.distance_km);

    return {
      tears: selected.map((t) => ({
        tear_id:      t.id,
        lat:          t.lat,
        lon:          t.lon,
        tier:         t.tier,
        type:         TIER_TO_TYPE[t.tier] ?? 'minor',
        status:       t.status,
        distance_km:  Math.round(t.distance_km * 100) / 100,
        region_label: t.regionLabel,
        spawned_at:   t.spawnedAt.toISOString(),
        expires_at:   t.expiresAt?.toISOString() ?? null,
      })),
      total:     selected.length,
      radius_km,
      band_mix:  band.mix,
    };
  }

  /** Spawn a fresh tear in the given region's tier-banded radial,
   *  at a random angle. Used to maintain density after a tear is
   *  sealed (and, eventually, after the 24h expiry sweep). Returns
   *  null if the region or tier isn't recognized — the seal still
   *  succeeds; density just drifts down by one for that city/tier.
   *
   *  Placement is uniformly random within the tier's radial band.
   *  This intentionally differs from the seed's deterministic ring
   *  formula — once a city goes "live", successive respawns vary
   *  the spatial pattern so a returning player doesn't see the same
   *  six points forever. */
  async spawnReplacementTear(regionLabel: string | null, tier: string) {
    if (!regionLabel) return null;
    const center = CITY_CENTERS[regionLabel];
    const band   = TIER_RADIAL_BANDS[tier];
    if (!center || !band) return null;

    const radial = band.min + Math.random() * (band.max - band.min);
    const angle  = Math.random() * 2 * Math.PI;
    const lat    = center.lat + radial * Math.sin(angle);
    const lon    = center.lon + (radial * Math.cos(angle)) / Math.cos((center.lat * Math.PI) / 180);

    return this.prisma.worldTear.create({
      data: {
        lat,
        lon,
        tier,
        status:      'active',
        spawnedAt:   new Date(),
        expiresAt:   new Date(Date.now() + TEAR_LIFETIME_MS),
        regionLabel,
      },
    });
  }

  /** Seal a tear and immediately spawn a replacement in the same
   *  region + tier. Called from recordEncounter when an encounter
   *  is won with a world_tear_id. Idempotent — re-sealing an
   *  already-sealed tear is a no-op (returns false). */
  async sealWorldTear(tearId: string, rootId: string): Promise<boolean> {
    // Procedural tears carry a "{cellKey}#{slot}" id and have no active
    // row to mutate. Record the seal in tear_seal with a cooldown; the
    // generator excludes it until the cooldown elapses, after which the
    // slot regenerates (density self-heals — no replacement insert).
    if (tearId.includes('#')) {
      const cellKey = tearId.split('#')[0];
      const cfg = await this.config.getAll().catch(() => ({} as Record<string, unknown>));
      const cooldownHours =
        typeof cfg['veil.cooldown_hours'] === 'number' && !Number.isNaN(cfg['veil.cooldown_hours'])
          ? (cfg['veil.cooldown_hours'] as number)
          : PROC_DEFAULTS.cooldownHours;
      const cooldownUntil = new Date(Date.now() + cooldownHours * 3_600_000);
      await this.prisma.tearSeal.upsert({
        where:  { tearId },
        create: { tearId, cellKey, sealedByRootId: rootId, cooldownUntil },
        update: { sealedByRootId: rootId, sealedAt: new Date(), cooldownUntil },
      });
      return true;
    }

    // Legacy stored-row path (UUID ids from the original seed).
    const tear = await this.prisma.worldTear.findUnique({ where: { id: tearId } });
    if (!tear || tear.status !== 'active') return false;

    await this.prisma.worldTear.update({
      where: { id: tearId },
      data:  {
        status:         'sealed',
        sealedAt:       new Date(),
        sealedByRootId: rootId,
      },
    });

    // Fire-and-forget — replacement spawn shouldn't block the
    // encounter response.
    this.spawnReplacementTear(tear.regionLabel, tear.tier).catch(() => {
      // Soft-fail; the seal already committed. Density recovers
      // on the next maintenance sweep (Arc B slice 3b).
    });

    return true;
  }
}
