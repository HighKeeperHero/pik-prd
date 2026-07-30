// ============================================================
// PIK — VocationRecommendationService (canon §13.6, Phase 5)
//
// Advisory Job recommendation at Fate L40. Named VOCATION, never
// "Calling" — Calling is the Fate Fox reveal (src/fox), a false
// friend. The player may choose ANY Job regardless of ranking.
//
// v4 weight frame (locked 2026-07-29):
//   40% Paradigm · 20% Performance · 15% Encounter preference ·
//   10% Echo usage · 10% Weapon usage · 5% Misc behaviour
//
// v1 signal reality: Performance and Echo have no data source yet
// (no per-job outcome telemetry; Master Echoes unbuilt), so those
// two contribute a NEUTRAL even split and are reported inactive in
// `signals`. The weight frame stays canonical — they light up when
// their systems ship, without changing this math.
//
// History (v4's RecommendedVocationHistory): each time the ranking's
// TOP job changes, a `vocation.recommended` event is logged to the
// identity_events ledger — history for free, no migration.
// ============================================================
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { echoJobSharesFromRows } from '../echo/echo.catalog';
import { EventsService } from '../events/events.service';
import { GearService } from '../gear/gear.service';

const JOBS = ['AEGIS', 'SCALESWORN', 'DRYADIC', 'HARVESTER'] as const;
type Job = (typeof JOBS)[number];

const WEIGHTS = {
  paradigm:    40,
  performance: 20,
  encounter:   15,
  echo:        10,
  weapon:      10,
  misc:         5,
} as const;
type SignalKey = keyof typeof WEIGHTS;

// Paradigm ↔ Job (canon §13.3) — must match gear.service PARADIGM_JOB.
const PARADIGM_TO_JOB: Record<string, Job> = {
  bulwark: 'AEGIS', onslaught: 'SCALESWORN', verdant: 'DRYADIC', reap: 'HARVESTER',
};
// Gear-modifier → paradigm lean, for weapon classification. Mirrors
// gear.service MODIFIER_PARADIGM.
const MODIFIER_PARADIGM: Record<string, string> = {
  defense: 'bulwark', boss_damage_pct: 'onslaught', crit_pct: 'onslaught',
  cooldown_pct: 'verdant', luck_pct: 'reap', xp_bonus_pct: 'reap', fate_affinity: 'reap',
};
// Encounter genres (rift_fauna canon): rifts are a stabilization
// ritual → the guardian/steward Jobs; fauna is monster combat →
// the hunter/striker Jobs.
const RIFT_JOBS:  Job[] = ['AEGIS', 'DRYADIC'];
const FAUNA_JOBS: Job[] = ['SCALESWORN', 'HARVESTER'];
// Misc: fateAlignment temperament lean.
const ALIGNMENT_JOB: Record<string, Job | null> = {
  ORDER: 'AEGIS', LIGHT: 'AEGIS', WILD: 'DRYADIC',
  VEIL: 'SCALESWORN', DARK: 'HARVESTER', NONE: null,
};

type Share = Record<Job, number>;
const evenShare = (): Share => ({ AEGIS: 0.25, SCALESWORN: 0.25, DRYADIC: 0.25, HARVESTER: 0.25 });

/** Normalize raw per-job weights into shares summing to 1
 *  (even split when there is no signal at all). */
function normalize(raw: Share): Share {
  const total = JOBS.reduce((s, j) => s + raw[j], 0);
  if (total <= 0) return evenShare();
  const out = {} as Share;
  for (const j of JOBS) out[j] = raw[j] / total;
  return out;
}

export interface VocationSignal {
  key: SignalKey;
  weight: number;
  active: boolean;       // false = neutral even split (no data source yet)
  note: string;
}

export interface VocationRanked {
  job: Job;
  score_pct: number;     // 0-100 compatibility
  reasons: string[];     // human lines from the strongest active signals
}

