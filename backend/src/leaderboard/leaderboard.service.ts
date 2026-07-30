// ============================================================
// PIK — Leaderboard Service (Sprint 7.4 — Leaderboards)
//
// Ranked player standings computed from existing data.
// No new tables — pure query aggregation.
//
// Board types:
//   xp          — Total Fate XP (all-time)
//   level       — Highest Fate Level
//   sessions    — Most completed sessions
//   boss_kills  — Most boss defeats (100%+ damage)
//   quests      — Most quests completed
//   gear_score  — Total equipped gear stat value
//   arena       — Arena standing: seasonal composite of Legacy
//                 activity + trial bests (2026-07-30). Displays
//                 rank tier + score, NEVER raw XP (canon rule).
//   warband     — Warband ladder: communal seasonal score from
//                 members' qualifying actions. Never feeds member
//                 Fate (canon §7).
//
// Supports: global, per-source, daily/weekly/all-time windows.
// The arena/warband boards are seasonal (UTC month key) and
// ignore the period param.
//
// Place at: src/leaderboard/leaderboard.service.ts
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TrialsService, trialSeasonKey } from '../trials/trials.service';

export interface LeaderboardEntry {
  rank: number;
  root_id: string;
  hero_name: string;
  fate_level: number;
  fate_alignment: string;
  equipped_title: string | null;
  value: number;
  label: string;
}

// Warband ladder rows are communal — no hero fields at all.
export interface WarbandLadderEntry {
  rank: number;
  warband_id: string;
  name: string;
  emblem: string;
  member_count: number;
  value: number;
  label: string;
}

export interface LeaderboardResult {
  board: string;
  period: string;
  source_id: string | null;
  updated_at: string;
  season?: string;
  entries: LeaderboardEntry[] | WarbandLadderEntry[];
}

// A qualifying Legacy action (one TrainingEntry this season) is
// worth this many Arena points. Tunable; pairs with the trial
// score scale (a clean trial run is worth ~15–35 actions).
const ARENA_POINTS_PER_ACTION = 25;

