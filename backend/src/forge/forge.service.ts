// src/forge/forge.service.ts
// ============================================================
// The Forge — Sprint 33
// Gym / workout companion service (Hevy/Strong-style logging).
//
// A hero builds Regimens (routines), starts a Forge Rite
// (workout session), logs sets exercise-by-exercise, and seals
// the rite. On completion the Forge:
//   • computes volume, sets, reps, and new Feats (PRs)
//   • grants Forge-pillar XP via TrainingService (same curve as
//     daily rites — level, streak, and pillar titles all advance)
//   • grants Fate XP via LevelingService (account-wide progression)
//   • writes a Chronicle entry and emits a domain event
//
// This is the continuity seam: the workout logger is not a
// sidecar — it drives the same Forge pillar and Fate level the
// rest of the Codex already understands.
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
import { TrainingService } from '../training/training.service';
import {
  CreateExerciseDto,
  SaveRegimenDto,
  StartSessionDto,
  AddSessionExerciseDto,
  LogSetDto,
  UpdateSetDto,
  FinishSessionDto,
} from './dto/forge.dto';

// ── XP economy ──────────────────────────────────────────────────────────────────
// Tuned so a solid session lands near a "normal session" (≈100 Fate XP, see
// config fate.xp_per_session_normal) and a heavy, PR-laden session can roughly
// match a "hard" one. Forge-pillar XP is set-driven so consistency is rewarded.
const XP = {
  FATE_BASE:         60,    // for finishing with ≥1 working set
  FATE_PER_400KG:    1,     // +1 Fate XP per 400 kg of volume…
  FATE_VOLUME_CAP:   60,    // …capped here
  FATE_PER_PR:       20,    // +20 Fate XP per new Feat…
  FATE_PR_CAP:       60,    // …capped here
  FORGE_PER_SET:     10,    // Forge-pillar XP per completed working set…
  FORGE_SET_CAP:     150,   // …capped here
  FORGE_PER_PR:      15,    // +15 Forge-pillar XP per new Feat
} as const;

