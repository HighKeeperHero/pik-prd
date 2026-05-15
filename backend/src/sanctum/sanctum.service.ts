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

const AUGURY_DECK: AuguryCard[] = [
  // ── Common — drift, ash, mote ──────────────────────────────
  { id: 'wisp-fragment',   name: 'WISP FRAGMENT',   rarity: 'common', weight: 50,
    flavor: 'A pale wisp drifts past your fingers.',
    rewards: { essence: 5 } },
  { id: 'pale-coin',       name: 'PALE COIN',       rarity: 'common', weight: 50,
    flavor: 'A coin warmed by hands not your own.',
    rewards: { essence: 6 } },
  { id: 'hearth-ash',      name: 'HEARTH ASH',      rarity: 'common', weight: 50,
    flavor: 'Ash from a hearth whose owner has gone.',
    rewards: { essence: 4, fate_xp: 5 } },
  { id: 'veil-mote',       name: 'VEIL MOTE',       rarity: 'common', weight: 50,
    flavor: 'A mote of Veil dust catches on your sleeve.',
    rewards: { fate_xp: 10 } },

  // ── Uncommon — sparks + threads + echoes ───────────────────
  { id: 'forge-spark',     name: 'FORGE SPARK',     rarity: 'uncommon', weight: 35,
    flavor: 'A spark from a forge not your own.',
    rewards: { essence: 10, fate_xp: 10 } },
  { id: 'reliquary-echo',  name: 'RELIQUARY ECHO',  rarity: 'uncommon', weight: 35,
    flavor: 'The Reliquary at your throat warms briefly.',
    rewards: { essence: 14 } },
  { id: 'oath-thread',     name: 'OATH THREAD',     rarity: 'uncommon', weight: 35,
    flavor: 'A thread pulled from an oath someone kept.',
    rewards: { essence: 8, fate_xp: 18 } },

  // ── Rare — held memories, marked tokens ────────────────────
  { id: 'sealed-memory',   name: 'SEALED MEMORY',   rarity: 'rare', weight: 15,
    flavor: 'A memory the Veil tried to keep.',
    rewards: { essence: 20, fate_xp: 25 } },
  { id: 'mintmaster-mark', name: "MINTMASTER'S MARK", rarity: 'rare', weight: 15,
    flavor: 'A token marked by an unfamiliar sigil.',
    rewards: { essence: 30 } },

  // ── Epic — Empyrean glimpse ────────────────────────────────
  { id: 'empyrean-glimmer', name: 'EMPYREAN GLIMMER', rarity: 'epic', weight: 5,
    flavor: 'A glimmer of Empyrean color, brief but real.',
    rewards: { essence: 40, fate_xp: 40 } },

  // ── Legendary — the Oracular speaks (+ sealed cache) ───────
  { id: 'oracular-vision', name: 'THE ORACULAR SPEAKS', rarity: 'legendary', weight: 2,
    flavor: 'A vision passes through you. You remember it later.',
    rewards: { essence: 30, fate_xp: 80, cache: { type: 'augury_legendary', rarity: 'epic' } } },
];

function weightedPickCard(): AuguryCard {
  const totalWeight = AUGURY_DECK.reduce((sum, c) => sum + c.weight, 0);
  let r = Math.random() * totalWeight;
  for (const card of AUGURY_DECK) {
    r -= card.weight;
    if (r <= 0) return card;
  }
  return AUGURY_DECK[0];
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

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

    // Three independent weighted picks. Same card may appear twice
    // by design — rare but a real moment when it does.
    const cards: AuguryCard[] = [weightedPickCard(), weightedPickCard(), weightedPickCard()];

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
