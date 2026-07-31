// src/training/training.service.ts
// ============================================================
// Sprint 7A — Training System
// Pillars: Forge (Physical) | Lore (Mental) | Veil (Spiritual)
// ============================================================

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';
import { LevelingService } from '../leveling/leveling.service';
import { QuestLogService } from '../quest/quest-log.service';
import {
  LogTrainingDto,
  CompleteRiteDto,
  DeclareOathDto,
  ResolveOathDto,
  Pillar,
} from './dto/training.dto';
import {
  DISCIPLINE_ATTRIBUTES, ACTIVITY_CATALOG, activityById, scaledGrants,
  RITE_ACTIVITY, ATTR_LEVELS, LEGACY_LEVELS, levelFromXp,
} from './legacy';
import { OATH_PRESETS, oathPresetById, type OathPreset } from './oaths';

// ── XP Constants ──────────────────────────────────────────────────────────────
const XP = {
  RITE_BASE:          50,
  ALL_THREE_BONUS:    75,
  ALIGNMENT_BONUS:    50,
  STREAK_3_PCT:       0.10,
  STREAK_7_PCT:       0.25,
  OATH_KEPT:          200,
  OATH_BROKEN_DEBT:   0,     // Tim 2026-07-31: an unkept oath costs NOTHING
} as const;

// Pillar XP thresholds per level (cumulative)
const PILLAR_LEVELS = [0, 200, 500, 1000, 1800, 3000, 4500, 6500, 9000, 12000, 16000];

// Alignment → which pillar triggers the resonance bonus
const ALIGNMENT_RESONANCE: Record<string, Pillar | 'all'> = {
  ORDER: 'forge',
  CHAOS: 'lore',
  LIGHT: 'veil',
  DARK:  'all',   // all 3 rites in one day
};

// Pillar → ordered activity types for title generation
const PILLAR_TITLES: Record<string, string[]> = {
  forge: ['Forge Initiate', 'Forge Adept', 'Forge Hardened', 'Forge Master', 'Iron-Sworn'],
  lore:  ['Lore Seeker',   'Lore Keeper', 'Lore Warden',    'Lore Sage',    'Veil Scholar'],
  veil:  ['Veil Touched',  'Veil Walker', 'Veil Warden',    'Veil Bound',   'The Still Point'],
};

// Date helpers
function todayKey() {
  return new Date().toISOString().split('T')[0]; // "2026-03-08"
}
function weekKey() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // Start of week (Sunday)
  return d.toISOString().split('T')[0];
}
function lastWeekKey() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() - 7); // Start of previous week (Sunday)
  return d.toISOString().split('T')[0];
}

