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
  };
}

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

export type UpgradeTrack = 'sanctum' | 'library' | 'forge' | 'altar';

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

/** Wing-level prerequisites to REACH each sanctum level — the keep
 *  cannot outgrow its wings (Kingshot-style main-building gating).
 *  Hearth/Altar join the table once their tracks exist. */
const SANCTUM_PREREQS: Record<number, { library?: number; forge?: number; hearth?: number; altar?: number }> = {
  5:  { library: 2 },
  6:  { library: 2 },
  7:  { library: 3 },
  8:  { library: 3, forge: 2 },
  9:  { library: 4, forge: 2 },
  10: { library: 4, forge: 3 },
  11: { library: 5, forge: 3 },
  12: { library: 5, forge: 4 },
  13: { library: 6, forge: 4 },
  14: { library: 6, forge: 5 },
  15: { library: 7, forge: 5 },
  16: { library: 7, forge: 6 },
  17: { library: 8, forge: 6 },
  18: { library: 8, forge: 7 },
  19: { library: 9, forge: 8 },
  20: { library: 10, forge: 9 },
};

@Injectable()
export class SanctumService {
  constructor(
    private readonly prisma:   PrismaService,
    private readonly leveling: LevelingService,
  ) {}

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
    const hero = await this.prisma.rootIdentity.findUnique({
      where:  { id: rootId },
      select: { fateXp: true, fateLevel: true },
    });
    const fateXp       = hero?.fateXp ?? 0;
    // Derive Fate level fresh from XP — the stored fateLevel may lag
    // if a non-LevelingService path granted XP without recomputing.
    const fateLevel    = levelFromXp(fateXp);
    const xpInLevel    = fateXp - xpToReach(fateLevel);
    const xpToNextLvl  = xpForLevel(fateLevel);
    return {
      ...state,
      fateLevel,
      fateXp,
      xpInLevel,
      xpToNextLevel: xpToNextLvl,
    };
  }

  /** Commit a restoration level-up. Validates (a) enough progress
   *  points for the next level, (b) wing-level prerequisites for the
   *  sanctum track. Throws ConflictException with a player-readable
   *  message when a gate is unmet. */
  async upgrade(rootId: string, track: UpgradeTrack) {
    const raw = await this.prisma.sanctumState.findUnique({ where: { rootId } })
      ?? await this.prisma.sanctumState.create({ data: { rootId } });

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
        if (prereq.library && raw.libraryLevel < prereq.library) unmet.push(`Library level ${prereq.library}`);
        if (prereq.forge   && raw.forgeLevel   < prereq.forge)   unmet.push(`Forge level ${prereq.forge}`);
        if (prereq.hearth  && raw.hearthLevel  < prereq.hearth)  unmet.push(`Hearth level ${prereq.hearth}`);
        if (prereq.altar   && raw.altarLevel   < prereq.altar)   unmet.push(`Altar level ${prereq.altar}`);
        if (unmet.length > 0) {
          throw new ConflictException(`The keep cannot outgrow its wings. Requires ${unmet.join(' · ')}.`);
        }
      }
      const updated = await this.prisma.sanctumState.update({
        where: { rootId }, data: { sanctumLevel: next },
      });
      return this.attachProgression(rootId, updated);
    }

    if (track === 'library') {
      const next = raw.libraryLevel + 1;
      if (next > WING_MAX_LEVEL) throw new ConflictException('The Library is fully restored.');
      const finds = await this.prisma.heroLore.count({ where: { rootId } });
      if (finds < (LIBRARY_CUM_COSTS[next] ?? Infinity)) {
        throw new ConflictException('Not enough of the Archive has been recovered.');
      }
      const updated = await this.prisma.sanctumState.update({
        where: { rootId }, data: { libraryLevel: next },
      });
      return this.attachProgression(rootId, updated);
    }

    if (track === 'altar') {
      const next = raw.altarLevel + 1;
      if (next > WING_MAX_LEVEL) throw new ConflictException('The Altar is fully restored.');
      // Altar works = Reliquary + Hero Echo completions (TBG).
      const altarWorks = 0;
      if (altarWorks < (ALTAR_CUM_COSTS[next] ?? Infinity)) {
        throw new ConflictException('The altar is silent — no devotions have been offered.');
      }
      const updated = await this.prisma.sanctumState.update({
        where: { rootId }, data: { altarLevel: next },
      });
      return this.attachProgression(rootId, updated);
    }

    if (track === 'forge') {
      const next = raw.forgeLevel + 1;
      if (next > WING_MAX_LEVEL) throw new ConflictException('The Forge is fully restored.');
      // Forge works = Crafting + Smelting quest completions. Content
      // TBG — until those quests seed, points are 0 and the forge
      // holds at L1. (Resonance floors for upper forge levels are
      // enforced client-side v1; move here once a server-side
      // resonance read exists.)
      const forgeWorks = 0;
      if (forgeWorks < (FORGE_CUM_COSTS[next] ?? Infinity)) {
        throw new ConflictException('The forge is cold — no works have been completed.');
      }
      const updated = await this.prisma.sanctumState.update({
        where: { rootId }, data: { forgeLevel: next },
      });
      return this.attachProgression(rootId, updated);
    }

    throw new BadRequestException(`Unknown upgrade track: ${track}`);
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
    const withProgress = await this.attachProgression(rootId, updated);
    return { ...withProgress, xp_award: xpAward };
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
    const withProgress = await this.attachProgression(rootId, updated);
    return { ...withProgress, xp_award: xpAward };
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
    const withProgress = await this.attachProgression(rootId, updated);
    return {
      ...withProgress,
      xp_award: xpAward,
      essence_granted: essence,
      score:           Math.floor(score),
      best:            newBest,
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
    const deck: AuguryCard[] = rows.map((r) => ({
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

    const xpAward      = totalXp > 0 ? await this.leveling.grantXp(rootId, totalXp) : null;
    const withProgress = await this.attachProgression(rootId, updated);
    return {
      ...withProgress,
      xp_award:        xpAward,
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
    };
  }
}
