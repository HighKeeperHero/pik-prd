// ============================================================
// PIK — Quest Log Service (Sprint 32 — Cadence Quest Engine)
//
// Hero-facing daily / weekly / story quests, layered on the same
// QuestTemplate / PlayerQuest tables as the Sprint 7.3 venue
// board. Cadence quests differ from venue quests in three ways:
//
//   1. They auto-materialize per period (no accept step).
//      periodKey: 'YYYY-MM-DD' (daily) | 'YYYY-Wnn' (weekly,
//      ISO week, Monday start) | 'once' (story).
//   2. Progress is event-driven — gameplay services call
//      recordEvent() from their mutation paths — rather than
//      recomputed from venue-session stats.
//   3. Rewards are granted at CLAIM (player action), not at
//      completion. XP flows through LevelingService.grantXp so
//      the Fate Fox bonus and level-up caches apply.
//
// Story chains: templates sharing a chainKey, ordered by
// chainStep. Step n+1 materializes when step n is claimed.
//
// Objective types (template JSON):
//   seal_tears        { target, tier_min? }        tier 1..4
//   open_caches       { target, rarity_min? }
//   tend_hearth / swear_oath / complete_trial / complete_augury
//                     { target }
//   ritual_days       { target }                   all 4 in one UTC day
//   collect_lore      { target }
//   upgrade_wings     { target, track? }
//   reach_level       { target }                   evaluated lazily
//   complete_chapter  { chapter }
//   craft_works / smelt_works { target }           Forge (tag: forge_work)
// ============================================================

import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';
import { EventsService } from '../events/events.service';
import { LevelingService, XpAward } from '../leveling/leveling.service';

// ── Events emitted by gameplay services ─────────────────────

export type QuestEvent =
  | { type: 'tear_seal'; tier: number }
  | { type: 'cache_open'; rarity: string }
  | { type: 'hearth' }
  | { type: 'oath' }
  | { type: 'trial' }
  | { type: 'augury' }
  | { type: 'ritual_day' }
  | { type: 'lore_find' }
  | { type: 'wing_upgrade'; track: string }
  | { type: 'chapter_complete'; chapter: number }
  | { type: 'craft' }
  | { type: 'smelt' }
  // 2026-07-08 — Rite of Purification result (grade + tallies for
  // the weekly challenges; the plain 'trial' event still fires for
  // completion objectives).
  | { type: 'rite'; grade: string; purity: number; nodes: number; corruption: number }
  // 2026-07-09 — Fate Fox / Silent Witness beats (L50 chain):
  // investigate | follow | shrine | calling | bond.
  | { type: 'fox'; beat: string }
  // 2026-07-10 — Chapter I 'Arms of the Covenant' (first equip).
  | { type: 'gear_equip' }
  // 2026-07-10 — Veil Fauna banished (tier 1-4).
  | { type: 'fauna'; tier: number };

export interface CadenceObjective {
  id: string;
  type: string;
  label: string;
  target: number;
  tier_min?: number;
  rarity_min?: string;
  track?: string;
  chapter?: number;
}

export interface CadenceRewards {
  xp?: number;
  essence?: number;
  cache_rarity?: string;
  title_id?: string;
  /** 2026-07-10 — build materials (weekly quests = ore's source). */
  materials?: Record<string, number>;
}

export interface QuestProgressUpdate {
  slug: string;
  name: string;
  cadence: string;
  completed: boolean;
}

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'rare+', 'epic', 'legendary', 'artifact'];

