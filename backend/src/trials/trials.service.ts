// ============================================================
// TrialsService — Arena score-attack gauntlets (2026-07-30)
//
// Trials are seeded read-and-react sequences on the battle
// engine's telegraph grammar. The seed is derived from the
// trial id + the UTC month key, so every hero faces the SAME
// sequence all season and bests are comparable. Seasons reset
// implicitly: a new month is a new season key, and TrialBest
// rows are keyed by it. Rewards are cosmetic-only (v4 rule 5
// territory — competition never buys combat power).
//
// The client runs the gauntlet (fixed windows, no gear
// calibration — fairness over power) and reports the tally;
// the server recomputes the score from the tally and clamps
// to the trial's bounds. Same trust model as battle stats.
// ============================================================

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';

export interface TrialDef {
  id:       string;
  name:     string;
  tearType: 'minor' | 'wander' | 'dormant' | 'double';
  tells:    number;
  flavor:   string;
}

// Definitions live in code — three gauntlets v1, tier-laddered.
// (Adding one is additive: new id, new best rows accrue to it.)
const TRIAL_DEFS: TrialDef[] = [
  {
    id: 'trial_footwork', name: 'The Footwork', tearType: 'minor', tells: 16,
    flavor: 'Sixteen tells at walking tempo. Read them clean before you read them fast.',
  },
  {
    id: 'trial_gauntlet', name: 'The Gauntlet', tearType: 'wander', tells: 20,
    flavor: 'Twenty tells, tighter windows. The proving ground keeps the count.',
  },
  {
    id: 'trial_proving', name: 'The Proving', tearType: 'dormant', tells: 24,
    flavor: 'Twenty-four tells at dormant pressure. Perfection is remembered here.',
  },
];

// Scoring — shared contract with the native trial engine
// (src/screens/Arena/trialEngine.ts). Keep the two in sync.
const POINTS_CORRECT = 100;
const POINTS_PERFECT = 50; // on top of correct

export function trialSeasonKey(d = new Date()): string {
  return d.toISOString().slice(0, 7); // "2026-08"
}

function seasonEndsAt(): string {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1)).toISOString();
}

// FNV-1a → uint32. Mirrors the native constellation hash so both
// sides derive the identical seed from `${trialId}:${seasonKey}`.
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

@Injectable()
export class TrialsService {
  private readonly logger = new Logger(TrialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  // ── LIST TRIALS + SEASONAL BESTS ─────────────────────────

  async getTrials(rootId: string) {
    const season = trialSeasonKey();
    const bests = await this.prisma.trialBest.findMany({
      where: { rootId, seasonKey: season },
    });
    const bestMap = new Map(bests.map(b => [b.trialId, b]));

    return {
      season,
      ends_at: seasonEndsAt(),
      trials: TRIAL_DEFS.map(def => {
        const best = bestMap.get(def.id);
        return {
          trial_id:  def.id,
          name:      def.name,
          tear_type: def.tearType,
          tells:     def.tells,
          flavor:    def.flavor,
          seed:      fnv1a(`${def.id}:${season}`),
          max_score: def.tells * (POINTS_CORRECT + POINTS_PERFECT),
          best: best ? {
            score:       best.score,
            perfect:     best.perfect,
            misses:      best.misses,
            runs:        best.runs,
            achieved_at: best.achievedAt.toISOString(),
          } : null,
        };
      }),
    };
  }

  // ── SUBMIT A RUN ─────────────────────────────────────────

  async submitRun(rootId: string, dto: { trial_id: string; perfect: number; misses: number }) {
    const def = TRIAL_DEFS.find(d => d.id === dto.trial_id);
    if (!def) throw new BadRequestException('Unknown trial');

    const perfect = Math.floor(dto.perfect ?? 0);
    const misses  = Math.floor(dto.misses ?? 0);
    if (perfect < 0 || misses < 0 || misses > def.tells || perfect > def.tells - misses) {
      throw new BadRequestException('Tally out of bounds for this trial');
    }

    // Server recomputes the score — the client's number is display-only.
    const correct = def.tells - misses;
    const score   = correct * POINTS_CORRECT + perfect * POINTS_PERFECT;
    const season  = trialSeasonKey();

    const existing = await this.prisma.trialBest.findUnique({
      where: { rootId_trialId_seasonKey: { rootId, trialId: def.id, seasonKey: season } },
    });

    const newBest = !existing || score > existing.score;
    const best = existing
      ? await this.prisma.trialBest.update({
          where: { id: existing.id },
          data: newBest
            ? { score, tells: def.tells, perfect, misses, runs: { increment: 1 }, achievedAt: new Date() }
            : { runs: { increment: 1 } },
        })
      : await this.prisma.trialBest.create({
          data: { rootId, trialId: def.id, seasonKey: season, score, tells: def.tells, perfect, misses },
        });

    // Run audit + Chronicle-ready event on a new best (non-critical)
    await this.events.log({
      rootId,
      sourceId: 'codex-platform',
      eventType: newBest ? 'trial.new_best' : 'trial.run_submitted',
      payload: {
        trial_id: def.id,
        season,
        score,
        perfect,
        misses,
        tells: def.tells,
      },
    }).catch(() => {});

    this.logger.log(`Trial run: ${rootId} | ${def.id} | ${score}${newBest ? ' (new best)' : ''}`);

    return {
      accepted:  true,
      new_best:  newBest,
      score,
      season,
      best: {
        score:       best.score,
        perfect:     best.perfect,
        misses:      best.misses,
        runs:        best.runs,
        achieved_at: best.achievedAt.toISOString(),
      },
    };
  }

  // ── SEASONAL TRIAL POINTS (for the Arena standing board) ──

  /** Sum of a season's trial bests per hero — the trial half of the
   *  Arena standing composite. Used by LeaderboardService. */
  async seasonTrialPoints(season: string): Promise<Map<string, number>> {
    const groups = await this.prisma.trialBest.groupBy({
      by: ['rootId'],
      where: { seasonKey: season },
      _sum: { score: true },
    });
    return new Map(groups.map(g => [g.rootId, g._sum.score ?? 0]));
  }
}