@Injectable()
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);

  constructor(
    private readonly prisma:   PrismaService,
    private readonly events:   EventsService,
    private readonly leveling: LevelingService,
    private readonly questLog: QuestLogService,
  ) {}

  // ── GET DAILY RITES ───────────────────────────────────────────────────────────
  // Generates today's 3 rites if not yet created. One per pillar, random from pool.

  async getDailyRites(rootId: string) {
    await this.ensureHeroExists(rootId);
    const dateKey = todayKey();

    let rites = await this.prisma.dailyRite.findMany({
      where: { rootId, dateKey },
      include: { template: true },
      orderBy: { pillar: 'asc' },
    });

    if (rites.length < 3) {
      rites = await this.generateDailyRites(rootId, dateKey);
    }

    const pillarProgress = await this.getPillarProgressMap(rootId);
    const streak = await this.getCurrentStreak(rootId);

    return {
      date:    dateKey,
      streak,
      rites:   rites.map(r => this.formatRite(r)),
      summary: this.buildDailySummary(rites, streak),
      pillar_progress: pillarProgress,
    };
  }

  // ── COMPLETE A RITE ───────────────────────────────────────────────────────────

  async completeRite(rootId: string, dto: CompleteRiteDto) {
    const rite = await this.prisma.dailyRite.findFirst({
      where: { id: dto.rite_id, rootId },
      include: { template: true, root: true },
    });

    if (!rite) throw new NotFoundException('Rite not found');
    if (rite.status === 'completed') throw new BadRequestException('Rite already completed');

    const dateKey = todayKey();
    if (rite.dateKey !== dateKey) throw new BadRequestException('This rite has expired');

    // Calculate XP
    const alignment = rite.root.fateAlignment?.toUpperCase();
    let xp: number = XP.RITE_BASE;

    // Alignment resonance
    const resonance = ALIGNMENT_RESONANCE[alignment] ?? null;
    let resonanceApplied = false;
    if (resonance === rite.template.pillar) {
      xp += XP.ALIGNMENT_BONUS;
      resonanceApplied = true;
    }

    // Check if this completes all 3 rites for the day
    const completedToday = await this.prisma.dailyRite.count({
      where: { rootId, dateKey, status: 'completed' },
    });
    const allThreeBonus = completedToday === 2; // This is the 3rd
    if (allThreeBonus) {
      xp += XP.ALL_THREE_BONUS;
      // DARK alignment resonance: all 3 rites
      if (resonance === 'all') {
        xp += XP.ALIGNMENT_BONUS;
        resonanceApplied = true;
      }
    }

    // Streak multiplier
    const streak = await this.getCurrentStreak(rootId);
    const newStreak = streak + (completedToday === 0 ? 1 : 0); // First rite of the day advances streak
    if (newStreak >= 7) xp = Math.round(xp * (1 + XP.STREAK_7_PCT));
    else if (newStreak >= 3) xp = Math.round(xp * (1 + XP.STREAK_3_PCT));

    // Commit everything in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Mark rite complete
      await tx.dailyRite.update({
        where: { id: rite.id },
        data: { status: 'completed', completedAt: new Date(), xpGranted: xp },
      });

      // Log training entry
      const entry = await tx.trainingEntry.create({
        data: {
          rootId,
          pillar:       rite.template.pillar,
          activityType: 'other', // Rite completion — no specific activity
          notes:        dto.notes ?? null,
          xpGranted:    xp,
          dailyRiteId:  rite.id,
        },
      });

      // Pillar progress + 7-day streak Fate Seal stay inside the tx so they
      // mirror the rite completion's atomicity. Fate XP is granted after the
      // tx commits — LevelingService does its own findUnique+update.
      await this.updatePillarXp(tx, rootId, rite.template.pillar as Pillar, xp);

      // A rite IS an activity — grant its base-session attribute XP
      // (Legacy Development brief: quests reward discipline AND
      // attribute XP; the daily rite is the daily quest).
      const riteActivity = activityById(RITE_ACTIVITY[rite.templateId] ?? '');
      const attributeXp = riteActivity
        ? await this.upsertAttributeXp(tx, rootId, rite.template.pillar as Pillar, scaledGrants(riteActivity))
        : {};

      let sealGranted = false;
      if (newStreak >= 7 && newStreak % 7 === 0) {
        await tx.fateCache.create({
          data: { rootId, cacheType: 'milestone', trigger: `streak:${newStreak}`, rarity: 'uncommon' },
        });
        sealGranted = true;
      }

      return { entry, xp, sealGranted, allThreeBonus, resonanceApplied, attributeXp };
    });

    // Legacy milestone check (post-tx, non-critical)
    await this.checkLegacyMilestone(rootId, xp);

    // Advance daily/weekly training quests (never throws)
    const questUpdates = await this.questLog.recordEvent(rootId, {
      type: 'rite_done', pillar: rite.template.pillar,
    });

    // Grant Fate XP (LevelingService is the canonical curve + level-up source)
    const xpAward = await this.leveling.grantXp(rootId, xp);

    // Log event
    await this.events.log({
      rootId,
      sourceId: 'codex-platform',
      eventType: 'training.rite_completed',
      payload: {
        rite_id:    rite.id,
        pillar:     rite.template.pillar,
        xp_granted: xp,
        all_three:  allThreeBonus,
        resonance:  resonanceApplied,
        streak:     newStreak,
      },
    });

    this.logger.log(`Rite completed: ${rootId} | ${rite.template.pillar} | +${xp} XP`);

    return {
      message:          this.buildCompletionMessage(rite.template.pillar, allThreeBonus, resonanceApplied),
      xp_granted:       result.xp,
      all_three_bonus:  result.allThreeBonus,
      resonance_bonus:  result.resonanceApplied,
      seal_granted:     result.sealGranted,
      attribute_xp:     result.attributeXp,
      fate_xp:          xpAward?.fate_xp ?? 0,
      fate_level:       xpAward?.fate_level ?? 1,
      leveled_up:       xpAward?.leveled_up ?? false,
      quest_updates:    questUpdates,
    };
  }

  // ── LOG AN ACTIVITY ───────────────────────────────────────────────────────────
  // The Legacy Development brief's bottom layer: an activity grants XP
  // to MULTIPLE attributes (who you become); discipline XP is the sum
  // of the attribute XP. No Fate XP — Legacy never buys combat power.

  async logTraining(rootId: string, dto: LogTrainingDto) {
    await this.ensureHeroExists(rootId);

    const def = activityById(dto.activity_type);
    if (def && def.pillar !== dto.pillar) {
      throw new BadRequestException('That practice belongs to another life.');
    }

    // 'other' (and any unmapped legacy value): flat discipline XP,
    // no attribute growth — the record keeps it, the radar doesn't.
    const grants   = def ? scaledGrants(def, dto.duration_min) : {};
    const pillarXp = def
      ? Object.values(grants).reduce((s, n) => s + n, 0)
      : 25;

    const { entry, attributeXp } = await this.prisma.$transaction(async (tx) => {
      const e = await tx.trainingEntry.create({
        data: {
          rootId,
          pillar:       dto.pillar,
          activityType: dto.activity_type,
          durationMin:  dto.duration_min ?? null,
          notes:        dto.notes ?? null,
          xpGranted:    pillarXp,
        },
      });

      const attrs = def ? await this.upsertAttributeXp(tx, rootId, dto.pillar, grants) : {};
      await this.updatePillarXp(tx, rootId, dto.pillar, pillarXp);

      return { entry: e, attributeXp: attrs };
    });

    // Legacy milestone check (post-tx, non-critical)
    await this.checkLegacyMilestone(rootId, pillarXp);

    // Advance daily/weekly training quests (never throws)
    const questUpdates = await this.questLog.recordEvent(rootId, {
      type: 'training_log', pillar: dto.pillar, minutes: dto.duration_min ?? def?.baseMinutes ?? 30,
    });

    await this.events.log({
      rootId,
      sourceId: 'codex-platform',
      eventType: 'training.logged',
      payload: {
        pillar:        dto.pillar,
        activity_type: dto.activity_type,
        duration_min:  dto.duration_min,
        pillar_xp:     pillarXp,
        attribute_xp:  attributeXp,
      },
    });

    return {
      message:       this.buildLogMessage(dto.pillar, dto.activity_type),
      entry_id:      entry.id,
      pillar_xp:     pillarXp,
      attribute_xp:  attributeXp,
      quest_updates: questUpdates,
    };
  }

  // ── THE LEGACY READOUT ────────────────────────────────────────────────────────
  // One call for the whole hierarchy (brief: Legacy > Discipline >
  // Attributes > Activities): legacy level from TOTAL discipline XP,
  // per-discipline XP/level/streak, all 18 attributes, and the
  // activity catalog the logger renders from.

  async getLegacy(rootId: string) {
    await this.ensureHeroExists(rootId);

    const [pillars, attrs] = await Promise.all([
      this.prisma.pillarProgress.findMany({ where: { rootId } }),
      this.prisma.attributeProgress.findMany({ where: { rootId } }),
    ]);

    const attrMap = new Map(attrs.map(a => [a.attribute, a]));
    const totalXp = pillars.reduce((s, p) => s + p.xp, 0);
    const legacyLevel = levelFromXp(totalXp, LEGACY_LEVELS);
    const nextAt = LEGACY_LEVELS[legacyLevel] ?? null;

    const disciplines = (['forge', 'lore', 'veil'] as Pillar[]).map(pillar => {
      const p = pillars.find(r => r.pillar === pillar);
      return {
        pillar,
        xp:             p?.xp ?? 0,
        level:          p?.level ?? 1,
        streak:         p?.streak ?? 0,
        longest_streak: p?.longestStreak ?? 0,
        attributes: DISCIPLINE_ATTRIBUTES[pillar].map(def => {
          const rec = attrMap.get(def.id);
          const xp = rec?.xp ?? 0;
          const level = levelFromXp(xp, ATTR_LEVELS);
          const floor = ATTR_LEVELS[level - 1] ?? 0;
          const ceil  = ATTR_LEVELS[level] ?? null;
          return {
            attribute:  def.id,
            name:       def.name,
            theme:      def.theme,
            xp,
            level,
            max_level:  ATTR_LEVELS.length,
            xp_in_level: xp - floor,
            xp_to_next:  ceil === null ? 0 : ceil - xp,
          };
        }),
      };
    });

    return {
      legacy: {
        level:      legacyLevel,
        max_level:  LEGACY_LEVELS.length,
        total_xp:   totalXp,
        xp_to_next: nextAt === null || legacyLevel >= LEGACY_LEVELS.length ? 0 : nextAt - totalXp,
      },
      disciplines,
      activities: ACTIVITY_CATALOG.map(a => ({
        id: a.id, pillar: a.pillar, name: a.name,
        base_minutes: a.baseMinutes, grants: a.grants,
      })),
    };
  }

  // ── GET PILLAR PROGRESS ───────────────────────────────────────────────────────

  async getPillarProgress(rootId: string) {
    await this.ensureHeroExists(rootId);
    return this.getPillarProgressMap(rootId);
  }

  // ── GET CHRONICLE ─────────────────────────────────────────────────────────────

  async getChronicle(rootId: string, limit = 20) {
    await this.ensureHeroExists(rootId);

    const entries = await this.prisma.trainingEntry.findMany({
      where: { rootId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return entries.map(e => ({
      entry_id:      e.id,
      pillar:        e.pillar,
      activity_type: e.activityType,
      duration_min:  e.durationMin,
      notes:         e.notes,
      xp_granted:    e.xpGranted,
      lore_text:     this.buildChronicleEntry(e.pillar, e.activityType, e.durationMin),
      created_at:    e.createdAt.toISOString(),
    }));
  }

  // ── OATHS ─────────────────────────────────────────────────────────────────────

  /** The vows on offer. Presets only (Tim, 2026-07-31). */
  getOathPresets() {
    return {
      week_of: weekKey(),
      presets: OATH_PRESETS.map(p => ({
        preset_id:   p.id,
        pillar:      p.pillar,
        declaration: p.declaration,
        measure:     p.measure,
        target:      p.target,
        metric:      p.metric,
      })),
    };
  }

  async declareOath(rootId: string, dto: DeclareOathDto) {
    await this.ensureHeroExists(rootId);
    const week = weekKey();

    const preset = oathPresetById(dto.preset_id);
    if (!preset) throw new BadRequestException('No such vow stands on the altar.');

    const existing = await this.prisma.oath.findUnique({
      where: { rootId_weekOf: { rootId, weekOf: week } },
    });
    if (existing) throw new BadRequestException('An oath has already been declared this week');

    const oath = await this.prisma.oath.create({
      data: {
        rootId,
        pillar:      preset.pillar,
        // The preset id is stored alongside the words so progress can
        // be recomputed later without guessing which vow was taken.
        declaration: `${preset.declaration}␟${preset.id}`,
        weekOf:      week,
      },
    });

    await this.events.log({
      rootId,
      sourceId: 'codex-platform',
      eventType: 'training.oath_declared',
      payload: { pillar: preset.pillar, preset_id: preset.id, week_of: week },
    });

    return {
      oath_id: oath.id,
      message: `"${preset.declaration}" — your word is entered into the Codex. The Veil watches.`,
      week_of: week,
      pillar:  preset.pillar,
    };
  }

  // ── OATH PROGRESS + AUTO-RESOLUTION ───────────────────────────────────────────
  // Every preset counts rows we already write, so the oath verifies
  // itself. Hit the target and it resolves KEPT on the spot. Miss the
  // week and nothing happens at all — no debt, no guilt (Tim's lock).

  private splitDeclaration(stored: string): { text: string; presetId: string | null } {
    const [text, presetId] = stored.split('\u241F');
    return { text, presetId: presetId ?? null };
  }

  private async oathProgress(rootId: string, preset: OathPreset, weekOf: string): Promise<number> {
    const start = new Date(`${weekOf}T00:00:00.000Z`);
    if (preset.metric === 'rites') {
      return this.prisma.dailyRite.count({
        where: { rootId, pillar: preset.pillar, status: 'completed', dateKey: { gte: weekOf } },
      });
    }
    if (preset.metric === 'activities') {
      return this.prisma.trainingEntry.count({
        where: { rootId, pillar: preset.pillar, createdAt: { gte: start } },
      });
    }
    const agg = await this.prisma.trainingEntry.aggregate({
      where: { rootId, pillar: preset.pillar, createdAt: { gte: start } },
      _sum: { durationMin: true },
    });
    return agg._sum.durationMin ?? 0;
  }

  async getActiveOath(rootId: string) {
    const week = weekKey();
    const oath = await this.prisma.oath.findUnique({
      where: { rootId_weekOf: { rootId, weekOf: week } },
    });
    if (!oath) return null;

    const { text, presetId } = this.splitDeclaration(oath.declaration);
    const preset = presetId ? oathPresetById(presetId) : undefined;
    if (!preset) return { ...this.formatOath(oath), declaration: text };

    const progress = await this.oathProgress(rootId, preset, oath.weekOf);
    let row = oath;

    // Met it → resolve KEPT now, so the reward lands in the moment
    // the hero earns it rather than at some unseen week boundary.
    if (row.status === 'pending' && progress >= preset.target) {
      row = await this.prisma.oath.update({
        where: { id: oath.id },
        data:  { status: 'kept', resolvedAt: new Date(), xpGranted: XP.OATH_KEPT },
      });
      await this.leveling.grantXp(rootId, XP.OATH_KEPT).catch(() => {});
      await this.prisma.fateMarker
        .create({ data: { rootId, marker: `Kept the ${preset.pillar} oath: "${preset.declaration}"` } })
        .catch(() => {});
      await this.events.log({
        rootId,
        sourceId: 'codex-platform',
        eventType: 'training.oath_resolved',
        payload: { oath_id: oath.id, status: 'kept', xp: XP.OATH_KEPT, preset_id: preset.id },
      }).catch(() => {});
      this.logger.log(`Oath kept: ${rootId} | ${preset.id}`);
    }

    return {
      ...this.formatOath(row),
      declaration: text,
      preset_id:   preset.id,
      measure:     preset.measure,
      metric:      preset.metric,
      target:      preset.target,
      progress:    Math.min(progress, preset.target),
      xp_kept:     XP.OATH_KEPT,
    };
  }

  async resolveOath(rootId: string, oathId: string, dto: ResolveOathDto) {
    const oath = await this.prisma.oath.findFirst({
      where: { id: oathId, rootId, status: 'pending' },
      include: { root: true },
    });
    if (!oath) throw new NotFoundException('Active oath not found');

    let xpGranted: number | null = null;
    let message: string;

    if (dto.status === 'kept') {
      xpGranted = XP.OATH_KEPT;
      await this.prisma.$transaction(async (tx) => {
        await tx.oath.update({
          where: { id: oathId },
          data: { status: 'kept', resolvedAt: new Date(), xpGranted },
        });
        // Add a fate marker for the Chronicle
        await tx.fateMarker.create({
          data: { rootId, marker: `Kept the ${oath.pillar} oath: "${oath.declaration}"` },
        });
      });
      // Fate XP grant + level-up via LevelingService (canonical curve)
      await this.leveling.grantXp(rootId, xpGranted!);
      message = 'Your word held. The Chronicle grows. The Veil acknowledges your resolve.';
    } else {
      // Oath v2: an unkept oath costs NOTHING (Tim, 2026-07-31). No
      // Fate XP change, no debt marker — the week simply closes. The
      // ethic is the Warband flame's: a hard week is carried, not
      // punished.
      await this.prisma.oath.update({
        where: { id: oathId },
        data: { status: 'broken', resolvedAt: new Date(), xpGranted: 0 },
      });
      message = 'The week turned before the word was kept. Nothing is taken. Begin again.';
    }

    await this.events.log({
      rootId,
      sourceId: 'codex-platform',
      eventType: 'training.oath_resolved',
      payload: { oath_id: oathId, status: dto.status, xp: xpGranted ?? XP.OATH_BROKEN_DEBT },
    });

    return { message, status: dto.status, xp_delta: xpGranted ?? XP.OATH_BROKEN_DEBT };
  }

  // ── OATH ACCOUNTABILITY FEED ──────────────────────────────────────────────────
  // Public feed of a given week's oath activity (declared, kept, broken).
  // Called by GET /api/training/oaths/feed?limit=30&week=current|last

  async getOathFeed(limit = 30, period: 'current' | 'last' = 'current') {
    const week = period === 'last' ? lastWeekKey() : weekKey();

    const oaths = await this.prisma.oath.findMany({
      where:    { weekOf: week },
      include:  { root: true },          // full include avoids select field-name guessing
      orderBy:  { status: 'asc' },       // resolved oaths (broken/kept) sort before pending
      take:     limit,
    });

    return oaths.map(o => ({
      oath_id:     o.id,
      pillar:      o.pillar,
      // Pending declarations hidden until resolved (suspense mechanic)
      declaration: o.status !== 'pending' ? o.declaration : null,
      week_of:     o.weekOf,
      status:      o.status,            // 'pending' | 'kept' | 'broken'
      alignment:   (o.root?.fateAlignment?.toUpperCase()) ?? 'NONE',
      hero_name:   o.root?.heroName ?? 'Unknown Hero',
      fate_level:  o.root?.fateLevel ?? 1,
      resolved_at: o.resolvedAt?.toISOString() ?? null,
      xp_delta:    o.xpGranted ?? null,
    }));
  }

  // ── PRIVATE HELPERS ───────────────────────────────────────────────────────────

  private async ensureHeroExists(rootId: string) {
    const hero = await this.prisma.rootIdentity.findUnique({ where: { id: rootId } });
    if (!hero || hero.status !== 'active') throw new NotFoundException('Hero not found');
    return hero;
  }

  private async generateDailyRites(rootId: string, dateKey: string) {
    const pillars: Pillar[] = ['forge', 'lore', 'veil'];

    // Get existing rites for today (may be partially created)
    const existing = await this.prisma.dailyRite.findMany({
      where: { rootId, dateKey },
    });
    const existingPillars = existing.map(r => r.pillar);
    const needed = pillars.filter(p => !existingPillars.includes(p));

    for (const pillar of needed) {
      // Pick a random active template for this pillar
      const templates = await this.prisma.riteTemplate.findMany({
        where: { pillar, status: 'active' },
      });
      if (templates.length === 0) continue;

      const template = templates[Math.floor(Math.random() * templates.length)];
      await this.prisma.dailyRite.create({
        data: { rootId, templateId: template.id, dateKey, pillar },
      });
    }

    return this.prisma.dailyRite.findMany({
      where: { rootId, dateKey },
      include: { template: true },
      orderBy: { pillar: 'asc' },
    });
  }

  private async getPillarProgressMap(rootId: string) {
    const records = await this.prisma.pillarProgress.findMany({
      where: { rootId },
    });

    const pillars: Pillar[] = ['forge', 'lore', 'veil'];
    return pillars.map(pillar => {
      const rec = records.find(r => r.pillar === pillar);
      const xp    = rec?.xp ?? 0;
      const level = rec?.level ?? 1;
      const nextThreshold = PILLAR_LEVELS[Math.min(level, PILLAR_LEVELS.length - 1)];
      const prevThreshold = PILLAR_LEVELS[Math.min(level - 1, PILLAR_LEVELS.length - 1)];
      return {
        pillar,
        xp,
        level,
        streak:         rec?.streak ?? 0,
        longest_streak: rec?.longestStreak ?? 0,
        title:          PILLAR_TITLES[pillar]?.[Math.min(level - 1, PILLAR_TITLES[pillar].length - 1)],
        xp_in_level:    xp - prevThreshold,
        xp_to_next:     nextThreshold - xp,
        last_activity_at: rec?.lastActivityAt?.toISOString() ?? null,
      };
    });
  }

  private async updatePillarXp(
    tx: any, rootId: string, pillar: Pillar, xp: number,
  ): Promise<{ oldLevel: number; newLevel: number }> {
    const existing = await tx.pillarProgress.findUnique({
      where: { rootId_pillar: { rootId, pillar } },
    });

    const currentXp = (existing?.xp ?? 0) + xp;
    const newLevel  = PILLAR_LEVELS.findIndex(t => t > currentXp);
    const level     = newLevel === -1 ? PILLAR_LEVELS.length : newLevel;

    // Streak logic
    const today = todayKey();
    const lastDate = existing?.lastActivityAt
      ? existing.lastActivityAt.toISOString().split('T')[0]
      : null;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().split('T')[0];

    let streak = existing?.streak ?? 0;
    if (lastDate === today) {
      // Same day, no streak change
    } else if (lastDate === yesterdayKey) {
      streak += 1;
    } else {
      streak = 1; // Streak broken — restart
    }

    const longestStreak = Math.max(existing?.longestStreak ?? 0, streak);

    await tx.pillarProgress.upsert({
      where: { rootId_pillar: { rootId, pillar } },
      update: { xp: currentXp, level, streak, longestStreak, lastActivityAt: new Date() },
      create: { rootId, pillar, xp: currentXp, level, streak, longestStreak, lastActivityAt: new Date() },
    });

    // Grant pillar title if leveled up (a first-ever record can also
    // land above level 1, so don't require an existing row)
    const oldLevel = existing?.level ?? 1;
    if (level > oldLevel) {
      const titleName = PILLAR_TITLES[pillar]?.[Math.min(level - 1, PILLAR_TITLES[pillar].length - 1)];
      if (titleName) {
        const titleId = `title_${pillar}_${level}`;
        const titleExists = await tx.title.findUnique({ where: { id: titleId } });
        if (titleExists) {
          await tx.userTitle.upsert({
            where: { rootId_titleId: { rootId, titleId } },
            update: {},
            create: { rootId, titleId },
          }).catch(() => {}); // Ignore if already owned
        }
      }
    }

    return { oldLevel, newLevel: level };
  }

  // ── ATTRIBUTE XP ──────────────────────────────────────────────────────────────
  // Layer 4: independent XP + levels per attribute. Runs inside the
  // caller's transaction. Returns the granted map for the response.

  private async upsertAttributeXp(
    tx: any, rootId: string, pillar: Pillar, grants: Record<string, number>,
  ): Promise<Record<string, number>> {
    const valid = new Set(DISCIPLINE_ATTRIBUTES[pillar].map(a => a.id));
    const granted: Record<string, number> = {};
    for (const [attribute, xp] of Object.entries(grants)) {
      if (!valid.has(attribute) || xp <= 0) continue;
      const existing = await tx.attributeProgress.findUnique({
        where: { rootId_attribute: { rootId, attribute } },
      });
      const newXp = (existing?.xp ?? 0) + xp;
      const level = levelFromXp(newXp, ATTR_LEVELS);
      await tx.attributeProgress.upsert({
        where:  { rootId_attribute: { rootId, attribute } },
        update: { xp: newXp, level },
        create: { rootId, discipline: pillar, attribute, xp: newXp, level },
      });
      granted[attribute] = xp;
    }
    return granted;
  }

  // ── LEGACY MILESTONES ─────────────────────────────────────────────────────────
  // Legacy level derives from TOTAL discipline XP (the 2026-07-30 brief;
  // permanent, never resets) — the server twin of computeLegacyLevel()
  // in the native client (keep the two in sync). On a crossing: grant
  // the legacy_<n> title (cosmetic-only, v4 rule 5 — Legacy never buys
  // combat power) and write the IdentityEvent the Chronicle derives
  // from. Runs post-tx; every failure is non-critical and swallowed.

  private async checkLegacyMilestone(rootId: string, xpJustGranted: number) {
    if (xpJustGranted <= 0) return;
    try {
      const pillars = await this.prisma.pillarProgress.findMany({ where: { rootId } });
      const levelOf = (p: string) => pillars.find(r => r.pillar === p)?.level ?? 1;
      const totalXp = pillars.reduce((s, p) => s + p.xp, 0);
      const newLegacy = levelFromXp(totalXp, LEGACY_LEVELS);
      const oldLegacy = levelFromXp(Math.max(0, totalXp - xpJustGranted), LEGACY_LEVELS);
      if (newLegacy <= oldLegacy) return;

      for (let lv = oldLegacy + 1; lv <= newLegacy; lv++) {
        const titleId = `legacy_${lv}`;
        const title = await this.prisma.title.findUnique({ where: { id: titleId } });
        if (title) {
          await this.prisma.userTitle.upsert({
            where: { rootId_titleId: { rootId, titleId } },
            update: {},
            create: { rootId, titleId },
          }).catch(() => {});
        }
        await this.events.log({
          rootId,
          sourceId: 'codex-platform',
          eventType: 'legacy.milestone_reached',
          payload: {
            legacy_level: lv,
            title_id:     title ? titleId : null,
            pillars:      { forge: levelOf('forge'), lore: levelOf('lore'), veil: levelOf('veil') },
          },
        });
        this.logger.log(`Legacy milestone: ${rootId} reached Legacy ${lv}`);
      }
    } catch (e) {
      this.logger.warn(`Legacy milestone check failed for ${rootId}: ${e}`);
    }
  }

  private async getCurrentStreak(rootId: string): Promise<number> {
    const progress = await this.prisma.pillarProgress.findMany({ where: { rootId } });
    if (!progress.length) return 0;
    return Math.max(...progress.map(p => p.streak));
  }

  private buildDailySummary(rites: any[], streak: number) {
    const completed = rites.filter(r => r.status === 'completed').length;
    const pending   = rites.filter(r => r.status === 'pending').length;
    return {
      completed,
      pending,
      total: 3,
      streak,
      all_complete: completed === 3,
    };
  }

  private formatRite(r: any) {
    return {
      rite_id:     r.id,
      pillar:      r.pillar,
      title:       r.template.title,
      description: r.template.description,
      lore_text:   r.template.loreText,
      xp_base:     r.template.xpBase,
      status:      r.status,
      completed_at: r.completedAt?.toISOString() ?? null,
      xp_granted:  r.xpGranted ?? null,
    };
  }

  private formatOath(o: any) {
    return {
      oath_id:     o.id,
      pillar:      o.pillar,
      declaration: o.declaration,
      week_of:     o.weekOf,
      status:      o.status,
      resolved_at: o.resolvedAt?.toISOString() ?? null,
      xp_granted:  o.xpGranted ?? null,
    };
  }

  private buildCompletionMessage(pillar: string, allThree: boolean, resonance: boolean): string {
    const base: Record<string, string> = {
      forge: 'The body is tempered. The Forge remembers.',
      lore:  'Knowledge claimed. The Codex grows.',
      veil:  'Stillness achieved. The Veil acknowledges you.',
    };
    if (allThree) return 'All three rites complete. By the Veil, you are attested. The day is sealed.';
    if (resonance) return `${base[pillar] ?? 'Rite complete.'} Your alignment resonates.`;
    return base[pillar] ?? 'Rite complete. By the Veil, I attest this was done.';
  }

  private buildLogMessage(pillar: string, activity: string): string {
    const messages: Record<string, string> = {
      forge: 'Your training is entered into the Chronicle.',
      lore:  'Your study is recorded. The Lore grows.',
      veil:  'Your attunement is noted. The Veil witnesses.',
    };
    return messages[pillar] ?? 'Activity recorded in the Chronicle.';
  }

  private buildChronicleEntry(pillar: string, activity: string, duration: number | null): string {
    const dur = duration ? ` for ${duration} minutes` : '';
    const templates: Record<string, string> = {
      forge:     `The hero committed to physical training${dur} — the body made ready.`,
      lore:      `The hero pursued knowledge${dur} — the mind sharpened against the dark.`,
      veil:      `The hero sought stillness${dur} — listening for what moves beneath.`,
    };
    return templates[pillar] ?? `The hero trained${dur}.`;
  }
}
