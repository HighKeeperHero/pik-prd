// ============================================================
// PIK — Quest Service (Sprint 7.3 — Quest Engine)
//
// Cross-venue quest chains with auto-completion.
//
// Objective types:
//   complete_sessions — complete N sessions (optionally at specific source)
//   reach_level       — reach fate level N
//   earn_title        — earn a specific title
//   visit_zones       — check in at N distinct zones
//   defeat_boss       — deal N% boss damage across sessions
//   earn_xp           — accumulate N total XP
//
// Auto-evaluation: called after events fire. Checks all active
// player quests for objective completion. When all objectives
// are met, quest completes and rewards are granted.
//
// Place at: src/quest/quest.service.ts
// ============================================================

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';
import { EventsService } from '../events/events.service';
import { SseService } from '../sse/sse.service';


// ── Tier reward multipliers (Bronze→Adamantium) ───────────────────────────────
function getTierMultiplier(heroLevel: number): number {
  if (heroLevel >= 40) return 3.0;   // Adamantium
  if (heroLevel >= 30) return 2.5;   // Platinum
  if (heroLevel >= 22) return 2.0;   // Gold
  if (heroLevel >= 14) return 1.6;   // Silver
  if (heroLevel >= 7)  return 1.3;   // Copper
  return 1.0;                         // Bronze
}

export interface Objective {
  id: string;
  type: string;
  label: string;
  target: number;
  source_id?: string;
  title_id?: string;
  zones?: string[];
  quest_id?: string;
}

export interface ProgressEntry {
  objective_id: string;
  completed: boolean;
  completed_at: string | null;
  current?: number;
}

export interface QuestRewards {
  xp?: number;
  title_id?: string;
  cache_tier?: string;
}

@Injectable()
export class QuestService {
  private readonly logger = new Logger(QuestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly sse: SseService,
  ) {}

  // ── SEED / CREATE QUEST TEMPLATE ─────────────────────────

  async createTemplate(params: {
    name: string;
    description?: string;
    questType: string;
    objectives: Objective[];
    rewards: QuestRewards;
    minLevel?: number;
    maxLevel?: number;
    sourceId?: string;
    sortOrder?: number;
  }) {
    const template = await this.prisma.questTemplate.create({
      data: {
        name: params.name,
        description: params.description || null,
        questType: params.questType,
        objectives: params.objectives as unknown as Prisma.InputJsonValue,
        rewards: params.rewards as unknown as Prisma.InputJsonValue,
        minLevel: params.minLevel ?? 1,
        maxLevel: params.maxLevel ?? null,
        sourceId: params.sourceId || null,
        sortOrder: params.sortOrder ?? 0,
      },
    });

    this.logger.log(`Quest template created: ${template.name} (${template.id})`);
    return template;
  }

  // ── QUEST BOARD (available quests for a player) ──────────

