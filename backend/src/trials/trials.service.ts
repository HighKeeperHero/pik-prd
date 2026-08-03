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
  // Added 2026-07-31 for the 8-week season — three gauntlets plateau
  // too early over two months. These extend the ladder on BOTH axes:
  // endurance (more tells at the same pressure) and pressure (the
  // double tier's 1.2s windows and full six-tell mix).
  {
    id: 'trial_crucible', name: 'The Crucible', tearType: 'dormant', tells: 32,
    flavor: 'Thirty-two tells without relief. The ground stops asking whether you are tired.',
  },
  {
    id: 'trial_reckoning', name: 'The Reckoning', tearType: 'double', tells: 28,
    flavor: 'The narrowest windows the Veil offers. Few finish it clean; the board remembers those who do.',
  },
];

// Scoring — shared contract with the native trial engine
// (src/screens/Arena/trialEngine.ts). Keep the two in sync.
const POINTS_CORRECT = 100;
const POINTS_PERFECT = 50; // on top of correct

// ── Mastery (2026-08-03) ─────────────────────────────────────
// The Arena had no progression of its own. Everything that advanced
// in the wing was borrowed: the 10 art plates keyed off LEGACY (a
// life-training metric), the ladder's rank tier off FATE level, and
// the composite score reset every season. Clearing a gauntlet wrote
// a seasonal row and granted nothing that outlived it.
//
// Mastery is the part that keeps. A run is graded against the trial's
// own ceiling, the best tier ever earned is stored permanently, and
// the sum of those tiers is Arena Renown — which gates the harder
// gauntlets, grants titles, and drives the wing's art state.
//
// Cosmetic-only, by construction (v4 rule 5): Renown buys titles,
// access and scenery. Never combat power.

export type MasteryTier = 0 | 1 | 2 | 3;

/** Score ratio needed for each tier. Bronze is "you finished it
 *  competently" — deliberately reachable on a first honest run, since
 *  a locked ladder that never opens is the same as no ladder. Gold
 *  demands near-perfect reads, not just no misses. */
const MASTERY_THRESHOLDS: Array<{ tier: MasteryTier; ratio: number; name: string }> = [
  { tier: 3, ratio: 0.95, name: 'gold'   },
  { tier: 2, ratio: 0.80, name: 'silver' },
  { tier: 1, ratio: 0.60, name: 'bronze' },
];

export const MASTERY_NAME: Record<MasteryTier, string> = {
  0: 'unproven', 1: 'bronze', 2: 'silver', 3: 'gold',
};

export function tierForRatio(ratio: number): MasteryTier {
  for (const t of MASTERY_THRESHOLDS) if (ratio >= t.ratio) return t.tier;
  return 0;
}

/** Renown a trial contributes at each tier. Linear on purpose: a gold
 *  on the first gauntlet is worth exactly as much as a gold on the
 *  last, so the arc rewards breadth (clear everything) before depth
 *  (perfect one thing). */
const RENOWN_PER_TIER: Record<MasteryTier, number> = { 0: 0, 1: 1, 2: 2, 3: 3 };

/** Renown needed before a gauntlet will open. The first is always
 *  available; each next one asks for roughly a bronze more. Max
 *  Renown is TRIAL_DEFS.length × 3 = 15. */
const TRIAL_UNLOCK_AT: Record<string, number> = {
  trial_footwork:  0,
  trial_gauntlet:  1,
  trial_proving:   3,
  trial_crucible:  6,
  trial_reckoning: 9,
};

/** Renown milestones that grant a title. Seeded as arena_<n> rows —
 *  an unseeded title id silently grants nothing (the legacy_<n>
 *  milestones learned this the hard way). */
const RENOWN_TITLES: Array<{ at: number; id: string }> = [
  { at: 3,  id: 'arena_proven'     },
  { at: 6,  id: 'arena_contender'  },
  { at: 9,  id: 'arena_champion'   },
  { at: 12, id: 'arena_undefeated' },
  { at: 15, id: 'arena_flawless'   },
];

/** The wing has 10 art plates; Renown runs 0..15. */
export const MAX_RENOWN = 15;

// ── Seasons: 8 weeks, Sunday-aligned (Tim, 2026-07-31) ──────
// Monthly was too short — a season should be long enough to chase a
// best, not just notice one. The grid is anchored to the Sunday on
// or before 2026-01-01 so season boundaries always land on the same
// weekday the weekly oath resets on.
const SEASON_DAYS  = 56;                       // 8 weeks
// Anchored to the closed-alpha launch week (Sunday 2026-07-26) so the
// first season testers meet is a FULL eight weeks. Anchoring to a
// January epoch would have dropped them into a season with 9 days
// left and wiped their first bests almost immediately.
const SEASON_EPOCH = Date.UTC(2026, 6, 26);    // Sunday 2026-07-26
const DAY_MS       = 86_400_000;

/** The season's FIRST DAY as an ISO date — self-describing and
 *  parseable straight back to a Date (no `-01` string surgery). */
export function trialSeasonKey(d = new Date()): string {
  const idx = Math.floor((d.getTime() - SEASON_EPOCH) / (SEASON_DAYS * DAY_MS));
  return new Date(SEASON_EPOCH + idx * SEASON_DAYS * DAY_MS).toISOString().slice(0, 10);
}

/** Start instant of the season a key names. Callers that need to
 *  filter rows by "this season" MUST use this rather than parsing. */
export function seasonStart(key = trialSeasonKey()): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