@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trials: TrialsService,
  ) {}

  // ── MAIN ENTRY POINT ─────────────────────────────────────

  async getLeaderboard(params: {
    board?: string;
    period?: string;
    sourceId?: string;
    limit?: number;
  }): Promise<LeaderboardResult> {
    const board = params.board || 'xp';
    const period = params.period || 'all_time';
    const limit = Math.min(params.limit || 25, 100);

    switch (board) {
      case 'xp':
        return this.xpBoard(period, params.sourceId, limit);
      case 'level':
        return this.levelBoard(limit);
      case 'sessions':
        return this.sessionsBoard(period, params.sourceId, limit);
      case 'boss_kills':
        return this.bossKillsBoard(period, params.sourceId, limit);
      case 'quests':
        return this.questsBoard(limit);
      case 'gear_score':
        return this.gearScoreBoard(limit);
      case 'arena':
        return this.arenaBoard(limit);
      case 'warband':
        return this.warbandBoard(limit);
      default:
        return this.xpBoard(period, params.sourceId, limit);
    }
  }

  // ── ALL BOARDS SUMMARY (for dashboard sidebar) ───────────

  async getSummary(limit = 5): Promise<Record<string, LeaderboardEntry[]>> {
    const [xp, sessions, quests] = await Promise.all([
      this.xpBoard('all_time', undefined, limit),
      this.sessionsBoard('all_time', undefined, limit),
      this.questsBoard(limit),
    ]);

    // These are all hero boards — the union only widens for 'warband'.
    return {
      xp: xp.entries as LeaderboardEntry[],
      sessions: sessions.entries as LeaderboardEntry[],
      quests: quests.entries as LeaderboardEntry[],
    };
  }

  // ── XP LEADERBOARD ───────────────────────────────────────

  private async xpBoard(period: string, sourceId?: string, limit = 25): Promise<LeaderboardResult> {
    const users = await this.prisma.rootIdentity.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        heroName: true,
        fateLevel: true,
        fateXp: true,
        fateAlignment: true,
        equippedTitle: true,
      },
      orderBy: { fateXp: 'desc' },
      take: limit,
    });

    return {
      board: 'xp',
      period,
      source_id: sourceId || null,
      updated_at: new Date().toISOString(),
      entries: users.map((u, i) => ({
        rank: i + 1,
        root_id: u.id,
        hero_name: u.heroName,
        fate_level: u.fateLevel,
        fate_alignment: u.fateAlignment,
        equipped_title: u.equippedTitle,
        value: u.fateXp,
        label: `${u.fateXp.toLocaleString()} XP`,
      })),
    };
  }

  // ── LEVEL LEADERBOARD ────────────────────────────────────

  private async levelBoard(limit = 25): Promise<LeaderboardResult> {
    const users = await this.prisma.rootIdentity.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        heroName: true,
        fateLevel: true,
        fateXp: true,
        fateAlignment: true,
        equippedTitle: true,
      },
      orderBy: [{ fateLevel: 'desc' }, { fateXp: 'desc' }],
      take: limit,
    });

    return {
      board: 'level',
      period: 'all_time',
      source_id: null,
      updated_at: new Date().toISOString(),
      entries: users.map((u, i) => ({
        rank: i + 1,
        root_id: u.id,
        hero_name: u.heroName,
        fate_level: u.fateLevel,
        fate_alignment: u.fateAlignment,
        equipped_title: u.equippedTitle,
        value: u.fateLevel,
        label: `Level ${u.fateLevel}`,
      })),
    };
  }

  // ── SESSIONS LEADERBOARD ─────────────────────────────────

  private async sessionsBoard(period: string, sourceId?: string, limit = 25): Promise<LeaderboardResult> {
    const dateFilter = this.getDateFilter(period);
    const where: any = { status: 'completed' };
    if (dateFilter) where.checkedInAt = { gte: dateFilter };
    if (sourceId) where.sourceId = sourceId;

    // Group by rootId and count
    const groups = await this.prisma.playerSession.groupBy({
      by: ['rootId'],
      where,
      _count: true,
      orderBy: { _count: { rootId: 'desc' } },
      take: limit,
    });

    // Fetch user details
    const rootIds = groups.map(g => g.rootId);
    const users = await this.prisma.rootIdentity.findMany({
      where: { id: { in: rootIds } },
      select: {
        id: true,
        heroName: true,
        fateLevel: true,
        fateAlignment: true,
        equippedTitle: true,
      },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    return {
      board: 'sessions',
      period,
      source_id: sourceId || null,
      updated_at: new Date().toISOString(),
      entries: groups.map((g, i) => {
        const u = userMap.get(g.rootId);
        return {
          rank: i + 1,
          root_id: g.rootId,
          hero_name: u?.heroName || 'Unknown',
          fate_level: u?.fateLevel || 1,
          fate_alignment: u?.fateAlignment || 'neutral',
          equipped_title: u?.equippedTitle || null,
          value: g._count,
          label: `${g._count} sessions`,
        };
      }),
    };
  }

  // ── BOSS KILLS LEADERBOARD ───────────────────────────────

  private async bossKillsBoard(period: string, sourceId?: string, limit = 25): Promise<LeaderboardResult> {
    const dateFilter = this.getDateFilter(period);
    const where: any = { status: 'completed' };
    if (dateFilter) where.checkedInAt = { gte: dateFilter };
    if (sourceId) where.sourceId = sourceId;

    // Get all completed sessions with summaries
    const sessions = await this.prisma.playerSession.findMany({
      where,
      select: { rootId: true, summary: true },
    });

    // Count boss kills per player
    const killMap = new Map<string, number>();
    for (const s of sessions) {
      const summary = s.summary as any;
      if (summary?.boss_damage_pct >= 100) {
        killMap.set(s.rootId, (killMap.get(s.rootId) || 0) + 1);
      }
    }

    // Sort and limit
    const sorted = Array.from(killMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    if (sorted.length === 0) {
      return { board: 'boss_kills', period, source_id: sourceId || null, updated_at: new Date().toISOString(), entries: [] };
    }

    // Fetch user details
    const rootIds = sorted.map(([id]) => id);
    const users = await this.prisma.rootIdentity.findMany({
      where: { id: { in: rootIds } },
      select: { id: true, heroName: true, fateLevel: true, fateAlignment: true, equippedTitle: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    return {
      board: 'boss_kills',
      period,
      source_id: sourceId || null,
      updated_at: new Date().toISOString(),
      entries: sorted.map(([rootId, kills], i) => {
        const u = userMap.get(rootId);
        return {
          rank: i + 1,
          root_id: rootId,
          hero_name: u?.heroName || 'Unknown',
          fate_level: u?.fateLevel || 1,
          fate_alignment: u?.fateAlignment || 'neutral',
          equipped_title: u?.equippedTitle || null,
          value: kills,
          label: `${kills} boss kills`,
        };
      }),
    };
  }

  // ── QUESTS LEADERBOARD ───────────────────────────────────

  private async questsBoard(limit = 25): Promise<LeaderboardResult> {
    const groups = await this.prisma.playerQuest.groupBy({
      by: ['rootId'],
      where: { status: 'completed' },
      _count: true,
      orderBy: { _count: { rootId: 'desc' } },
      take: limit,
    });

    const rootIds = groups.map(g => g.rootId);
    const users = await this.prisma.rootIdentity.findMany({
      where: { id: { in: rootIds } },
      select: { id: true, heroName: true, fateLevel: true, fateAlignment: true, equippedTitle: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    return {
      board: 'quests',
      period: 'all_time',
      source_id: null,
      updated_at: new Date().toISOString(),
      entries: groups.map((g, i) => {
        const u = userMap.get(g.rootId);
        return {
          rank: i + 1,
          root_id: g.rootId,
          hero_name: u?.heroName || 'Unknown',
          fate_level: u?.fateLevel || 1,
          fate_alignment: u?.fateAlignment || 'neutral',
          equipped_title: u?.equippedTitle || null,
          value: g._count,
          label: `${g._count} quests`,
        };
      }),
    };
  }

  // ── GEAR SCORE LEADERBOARD ───────────────────────────────

  private async gearScoreBoard(limit = 25): Promise<LeaderboardResult> {
    // Get equipped items with their gear templates
    const equipped = await this.prisma.playerEquipment.findMany({
      include: {
        inventory: {
          include: { item: true },
        },
        root: {
          select: { id: true, heroName: true, fateLevel: true, fateAlignment: true, equippedTitle: true },
        },
      },
    });

    // Compute gear score per player
    const scoreMap = new Map<string, { score: number; user: any }>();
    for (const eq of equipped) {
      const mods = (eq.inventory.item.modifiers as any) || {};
      const score: number = Object.values(mods).reduce<number>((sum, v: any) => sum + (typeof v === 'number' ? Math.abs(v) : 0), 0);
      const existing = scoreMap.get(eq.rootId);
      if (existing) {
        existing.score += score;
      } else {
        scoreMap.set(eq.rootId, { score, user: eq.root });
      }
    }

    const sorted = Array.from(scoreMap.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit);

    return {
      board: 'gear_score',
      period: 'all_time',
      source_id: null,
      updated_at: new Date().toISOString(),
      entries: sorted.map(([rootId, data], i) => ({
        rank: i + 1,
        root_id: rootId,
        hero_name: data.user?.heroName || 'Unknown',
        fate_level: data.user?.fateLevel || 1,
        fate_alignment: data.user?.fateAlignment || 'neutral',
        equipped_title: data.user?.equippedTitle || null,
        value: data.score,
        label: `${data.score} GS`,
      })),
    };
  }

  // ── ARENA STANDING (seasonal composite, 2026-07-30) ──────
  // Composite = Legacy activity (qualifying training entries ×
  // ARENA_POINTS_PER_ACTION) + summed seasonal trial bests. The
  // entry's `value` is this composite score — never raw XP; the
  // client renders the rank TIER from fate_level, not the level.

  private async arenaBoard(limit = 25): Promise<LeaderboardResult> {
    const season = trialSeasonKey();
    const seasonStart = new Date(`${season}-01T00:00:00.000Z`);

    const [legacyGroups, trialPoints] = await Promise.all([
      this.prisma.trainingEntry.groupBy({
        by: ['rootId'],
        where: { createdAt: { gte: seasonStart } },
        _count: true,
      }),
      this.trials.seasonTrialPoints(season),
    ]);

    const scoreMap = new Map<string, number>();
    for (const g of legacyGroups) {
      scoreMap.set(g.rootId, g._count * ARENA_POINTS_PER_ACTION);
    }
    for (const [rootId, pts] of trialPoints) {
      scoreMap.set(rootId, (scoreMap.get(rootId) ?? 0) + pts);
    }

    const sorted = Array.from(scoreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    if (sorted.length === 0) {
      return { board: 'arena', period: 'seasonal', source_id: null, season, updated_at: new Date().toISOString(), entries: [] };
    }

    const users = await this.prisma.rootIdentity.findMany({
      where: { id: { in: sorted.map(([id]) => id) }, status: 'active' },
      select: { id: true, heroName: true, fateLevel: true, fateAlignment: true, equippedTitle: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    return {
      board: 'arena',
      period: 'seasonal',
      source_id: null,
      season,
      updated_at: new Date().toISOString(),
      entries: sorted
        .filter(([rootId]) => userMap.has(rootId))
        .map(([rootId, score], i) => {
          const u = userMap.get(rootId)!;
          return {
            rank: i + 1,
            root_id: rootId,
            hero_name: u.heroName,
            fate_level: u.fateLevel,
            fate_alignment: u.fateAlignment,
            equipped_title: u.equippedTitle,
            value: score,
            label: `${score.toLocaleString()} Arena Score`,
          };
        }),
    };
  }

  // ── WARBAND LADDER (communal, 2026-07-30) ────────────────
  // Communal score = the sum of every member's seasonal Arena
  // composite. Aggregation only — nothing flows back into any
  // member's Fate (canon §7).

  private async warbandBoard(limit = 25): Promise<LeaderboardResult> {
    const season = trialSeasonKey();
    const seasonStart = new Date(`${season}-01T00:00:00.000Z`);

    const [memberships, legacyGroups, trialPoints] = await Promise.all([
      this.prisma.warbandMembership.findMany({
        select: { warbandId: true, rootId: true },
      }),
      this.prisma.trainingEntry.groupBy({
        by: ['rootId'],
        where: { createdAt: { gte: seasonStart } },
        _count: true,
      }),
      this.trials.seasonTrialPoints(season),
    ]);

    const heroScore = new Map<string, number>();
    for (const g of legacyGroups) {
      heroScore.set(g.rootId, g._count * ARENA_POINTS_PER_ACTION);
    }
    for (const [rootId, pts] of trialPoints) {
      heroScore.set(rootId, (heroScore.get(rootId) ?? 0) + pts);
    }

    const bandScore = new Map<string, { score: number; members: number }>();
    for (const m of memberships) {
      const agg = bandScore.get(m.warbandId) ?? { score: 0, members: 0 };
      agg.score += heroScore.get(m.rootId) ?? 0;
      agg.members += 1;
      bandScore.set(m.warbandId, agg);
    }

    const sorted = Array.from(bandScore.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit);

    if (sorted.length === 0) {
      return { board: 'warband', period: 'seasonal', source_id: null, season, updated_at: new Date().toISOString(), entries: [] };
    }

    const bands = await this.prisma.warband.findMany({
      where: { id: { in: sorted.map(([id]) => id) } },
      select: { id: true, name: true, emblem: true },
    });
    const bandMap = new Map(bands.map(b => [b.id, b]));

    return {
      board: 'warband',
      period: 'seasonal',
      source_id: null,
      season,
      updated_at: new Date().toISOString(),
      entries: sorted
        .filter(([id]) => bandMap.has(id))
        .map(([id, agg], i) => {
          const b = bandMap.get(id)!;
          return {
            rank: i + 1,
            warband_id: id,
            name: b.name,
            emblem: b.emblem,
            member_count: agg.members,
            value: agg.score,
            label: `${agg.score.toLocaleString()} Warband Score`,
          };
        }),
    };
  }

  // ── HELPERS ──────────────────────────────────────────────

  private getDateFilter(period: string): Date | null {
    const now = new Date();
    switch (period) {
      case 'daily':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'weekly':
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return weekAgo;
      case 'monthly':
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return monthAgo;
      default:
        return null; // all_time
    }
  }
}