function epley1rm(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

@Injectable()
export class ForgeService {
  private readonly logger = new Logger(ForgeService.name);

  constructor(
    private readonly prisma:   PrismaService,
    private readonly events:   EventsService,
    private readonly leveling: LevelingService,
    private readonly training: TrainingService,
  ) {}

  // ════════════════════════════════════════════════════════════════════════════
  // EXERCISE LIBRARY
  // ════════════════════════════════════════════════════════════════════════════

  async listExercises(
    rootId: string,
    filter: { category?: string; equipment?: string; q?: string } = {},
  ) {
    await this.ensureHero(rootId);

    const where: any = {
      status: 'active',
      // Global library rows (rootId null) plus this hero's custom movements.
      OR: [{ rootId: null }, { rootId }],
    };
    if (filter.category)  where.category  = filter.category;
    if (filter.equipment) where.equipment = filter.equipment;
    if (filter.q) {
      where.name = { contains: filter.q, mode: 'insensitive' };
    }

    const rows = await this.prisma.forgeExercise.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return rows.map(e => this.formatExercise(e));
  }

  async createExercise(rootId: string, dto: CreateExerciseDto) {
    await this.ensureHero(rootId);
    const ex = await this.prisma.forgeExercise.create({
      data: {
        name:         dto.name.trim(),
        themeName:    dto.theme_name?.trim() ?? null,
        category:     dto.category,
        equipment:    dto.equipment ?? 'barbell',
        logType:      dto.log_type ?? 'weight_reps',
        instructions: dto.instructions ?? null,
        isCustom:     true,
        rootId,
      },
    });
    return this.formatExercise(ex);
  }

  // Per-movement history: every logged set (most-recent first) plus the hero's
  // current Feats for that movement. Powers the "exercise detail" screen and
  // pre-fills the next session with last time's numbers.
  async getExerciseHistory(rootId: string, exerciseId: string) {
    await this.ensureHero(rootId);
    const exercise = await this.prisma.forgeExercise.findUnique({ where: { id: exerciseId } });
    if (!exercise) throw new NotFoundException('Movement not found');

    const sets = await this.prisma.forgeSet.findMany({
      where: {
        completed: true,
        sessionExercise: { exerciseId, session: { rootId, status: 'completed' } },
      },
      include: { sessionExercise: { include: { session: true } } },
      orderBy: { sessionExercise: { session: { completedAt: 'desc' } } },
      take: 200,
    });

    const records = await this.prisma.forgePersonalRecord.findMany({
      where: { rootId, exerciseId },
    });

    return {
      exercise: this.formatExercise(exercise),
      records:  records.map(r => this.formatRecord(r)),
      sets: sets.map(s => ({
        set_id:       s.id,
        session_id:   s.sessionExercise.session.id,
        date:         s.sessionExercise.session.completedAt?.toISOString() ?? null,
        weight:       s.weight,
        reps:         s.reps,
        duration_sec: s.durationSec,
        distance_m:   s.distanceM,
        rpe:          s.rpe,
        is_pr:        s.isPr,
        est_1rm:      s.weight && s.reps ? Math.round(epley1rm(s.weight, s.reps)) : null,
      })),
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // REGIMENS (routines / "Forms")
  // ════════════════════════════════════════════════════════════════════════════

  async listRegimens(rootId: string) {
    await this.ensureHero(rootId);
    const regimens = await this.prisma.forgeRegimen.findMany({
      where:   { rootId, archived: false },
      include: { exercises: { include: { exercise: true }, orderBy: { orderIdx: 'asc' } } },
      orderBy: [{ orderIdx: 'asc' }, { createdAt: 'asc' }],
    });
    return regimens.map(r => this.formatRegimen(r));
  }

  async getRegimen(rootId: string, regimenId: string) {
    const regimen = await this.prisma.forgeRegimen.findFirst({
      where:   { id: regimenId, rootId },
      include: { exercises: { include: { exercise: true }, orderBy: { orderIdx: 'asc' } } },
    });
    if (!regimen) throw new NotFoundException('Regimen not found');
    return this.formatRegimen(regimen);
  }

  async saveRegimen(rootId: string, dto: SaveRegimenDto) {
    await this.ensureHero(rootId);
    await this.assertExercisesExist(rootId, (dto.exercises ?? []).map(e => e.exercise_id));

    const count = await this.prisma.forgeRegimen.count({ where: { rootId, archived: false } });
    const regimen = await this.prisma.forgeRegimen.create({
      data: {
        rootId,
        name:       dto.name.trim(),
        themeTitle: dto.theme_title?.trim() ?? null,
        notes:      dto.notes ?? null,
        orderIdx:   count,
        exercises: {
          create: (dto.exercises ?? []).map((e, i) => ({
            exerciseId: e.exercise_id,
            orderIdx:   i,
            targetSets: e.target_sets ?? 3,
            targetReps: e.target_reps ?? null,
            restSec:    e.rest_sec ?? 120,
            notes:      e.notes ?? null,
          })),
        },
      },
      include: { exercises: { include: { exercise: true }, orderBy: { orderIdx: 'asc' } } },
    });
    return this.formatRegimen(regimen);
  }

  async updateRegimen(rootId: string, regimenId: string, dto: SaveRegimenDto) {
    const existing = await this.prisma.forgeRegimen.findFirst({ where: { id: regimenId, rootId } });
    if (!existing) throw new NotFoundException('Regimen not found');

    // When exercises are supplied, replace the slot list wholesale (simplest
    // model for a drag-to-reorder editor — the client always sends the full set).
    if (dto.exercises) {
      await this.assertExercisesExist(rootId, dto.exercises.map(e => e.exercise_id));
    }

    const regimen = await this.prisma.$transaction(async (tx) => {
      await tx.forgeRegimen.update({
        where: { id: regimenId },
        data: {
          name:       dto.name?.trim() ?? existing.name,
          themeTitle: dto.theme_title?.trim() ?? existing.themeTitle,
          notes:      dto.notes ?? existing.notes,
        },
      });

      if (dto.exercises) {
        await tx.forgeRegimenExercise.deleteMany({ where: { regimenId } });
        for (let i = 0; i < dto.exercises.length; i++) {
          const e = dto.exercises[i];
          await tx.forgeRegimenExercise.create({
            data: {
              regimenId,
              exerciseId: e.exercise_id,
              orderIdx:   i,
              targetSets: e.target_sets ?? 3,
              targetReps: e.target_reps ?? null,
              restSec:    e.rest_sec ?? 120,
              notes:      e.notes ?? null,
            },
          });
        }
      }

      return tx.forgeRegimen.findUnique({
        where:   { id: regimenId },
        include: { exercises: { include: { exercise: true }, orderBy: { orderIdx: 'asc' } } },
      });
    });

    return this.formatRegimen(regimen);
  }

  async deleteRegimen(rootId: string, regimenId: string) {
    const existing = await this.prisma.forgeRegimen.findFirst({ where: { id: regimenId, rootId } });
    if (!existing) throw new NotFoundException('Regimen not found');
    // Soft-archive so historical sessions keep their source reference.
    await this.prisma.forgeRegimen.update({ where: { id: regimenId }, data: { archived: true } });
    return { archived: true, regimen_id: regimenId };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SESSIONS (Forge Rites)
  // ════════════════════════════════════════════════════════════════════════════

  async startSession(rootId: string, dto: StartSessionDto) {
    await this.ensureHero(rootId);

    // One active session at a time — return the in-flight one if present so a
    // double-tap on "Start" never strands a half-logged workout.
    const active = await this.prisma.forgeSession.findFirst({
      where: { rootId, status: 'active' },
    });
    if (active) return this.getSession(rootId, active.id);

    let name = dto.name?.trim() || 'Forge Rite';
    let seedExercises: { exerciseId: string; orderIdx: number }[] = [];

    if (dto.regimen_id) {
      const regimen = await this.prisma.forgeRegimen.findFirst({
        where:   { id: dto.regimen_id, rootId },
        include: { exercises: { orderBy: { orderIdx: 'asc' } } },
      });
      if (!regimen) throw new NotFoundException('Regimen not found');
      if (!dto.name) name = regimen.name;
      seedExercises = regimen.exercises.map((e, i) => ({ exerciseId: e.exerciseId, orderIdx: i }));
    }

    const session = await this.prisma.forgeSession.create({
      data: {
        rootId,
        regimenId: dto.regimen_id ?? null,
        name,
        status: 'active',
        exercises: { create: seedExercises },
      },
    });

    await this.events.log({
      rootId,
      sourceId: 'codex-platform',
      eventType: 'forge.session_started',
      payload: { session_id: session.id, regimen_id: dto.regimen_id ?? null, name },
    });

    return this.getSession(rootId, session.id);
  }

  async getActiveSession(rootId: string) {
    await this.ensureHero(rootId);
    const active = await this.prisma.forgeSession.findFirst({
      where: { rootId, status: 'active' },
    });
    if (!active) return null;
    return this.getSession(rootId, active.id);
  }

  async getSession(rootId: string, sessionId: string) {
    const session = await this.prisma.forgeSession.findFirst({
      where: { id: sessionId, rootId },
      include: {
        exercises: {
          orderBy: { orderIdx: 'asc' },
          include: {
            exercise: true,
            sets: { orderBy: { setNumber: 'asc' } },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    return this.formatSession(session);
  }

  async addSessionExercise(rootId: string, sessionId: string, dto: AddSessionExerciseDto) {
    const session = await this.requireActiveSession(rootId, sessionId);
    await this.assertExercisesExist(rootId, [dto.exercise_id]);

    const count = await this.prisma.forgeSessionExercise.count({ where: { sessionId: session.id } });
    await this.prisma.forgeSessionExercise.create({
      data: { sessionId: session.id, exerciseId: dto.exercise_id, orderIdx: count },
    });
    return this.getSession(rootId, sessionId);
  }

  async removeSessionExercise(rootId: string, sessionId: string, sessionExerciseId: string) {
    const session = await this.requireActiveSession(rootId, sessionId);
    const se = await this.prisma.forgeSessionExercise.findFirst({
      where: { id: sessionExerciseId, sessionId: session.id },
    });
    if (!se) throw new NotFoundException('Session exercise not found');
    await this.prisma.forgeSessionExercise.delete({ where: { id: sessionExerciseId } });
    return this.getSession(rootId, sessionId);
  }

  async logSet(rootId: string, sessionId: string, dto: LogSetDto) {
    const session = await this.requireActiveSession(rootId, sessionId);
    const se = await this.prisma.forgeSessionExercise.findFirst({
      where: { id: dto.session_exercise_id, sessionId: session.id },
    });
    if (!se) throw new NotFoundException('Session exercise not found');

    const count = await this.prisma.forgeSet.count({ where: { sessionExerciseId: se.id } });
    const set = await this.prisma.forgeSet.create({
      data: {
        sessionExerciseId: se.id,
        setNumber:   count + 1,
        weight:      dto.weight ?? null,
        reps:        dto.reps ?? null,
        durationSec: dto.duration_sec ?? null,
        distanceM:   dto.distance_m ?? null,
        rpe:         dto.rpe ?? null,
        isWarmup:    dto.is_warmup ?? false,
        completed:   dto.completed ?? true,
      },
    });
    return this.formatSet(set);
  }

  async updateSet(rootId: string, setId: string, dto: UpdateSetDto) {
    const set = await this.requireOwnedSet(rootId, setId, /* mustBeActive */ true);
    const updated = await this.prisma.forgeSet.update({
      where: { id: setId },
      data: {
        weight:      dto.weight      ?? set.weight,
        reps:        dto.reps        ?? set.reps,
        durationSec: dto.duration_sec ?? set.durationSec,
        distanceM:   dto.distance_m  ?? set.distanceM,
        rpe:         dto.rpe         ?? set.rpe,
        isWarmup:    dto.is_warmup   ?? set.isWarmup,
        completed:   dto.completed   ?? set.completed,
      },
    });
    return this.formatSet(updated);
  }

  async deleteSet(rootId: string, setId: string) {
    await this.requireOwnedSet(rootId, setId, /* mustBeActive */ true);
    await this.prisma.forgeSet.delete({ where: { id: setId } });
    return { deleted: true, set_id: setId };
  }

  async discardSession(rootId: string, sessionId: string) {
    const session = await this.requireActiveSession(rootId, sessionId);
    await this.prisma.forgeSession.update({
      where: { id: session.id },
      data:  { status: 'discarded', completedAt: new Date() },
    });
    return { discarded: true, session_id: sessionId };
  }

  // ── SEAL THE RITE ───────────────────────────────────────────────────────────
  // Compute totals + Feats, persist them, then grant Forge-pillar XP and Fate XP.

  async finishSession(rootId: string, sessionId: string, dto: FinishSessionDto) {
    const session = await this.requireActiveSession(rootId, sessionId);

    const full = await this.prisma.forgeSession.findUnique({
      where: { id: session.id },
      include: {
        exercises: { include: { exercise: true, sets: true } },
      },
    });
    if (!full) throw new NotFoundException('Session not found');

    // ── Tally working sets ────────────────────────────────────────────────────
    let totalVolume = 0;
    let totalSets   = 0;
    let totalReps   = 0;
    let workingSets = 0;

    for (const se of full.exercises) {
      for (const s of se.sets) {
        if (!s.completed) continue;
        totalSets += 1;
        if (!s.isWarmup) workingSets += 1;
        if (s.reps) totalReps += s.reps;
        if (s.weight && s.reps && !s.isWarmup) totalVolume += s.weight * s.reps;
      }
    }

    // ── Detect new Feats (PRs) per movement ───────────────────────────────────
    const existingRecords = await this.prisma.forgePersonalRecord.findMany({ where: { rootId } });
    const recordKey = (exId: string, type: string) => `${exId}:${type}`;
    const recMap = new Map(existingRecords.map(r => [recordKey(r.exerciseId, r.recordType), r]));

    type NewPr = { exerciseId: string; type: string; value: number; weight?: number; reps?: number; setId: string; exerciseName: string };
    const newPrs: NewPr[] = [];

    for (const se of full.exercises) {
      const logType = se.exercise.logType;
      const sets = se.sets.filter(s => s.completed && !s.isWarmup);
      if (!sets.length) continue;

      const consider = (type: string, candidate: { value: number; weight?: number; reps?: number; setId: string }) => {
        const prev = recMap.get(recordKey(se.exerciseId, type));
        if (!prev || candidate.value > prev.value) {
          newPrs.push({ exerciseId: se.exerciseId, type, exerciseName: se.exercise.name, ...candidate });
        }
      };

      if (logType === 'weight_reps') {
        let bestW = { value: -1, setId: '', weight: 0, reps: 0 };
        let best1rm = { value: -1, setId: '', weight: 0, reps: 0 };
        for (const s of sets) {
          if (s.weight == null || s.reps == null || s.reps < 1) continue;
          if (s.weight > bestW.value) bestW = { value: s.weight, setId: s.id, weight: s.weight, reps: s.reps };
          const e1 = epley1rm(s.weight, s.reps);
          if (e1 > best1rm.value) best1rm = { value: e1, setId: s.id, weight: s.weight, reps: s.reps };
        }
        if (bestW.value > 0)   consider('max_weight', bestW);
        if (best1rm.value > 0) consider('est_1rm', { value: Math.round(best1rm.value), setId: best1rm.setId, weight: best1rm.weight, reps: best1rm.reps });
      } else if (logType === 'reps') {
        let best = { value: -1, setId: '', reps: 0 };
        for (const s of sets) if ((s.reps ?? 0) > best.value) best = { value: s.reps ?? 0, setId: s.id, reps: s.reps ?? 0 };
        if (best.value > 0) consider('max_reps', best);
      } else if (logType === 'duration') {
        let best = { value: -1, setId: '' };
        for (const s of sets) if ((s.durationSec ?? 0) > best.value) best = { value: s.durationSec ?? 0, setId: s.id };
        if (best.value > 0) consider('best_duration', best);
      } else if (logType === 'distance') {
        let best = { value: -1, setId: '' };
        for (const s of sets) if ((s.distanceM ?? 0) > best.value) best = { value: s.distanceM ?? 0, setId: s.id };
        if (best.value > 0) consider('best_distance', best);
      }
    }

    // ── XP economy ────────────────────────────────────────────────────────────
    const prCount = newPrs.length;
    let fateXp  = 0;
    let forgeXp = 0;
    if (workingSets > 0) {
      const volRounded = Math.round(totalVolume);
      fateXp =
        XP.FATE_BASE +
        Math.min(Math.floor(volRounded / 400) * XP.FATE_PER_400KG, XP.FATE_VOLUME_CAP) +
        Math.min(prCount * XP.FATE_PER_PR, XP.FATE_PR_CAP);
      forgeXp =
        Math.min(workingSets * XP.FORGE_PER_SET, XP.FORGE_SET_CAP) +
        prCount * XP.FORGE_PER_PR;
    }

    const durationSec = Math.max(
      0,
      Math.round((Date.now() - new Date(full.startedAt).getTime()) / 1000),
    );

    // ── Persist completion + Feats atomically ─────────────────────────────────
    await this.prisma.$transaction(async (tx) => {
      await tx.forgeSession.update({
        where: { id: session.id },
        data: {
          status:      'completed',
          completedAt: new Date(),
          notes:       dto.notes ?? full.notes,
          durationSec,
          totalVolume: Math.round(totalVolume),
          totalSets,
          totalReps,
          prCount,
          fateXp,
          forgeXp,
        },
      });

      for (const pr of newPrs) {
        await tx.forgeSet.update({ where: { id: pr.setId }, data: { isPr: true } });
        await tx.forgePersonalRecord.upsert({
          where: { rootId_exerciseId_recordType: { rootId, exerciseId: pr.exerciseId, recordType: pr.type } },
          update: { value: pr.value, weight: pr.weight ?? null, reps: pr.reps ?? null, sessionId: session.id, achievedAt: new Date() },
          create: { rootId, exerciseId: pr.exerciseId, recordType: pr.type, value: pr.value, weight: pr.weight ?? null, reps: pr.reps ?? null, sessionId: session.id },
        });
      }

      // Chronicle entry — the Forge writes into the same training log rites use,
      // so a workout shows up in the hero's existing history feed.
      await tx.trainingEntry.create({
        data: {
          rootId,
          pillar:       'forge',
          activityType: 'workout',
          durationMin:  Math.round(durationSec / 60),
          notes:        dto.notes ?? `${full.name}: ${totalSets} sets, ${Math.round(totalVolume).toLocaleString()} kg`,
          xpGranted:    fateXp,
        },
      });
    });

    // ── Advance Forge pillar (level / streak / titles) + Fate XP ───────────────
    if (forgeXp > 0) await this.training.grantPillarXp(rootId, 'forge', forgeXp);
    const xpAward = fateXp > 0 ? await this.leveling.grantXp(rootId, fateXp) : null;

    await this.events.log({
      rootId,
      sourceId: 'codex-platform',
      eventType: 'forge.session_completed',
      payload: {
        session_id:   session.id,
        total_volume: Math.round(totalVolume),
        total_sets:   totalSets,
        working_sets: workingSets,
        pr_count:     prCount,
        fate_xp:      fateXp,
        forge_xp:     forgeXp,
      },
    });

    this.logger.log(`Forge Rite sealed: ${rootId} | ${totalSets} sets | ${Math.round(totalVolume)}kg | ${prCount} PRs | +${fateXp} Fate XP`);

    return {
      message:      this.buildSealMessage(prCount, workingSets),
      session_id:   session.id,
      duration_sec: durationSec,
      total_volume: Math.round(totalVolume),
      total_sets:   totalSets,
      total_reps:   totalReps,
      working_sets: workingSets,
      forge_xp:     forgeXp,
      fate_xp:      fateXp,
      fate_level:   xpAward?.fate_level ?? null,
      leveled_up:   xpAward?.leveled_up ?? false,
      new_feats:    newPrs.map(p => ({
        exercise:    p.exerciseName,
        record_type: p.type,
        value:       p.value,
        weight:      p.weight ?? null,
        reps:        p.reps ?? null,
      })),
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // HISTORY / FEATS / STATS
  // ════════════════════════════════════════════════════════════════════════════

  async listHistory(rootId: string, limit = 20) {
    await this.ensureHero(rootId);
    const sessions = await this.prisma.forgeSession.findMany({
      where:   { rootId, status: 'completed' },
      orderBy: { completedAt: 'desc' },
      take:    Math.min(Math.max(limit, 1), 100),
      include: {
        exercises: { include: { exercise: true, sets: true }, orderBy: { orderIdx: 'asc' } },
      },
    });
    return sessions.map(s => this.formatSessionSummary(s));
  }

  async getRecords(rootId: string) {
    await this.ensureHero(rootId);
    const records = await this.prisma.forgePersonalRecord.findMany({
      where:   { rootId },
      include: { exercise: true },
      orderBy: { achievedAt: 'desc' },
    });
    return records.map(r => ({
      ...this.formatRecord(r),
      exercise:      r.exercise.name,
      theme_name:    r.exercise.themeName,
      category:      r.exercise.category,
    }));
  }

  async getStats(rootId: string) {
    await this.ensureHero(rootId);
    const sessions = await this.prisma.forgeSession.findMany({
      where:   { rootId, status: 'completed' },
      orderBy: { completedAt: 'asc' },
      select:  { completedAt: true, totalVolume: true, totalSets: true, durationSec: true, fateXp: true },
    });

    const totalVolume = sessions.reduce((a, s) => a + s.totalVolume, 0);
    const totalSets   = sessions.reduce((a, s) => a + s.totalSets, 0);
    const totalSecs   = sessions.reduce((a, s) => a + (s.durationSec ?? 0), 0);
    const feats       = await this.prisma.forgePersonalRecord.count({ where: { rootId } });

    // Volume by ISO week for the last 12 weeks (drives the progress chart).
    const byWeek = new Map<string, number>();
    for (const s of sessions) {
      if (!s.completedAt) continue;
      const d = new Date(s.completedAt);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - d.getUTCDay());
      const key = d.toISOString().split('T')[0];
      byWeek.set(key, (byWeek.get(key) ?? 0) + s.totalVolume);
    }
    const weekly = [...byWeek.entries()].slice(-12).map(([week_of, volume]) => ({ week_of, volume }));

    return {
      total_sessions: sessions.length,
      total_volume:   totalVolume,
      total_sets:     totalSets,
      total_minutes:  Math.round(totalSecs / 60),
      total_feats:    feats,
      weekly_volume:  weekly,
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════════════════════

  private async ensureHero(rootId: string) {
    const hero = await this.prisma.rootIdentity.findUnique({ where: { id: rootId } });
    if (!hero || hero.status !== 'active') throw new NotFoundException('Hero not found');
    return hero;
  }

  private async requireActiveSession(rootId: string, sessionId: string) {
    const session = await this.prisma.forgeSession.findFirst({ where: { id: sessionId, rootId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== 'active') throw new BadRequestException('This Forge Rite is already sealed');
    return session;
  }

  private async requireOwnedSet(rootId: string, setId: string, mustBeActive: boolean) {
    const set = await this.prisma.forgeSet.findUnique({
      where: { id: setId },
      include: { sessionExercise: { include: { session: true } } },
    });
    if (!set || set.sessionExercise.session.rootId !== rootId) throw new NotFoundException('Set not found');
    if (mustBeActive && set.sessionExercise.session.status !== 'active') {
      throw new BadRequestException('This Forge Rite is already sealed');
    }
    return set;
  }

  private async assertExercisesExist(rootId: string, ids: string[]) {
    if (!ids.length) return;
    const unique = [...new Set(ids)];
    const found = await this.prisma.forgeExercise.findMany({
      where: { id: { in: unique }, status: 'active', OR: [{ rootId: null }, { rootId }] },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException('One or more movements are unknown');
    }
  }

  private formatExercise(e: any) {
    return {
      exercise_id:  e.id,
      slug:         e.slug,
      name:         e.name,
      theme_name:   e.themeName,
      category:     e.category,
      equipment:    e.equipment,
      log_type:     e.logType,
      instructions: e.instructions,
      is_custom:    e.isCustom,
    };
  }

  private formatRegimen(r: any) {
    return {
      regimen_id:  r.id,
      name:        r.name,
      theme_title: r.themeTitle,
      notes:       r.notes,
      created_at:  r.createdAt?.toISOString?.() ?? null,
      exercise_count: r.exercises?.length ?? 0,
      exercises: (r.exercises ?? []).map((re: any) => ({
        regimen_exercise_id: re.id,
        exercise_id:  re.exerciseId,
        name:         re.exercise?.name,
        theme_name:   re.exercise?.themeName,
        category:     re.exercise?.category,
        log_type:     re.exercise?.logType,
        target_sets:  re.targetSets,
        target_reps:  re.targetReps,
        rest_sec:     re.restSec,
        notes:        re.notes,
      })),
    };
  }

  private formatSession(s: any) {
    return {
      session_id:   s.id,
      regimen_id:   s.regimenId,
      name:         s.name,
      status:       s.status,
      notes:        s.notes,
      started_at:   s.startedAt?.toISOString?.() ?? null,
      completed_at: s.completedAt?.toISOString?.() ?? null,
      duration_sec: s.durationSec,
      total_volume: s.totalVolume,
      total_sets:   s.totalSets,
      total_reps:   s.totalReps,
      pr_count:     s.prCount,
      fate_xp:      s.fateXp,
      forge_xp:     s.forgeXp,
      exercises: (s.exercises ?? []).map((se: any) => ({
        session_exercise_id: se.id,
        exercise_id:  se.exerciseId,
        name:         se.exercise?.name,
        theme_name:   se.exercise?.themeName,
        category:     se.exercise?.category,
        equipment:    se.exercise?.equipment,
        log_type:     se.exercise?.logType,
        notes:        se.notes,
        sets: (se.sets ?? []).map((set: any) => this.formatSet(set)),
      })),
    };
  }

  private formatSessionSummary(s: any) {
    const exercises = (s.exercises ?? []).map((se: any) => ({
      name:       se.exercise?.name,
      theme_name: se.exercise?.themeName,
      sets:       (se.sets ?? []).filter((x: any) => x.completed).length,
      top_set:    this.topSet(se.sets ?? []),
    }));
    return {
      session_id:   s.id,
      name:         s.name,
      completed_at: s.completedAt?.toISOString?.() ?? null,
      duration_sec: s.durationSec,
      total_volume: s.totalVolume,
      total_sets:   s.totalSets,
      total_reps:   s.totalReps,
      pr_count:     s.prCount,
      fate_xp:      s.fateXp,
      forge_xp:     s.forgeXp,
      exercises,
    };
  }

  private topSet(sets: any[]) {
    const working = sets.filter(s => s.completed && !s.isWarmup && s.weight != null && s.reps != null);
    if (!working.length) return null;
    const best = working.reduce((a, b) => (b.weight * b.reps > a.weight * a.reps ? b : a));
    return { weight: best.weight, reps: best.reps };
  }

  private formatSet(s: any) {
    return {
      set_id:       s.id,
      set_number:   s.setNumber,
      weight:       s.weight,
      reps:         s.reps,
      duration_sec: s.durationSec,
      distance_m:   s.distanceM,
      rpe:          s.rpe,
      is_warmup:    s.isWarmup,
      completed:    s.completed,
      is_pr:        s.isPr,
    };
  }

  private formatRecord(r: any) {
    return {
      record_id:   r.id,
      exercise_id: r.exerciseId,
      record_type: r.recordType,
      value:       r.value,
      weight:      r.weight,
      reps:        r.reps,
      achieved_at: r.achievedAt?.toISOString?.() ?? null,
    };
  }

  private buildSealMessage(prCount: number, workingSets: number): string {
    if (workingSets === 0) return 'The rite is closed, though no iron was moved. The Forge waits.';
    if (prCount > 0) {
      return prCount === 1
        ? 'The rite is sealed — and a new Feat is struck into the Chronicle. The Forge remembers.'
        : `The rite is sealed — ${prCount} new Feats struck into the Chronicle. The body is tempered.`;
    }
    return 'The rite is sealed. The body is tempered, the Chronicle grows. By the Veil, I attest this was done.';
  }
}