function rarityRank(r: string): number {
  const i = RARITY_ORDER.indexOf(r);
  return i === -1 ? 0 : i;
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// ISO week key, Monday start — '2026-W28'
export function isoWeekKey(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // Thursday decides the year
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const ftDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function nextUtcMidnight(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return d;
}

function nextMondayUtc(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() + (7 - dayNum));
  return d;
}

interface ObjProgress {
  objective_id: string;
  completed: boolean;
  completed_at: string | null;
  current: number;
}

@Injectable()
export class QuestLogService {
  private readonly logger = new Logger(QuestLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly leveling: LevelingService,
  ) {}

  private periodKeyFor(cadence: string): string {
    if (cadence === 'daily') return todayUtc();
    if (cadence === 'weekly') return isoWeekKey();
    return 'once';
  }

  // ── MATERIALIZATION ──────────────────────────────────────
  // Ensure the hero has PlayerQuest rows for the current period
  // (daily/weekly) and for every unlocked story step. Idempotent
  // via createMany + skipDuplicates on (rootId, questId, periodKey).

  async ensureLog(rootId: string): Promise<void> {
    const hero = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      select: { fateLevel: true },
    });
    if (!hero) throw new NotFoundException(`Identity not found: ${rootId}`);

    const templates = await this.prisma.questTemplate.findMany({
      where: { status: 'active', cadence: { in: ['daily', 'weekly', 'story'] } },
      orderBy: [{ chainKey: 'asc' }, { chainStep: 'asc' }, { sortOrder: 'asc' }],
    });
    if (templates.length === 0) return;

    const existing = await this.prisma.playerQuest.findMany({
      where: { rootId, questId: { in: templates.map(t => t.id) } },
      select: { questId: true, periodKey: true, status: true },
    });
    const have = new Set(existing.map(e => `${e.questId}:${e.periodKey}`));
    const claimedIds = new Set(existing.filter(e => e.status === 'claimed').map(e => e.questId));

    const toCreate: { rootId: string; questId: string; periodKey: string; progress: Prisma.InputJsonValue }[] = [];

    const eligible = (t: { minLevel: number; maxLevel: number | null }) =>
      hero.fateLevel >= t.minLevel && (t.maxLevel === null || hero.fateLevel <= t.maxLevel);

    // Daily / weekly: one row per current period.
    for (const t of templates.filter(t => t.cadence !== 'story')) {
      if (!eligible(t)) continue;
      const periodKey = this.periodKeyFor(t.cadence);
      if (have.has(`${t.id}:${periodKey}`)) continue;
      toCreate.push({ rootId, questId: t.id, periodKey, progress: this.freshProgress(t) });
    }

    // Story: standalone quests materialize when eligible; chain
    // steps materialize when every earlier step is claimed.
    const chains = new Map<string, typeof templates>();
    for (const t of templates.filter(t => t.cadence === 'story')) {
      if (!t.chainKey) {
        if (eligible(t) && !have.has(`${t.id}:once`)) {
          toCreate.push({ rootId, questId: t.id, periodKey: 'once', progress: this.freshProgress(t) });
        }
        continue;
      }
      const list = chains.get(t.chainKey) ?? [];
      list.push(t);
      chains.set(t.chainKey, list);
    }

    // 2026-07-10 — the campaign reads in order: a chapter chain
    // materializes only when the PREVIOUS chapter's final step is
    // claimed (Quest_Chpt1-5: "Trigger: Chapter N-1 Complete").
    // minLevel remains an additional pacing floor. Rows already
    // materialized under the old rules are untouched.
    const CHAPTER_SEQUENCE = [
      'chapter_one', 'chapter_two', 'chapter_three', 'chapter_four', 'chapter_five',
    ];
    const chainComplete = (key: string): boolean => {
      const steps = chains.get(key);
      if (!steps || steps.length === 0) return false;
      return steps.every(s => claimedIds.has(s.id));
    };

    for (const [key, steps] of chains) {
      const seqIdx = CHAPTER_SEQUENCE.indexOf(key);
      if (seqIdx > 0 && !chainComplete(CHAPTER_SEQUENCE[seqIdx - 1])) {
        continue; // the previous chapter is still being written
      }
      steps.sort((a, b) => (a.chainStep ?? 0) - (b.chainStep ?? 0));
      for (const step of steps) {
        if (claimedIds.has(step.id)) continue; // done — look at the next step
        if (eligible(step) && !have.has(`${step.id}:once`)) {
          toCreate.push({ rootId, questId: step.id, periodKey: 'once', progress: this.freshProgress(step) });
        }
        break; // first unclaimed step is the frontier; later steps stay locked
      }
    }

    if (toCreate.length > 0) {
      await this.prisma.playerQuest.createMany({ data: toCreate, skipDuplicates: true });
    }
  }

  private freshProgress(t: { objectives: Prisma.JsonValue }): Prisma.InputJsonValue {
    const objectives = t.objectives as unknown as CadenceObjective[];
    const progress: ObjProgress[] = objectives.map(o => ({
      objective_id: o.id,
      completed: false,
      completed_at: null,
      current: 0,
    }));
    return progress as unknown as Prisma.InputJsonValue;
  }

  // ── EVENT-DRIVEN PROGRESS ────────────────────────────────
  // Called by gameplay services after their own mutation commits.
  // Never throws — quest bookkeeping must not fail the ritual,
  // seal, or cache-open that triggered it.

  async recordEvent(rootId: string, event: QuestEvent): Promise<QuestProgressUpdate[]> {
    try {
      return await this.applyEvent(rootId, event);
    } catch (err) {
      this.logger.error(`recordEvent(${event.type}) failed for ${rootId}: ${(err as Error).message}`);
      return [];
    }
  }

  private async applyEvent(rootId: string, event: QuestEvent): Promise<QuestProgressUpdate[]> {
    await this.ensureLog(rootId);

    const activePeriods = ['once', todayUtc(), isoWeekKey()];
    const rows = await this.prisma.playerQuest.findMany({
      where: {
        rootId,
        status: 'active',
        periodKey: { in: activePeriods },
        quest: { cadence: { in: ['daily', 'weekly', 'story'] }, status: 'active' },
      },
      include: { quest: true },
    });
    if (rows.length === 0) return [];

    // reach_level objectives are stat-based; fetch level once if any row needs it.
    const needsLevel = rows.some(r =>
      (r.quest.objectives as unknown as CadenceObjective[]).some(o => o.type === 'reach_level'));
    const fateLevel = needsLevel
      ? (await this.prisma.rootIdentity.findUnique({ where: { id: rootId }, select: { fateLevel: true } }))?.fateLevel ?? 1
      : 1;

    const updates: QuestProgressUpdate[] = [];

    for (const row of rows) {
      // Guard: a 'once'-period row can also be a legacy venue quest — cadence filter above handles it.
      const objectives = row.quest.objectives as unknown as CadenceObjective[];
      const progress = row.progress as unknown as ObjProgress[];
      let changed = false;

      for (const obj of objectives) {
        const prog = progress.find(p => p.objective_id === obj.id);
        if (!prog || prog.completed) continue;

        const inc = this.matchEvent(obj, event, fateLevel);
        if (inc === 0) continue;

        prog.current = obj.type === 'reach_level'
          ? Math.min(fateLevel, obj.target)
          : Math.min((prog.current ?? 0) + inc, obj.target);
        changed = true;

        if (prog.current >= obj.target) {
          prog.completed = true;
          prog.completed_at = new Date().toISOString();
        }
      }

      if (!changed) continue;

      const allComplete = progress.every(p => p.completed);
      await this.prisma.playerQuest.update({
        where: { id: row.id },
        data: {
          progress: progress as unknown as Prisma.InputJsonValue,
          ...(allComplete ? { status: 'completed', completedAt: new Date() } : {}),
        },
      });

      updates.push({
        slug: row.quest.slug ?? row.quest.id,
        name: row.quest.name,
        cadence: row.quest.cadence,
        completed: allComplete,
      });

      if (allComplete) {
        this.logger.log(`Quest objectives met: ${row.quest.name} (${row.quest.cadence}) for ${rootId}`);
      }
    }

    return updates;
  }

  // How much an event advances one objective. 0 = no match.
  private matchEvent(obj: CadenceObjective, event: QuestEvent, fateLevel: number): number {
    switch (obj.type) {
      case 'seal_tears':
        return event.type === 'tear_seal' && event.tier >= (obj.tier_min ?? 1) ? 1 : 0;
      case 'banish_fauna':
        return event.type === 'fauna' && event.tier >= (obj.tier_min ?? 1) ? 1 : 0;
      case 'open_caches':
        return event.type === 'cache_open' &&
          rarityRank(event.rarity) >= rarityRank(obj.rarity_min ?? 'common') ? 1 : 0;
      case 'tend_hearth':      return event.type === 'hearth' ? 1 : 0;
      case 'swear_oath':       return event.type === 'oath' ? 1 : 0;
      case 'complete_trial':   return event.type === 'trial' ? 1 : 0;
      case 'complete_augury':  return event.type === 'augury' ? 1 : 0;
      case 'ritual_days':      return event.type === 'ritual_day' ? 1 : 0;
      case 'collect_lore':     return event.type === 'lore_find' ? 1 : 0;
      case 'upgrade_wings':
        return event.type === 'wing_upgrade' && (!obj.track || obj.track === event.track) ? 1 : 0;
      case 'complete_chapter':
        return event.type === 'chapter_complete' && event.chapter === (obj.chapter ?? obj.target) ? obj.target : 0;
      case 'craft_works':      return event.type === 'craft' ? 1 : 0;
      case 'smelt_works':      return event.type === 'smelt' ? 1 : 0;
      // Rite of Purification weekly challenges — tally-type
      // objectives advance by the event's counts, not by 1.
      case 'equip_gear':         return event.type === 'gear_equip' ? 1 : 0;
      case 'fox_investigate':    return event.type === 'fox' && event.beat === 'investigate' ? 1 : 0;
      case 'fox_follow':         return event.type === 'fox' && event.beat === 'follow' ? 1 : 0;
      case 'fox_shrine':         return event.type === 'fox' && event.beat === 'shrine' ? 1 : 0;
      case 'fox_calling':        return event.type === 'fox' && event.beat === 'calling' ? 1 : 0;
      case 'fox_bond':           return event.type === 'fox' && event.beat === 'bond' ? 1 : 0;
      case 'rite_s_grades':      return event.type === 'rite' && event.grade === 'S' ? 1 : 0;
      case 'perfect_purity':     return event.type === 'rite' && event.purity >= 100 ? 1 : 0;
      case 'purify_nodes':       return event.type === 'rite' ? event.nodes : 0;
      case 'cleanse_corruption': return event.type === 'rite' ? event.corruption : 0;
      case 'reach_level':
        // Any event can surface a level threshold already met —
        // there is no level-up event, so the NEXT gameplay event
        // after crossing the threshold completes the quest, and
        // its quest_updates will attribute the fulfillment to an
        // unrelated action (verified 2026-07-09: a fauna banish
        // that tipped a hero past L3 returned "The First Echo"
        // FULFILLED alongside the fauna quest advances).
        return fateLevel >= obj.target ? obj.target : 0;
      default:
        return 0;
    }
  }

  // ── CLAIM ────────────────────────────────────────────────

  async claim(rootId: string, slug: string) {
    const template = await this.prisma.questTemplate.findUnique({ where: { slug } });
    if (!template) throw new NotFoundException(`Quest not found: ${slug}`);

    const periodKey = this.periodKeyFor(template.cadence);
    const row = await this.prisma.playerQuest.findUnique({
      where: { rootId_questId_periodKey: { rootId, questId: template.id, periodKey } },
    });
    if (!row) throw new NotFoundException(`Quest not on your log: ${slug}`);
    if (row.status === 'claimed') throw new ConflictException('Rewards already claimed.');
    if (row.status !== 'completed') throw new ConflictException('Quest is not complete yet.');

    const rewards = template.rewards as unknown as CadenceRewards;
    let xpAward: XpAward | null = null;

    if (rewards.xp && rewards.xp > 0) {
      xpAward = await this.leveling.grantXp(rootId, rewards.xp);
    }

    if (rewards.essence && rewards.essence > 0) {
      await this.prisma.sanctumState.upsert({
        where: { rootId },
        update: { veilEssence: { increment: rewards.essence } },
        create: { rootId, veilEssence: rewards.essence },
      });
    }

    let cacheGranted: string | null = null;
    if (rewards.cache_rarity) {
      await this.prisma.fateCache.create({
        data: {
          rootId,
          cacheType: 'quest',
          rarity: rewards.cache_rarity,
          trigger: `quest:${slug}`,
        },
      });
      cacheGranted = rewards.cache_rarity;
    }

    if (rewards.title_id) {
      await this.prisma.userTitle.upsert({
        where: { rootId_titleId: { rootId, titleId: rewards.title_id } },
        update: {},
        create: { rootId, titleId: rewards.title_id },
      });
    }

    // 2026-07-10 restoration economy — quests may pay build
    // materials (weekly quests are Sanctified Ore's only source).
    if (rewards.materials) {
      for (const [material, count] of Object.entries(rewards.materials)) {
        if (!count || count <= 0) continue;
        await this.prisma.materialStock.upsert({
          where:  { rootId_material: { rootId, material } },
          create: { rootId, material, count },
          update: { count: { increment: count } },
        });
      }
    }

    await this.prisma.playerQuest.update({
      where: { id: row.id },
      data: { status: 'claimed', claimedAt: new Date() },
    });

    await this.events.log({
      rootId,
      eventType: 'quest.claimed',
      payload: { slug, cadence: template.cadence, rewards },
    });

    // A claimed chain step unlocks the next one immediately.
    if (template.chainKey) await this.ensureLog(rootId);

    this.logger.log(`Quest claimed: ${slug} by ${rootId} (+${rewards.xp ?? 0} XP)`);

    return {
      slug,
      cadence: template.cadence,
      rewards,
      xp_award: xpAward,
      cache_granted: cacheGranted,
    };
  }

  // ── LOG (client surface) ─────────────────────────────────

  async getLog(rootId: string) {
    await this.ensureLog(rootId);

    const now = new Date();
    const periods = ['once', todayUtc(), isoWeekKey(now)];
    const rows = await this.prisma.playerQuest.findMany({
      where: {
        rootId,
        periodKey: { in: periods },
        quest: { cadence: { in: ['daily', 'weekly', 'story'] }, status: 'active' },
      },
      include: { quest: true },
      orderBy: { startedAt: 'asc' },
    });

    // Chain metadata so the client can render "step 2 of 5".
    const chainKeys = [...new Set(rows.map(r => r.quest.chainKey).filter(Boolean))] as string[];
    const chainSizes = new Map<string, number>();
    if (chainKeys.length > 0) {
      const counts = await this.prisma.questTemplate.groupBy({
        by: ['chainKey'],
        where: { chainKey: { in: chainKeys }, status: 'active' },
        _count: { _all: true },
      });
      for (const c of counts) if (c.chainKey) chainSizes.set(c.chainKey, c._count._all);
    }

    const entry = (row: (typeof rows)[number]) => {
      const objectives = row.quest.objectives as unknown as CadenceObjective[];
      const progress = row.progress as unknown as ObjProgress[];
      return {
        slug: row.quest.slug ?? row.quest.id,
        name: row.quest.name,
        description: row.quest.description,
        cadence: row.quest.cadence,
        chain_key: row.quest.chainKey,
        chain_step: row.quest.chainStep,
        chain_total: row.quest.chainKey ? chainSizes.get(row.quest.chainKey) ?? null : null,
        status: row.status,
        claimable: row.status === 'completed',
        objectives: objectives.map(o => {
          const p = progress.find(x => x.objective_id === o.id);
          return {
            id: o.id,
            label: o.label,
            current: p?.current ?? 0,
            target: o.target,
            completed: p?.completed ?? false,
          };
        }),
        rewards: row.quest.rewards as unknown as CadenceRewards,
      };
    };

    const sortByOrder = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
      a.quest.sortOrder - b.quest.sortOrder;

    return {
      daily: rows.filter(r => r.quest.cadence === 'daily').sort(sortByOrder).map(entry),
      weekly: rows.filter(r => r.quest.cadence === 'weekly').sort(sortByOrder).map(entry),
      story: rows
        .filter(r => r.quest.cadence === 'story' && r.status !== 'claimed')
        .sort(sortByOrder)
        .map(entry),
      resets: {
        daily_ends_at: nextUtcMidnight(now).toISOString(),
        weekly_ends_at: nextMondayUtc(now).toISOString(),
      },
    };
  }

  // ── FORGE WORKS (restoration bridge) ─────────────────────
  // Forge restoration L1-10 is paid in completed "forge works" —
  // claimed quests tagged forge_work. SanctumService reads this.

  async countTaggedClaims(rootId: string, tag: string): Promise<number> {
    return this.prisma.playerQuest.count({
      where: { rootId, status: 'claimed', quest: { tag } },
    });
  }

  // ── CHAPTER COMPLETION ───────────────────────────────────
  // Chapters have no backend record pre-Sprint 32; the ledger
  // (IdentityEvent) is the store. Idempotent per chapter. Grants
  // the canonical 1,000 XP (phase-2 locked parameters) once.

  static readonly CHAPTER_XP = 1000;

  async completeChapter(rootId: string, chapter: number) {
    if (!Number.isInteger(chapter) || chapter < 1 || chapter > 99) {
      throw new ConflictException('chapter must be a positive integer');
    }

    const prior = await this.prisma.identityEvent.findFirst({
      where: {
        rootId,
        eventType: 'chapter.completed',
        payload: { path: ['chapter'], equals: chapter },
      },
      select: { id: true },
    });

    if (prior) {
      return { chapter, already_completed: true, xp_award: null, quest_updates: [] };
    }

    await this.events.log({
      rootId,
      eventType: 'chapter.completed',
      payload: { chapter },
    });

    const xpAward = await this.leveling.grantXp(rootId, QuestLogService.CHAPTER_XP);
    const questUpdates = await this.recordEvent(rootId, { type: 'chapter_complete', chapter });

    return { chapter, already_completed: false, xp_award: xpAward, quest_updates: questUpdates };
  }
}
