// ============================================================
// PIK — Sanctum Service
//
// In-app daily-ritual state for the iOS Heroes Veritas app.
// One row per hero. Daily reset is by UTC date (computed
// server-side; client-supplied dates are advisory).
//
// Behaviors:
//   - getOrCreateState: ensures a row exists for the hero
//   - claimHearth:      idempotent for the UTC day; awards
//                       HEARTH_REWARD Veil Essence the first
//                       time it succeeds, no-op afterwards
//   - swearOath:        records one of forge|lore|veil for
//                       the UTC day; second call same day
//                       throws AlreadySworn
// ============================================================

import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LevelingService, levelFromXp, xpForLevel, xpToReach } from '../leveling/leveling.service';
import { LoreService, type LoreFound } from '../lore/lore.service';
import { QuestLogService, type QuestProgressUpdate } from '../quest/quest-log.service';

export type OathOption = 'forge' | 'lore' | 'veil';
const VALID_OATHS: ReadonlyArray<OathOption> = ['forge', 'lore', 'veil'];

const HEARTH_REWARD = 5;

// Phase 2 Arc A — XP grants on daily ritual actions.
const XP_HEARTH = 25;
const XP_OATH   = 25;

// Sprint 30 Slice 5.1 — Veil Trial reward shape.
//   * Essence: 1 per "catch" (score), capped so a perfect run
//     can't out-yield a Hearth + Oath. Trial is the snackable
//     dopamine layer, not the primary income.
//   * Fate XP: small flat bonus so the loop still ladders into
//     Adventurer Rank progression — but small enough that it
//     doesn't compete with battles / chapters for primary XP.
const TRIAL_ESSENCE_PER_CATCH = 1;
const TRIAL_ESSENCE_MAX       = 20;
const XP_TRIAL                = 10;

// 2026-07-08 — the Rite of Purification (Veilfire Purification)
// replaces the Wisp Harvest as the daily Sanctum minigame. Same
// daily gate + lifetime counters as the trial (restoration math
// unchanged); rewards scale with GRADE × SANCTUM LEVEL instead of
// a flat catch cap.
//   Grade thresholds (final Sanctum Purity %): S 98+ · A 90+ ·
//   B 75+ · C below. Every hero completes the Rite — grades are
//   degrees of restoration, not pass/fail.
//   Economy: base table × (1 + RITE_LEVEL_MULT·(sanctumLevel−1)).
//   Values deliberately conservative vs the design spec's examples
//   — tune with the economy pass, not here in passing.
const RITE_GRADE_BASE: Record<'S' | 'A' | 'B' | 'C', number> = {
  S: 40, A: 30, B: 20, C: 12,
};
const RITE_LEVEL_MULT = 0.25;
const XP_RITE         = 15;

export function riteGradeFor(purity: number): 'S' | 'A' | 'B' | 'C' {
  if (purity >= 98) return 'S';
  if (purity >= 90) return 'A';
  if (purity >= 75) return 'B';
  return 'C';
}

// Sprint 30 Slice 5.2 — Augury Draw.
//   * Three cards per day, weighted by rarity.
//   * Total weights: ~58% common / 31% uncommon / 9% rare / 1.5% epic /
//     0.6% legendary per card. Across 3 cards, the player sees a
//     legendary roughly once every two months.
//   * Rewards stack: each card may grant essence + fate_xp; legendary
//     also spawns a sealed cache via the existing FateCache table.
//
// Sprint 31 — deck is now DB-driven (augury_cards table). The in-code
// constant was removed; new cards, seasonal additions, and weight
// rebalancing ship via DB rows without a redeploy.
interface AuguryCard {
  id:      string;
  name:    string;
  flavor:  string;
  rarity:  'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  weight:  number;
  rewards: {
    essence?: number;
    fate_xp?: number;
    cache?:   { type: string; rarity: string };
    /** Scholar archetype (2026-07-07 tarot deck) — grants one
     *  rarity-weighted uncollected Lore Archive entry. */
    lore?:    boolean;
  };
}

// Fairness gates (2026-07-07, Tim's directive): the Augury must
// never obsolete other XP/essence sources. High-rarity cards carry
// ×4/×8/×16 magnitudes — meaningful jackpots at levels where a
// level costs thousands of XP, but early on a single legendary
// (128+ XP) would trivialize the curve (Fate 1→2 is 80 XP). So
// rarities unlock with Fate level; below the gate the hero's deck
// simply doesn't contain them and the remaining weights renormalize
// by construction. Daily frequency stays untouched — the ritual is
// the point; the ceiling is what scales.
const AUGURY_RARITY_LEVEL_GATES: Record<string, number> = {
  rare:      5,
  epic:      10,
  legendary: 20,
};