@Injectable()
export class VocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly gear: GearService,
  ) {}

  async getRecommendation(rootId: string) {
    const hero = await this.prisma.rootIdentity.findUnique({
      where:  { id: rootId },
      select: { fateLevel: true, heroClass: true, fateAlignment: true },
    });
    if (!hero) return null;

    // ── Signal shares ─────────────────────────────────────────
    const shares:  Record<SignalKey, Share> = {
      paradigm:    evenShare(), performance: evenShare(), encounter: evenShare(),
      echo:        evenShare(), weapon:      evenShare(), misc:      evenShare(),
    };
    const signals: VocationSignal[] = [];

    // Paradigm (40) — gear playstyle totals mapped onto Jobs.
    const paradigm = await this.gear.getComputedParadigm(rootId);
    const pRaw = { AEGIS: 0, SCALESWORN: 0, DRYADIC: 0, HARVESTER: 0 } as Share;
    let pAny = false;
    for (const [p, job] of Object.entries(PARADIGM_TO_JOB)) {
      const v = (paradigm.totals as Record<string, number>)[p] ?? 0;
      pRaw[job] += v;
      if (v > 0) pAny = true;
    }
    if (pAny) shares.paradigm = normalize(pRaw);
    signals.push({
      key: 'paradigm', weight: WEIGHTS.paradigm, active: pAny,
      note: pAny
        ? `Your kit leans ${paradigm.dominant ?? 'evenly'} — the gear votes first.`
        : 'No gear equipped yet — the kit has not spoken.',
    });

    // Performance (20) — LIVE (v4 tails, 2026-07-30): read from
    // battle.completed events (per-fight combat stats reported by
    // the client since this slice). The mapping reads what the
    // hero is actually good at / reaches for:
    //   ANCHOR reads (defends) → AEGIS      (the wall)
    //   CHANNEL reads (counters) → SCALESWORN (the blade)
    //   PERFECT-timing rate → DRYADIC        (harmony with the rhythm)
    //   crit procs → HARVESTER               (the opportunist's edge)
    const battles = await this.prisma.identityEvent.findMany({
      where:   { rootId, eventType: 'battle.completed' },
      orderBy: { createdAt: 'desc' },
      take:    40,   // recent form, not lifetime averages
      select:  { payload: true },
    });
    let perfDefends = 0, perfCounters = 0, perfPerfect = 0, perfCrits = 0;
    for (const b of battles) {
      const p = b.payload as Partial<Record<string, number>> | null;
      perfDefends  += p?.defends  ?? 0;
      perfCounters += p?.counters ?? 0;
      perfPerfect  += p?.perfect  ?? 0;
      perfCrits    += p?.crits    ?? 0;
    }
    const perfTotal = perfDefends + perfCounters + perfPerfect + perfCrits;
    if (perfTotal > 0) {
      shares.performance = normalize({
        AEGIS: perfDefends, SCALESWORN: perfCounters,
        DRYADIC: perfPerfect, HARVESTER: perfCrits,
      } as Share);
    }
    signals.push({
      key: 'performance', weight: WEIGHTS.performance, active: perfTotal > 0,
      note: perfTotal > 0
        ? `Read from your last ${battles.length} fights — how you actually answer the seam.`
        : 'No reported fights yet — weighed evenly for now.',
    });

    // Encounter preference (15) — rift seals vs fauna banishes.
    // Rift seals come from the tear_encounters table — there is no
    // veil_tear_sealed identity event (that string is hunt-tracker
    // internal; counting it here always read zero — fixed 2026-07-30).
    const [riftCount, faunaCount] = await Promise.all([
      this.prisma.tearEncounter.count({ where: { rootId, outcome: 'won' } }),
      this.prisma.faunaBanish.count({ where: { rootId } }),
    ]);
    const encTotal = riftCount + faunaCount;
    if (encTotal > 0) {
      const eRaw = { AEGIS: 0, SCALESWORN: 0, DRYADIC: 0, HARVESTER: 0 } as Share;
      for (const j of RIFT_JOBS)  eRaw[j] += riftCount / 2;
      for (const j of FAUNA_JOBS) eRaw[j] += faunaCount / 2;
      shares.encounter = normalize(eRaw);
    }
    signals.push({
      key: 'encounter', weight: WEIGHTS.encounter, active: encTotal > 0,
      note: encTotal > 0
        ? `${riftCount} rifts steadied, ${faunaCount} fauna banished.`
        : 'No encounters on record yet.',
    });

    // Echo usage (10) — LIVE (canon §13.9 unification, 2026-07-30):
    // the heroes you chose to restore at the Altar say something
    // about who you are. Rarity-weighted jobLean shares from
    // REGISTERED echoes only.
    const echoRows = await this.prisma.playerEchoFragment.findMany({
      where: { rootId, registeredAt: { not: null } }, select: { echoId: true },
    }).catch(() => []);
    const echoShares = echoJobSharesFromRows(echoRows);
    const echoTotal  = Object.values(echoShares).reduce((a, b) => a + b, 0);
    if (echoTotal > 0) {
      shares.echo = normalize({
        AEGIS:      echoShares.AEGIS      ?? 0,
        SCALESWORN: echoShares.SCALESWORN ?? 0,
        DRYADIC:    echoShares.DRYADIC    ?? 0,
        HARVESTER:  echoShares.HARVESTER  ?? 0,
      } as Share);
    }
    signals.push({
      key: 'echo', weight: WEIGHTS.echo, active: echoTotal > 0,
      note: echoTotal > 0
        ? `${echoRows.length} ${echoRows.length === 1 ? 'hero' : 'heroes'} of Elysendar restored at the Altar.`
        : 'No echoes registered at the Altar yet; weighed evenly for now.',
    });

    // Weapon usage (10) — history of weapon equips, classified by
    // each weapon's dominant modifier → paradigm → Job.
    const weaponEvents = await this.prisma.identityEvent.findMany({
      where:  { rootId, eventType: 'gear.item_equipped' },
      select: { payload: true },
    });
    const weaponCounts = new Map<string, number>();
    for (const ev of weaponEvents) {
      const p = ev.payload as { slot?: string; item_id?: string } | null;
      if (p?.slot === 'weapon' && p.item_id) {
        weaponCounts.set(p.item_id, (weaponCounts.get(p.item_id) ?? 0) + 1);
      }
    }
    let wAny = false;
    if (weaponCounts.size > 0) {
      const items = await this.prisma.gearItem.findMany({
        where:  { id: { in: [...weaponCounts.keys()] } },
        select: { id: true, modifiers: true },
      });
      const wRaw = { AEGIS: 0, SCALESWORN: 0, DRYADIC: 0, HARVESTER: 0 } as Share;
      for (const item of items) {
        const mods = (item.modifiers ?? {}) as Record<string, number>;
        // Dominant modifier decides the weapon's lean; engine-dropped
        // weapons (empty modifiers) lean onslaught by slot nature.
        let bestKey: string | null = null;
        for (const [k, v] of Object.entries(mods)) {
          if (MODIFIER_PARADIGM[k] && (bestKey === null || v > (mods[bestKey] ?? 0))) bestKey = k;
        }
        const paradigmKey = bestKey ? MODIFIER_PARADIGM[bestKey] : 'onslaught';
        const job = PARADIGM_TO_JOB[paradigmKey];
        wRaw[job] += weaponCounts.get(item.id) ?? 0;
        wAny = true;
      }
      if (wAny) shares.weapon = normalize(wRaw);
    }
    signals.push({
      key: 'weapon', weight: WEIGHTS.weapon, active: wAny,
      note: wAny ? 'Read from the blades you have actually drawn.' : 'No weapon history yet.',
    });

    // Misc (5) — alignment temperament.
    const alignJob = ALIGNMENT_JOB[hero.fateAlignment ?? 'NONE'] ?? null;
    if (alignJob) {
      const mRaw = { AEGIS: 0, SCALESWORN: 0, DRYADIC: 0, HARVESTER: 0 } as Share;
      // A lean, not a verdict: alignment gets double weight, rest even.
      for (const j of JOBS) mRaw[j] = j === alignJob ? 2 : 1;
      shares.misc = normalize(mRaw);
    }
    signals.push({
      key: 'misc', weight: WEIGHTS.misc, active: !!alignJob,
      note: alignJob ? `Your ${hero.fateAlignment} alignment carries a whisper.` : 'Alignment holds no lean.',
    });

    // ── Compose ──────────────────────────────────────────────
    const ranked: VocationRanked[] = JOBS.map(job => {
      const score = (Object.keys(WEIGHTS) as SignalKey[])
        .reduce((s, k) => s + WEIGHTS[k] * shares[k][job], 0);
      const reasons = signals
        .filter(sig => sig.active && shares[sig.key][job] > 0.25)
        .sort((a, b) => b.weight * shares[b.key][job] - a.weight * shares[a.key][job])
        .slice(0, 2)
        .map(sig => sig.note);
      return { job, score_pct: Math.round(score), reasons };
    }).sort((a, b) => b.score_pct - a.score_pct);

    // ── History: log when the top pick changes ───────────────
    const last = await this.prisma.identityEvent.findFirst({
      where:   { rootId, eventType: 'vocation.recommended' },
      orderBy: { createdAt: 'desc' },
      select:  { payload: true },
    });
    const lastTop = (last?.payload as { top?: string } | null)?.top ?? null;
    if (ranked[0] && ranked[0].job !== lastTop) {
      await this.events.log({
        rootId, eventType: 'vocation.recommended',
        payload: {
          top: ranked[0].job,
          ranking: ranked.map(r => ({ job: r.job, score_pct: r.score_pct })),
        },
      });
    }

    return {
      unlocked:   (hero.fateLevel ?? 1) >= 40,
      fate_level: hero.fateLevel ?? 1,
      hero_class: hero.heroClass ?? null,   // non-null = already chosen
      ranked,
      signals,
    };
  }
}