function seasonEndsAt(): string {
  return new Date(seasonStart().getTime() + SEASON_DAYS * DAY_MS).toISOString();
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
    const [bests, mastery] = await Promise.all([
      this.prisma.trialBest.findMany({ where: { rootId, seasonKey: season } }),
      this.prisma.trialMastery.findMany({ where: { rootId } }),
    ]);
    const bestMap    = new Map(bests.map(b => [b.trialId, b]));
    const masteryMap = new Map(mastery.map(m => [m.trialId, m]));
    const renown     = this.renownFrom(mastery);

    return {
      season,
      ends_at: seasonEndsAt(),
      // The Arena's own progression, in one number.
      renown,
      max_renown: MAX_RENOWN,
      next_title: RENOWN_TITLES.find(t => t.at > renown) ?? null,
      trials: TRIAL_DEFS.map(def => {
        const best  = bestMap.get(def.id);
        const mast  = masteryMap.get(def.id);
        const unlockAt = TRIAL_UNLOCK_AT[def.id] ?? 0;
        const tier  = (mast?.tier ?? 0) as MasteryTier;
        const maxScore = def.tells * (POINTS_CORRECT + POINTS_PERFECT);
        return {
          trial_id:  def.id,
          name:      def.name,
          tear_type: def.tearType,
          tells:     def.tells,
          flavor:    def.flavor,
          seed:      fnv1a(`${def.id}:${season}`),
          max_score: maxScore,
          // Permanent — survives the season reset that wipes `best`.
          mastery: {
            tier,
            name:       MASTERY_NAME[tier],
            best_ratio: mast?.bestRatio ?? 0,
            // What the NEXT tier costs, so the screen can say it.
            next_tier:  tier < 3 ? ((tier + 1) as MasteryTier) : null,
            next_score: tier < 3
              ? Math.ceil(MASTERY_THRESHOLDS.find(t => t.tier === tier + 1)!.ratio * maxScore)
              : null,
          },
          locked:    renown < unlockAt,
          unlock_at: unlockAt,
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

  private renownFrom(rows: Array<{ tier: number }>): number {
    return rows.reduce((s, r) => s + (RENOWN_PER_TIER[(r.tier as MasteryTier)] ?? 0), 0);
  }

  // ── SUBMIT A RUN ─────────────────────────────────────────

  async submitRun(rootId: string, dto: { trial_id: string; perfect: number; misses: number }) {
    const def = TRIAL_DEFS.find(d => d.id === dto.trial_id);
    if (!def) throw new BadRequestException('Unknown trial');

    // Gauntlets open in order. Checked server-side because the lock IS
    // the progression — a client that forgets to grey out a card must
    // not be able to skip the arc.
    const priorMastery = await this.prisma.trialMastery.findMany({ where: { rootId } });
    const renownBefore = this.renownFrom(priorMastery);
    const unlockAt = TRIAL_UNLOCK_AT[def.id] ?? 0;
    if (renownBefore < unlockAt) {
      throw new BadRequestException('That ground has not opened to you yet.');
    }

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

    // ── Mastery: the part that outlives the season ───────────
    const maxScore = def.tells * (POINTS_CORRECT + POINTS_PERFECT);
    const ratio    = maxScore > 0 ? score / maxScore : 0;
    const earned   = tierForRatio(ratio);
    const heldTier = (priorMastery.find(m => m.trialId === def.id)?.tier ?? 0) as MasteryTier;
    const raised   = earned > heldTier;

    if (raised) {
      await this.prisma.trialMastery.upsert({
        where:  { rootId_trialId: { rootId, trialId: def.id } },
        update: { tier: earned, bestScore: score, bestRatio: ratio, achievedAt: new Date() },
        create: { rootId, trialId: def.id, tier: earned, bestScore: score, bestRatio: ratio },
      });
    }

    const renownAfter = raised
      ? renownBefore - RENOWN_PER_TIER[heldTier] + RENOWN_PER_TIER[earned]
      : renownBefore;

    // Titles on a Renown crossing. Mirrors the legacy_<n> pattern:
    // grant only if the row exists, and never fail the run over it.
    const titlesEarned: string[] = [];
    if (renownAfter > renownBefore) {
      for (const m of RENOWN_TITLES) {
        if (m.at > renownBefore && m.at <= renownAfter) {
          const title = await this.prisma.title.findUnique({ where: { id: m.id } }).catch(() => null);
          if (!title) continue;
          await this.prisma.userTitle.upsert({
            where:  { rootId_titleId: { rootId, titleId: m.id } },
            update: {},
            create: { rootId, titleId: m.id },
          }).catch(() => {});
          titlesEarned.push(m.id);
        }
      }
      await this.events.log({
        rootId,
        sourceId:  'codex-platform',
        eventType: 'arena.mastery_earned',
        payload: {
          trial_id: def.id,
          tier:     earned,
          tier_name: MASTERY_NAME[earned],
          renown_before: renownBefore,
          renown_after:  renownAfter,
          titles: titlesEarned,
        },
      }).catch(() => {});
      this.logger.log(
        `Arena mastery: ${rootId} | ${def.id} → ${MASTERY_NAME[earned]} | renown ${renownBefore}→${renownAfter}`,
      );
    }

    // Which gauntlets this run just opened — the client turns this
    // into the "new ground has opened" beat.
    const unlocked = Object.entries(TRIAL_UNLOCK_AT)
      .filter(([, at]) => at > renownBefore && at <= renownAfter)
      .map(([id]) => id);

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
      // The permanent half — what this run added to the Arena itself.
      mastery: {
        tier:       earned,
        tier_name:  MASTERY_NAME[earned],
        raised,
        held_tier:  heldTier,
        ratio:      Math.round(ratio * 1000) / 1000,
      },
      renown: {
        before: renownBefore,
        after:  renownAfter,
        max:    MAX_RENOWN,
      },
      titles_earned: titlesEarned,
      trials_unlocked: unlocked,
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