function weightedPickCard(deck: AuguryCard[]): AuguryCard {
  const totalWeight = deck.reduce((sum, c) => sum + c.weight, 0);
  let r = Math.random() * totalWeight;
  for (const card of deck) {
    r -= card.weight;
    if (r <= 0) return card;
  }
  return deck[0];
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Restoration upgrades (2026-07-06) ───────────────────────
// Manual, prerequisite-gated level commits. Points are computed
// from lifetime counters (never stored); the tables below MUST
// mirror the client's src/screens/Sanctum/restoration.ts (kept
// local by convention — same pattern as Memoria's RANK_TIERS).

export type UpgradeTrack = 'sanctum' | 'library' | 'forge' | 'altar' | 'hearth' | 'arena';

const SANCTUM_MAX_LEVEL = 20;
const WING_MAX_LEVEL    = 10;

// Ritual points: hearth 30 / oath 30 / trial 20 / augury 20.
const SANCTUM_POINTS = { hearth: 30, oath: 30, trial: 20, augury: 20 };

/** Cumulative points required to REACH a sanctum level
 *  (level n costs 25·(n−1) from n−1). */
function sanctumCumCost(level: number): number {
  return (25 * level * (level - 1)) / 2;
}

/** Cumulative lore finds required to REACH a library level
 *  (per-level costs [1,2,3,3,4,5,5,6,7] → L10 at 36 of 40). */
const LIBRARY_CUM_COSTS = [0, 0, 1, 3, 6, 9, 13, 18, 23, 29, 36];

/** Cumulative forge works required to REACH a forge level.
 *  Forge points come from Crafting + Smelting quests (content TBG;
 *  until they seed, every hero's forge points are 0 and the forge
 *  cannot advance past L1). Same curve shape as the library. */
const FORGE_CUM_COSTS = [0, 0, 1, 3, 6, 9, 13, 18, 23, 29, 36];

/** Cumulative altar works to REACH an altar level. Altar points
 *  will come from the Reliquary + Hero Echo mechanics (TBG); until
 *  they ship, points are 0 and the altar holds at L1. */
const ALTAR_CUM_COSTS = [0, 0, 1, 3, 6, 9, 13, 18, 23, 29, 36];

/** Cumulative hearth works to REACH a hearth level (2026-07-13 —
 *  the hearth track ships). Hearth works = daily tendings
 *  (totalHearthClaims), the wing's own rite: same curve shape as
 *  the other wings → L10 at 36 tendings (~5 weeks of dailies). */
const HEARTH_CUM_COSTS = [0, 0, 1, 3, 6, 9, 13, 18, 23, 29, 36];

/** Wing-level prerequisites to REACH each sanctum level — the keep
 *  cannot outgrow its wings (Kingshot-style main-building gating).
 *  Hearth/Altar join the table once their tracks exist. */
// ── Restoration gates (2026-08-04, Tim's calibration) ────────
// The keep cannot outgrow its wings, AND the Sanctum cannot outrun the
// hero. Every level past the opening now asks for Fate as well as
// wings, so restoration paces against the whole system rather than
// against one grindable counter. Anchor supplied by Tim: Sanctum 6
// requires Fate 20 · Library 4 · Altar 4 · Forge 2 · Arena 2.
//
// MUST mirror native src/screens/Sanctum/restoration.ts.
const SANCTUM_PREREQS: Record<number, {
  fate?: number; library?: number; forge?: number; hearth?: number; altar?: number; arena?: number;
}> = {
  3:  { fate: 3 },
  4:  { fate: 8,  library: 2 },
  5:  { fate: 14, library: 3, hearth: 2 },
  6:  { fate: 20, library: 4, altar: 4, forge: 2, arena: 2 },
  7:  { fate: 23, library: 5, altar: 4, forge: 3, arena: 3, hearth: 3 },
  8:  { fate: 26, library: 5, altar: 5, forge: 3, arena: 3, hearth: 4 },
  9:  { fate: 29, library: 6, altar: 5, forge: 4, arena: 4, hearth: 4 },
  10: { fate: 32, library: 6, altar: 6, forge: 4, arena: 4, hearth: 5 },
  11: { fate: 35, library: 7, altar: 6, forge: 5, arena: 5, hearth: 5 },
  12: { fate: 37, library: 7, altar: 7, forge: 5, arena: 5, hearth: 6 },
  13: { fate: 39, library: 8, altar: 7, forge: 6, arena: 6, hearth: 6 },
  14: { fate: 41, library: 8, altar: 8, forge: 6, arena: 6, hearth: 7 },
  15: { fate: 43, library: 9, altar: 8, forge: 7, arena: 7, hearth: 7 },
  16: { fate: 45, library: 9, altar: 9, forge: 7, arena: 7, hearth: 8 },
  17: { fate: 46, library: 10, altar: 9, forge: 8, arena: 8, hearth: 8 },
  18: { fate: 47, library: 10, altar: 10, forge: 8, arena: 8, hearth: 9 },
  19: { fate: 48, library: 10, altar: 10, forge: 9, arena: 9, hearth: 9 },
  20: { fate: 50, library: 10, altar: 10, forge: 10, arena: 10, hearth: 10 },
};

/** Fate floors on the WINGS themselves, so none can be rushed ahead of
 *  the hero. Uniform across wings; the Forge stacks its own Resonance
 *  floors on top (its whole purpose is gear). */
const WING_FATE_FLOORS: Record<number, number> = { 4: 6, 6: 12, 8: 22, 10: 35 };

/** Cumulative works to REACH an arena level. Same curve as the other
 *  wings — the Arena is a wing, not a bespoke track. */
const ARENA_CUM_COSTS = [0, 0, 1, 3, 6, 9, 13, 18, 23, 29, 36];

/** Renown tier → arena works. A mastery tier is worth three logged
 *  practices: proving a gauntlet should move the ground faster than
 *  showing up, without making the daily habit pointless. */
const ARENA_WORKS_PER_TIER = 3;

// ── Restoration economy (2026-07-10, Tim's spec) ────────────
// Upgrades keep their progress-point gates and ADD: a Veil
// Essence cost, material costs, and a real-world build timer.
// One build in flight per (root, track); completion is CLAIMED.
export type Material = 'veilglass' | 'leywood' | 'ore';
export const MATERIAL_LABEL: Record<Material, string> = {
  veilglass: 'Veilglass Shard',
  leywood:   'Leywood',
  ore:       'Sanctified Ore',
};

/** Cost + duration to BUILD a track to `toLevel`. Tuned against
 *  essence income ~30-60/day and material drops (shards from tear
 *  seals + caches, leywood from caches, ore from weekly quests):
 *  wing L2 ≈ a first-day build (15m), wing L10 ≈ 8h + weeks of
 *  materials, sanctum L20 ≈ 14h + the full economy. */
export function buildCost(track: UpgradeTrack, toLevel: number): {
  essence: number;
  materials: Partial<Record<Material, number>>;
  minutes: number;
} {
  const n = toLevel - 1;
  if (track === 'sanctum') {
    return {
      essence:   20 * n,
      materials: { veilglass: n, ...(toLevel >= 8 ? { ore: Math.floor(toLevel / 4) } : {}) },
      minutes:   Math.round(10 * Math.pow(n, 1.5)),
    };
  }
  return {
    essence:   30 * n,
    materials: {
      veilglass: 2 * n,
      leywood:   n,
      ...(toLevel >= 5 ? { ore: toLevel - 4 } : {}),
    },
    minutes: Math.round(15 * Math.pow(n, 1.6)),
  };
}

// ── The Sanctum awakens (2026-07-10, Tim's beats) ───────────
// Stations wake in narrative order as the player acts + levels:
//   courtyard (always) → Veilfire cold-but-present → lighting it
//   opens the LIBRARY → learning from the Codex (first augury)
//   wakes the ALTAR → swearing the Oath rekindles the FORGE →
//   restoring the Forge (L2) reveals the VEILFRONT's first tear.
// NOTE: Tim's one-liner said Library>Forge>Altar, but his beats
// require Library→Altar→Forge (the Oath lives at the Altar) —
// beats win; flip AWAKENING_LEVELS + the chain below if not.
const AWAKENING_LEVELS = { library: 2, altar: 3, forge: 5 };

function awakeningFlags(
  raw: { totalTrials: number; totalAuguries: number; totalOathsSworn: number; forgeLevel: number },
  fateLevel: number,
) {
  const library   = raw.totalTrials >= 1 && fateLevel >= AWAKENING_LEVELS.library;
  const altar     = library && raw.totalAuguries >= 1 && fateLevel >= AWAKENING_LEVELS.altar;
  const forge     = altar && raw.totalOathsSworn >= 1 && fateLevel >= AWAKENING_LEVELS.forge;
  const veilfront = forge && raw.forgeLevel >= 2;
  return { veilfire: true, library, altar, forge, veilfront };
}

const TRACKS: UpgradeTrack[] = ['sanctum', 'library', 'forge', 'altar', 'hearth', 'arena'];
const LEVEL_COL: Record<UpgradeTrack, 'sanctumLevel' | 'libraryLevel' | 'forgeLevel' | 'altarLevel' | 'hearthLevel' | 'arenaLevel'> = {
  sanctum: 'sanctumLevel', library: 'libraryLevel', forge: 'forgeLevel', altar: 'altarLevel',
  hearth: 'hearthLevel', arena: 'arenaLevel',
};

@Injectable()
export class SanctumService {
  constructor(
    private readonly prisma:   PrismaService,
    private readonly leveling: LevelingService,
    private readonly lore:     LoreService,
    private readonly questLog: QuestLogService,
  ) {}

  /** Sprint 32 — quest hooks. Fires the ritual's own quest event,
   *  plus 'ritual_day' when this ritual closes out all four for the
   *  UTC day (the "perfect day" objective). recordEvent never throws. */
  private async afterRitual(
    rootId: string,
    ritual: 'hearth' | 'oath' | 'trial' | 'augury',
    state: { lastHearthClaim: string | null; oathTodayDate: string | null;
             lastTrialComplete: string | null; lastAuguryDate: string | null },
  ): Promise<QuestProgressUpdate[]> {
    const updates = await this.questLog.recordEvent(rootId, { type: ritual });
    const today = todayUtc();
    const allFour =
      state.lastHearthClaim === today &&
      state.oathTodayDate === today &&
      state.lastTrialComplete === today &&
      state.lastAuguryDate === today;
    if (allFour) {
      updates.push(...await this.questLog.recordEvent(rootId, { type: 'ritual_day' }));
    }
    return updates;
  }

  async getOrCreateState(rootId: string) {
    const existing = await this.prisma.sanctumState.findUnique({ where: { rootId } });
    const state = existing ?? await this.prisma.sanctumState.create({ data: { rootId } });
    return this.attachProgression(rootId, state);
  }

  /** Append Fate progression (level + XP) to a sanctum_state row.
   *  The client uses this as the canonical level source so the
   *  Sanctum screen can render "LVL N" + XP progress bar without
   *  needing a second API call. Fate XP per canon (progression.md
   *  §2) drives Adventurer Rank and content gates. */
  private async attachProgression<T extends { rootId: string }>(rootId: string, state: T) {
    // Re-read the row rather than trusting the caller's snapshot.
    // Every ritual captures `updated` from its own write and THEN runs
    // afterRitual, which advances the deed streak and pays its essence
    // — so the snapshot is already stale by the time it gets here. The
    // player tended the hearth and the response told them their streak
    // was 0 and their essence 5 short. Anything a post-write hook
    // touches has to be re-read or it is invisible until the next sync.
    const [hero, fresh] = await Promise.all([
      this.prisma.rootIdentity.findUnique({
        where:  { id: rootId },
        select: { fateXp: true, fateLevel: true },
      }),
      this.prisma.sanctumState.findUnique({ where: { rootId } }),
    ]);
    if (fresh) state = { ...state, ...fresh };
    const fateXp       = hero?.fateXp ?? 0;
    // Derive Fate level fresh from XP, but never below the stored
    // level — the same monotonic promise grantXp makes (2026-07-10:
    // recalibrations must not visibly de-level anyone).
    const fateLevel    = Math.max(hero?.fateLevel ?? 1, levelFromXp(fateXp));
    const xpInLevel    = Math.max(0, fateXp - xpToReach(fateLevel));
    const xpToNextLvl  = xpForLevel(fateLevel);

    // ── Restoration economy + awakening payload (2026-07-10) ──
    const s = state as unknown as {
      totalTrials: number; totalAuguries: number; totalOathsSworn: number;
      sanctumLevel: number; libraryLevel: number; forgeLevel: number; altarLevel: number;
      hearthLevel: number; arenaLevel: number;
    };
    const [materials, activeBuilds, physicalEntries, spiritualEntries, mastery] = await Promise.all([
      this.materialStocks(rootId),
      this.prisma.sanctumBuild.findMany({
        where: { rootId, completedAt: null },
        select: { track: true, toLevel: true, startedAt: true, readyAt: true },
      }),
      // Works for the two tracks whose points aren't stored counters.
      // Sent with the state so the client's bars and the server's gate
      // read the same number instead of the client guessing.
      this.prisma.trainingEntry.count({ where: { rootId, pillar: 'forge' } }),
      this.prisma.trainingEntry.count({ where: { rootId, pillar: 'veil' } }),
      this.prisma.trialMastery.findMany({ where: { rootId }, select: { tier: true } }),
    ]);
    const arenaWorks = physicalEntries
      + ARENA_WORKS_PER_TIER * mastery.reduce((a, m) => a + m.tier, 0);
    const altarWorks = spiritualEntries;
    const levelOf: Record<UpgradeTrack, number> = {
      sanctum: s.sanctumLevel, library: s.libraryLevel,
      forge: s.forgeLevel, altar: s.altarLevel, hearth: s.hearthLevel,
      arena: s.arenaLevel,
    };
    const nextBuilds = Object.fromEntries(TRACKS.map(t => {
      const max = t === 'sanctum' ? SANCTUM_MAX_LEVEL : WING_MAX_LEVEL;
      return [t, levelOf[t] >= max ? null : buildCost(t, levelOf[t] + 1)];
    }));

    return {
      ...state,
      awakening:   awakeningFlags(s, fateLevel),
      materials,
      arena_works: arenaWorks,
      altar_works: altarWorks,
      builds:      activeBuilds,
      next_builds: nextBuilds,
      fateLevel,
      fateXp,
      xpInLevel,
      xpToNextLevel: xpToNextLvl,
    };
  }

  /** Progress-point + prerequisite gates for a track's NEXT level.
   *  Throws player-readable ConflictException when unmet; returns
   *  the next level when the right has been earned. */
  private async validateNext(
    rootId: string,
    raw: Awaited<ReturnType<typeof this.prisma.sanctumState.create>>,
    track: UpgradeTrack,
  ): Promise<number> {
    // Fate now gates restoration on every track — the Sanctum cannot
    // outrun the hero who lives in it.
    const hero = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId }, select: { fateLevel: true },
    });
    const fate = hero?.fateLevel ?? 1;
    if (track === 'sanctum') {
      const next = raw.sanctumLevel + 1;
      if (next > SANCTUM_MAX_LEVEL) throw new ConflictException('The Sanctum is fully restored.');
      const points =
          SANCTUM_POINTS.hearth * raw.totalHearthClaims
        + SANCTUM_POINTS.oath   * raw.totalOathsSworn
        + SANCTUM_POINTS.trial  * raw.totalTrials
        + SANCTUM_POINTS.augury * raw.totalAuguries;
      if (points < sanctumCumCost(next)) {
        throw new ConflictException('Not enough restoration progress.');
      }
      const prereq = SANCTUM_PREREQS[next];
      if (prereq) {
        const unmet: string[] = [];
        if (prereq.fate    && fate              < prereq.fate)    unmet.push(`Fate level ${prereq.fate}`);
        if (prereq.library && raw.libraryLevel  < prereq.library) unmet.push(`Library level ${prereq.library}`);
        if (prereq.forge   && raw.forgeLevel    < prereq.forge)   unmet.push(`Forge level ${prereq.forge}`);
        if (prereq.hearth  && raw.hearthLevel   < prereq.hearth)  unmet.push(`Hearth level ${prereq.hearth}`);
        if (prereq.altar   && raw.altarLevel    < prereq.altar)   unmet.push(`Altar level ${prereq.altar}`);
        if (prereq.arena   && raw.arenaLevel    < prereq.arena)   unmet.push(`Arena level ${prereq.arena}`);
        if (unmet.length > 0) {
          throw new ConflictException(`The keep cannot outgrow its wings. Requires ${unmet.join(' · ')}.`);
        }
      }
      return next;
    }
    if (track === 'library') {
      const next = raw.libraryLevel + 1;
      if (next > WING_MAX_LEVEL) throw new ConflictException('The Library is fully restored.');
      const finds = await this.prisma.heroLore.count({ where: { rootId } });
      if (finds < (LIBRARY_CUM_COSTS[next] ?? Infinity)) {
        throw new ConflictException('Not enough of the Archive has been recovered.');
      }
      this.requireWingFate(fate, next, 'Library');
      return next;
    }
    if (track === 'altar') {
      const next = raw.altarLevel + 1;
      if (next > WING_MAX_LEVEL) throw new ConflictException('The Altar is fully restored.');
      // Devotions. Tim's call (2026-08-04): the Altar's sources are
      // Hero Echoes, Spiritual practice and the Reliquary. Only
      // Spiritual exists today, so it carries the track alone and the
      // other two add to it as they land — the hardcoded 0 that stood
      // here had left the Altar unlevellable since it shipped.
      const altarWorks = await this.prisma.trainingEntry.count({
        where: { rootId, pillar: 'veil' },
      });
      if (altarWorks < (ALTAR_CUM_COSTS[next] ?? Infinity)) {
        throw new ConflictException('The altar is silent — no devotions have been offered.');
      }
      this.requireWingFate(fate, next, 'Altar');
      return next;
    }
    if (track === 'forge') {
      const next = raw.forgeLevel + 1;
      if (next > WING_MAX_LEVEL) throw new ConflictException('The Forge is fully restored.');
      const forgeWorks = await this.questLog.countTaggedClaims(rootId, 'forge_work');
      if (forgeWorks < (FORGE_CUM_COSTS[next] ?? Infinity)) {
        throw new ConflictException('The forge is cold — no works have been completed.');
      }
      this.requireWingFate(fate, next, 'Forge');
      return next;
    }
    if (track === 'arena') {
      const next = raw.arenaLevel + 1;
      if (next > WING_MAX_LEVEL) throw new ConflictException('The Arena is fully restored.');
      // Physical practice + trial mastery — Tim: link the ground to
      // the body's work AND the gauntlets, not to trials alone.
      const [practices, mastery] = await Promise.all([
        this.prisma.trainingEntry.count({ where: { rootId, pillar: 'forge' } }),
        this.prisma.trialMastery.findMany({ where: { rootId }, select: { tier: true } }),
      ]);
      const works = practices + ARENA_WORKS_PER_TIER * mastery.reduce((s2, m) => s2 + m.tier, 0);
      if (works < (ARENA_CUM_COSTS[next] ?? Infinity)) {
        throw new ConflictException('The ground is unproven — train the body, or take a gauntlet.');
      }
      this.requireWingFate(fate, next, 'Arena');
      return next;
    }
    if (track === 'hearth') {
      const next = raw.hearthLevel + 1;
      if (next > WING_MAX_LEVEL) throw new ConflictException('The Hearth is fully restored.');
      if (raw.totalHearthClaims < (HEARTH_CUM_COSTS[next] ?? Infinity)) {
        throw new ConflictException('The embers remember too few tendings.');
      }
      this.requireWingFate(fate, next, 'Hearth');
      return next;
    }
    throw new BadRequestException(`Unknown upgrade track: ${track}`);
  }

  /** Fate floor on a wing level. Uniform across the wings so none can
   *  be rushed ahead of the hero who lives in the Sanctum. */
  private requireWingFate(fate: number, nextLevel: number, wing: string): void {
    const floor = WING_FATE_FLOORS[nextLevel];
    if (floor && fate < floor) {
      throw new ConflictException(`The ${wing} answers a proven hero. Requires Fate level ${floor}.`);
    }
  }

  /** START a restoration build (2026-07-10 economy): the progress
   *  gates earn the RIGHT; essence + materials pay the PRICE; the
   *  timer is the WORK. One build in flight per track. */
  async upgrade(rootId: string, track: UpgradeTrack) {
    const raw = await this.prisma.sanctumState.findUnique({ where: { rootId } })
      ?? await this.prisma.sanctumState.create({ data: { rootId } });

    const next = await this.validateNext(rootId, raw, track);

    const active = await this.prisma.sanctumBuild.findFirst({
      where: { rootId, track, completedAt: null },
    });
    if (active) throw new ConflictException('Work on this wing is already underway.');

    const cost = buildCost(track, next);
    if (raw.veilEssence < cost.essence) {
      throw new ConflictException(`The work needs ${cost.essence} Veil Essence.`);
    }
    const stocks = await this.materialStocks(rootId);
    for (const [m, c] of Object.entries(cost.materials)) {
      if ((stocks[m as Material] ?? 0) < (c ?? 0)) {
        throw new ConflictException(`The work needs ${c} ${MATERIAL_LABEL[m as Material]}.`);
      }
    }

    const readyAt = new Date(Date.now() + cost.minutes * 60_000);
    await this.prisma.$transaction([
      this.prisma.sanctumState.update({
        where: { rootId },
        data:  { veilEssence: { decrement: cost.essence } },
      }),
      ...Object.entries(cost.materials).map(([m, c]) =>
        this.prisma.materialStock.update({
          where: { rootId_material: { rootId, material: m } },
          data:  { count: { decrement: c ?? 0 } },
        }),
      ),
      this.prisma.sanctumBuild.create({
        data: {
          rootId, track, toLevel: next,
          essence: cost.essence, materials: cost.materials, readyAt,
        },
      }),
    ]);

    const updated = await this.prisma.sanctumState.findUnique({ where: { rootId } });
    return this.attachProgression(rootId, updated!);
  }

  /** CLAIM a finished build — the ceremony beat. Commits the level
   *  and fires the wing_upgrade quest event only now. */
  async completeBuild(rootId: string, track: UpgradeTrack) {
    const build = await this.prisma.sanctumBuild.findFirst({
      where: { rootId, track, completedAt: null },
      orderBy: { startedAt: 'asc' },
    });
    if (!build) throw new ConflictException('No work is underway here.');
    if (build.readyAt.getTime() > Date.now()) {
      throw new ConflictException('The work is not yet done.');
    }
    const updated = await this.prisma.$transaction(async tx => {
      await tx.sanctumBuild.update({
        where: { id: build.id },
        data:  { completedAt: new Date() },
      });
      return tx.sanctumState.update({
        where: { rootId },
        data:  { [LEVEL_COL[track]]: build.toLevel },
      });
    });
    await this.questLog.recordEvent(rootId, { type: 'wing_upgrade', track });
    return this.attachProgression(rootId, updated);
  }

  private async materialStocks(rootId: string): Promise<Record<Material, number>> {
    const rows = await this.prisma.materialStock.findMany({ where: { rootId } });
    const stocks: Record<Material, number> = { veilglass: 0, leywood: 0, ore: 0 };
    for (const r of rows) stocks[r.material as Material] = r.count;
    return stocks;
  }

  async claimHearth(rootId: string) {
    const today = todayUtc();
    const state = await this.getOrCreateState(rootId);
    if (state.lastHearthClaim === today) {
      throw new ConflictException('Hearth already tended today.');
    }
    const updated = await this.prisma.sanctumState.update({
      where: { rootId },
      data: {
        veilEssence:       { increment: HEARTH_REWARD },
        lastHearthClaim:   today,
        totalHearthClaims: { increment: 1 },
      },
    });
    const xpAward     = await this.leveling.grantXp(rootId, XP_HEARTH);
    const questUpdates = await this.afterRitual(rootId, 'hearth', updated);
    const withProgress = await this.attachProgression(rootId, updated);
    return { ...withProgress, xp_award: xpAward, quest_updates: questUpdates };
  }

  async swearOath(rootId: string, option: OathOption) {
    if (!VALID_OATHS.includes(option)) {
      throw new BadRequestException(`Invalid oath option: ${option}`);
    }
    const today = todayUtc();
    const state = await this.getOrCreateState(rootId);
    if (state.oathTodayDate === today) {
      throw new ConflictException('Oath already sworn today.');
    }
    const updated = await this.prisma.sanctumState.update({
      where: { rootId },
      data: {
        oathTodayDate:    today,
        oathTodayOption:  option,
        totalOathsSworn:  { increment: 1 },
      },
    });
    const xpAward      = await this.leveling.grantXp(rootId, XP_OATH);
    const questUpdates = await this.afterRitual(rootId, 'oath', updated);
    const withProgress = await this.attachProgression(rootId, updated);
    return { ...withProgress, xp_award: xpAward, quest_updates: questUpdates };
  }

  /** Awarded amount for hearth claim — exposed so the controller can echo it back. */
  static readonly HEARTH_REWARD = HEARTH_REWARD;

  /** Sprint 30 / Slice 5.1 — Veil Trial completion.
   *
   *  Daily snackable minigame; one run per UTC day per hero. The
   *  client posts the score it tallied client-side; the server
   *  caps it via TRIAL_ESSENCE_MAX so a fudged client can't
   *  out-yield the cap. Tighten with server-side rate / duration
   *  validation in a later slice if abuse appears.
   *
   *  Reward: Veil Essence = min(score, max) + small flat Fate XP. */
  async completeTrial(rootId: string, score: number) {
    if (!Number.isFinite(score) || score < 0) {
      throw new BadRequestException('Trial score must be a non-negative number.');
    }
    const today = todayUtc();
    const state = await this.getOrCreateState(rootId);
    if ((state as { lastTrialComplete?: string | null }).lastTrialComplete === today) {
      throw new ConflictException('Veil Trial already completed today.');
    }

    const essence = Math.min(
      Math.floor(score) * TRIAL_ESSENCE_PER_CATCH,
      TRIAL_ESSENCE_MAX,
    );
    const newBest = Math.max(
      (state as { bestTrialScore?: number }).bestTrialScore ?? 0,
      Math.floor(score),
    );

    const updated = await this.prisma.sanctumState.update({
      where: { rootId },
      data: {
        veilEssence:        { increment: essence },
        lastTrialComplete:  today,
        totalTrials:        { increment: 1 },
        bestTrialScore:     newBest,
      },
    });
    const xpAward      = await this.leveling.grantXp(rootId, XP_TRIAL);
    const questUpdates = await this.afterRitual(rootId, 'trial', updated);
    const withProgress = await this.attachProgression(rootId, updated);
    return {
      ...withProgress,
      xp_award: xpAward,
      quest_updates: questUpdates,
      essence_granted: essence,
      score:           Math.floor(score),
      best:            newBest,
    };
  }

  /** 2026-07-08 — the Rite of Purification. One rite per UTC day
   *  per hero (same gate + counters as the trial it replaces, so
   *  restoration points keep flowing through totalTrials). The
   *  client reports final purity (0–100) plus node/corruption
   *  tallies for the weekly challenge objectives; the server owns
   *  grading and the reward math. */
  async completeRite(
    rootId: string,
    input: { purity: number; nodesPurified?: number; corruptionRemoved?: number },
  ) {
    const purity = Math.round(input.purity);
    if (!Number.isFinite(purity) || purity < 0 || purity > 100) {
      throw new BadRequestException('purity must be 0–100.');
    }
    const today = todayUtc();
    const state = await this.getOrCreateState(rootId);
    if ((state as { lastTrialComplete?: string | null }).lastTrialComplete === today) {
      throw new ConflictException('The Rite has already been performed today.');
    }

    const grade = riteGradeFor(purity);
    const sanctumLevel = (state as { sanctumLevel?: number }).sanctumLevel ?? 1;
    const essence = Math.round(
      RITE_GRADE_BASE[grade] * (1 + RITE_LEVEL_MULT * (sanctumLevel - 1)),
    );
    const newBest = Math.max(
      (state as { bestTrialScore?: number }).bestTrialScore ?? 0,
      purity,
    );

    const updated = await this.prisma.sanctumState.update({
      where: { rootId },
      data: {
        veilEssence:       { increment: essence },
        lastTrialComplete: today,
        totalTrials:       { increment: 1 },
        bestTrialScore:    newBest,   // best PURITY now — same column
      },
    });

    const xpAward = await this.leveling.grantXp(rootId, XP_RITE);
    // 'trial' drives the daily quest + perfect-day; 'rite' carries
    // the grade/purity/tallies for the weekly challenges.
    const questUpdates = await this.afterRitual(rootId, 'trial', updated);
    questUpdates.push(...await this.questLog.recordEvent(rootId, {
      type:       'rite',
      grade,
      purity,
      nodes:      Math.max(0, Math.round(input.nodesPurified ?? 0)),
      corruption: Math.max(0, Math.round(input.corruptionRemoved ?? 0)),
    }));

    const withProgress = await this.attachProgression(rootId, updated);
    return {
      ...withProgress,
      xp_award:        xpAward,
      quest_updates:   questUpdates,
      grade,
      purity,
      essence_granted: essence,
      best_purity:     newBest,
    };
  }

  /** Sprint 30 / Slice 5.2 — Augury Draw.
   *
   *  Daily 3-card weighted draw from AUGURY_DECK. Rewards stack:
   *  essence + fate XP are summed across all three; cache drops
   *  (currently only on the legendary card) spawn rows in the
   *  existing FateCache table so the player can open them via
   *  the normal cache ceremony flow.
   *
   *  One draw per UTC day per hero. */
  async drawAugury(rootId: string) {
    const today = todayUtc();
    const state = await this.getOrCreateState(rootId);
    if ((state as { lastAuguryDate?: string | null }).lastAuguryDate === today) {
      throw new ConflictException('Augury already drawn today.');
    }

    // Sprint 31 — deck pulled from DB (augury_cards) so seasonal cards
    // and weight rebalancing can ship without a redeploy. Filter:
    // active = true, season is NULL (base deck — seasonal filter added
    // later when first seasonal pool ships).
    const rows = await this.prisma.auguryCard.findMany({
      where: { active: true, season: null },
    });
    if (rows.length === 0) {
      throw new BadRequestException(
        'No active Augury cards. Run the seed migration before drawing.',
      );
    }

    // Level-lock high rarities (fairness gates above). Uses the same
    // derived Fate level the response reports.
    const hero = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId }, select: { fateXp: true },
    });
    const fateLevel = levelFromXp(hero?.fateXp ?? 0);
    const eligible = rows.filter(
      (r) => fateLevel >= (AUGURY_RARITY_LEVEL_GATES[r.rarity] ?? 0),
    );

    const deck: AuguryCard[] = eligible.map((r) => ({
      id:      r.id,
      name:    r.name,
      flavor:  r.flavor,
      rarity:  r.rarity as AuguryCard['rarity'],
      weight:  r.weight,
      rewards: r.rewards as AuguryCard['rewards'],
    }));

    // Three independent weighted picks. Same card may appear twice
    // by design — rare but a real moment when it does.
    const cards: AuguryCard[] = [
      weightedPickCard(deck),
      weightedPickCard(deck),
      weightedPickCard(deck),
    ];

    // Aggregate rewards
    let totalEssence = 0;
    let totalXp      = 0;
    const cacheSpecs: Array<{ type: string; rarity: string }> = [];
    for (const card of cards) {
      if (card.rewards.essence) totalEssence += card.rewards.essence;
      if (card.rewards.fate_xp) totalXp      += card.rewards.fate_xp;
      if (card.rewards.cache)   cacheSpecs.push(card.rewards.cache);
    }

    // Apply state mutations atomically (essence + day gate + counter)
    const updated = await this.prisma.sanctumState.update({
      where: { rootId },
      data: {
        veilEssence:    { increment: totalEssence },
        lastAuguryDate: today,
        totalAuguries:  { increment: 1 },
      },
    });

    // Spawn sealed cache rows (post-transaction is fine — these are
    // append-only and the player wouldn't see them until they come
    // back to the cache view).
    const grantedCaches: Array<{ cache_id: string; cache_type: string; rarity: string }> = [];
    for (const spec of cacheSpecs) {
      const cache = await this.prisma.fateCache.create({
        data: {
          rootId,
          cacheType: spec.type,
          rarity:    spec.rarity,
          trigger:   'augury',
        },
      });
      grantedCaches.push({ cache_id: cache.id, cache_type: cache.cacheType, rarity: cache.rarity });
    }

    // Scholar cards — each grants one Lore Archive entry (rarity-
    // weighted, never-throws; null once the archive is complete).
    const loreFound: LoreFound[] = [];
    for (const card of cards) {
      if (card.rewards.lore) {
        const found = await this.lore.grantRandom(rootId, 'augury');
        if (found) loreFound.push(found);
      }
    }

    const xpAward      = totalXp > 0 ? await this.leveling.grantXp(rootId, totalXp) : null;
    const questUpdates = await this.afterRitual(rootId, 'augury', updated);
    // Scholar lore drops advance collect_lore objectives too.
    for (let i = 0; i < loreFound.length; i++) {
      questUpdates.push(...await this.questLog.recordEvent(rootId, { type: 'lore_find' }));
    }
    const withProgress = await this.attachProgression(rootId, updated);
    return {
      ...withProgress,
      xp_award:        xpAward,
      quest_updates:   questUpdates,
      cards: cards.map((c) => ({
        id:      c.id,
        name:    c.name,
        flavor:  c.flavor,
        rarity:  c.rarity,
        rewards: c.rewards,
      })),
      essence_granted: totalEssence,
      fate_xp_granted: totalXp,
      caches_granted:  grantedCaches,
      lore_found:      loreFound,
    };
  }
}
