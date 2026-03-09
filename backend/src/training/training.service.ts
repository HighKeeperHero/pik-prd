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
import {
  LogTrainingDto,
  CompleteRiteDto,
  DeclareOathDto,
  ResolveOathDto,
  Pillar,
} from './dto/training.dto';

// ── XP Constants ──────────────────────────────────────────────────────────────
const XP = {
  RITE_BASE:          50,
  ALL_THREE_BONUS:    75,
  ALIGNMENT_BONUS:    50,
  STREAK_3_PCT:       0.10,
  STREAK_7_PCT:       0.25,
  OATH_KEPT:          200,
  OATH_BROKEN_DEBT:   -50,
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
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
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

      // Grant Fate XP to hero
      const updated = await tx.rootIdentity.update({
        where: { id: rootId },
        data: { fateXp: { increment: xp } },
      });

      // Update pillar progress
      await this.updatePillarXp(tx, rootId, rite.template.pillar as Pillar, xp);

      // Grant Fate Seal on 7-day streak
      let sealGranted = false;
      if (newStreak >= 7 && newStreak % 7 === 0) {
        await tx.fateCache.create({
          data: { rootId, cacheType: 'milestone', trigger: `streak:${newStreak}`, rarity: 'uncommon' },
        });
        sealGranted = true;
      }

      return { entry, fateXp: updated.fateXp, fateLevel: updated.fateLevel, xp, sealGranted, allThreeBonus, resonanceApplied };
    });

    // Check for level up
    await this.checkLevelUp(rootId);

    // Log event
    await this.events.log({
      rootId,
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
      fate_xp:          result.fateXp,
    };
  }

  // ── LOG FREE TRAINING ─────────────────────────────────────────────────────────
  // Manual activity log (not tied to a daily rite). Grants pillar XP only,
  // no Fate XP — keeps LBE as primary Fate XP driver.

  async logTraining(rootId: string, dto: LogTrainingDto) {
    await this.ensureHeroExists(rootId);

    // Pillar XP scaled by duration (max 30 min for full pillar XP)
    const duration = dto.duration_min ?? 30;
    const pillarXp = Math.round(Math.min(duration / 30, 1) * 50);

    const entry = await this.prisma.$transaction(async (tx) => {
      const e = await tx.trainingEntry.create({
        data: {
          rootId,
          pillar:       dto.pillar,
          activityType: dto.activity_type,
          durationMin:  dto.duration_min ?? null,
          notes:        dto.notes ?? null,
          xpGranted:    0, // No Fate XP for free logging
        },
      });

      await this.updatePillarXp(tx, rootId, dto.pillar, pillarXp);

      return e;
    });

    await this.events.log({
      rootId,
      eventType: 'training.logged',
      payload: {
        pillar:        dto.pillar,
        activity_type: dto.activity_type,
        duration_min:  dto.duration_min,
        pillar_xp:     pillarXp,
      },
    });

    return {
      message:    this.buildLogMessage(dto.pillar, dto.activity_type),
      entry_id:   entry.id,
      pillar_xp:  pillarXp,
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

  async declareOath(rootId: string, dto: DeclareOathDto) {
    await this.ensureHeroExists(rootId);
    const week = weekKey();

    const existing = await this.prisma.oath.findUnique({
      where: { rootId_weekOf: { rootId, weekOf: week } },
    });
    if (existing) throw new BadRequestException('An oath has already been declared this week');

    const oath = await this.prisma.oath.create({
      data: { rootId, pillar: dto.pillar, declaration: dto.declaration, weekOf: week },
    });

    await this.events.log({
      rootId,
      eventType: 'training.oath_declared',
      payload: { pillar: dto.pillar, declaration: dto.declaration, week_of: week },
    });

    return {
      oath_id:     oath.id,
      message:     `"${dto.declaration}" — your word is entered into the Codex. The Veil watches.`,
      week_of:     week,
      pillar:      dto.pillar,
    };
  }

  async getActiveOath(rootId: string) {
    const week = weekKey();
    const oath = await this.prisma.oath.findUnique({
      where: { rootId_weekOf: { rootId, weekOf: week } },
    });
    if (!oath) return null;
    return this.formatOath(oath);
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
        await tx.rootIdentity.update({
          where: { id: rootId },
          data: { fateXp: { increment: xpGranted! } },
        });
        // Add a fate marker for the Chronicle
        await tx.fateMarker.create({
          data: { rootId, marker: `Kept the ${oath.pillar} oath: "${oath.declaration}"` },
        });
      });
      await this.checkLevelUp(rootId);
      message = 'Your word held. The Chronicle grows. The Veil acknowledges your resolve.';
    } else {
      // Apply Veil Debt
      await this.prisma.$transaction(async (tx) => {
        await tx.oath.update({
          where: { id: oathId },
          data: { status: 'broken', resolvedAt: new Date(), xpGranted: XP.OATH_BROKEN_DEBT },
        });
        await tx.rootIdentity.update({
          where: { id: rootId },
          data: { fateXp: { increment: XP.OATH_BROKEN_DEBT } },
        });
        await tx.fateMarker.create({
          data: { rootId, marker: `Failed the ${oath.pillar} oath: "${oath.declaration}" — a Veil Debt recorded.` },
        });
      });
      message = 'The Veil remembers what you do not. A debt is recorded. Three kept oaths will clear it.';
    }

    await this.events.log({
      rootId,
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

  private async updatePillarXp(tx: any, rootId: string, pillar: Pillar, xp: number) {
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

    // Grant pillar title if leveled up
    if (existing && level > (existing.level ?? 1)) {
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
  }

  private async getCurrentStreak(rootId: string): Promise<number> {
    const progress = await this.prisma.pillarProgress.findMany({ where: { rootId } });
    if (!progress.length) return 0;
    return Math.max(...progress.map(p => p.streak));
  }

  private async checkLevelUp(rootId: string) {
    // Use existing progression service logic via raw update
    // Level thresholds from existing system (config table)
    const hero = await this.prisma.rootIdentity.findUnique({ where: { id: rootId } });
    if (!hero) return;

    const config = await this.prisma.config.findUnique({
      where: { key: 'fate.xp_per_level' },
    });
    const xpPerLevel = parseInt(config?.value ?? '500', 10);
    const newLevel = Math.floor(hero.fateXp / xpPerLevel) + 1;

    if (newLevel > hero.fateLevel) {
      await this.prisma.rootIdentity.update({
        where: { id: rootId },
        data: { fateLevel: newLevel },
      });
      await this.events.log({
        rootId,
        eventType: 'progression.level_up',
        payload: { old_level: hero.fateLevel, new_level: newLevel, source: 'training' },
      });
    }
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