  async getQuestBoard(rootId: string) {
    const user = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      select: { fateLevel: true },
    });
    if (!user) throw new NotFoundException(`Identity not found: ${rootId}`);

    // Get all active templates
    const templates = await this.prisma.questTemplate.findMany({
      where: { status: 'active' },
      orderBy: { sortOrder: 'asc' },
    });

    // Get player's existing quests
    const playerQuests = await this.prisma.playerQuest.findMany({
      where: { rootId },
    });
    const questMap = new Map(playerQuests.map(q => [q.questId, q]));

    return templates.map(t => {
      const pq = questMap.get(t.id);
      const objectives = t.objectives as unknown as Objective[];
      const rewards = t.rewards as unknown as QuestRewards;
      const progress = pq ? (pq.progress as unknown as ProgressEntry[]) : [];
      const completedCount = progress.filter(p => p.completed).length;

      const eligible = user.fateLevel >= t.minLevel &&
        (t.maxLevel === null || user.fateLevel <= t.maxLevel);

      return {
        quest_id: t.id,
        name: t.name,
        description: t.description,
        quest_type: t.questType,
        objectives: objectives.map(obj => {
          const prog = progress.find(p => p.objective_id === obj.id);
          return {
            id: obj.id,
            label: obj.label,
            type: obj.type,
            target: obj.target,
            completed: prog?.completed || false,
            current: prog?.current ?? 0,
          };
        }),
        rewards,
        status: pq?.status || (eligible ? 'available' : 'locked'),
        progress: `${completedCount}/${objectives.length}`,
        started_at: pq?.startedAt?.toISOString() ?? null,
        completed_at: pq?.completedAt?.toISOString() ?? null,
      };
    });
  }

  // ── ACCEPT QUEST ─────────────────────────────────────────

  async acceptQuest(rootId: string, questId: string) {
    const user = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      select: { id: true, heroName: true, fateLevel: true },
    });
    if (!user) throw new NotFoundException(`Identity not found: ${rootId}`);

    const template = await this.prisma.questTemplate.findUnique({
      where: { id: questId },
    });
    if (!template) throw new NotFoundException(`Quest not found: ${questId}`);
    if (template.status !== 'active') throw new BadRequestException('Quest is not active');
    if (user.fateLevel < template.minLevel) throw new BadRequestException(`Requires level ${template.minLevel}`);
    if (template.maxLevel && user.fateLevel > template.maxLevel) throw new BadRequestException(`Max level ${template.maxLevel}`);

    // Check for existing
    const existing = await this.prisma.playerQuest.findUnique({
      where: { rootId_questId: { rootId, questId } },
    });
    if (existing) {
      if (existing.status === 'active') throw new ConflictException('Quest already active');
      if (existing.status === 'completed') throw new ConflictException('Quest already completed');
    }

    const objectives = template.objectives as unknown as Objective[];
    const progress: ProgressEntry[] = objectives.map(obj => ({
      objective_id: obj.id,
      completed: false,
      completed_at: null,
      current: 0,
    }));

    const pq = await this.prisma.playerQuest.create({
      data: {
        rootId,
        questId,
        progress: progress as unknown as Prisma.InputJsonValue,
      },
    });

    await this.events.log({
      rootId,
      eventType: 'quest.accepted',
      payload: {
        quest_id: questId,
        quest_name: template.name,
        hero_name: user.heroName,
        objectives: objectives.length,
      },
    });

    this.logger.log(`Quest accepted: ${user.heroName} → ${template.name}`);

    return {
      player_quest_id: pq.id,
      quest_id: questId,
      quest_name: template.name,
      status: 'active',
      objectives: objectives.length,
    };
  }

  // ── ABANDON QUEST ────────────────────────────────────────

  async abandonQuest(rootId: string, questId: string) {
    const pq = await this.prisma.playerQuest.findUnique({
      where: { rootId_questId: { rootId, questId } },
      include: { quest: true },
    });
    if (!pq) throw new NotFoundException(`No active quest found`);
    if (pq.status !== 'active') throw new BadRequestException(`Quest is not active`);

    await this.prisma.playerQuest.delete({
      where: { rootId_questId: { rootId, questId } },
    });

    await this.events.log({
      rootId,
      eventType: 'quest.abandoned',
      payload: {
        quest_id: questId,
        quest_name: pq.quest.name,
      },
    });

    this.logger.log(`Quest abandoned: ${rootId} abandoned "${pq.quest.name}"`);
    return { status: 'ok', message: `Abandoned: ${pq.quest.name}` };
  }

  // ── AUTO-EVALUATE (called after events) ──────────────────

  async evaluateForPlayer(rootId: string) {
    // Get all active quests for this player
    const activeQuests = await this.prisma.playerQuest.findMany({
      where: { rootId, status: 'active' },
      include: { quest: true },
    });

    if (activeQuests.length === 0) return [];

    // Gather player stats for evaluation
    const stats = await this.gatherPlayerStats(rootId);
    const completedQuests: string[] = [];

    for (const pq of activeQuests) {
      const objectives = pq.quest.objectives as unknown as Objective[];
      const progress = pq.progress as unknown as ProgressEntry[];
      let changed = false;

      for (const obj of objectives) {
        const prog = progress.find(p => p.objective_id === obj.id);
        if (!prog || prog.completed) continue;

        const result = this.evaluateObjective(obj, stats);
        if (result.current !== (prog.current ?? 0)) {
          prog.current = result.current;
          changed = true;
        }
        if (result.met && !prog.completed) {
          prog.completed = true;
          prog.completed_at = new Date().toISOString();
          prog.current = obj.target;
          changed = true;
          this.logger.log(`Objective completed: ${obj.label} for quest ${pq.quest.name}`);
        }
      }

      if (!changed) continue;

      // Check if all objectives are now complete
      const allComplete = progress.every(p => p.completed);

      if (allComplete) {
        // Complete the quest!
        await this.prisma.playerQuest.update({
          where: { id: pq.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            progress: progress as unknown as Prisma.InputJsonValue,
          },
        });

        // Grant rewards
        const rewards = pq.quest.rewards as unknown as QuestRewards;
        await this.grantRewards(rootId, rewards, pq.quest.name);

        await this.events.log({
          rootId,
          eventType: 'quest.completed',
          payload: {
            quest_id: pq.questId,
            quest_name: pq.quest.name,
            hero_name: stats.heroName,
            rewards,
          },
        });

        completedQuests.push(pq.quest.name);
        this.logger.log(`Quest completed! ${stats.heroName} finished "${pq.quest.name}"`);
      } else {
        // Just save progress
        await this.prisma.playerQuest.update({
          where: { id: pq.id },
          data: {
            progress: progress as unknown as Prisma.InputJsonValue,
          },
        });

        // Broadcast progress update
        const completedCount = progress.filter(p => p.completed).length;
        this.sse.emit('quest.progress', {
          root_id: rootId,
          quest_id: pq.questId,
          quest_name: pq.quest.name,
          hero_name: stats.heroName,
          progress: `${completedCount}/${objectives.length}`,
        });
      }
    }

    return completedQuests;
  }

  // ── PLAYER QUEST HISTORY ─────────────────────────────────

  async getPlayerQuests(rootId: string) {
    const quests = await this.prisma.playerQuest.findMany({
      where: { rootId },
      include: { quest: true },
      orderBy: { startedAt: 'desc' },
    });

    return quests.map(pq => {
      const objectives = pq.quest.objectives as unknown as Objective[];
      const progress = pq.progress as unknown as ProgressEntry[];
      const completedCount = progress.filter(p => p.completed).length;

      return {
        player_quest_id: pq.id,
        quest_id: pq.questId,
        name: pq.quest.name,
        description: pq.quest.description,
        quest_type: pq.quest.questType,
        status: pq.status,
        progress: `${completedCount}/${objectives.length}`,
        objectives: objectives.map(obj => {
          const prog = progress.find(p => p.objective_id === obj.id);
          return {
            id: obj.id,
            label: obj.label,
            completed: prog?.completed || false,
            current: prog?.current ?? 0,
            target: obj.target,
          };
        }),
        rewards: pq.quest.rewards as unknown as QuestRewards,
        started_at: pq.startedAt.toISOString(),
        completed_at: pq.completedAt?.toISOString() ?? null,
      };
    });
  }

  // ── GET ALL TEMPLATES ────────────────────────────────────

  async getTemplates() {
    return this.prisma.questTemplate.findMany({
      where: { status: 'active' },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ── STAT GATHERING ───────────────────────────────────────

  private async gatherPlayerStats(rootId: string) {
    const [user, sessions, titles, markers] = await Promise.all([
      this.prisma.rootIdentity.findUnique({
        where: { id: rootId },
        select: { heroName: true, fateLevel: true, fateXp: true },
      }),
      this.prisma.playerSession.findMany({
        where: { rootId, status: 'completed' },
        select: { sourceId: true, zone: true, summary: true },
      }),
      this.prisma.userTitle.findMany({
        where: { rootId },
        select: { titleId: true },
      }),
      this.prisma.fateMarker.findMany({
        where: { rootId },
        select: { marker: true },
      }),
    ]);

    const zones = new Set<string>();
    let totalBossPct = 0;
    let bossKills = 0;
    for (const s of sessions) {
      if (s.zone) zones.add(s.zone);
      const summary = s.summary as any;
      if (summary?.boss_damage_pct) {
        totalBossPct += summary.boss_damage_pct;
        if (summary.boss_damage_pct >= 100) bossKills++;
      }
    }

    return {
      heroName: user?.heroName || 'Unknown',
      fateLevel: user?.fateLevel || 1,
      fateXp: user?.fateXp || 0,
      totalSessions: sessions.length,
      sessionsBySource: this.countBy(sessions, s => s.sourceId),
      zones: Array.from(zones),
      totalZones: zones.size,
      titles: titles.map(t => t.titleId),
      markers: markers.map(m => m.marker),
      totalBossPct,
      bossKills,
    };
  }

  private evaluateObjective(obj: Objective, stats: any): { met: boolean; current: number } {
    switch (obj.type) {
      case 'complete_sessions': {
        const count = obj.source_id
          ? (stats.sessionsBySource[obj.source_id] || 0)
          : stats.totalSessions;
        return { met: count >= obj.target, current: Math.min(count, obj.target) };
      }
      case 'reach_level':
        return { met: stats.fateLevel >= obj.target, current: Math.min(stats.fateLevel, obj.target) };
      case 'earn_title':
        return { met: stats.titles.includes(obj.title_id), current: stats.titles.includes(obj.title_id) ? 1 : 0 };
      case 'visit_zones': {
        const matched = (obj.zones || []).filter((z: string) => stats.zones.includes(z)).length;
        return { met: matched >= obj.target, current: Math.min(matched, obj.target) };
      }
      case 'defeat_boss':
        return { met: stats.bossKills >= obj.target, current: Math.min(stats.bossKills, obj.target) };
      case 'earn_xp':
        return { met: stats.fateXp >= obj.target, current: Math.min(stats.fateXp, obj.target) };
      default:
        return { met: false, current: 0 };
    }
  }

  private async grantRewards(rootId: string, rewards: QuestRewards, questName: string) {
    if (rewards.xp && rewards.xp > 0) {
      // Fetch hero level to apply tier multiplier
      const identity = await this.prisma.rootIdentity.findUnique({
        where: { id: rootId },
        select: { heroLevel: true },
      });
      const multiplier  = getTierMultiplier(identity?.heroLevel ?? 1);
      const scaledXp    = Math.round(rewards.xp * multiplier);

      await this.prisma.rootIdentity.update({
        where: { id: rootId },
        data: { fateXp: { increment: scaledXp } },
      });
      this.logger.log(
        `Quest reward: +${scaledXp} XP (base ${rewards.xp} × ${multiplier} tier) for completing "${questName}"`,
      );
    }

    if (rewards.title_id) {
      const existing = await this.prisma.userTitle.findUnique({
        where: { rootId_titleId: { rootId, titleId: rewards.title_id } },
      });
      if (!existing) {
        await this.prisma.userTitle.create({
          data: { rootId, titleId: rewards.title_id },
        });
        this.logger.log(`Quest reward: title "${rewards.title_id}" for completing "${questName}"`);
      }
    }
  }

  private countBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const item of arr) {
      const key = keyFn(item);
      result[key] = (result[key] || 0) + 1;
    }
    return result;
  }

  // ── SEED DEFAULT QUESTS ──────────────────────────────────

  async seedDefaultQuests() {
    const existing = await this.prisma.questTemplate.count();
    if (existing > 0) return { seeded: false, message: 'Quests already exist' };

    const quests = [
      {
        name: "Veil Walker's Trial",
        description: 'Prove your worth across the venue — complete 3 sessions and reach Level 5.',
        questType: 'cross_venue',
        objectives: [
          { id: 'vwt-1', type: 'complete_sessions', label: 'Complete 3 sessions', target: 3 },
          { id: 'vwt-2', type: 'reach_level', label: 'Reach Fate Level 5', target: 5 },
        ],
        rewards: { xp: 200, title_id: 'title_veil_walker' },
        sortOrder: 1,
      },
      {
        name: 'Arena Champion',
        description: 'Defeat the Shade Captain with a perfect score in 2 sessions.',
        questType: 'single_venue',
        objectives: [
          { id: 'ac-1', type: 'defeat_boss', label: 'Defeat the boss twice', target: 2 },
          { id: 'ac-2', type: 'complete_sessions', label: 'Complete 5 sessions', target: 5 },
        ],
        rewards: { xp: 300, title_id: 'title_arena_champion' },
        sortOrder: 2,
      },
      {
        name: 'The Grand Tour',
        description: 'Visit every zone in the venue — explore the full experience.',
        questType: 'cross_venue',
        objectives: [
          {
            id: 'gt-1', type: 'visit_zones', label: 'Visit all 5 zones', target: 5,
            zones: ['Obsidian Spire', 'Veil Gate Approach', 'The Crucible Arena', "Shade Captain's Lair", 'The Binding Chamber'],
          },
        ],
        rewards: { xp: 250, title_id: 'title_grand_tourist' },
        sortOrder: 3,
      },
      {
        name: 'Fate Ascendant',
        description: 'Reach the pinnacle — Level 10 and 1000 total XP.',
        questType: 'achievement',
        objectives: [
          { id: 'fa-1', type: 'reach_level', label: 'Reach Fate Level 10', target: 10 },
          { id: 'fa-2', type: 'earn_xp', label: 'Earn 1000 total XP', target: 1000 },
        ],
        rewards: { xp: 500, title_id: 'title_fate_ascendant' },
        minLevel: 5,
        sortOrder: 4,
      },
    ];

    for (const q of quests) {
      await this.createTemplate({
        name: q.name,
        description: q.description,
        questType: q.questType,
        objectives: q.objectives as Objective[],
        rewards: q.rewards,
        minLevel: q.minLevel,
        sortOrder: q.sortOrder,
      });
    }

    return { seeded: true, count: quests.length };
  }
}
