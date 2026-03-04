// ============================================================
// PIK — Marker Milestone Engine
//
// Runs after every fate_marker event. Categorises the player's
// full marker history, checks all threshold ladders, and fires
// title grants + cache drops for anything newly crossed.
//
// Design goals:
//   • Idempotent — re-running on the same state never double-grants
//   • Additive — new categories/thresholds added without touching
//     existing ones; old titles are never revoked
//   • Observable — every grant logged as a structured event so
//     operators can see exactly what fired and why
//
// Place at: src/marker-engine/marker-engine.service.ts
// Register in: src/marker-engine/marker-engine.module.ts
// Inject into: IngestService (call checkMilestones after writing
//              any fate_marker event)
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService }      from '../prisma.service';
import { EventsService }      from '../events/events.service';
import { LootService }        from '../loot/loot.service';

// ─────────────────────────────────────────────────────────────
// MARKER CATEGORIES
//
// Each category defines a regex that matches against the raw
// marker string stored in FateMarker.marker.  A single marker
// can belong to multiple categories (e.g. a boss-veil encounter
// counts in both Veil and Combat).
// ─────────────────────────────────────────────────────────────
export const MARKER_CATEGORIES = {

  // ── VEIL ────────────────────────────────────────────────────
  // Markers earned by encountering Veil Shards, Veil thinning
  // events, or witnessing narrative Veil moments at venues.
  // These are the rarest and most prestigious — they require
  // physical presence at a specific in-world location.
  veil: /veil|thinning|glimpsed_the_weave|witnessed_the_thinning/i,

  // ── COMBAT ──────────────────────────────────────────────────
  // Boss kills, guardian defeats, trophy claims.
  // Earned when a session completes with high boss_damage_pct.
  combat: /boss|guardian|trophy|slain|defeated|champion|conqueror/i,

  // ── FATE ────────────────────────────────────────────────────
  // Lore-layer markers — story beats, artefact discoveries,
  // cross-venue narrative moments. Earned through any session
  // that fires a progression.fate_marker ingest event without
  // matching a more specific category.
  fate: /fate|weave|rune|ascend|omen|prophecy|awakened|burning/i,

  // ── EXPLORER ────────────────────────────────────────────────
  // Venue-discovery markers: first visit to a new location,
  // hidden-room unlocks, landmark finds.
  explorer: /discovered|explored|found|entered|unlocked|surveyed/i,

  // ── SURVIVOR ────────────────────────────────────────────────
  // Markers awarded for near-death difficulty completions,
  // solo runs, or no-damage nodes.
  survivor: /survived|endured|solo|no_damage|last_standing|outlasted/i,

} as const;

export type MarkerCategory = keyof typeof MARKER_CATEGORIES;

// ─────────────────────────────────────────────────────────────
// TITLE LADDERS
//
// Each ladder is an ordered array of thresholds (ascending).
// The engine checks which thresholds are newly crossed after
// the latest marker is written and grants each title once.
//
// title_id must match exactly what is stored in UserTitle.titleId
// and what the loot table / portal displays.
//
// cache_grant is optional — fires a milestone Fate Cache in
// addition to the title, giving players a tangible reward.
// ─────────────────────────────────────────────────────────────

export interface MilestoneTier {
  count:      number;
  title_id:   string;
  label:      string;           // human-readable, shown in events
  cache?:     {
    type:     string;           // cache_type passed to LootService
    rarity:   string;
  };
}

export const TITLE_LADDERS: Record<MarkerCategory | 'total', MilestoneTier[]> = {

  // ── VEIL LADDER ─────────────────────────────────────────────
  // The prestige track. Veil markers require physical presence
  // at specific venue locations — they can't be farmed.
  // High thresholds reflect genuine long-term engagement.
  veil: [
    {
      count:    1,
      title_id: 'title_veil_touched',
      label:    'Veil Touched',
      // No cache at 1 — just recognition. Creates curiosity.
    },
    {
      count:    5,
      title_id: 'title_veil_seeker',
      label:    'Veil Seeker',
      cache:    { type: 'milestone', rarity: 'uncommon' },
    },
    {
      count:    25,
      title_id: 'title_veil_hunter',
      label:    'Veil Hunter',
      cache:    { type: 'milestone', rarity: 'rare' },
    },
    {
      count:    75,
      title_id: 'title_veilbreaker_75',   // matches existing real title
      label:    'Veilbreaker 75',
      cache:    { type: 'milestone', rarity: 'epic' },
    },
    {
      count:    100,
      title_id: 'title_veilbreaker_100',  // matches existing real title
      label:    'Veilbreaker 100',
      cache:    { type: 'milestone', rarity: 'epic' },
    },
    {
      count:    200,
      title_id: 'title_veil_ascendant',
      label:    'Veil Ascendant',
      cache:    { type: 'milestone', rarity: 'legendary' },
      // Legendary threshold — meaningful long-term goal for hardcore players
    },
  ],

  // ── COMBAT LADDER ───────────────────────────────────────────
  // Boss and guardian kills. More accessible than Veil — every
  // hard session can produce one. Designed to reward consistent
  // attendance without being trivially fast to complete.
  combat: [
    {
      count:    1,
      title_id: 'title_guardian_slayer',
      label:    'Guardian Slayer',
    },
    {
      count:    5,
      title_id: 'title_boss_hunter',
      label:    'Boss Hunter',
      cache:    { type: 'boss_kill', rarity: 'uncommon' },
    },
    {
      count:    20,
      title_id: 'title_warden_of_blades',
      label:    'Warden of Blades',
      cache:    { type: 'boss_kill', rarity: 'rare' },
    },
    {
      count:    50,
      title_id: 'title_bane_of_guardians',
      label:    'Bane of Guardians',
      cache:    { type: 'boss_kill', rarity: 'epic' },
    },
    {
      count:    100,
      title_id: 'title_immortal_champion',
      label:    'Immortal Champion',
      cache:    { type: 'boss_kill', rarity: 'legendary' },
    },
  ],

  // ── FATE LADDER ─────────────────────────────────────────────
  // Lore and story markers. The broadest category — almost
  // every session can produce one. This is the "XP of markers":
  // always progressing, always rewarding, but not prestigious
  // on its own. The high-end titles carry real weight.
  fate: [
    {
      count:    1,
      title_id: 'title_fate_touched',
      label:    'Fate Touched',
    },
    {
      count:    10,
      title_id: 'title_fate_burning',     // matches existing real title
      label:    'Fate Burning',
      cache:    { type: 'milestone', rarity: 'common' },
    },
    {
      count:    25,
      title_id: 'title_fate_witness',
      label:    'Fate Witness',
      cache:    { type: 'milestone', rarity: 'uncommon' },
    },
    {
      count:    50,
      title_id: 'title_fate_weaver',      // matches existing real title
      label:    'Fate Weaver',
      cache:    { type: 'milestone', rarity: 'rare' },
    },
    {
      count:    100,
      title_id: 'title_fate_ascendant',   // matches existing real title
      label:    'Fate Ascendant',
      cache:    { type: 'milestone', rarity: 'epic' },
    },
  ],

  // ── EXPLORER LADDER ─────────────────────────────────────────
  // Discovery markers. Rewards players who explore venues
  // thoroughly rather than just grinding sessions.
  explorer: [
    {
      count:    1,
      title_id: 'title_pathfinder',
      label:    'Pathfinder',
    },
    {
      count:    5,
      title_id: 'title_realm_walker',
      label:    'Realm Walker',
      cache:    { type: 'milestone', rarity: 'uncommon' },
    },
    {
      count:    15,
      title_id: 'title_cartographer_of_fate',
      label:    'Cartographer of Fate',
      cache:    { type: 'milestone', rarity: 'rare' },
    },
  ],

  // ── SURVIVOR LADDER ─────────────────────────────────────────
  // Difficulty mastery markers. Rare — require specific
  // high-skill session completions. A short ladder with
  // high-prestige titles.
  survivor: [
    {
      count:    1,
      title_id: 'title_iron_willed',
      label:    'Iron Willed',
    },
    {
      count:    5,
      title_id: 'title_the_unbroken',
      label:    'The Unbroken',
      cache:    { type: 'milestone', rarity: 'rare' },
    },
    {
      count:    10,
      title_id: 'title_deathwalker',
      label:    'Deathwalker',
      cache:    { type: 'milestone', rarity: 'epic' },
    },
  ],

  // ── TOTAL MARKER LADDER ─────────────────────────────────────
  // Cross-category aggregate. Rewards breadth of engagement —
  // a player who earns 50 markers across ALL categories gets
  // recognised differently from one who has 50 in a single
  // track. These titles signal depth of play.
  total: [
    {
      count:    1,
      title_id: 'title_fate_awakened',    // matches existing real title
      label:    'Fate Awakened',
      // First marker ever — immediate recognition
    },
    {
      count:    10,
      title_id: 'title_marked',
      label:    'The Marked',
      cache:    { type: 'milestone', rarity: 'common' },
    },
    {
      count:    50,
      title_id: 'title_deep_marked',
      label:    'Deep Marked',
      cache:    { type: 'milestone', rarity: 'uncommon' },
    },
    {
      count:    100,
      title_id: 'title_century_marked',
      label:    'Century Marked',
      cache:    { type: 'milestone', rarity: 'rare' },
    },
    {
      count:    500,
      title_id: 'title_living_legend',
      label:    'Living Legend',
      cache:    { type: 'milestone', rarity: 'legendary' },
      // Long-term retention anchor: gives hardcore players a
      // horizon they can see but not reach quickly
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// ENGINE
// ─────────────────────────────────────────────────────────────

@Injectable()
export class MarkerEngineService {
  private readonly logger = new Logger(MarkerEngineService.name);

  constructor(
    private readonly prisma:  PrismaService,
    private readonly events:  EventsService,
    private readonly loot:    LootService,
  ) {}

  /**
   * Main entry point. Call this immediately after writing a
   * FateMarker record in the ingest service:
   *
   *   await this.markerEngine.checkMilestones(rootId, sourceId);
   *
   * Safe to call multiple times — idempotent via UserTitle
   * unique constraint on (rootId, titleId).
   */
  async checkMilestones(rootId: string, sourceId?: string): Promise<void> {
    // 1. Load full marker history for this player
    const allMarkers = await this.prisma.fateMarker.findMany({
      where: { rootId },
      select: { marker: true },
    });

    const markerStrings = allMarkers.map((m) => m.marker);

    // 2. Load titles already held (to skip already-granted)
    const heldTitles = await this.prisma.userTitle.findMany({
      where: { rootId },
      select: { titleId: true },
    });
    const heldSet = new Set(heldTitles.map((t) => t.titleId));

    // 3. Count per category + total
    const counts = this.countByCategory(markerStrings);

    // 4. Check every ladder and collect grants needed
    const grants: Array<{ tier: MilestoneTier; category: string }> = [];

    for (const [category, ladder] of Object.entries(TITLE_LADDERS)) {
      const count = counts[category as MarkerCategory | 'total'] ?? 0;
      for (const tier of ladder) {
        if (count >= tier.count && !heldSet.has(tier.title_id)) {
          grants.push({ tier, category });
        }
      }
    }

    if (grants.length === 0) return; // nothing new crossed

    // 5. Resolve player level once (needed for cache rarity)
    const identity = await this.prisma.rootIdentity.findUnique({
      where:  { id: rootId },
      select: { fateLevel: true },
    });
    const level = identity?.fateLevel ?? 1;

    // 6. Apply all grants
    for (const { tier, category } of grants) {
      await this.applyGrant(rootId, tier, category, sourceId, level, counts);
    }
  }

  // ─────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────

  /**
   * Count how many of the player's markers fall into each
   * category and the total.
   */
  private countByCategory(
    markers: string[],
  ): Record<MarkerCategory | 'total', number> {
    const counts = {
      veil:     0,
      combat:   0,
      fate:     0,
      explorer: 0,
      survivor: 0,
      total:    markers.length,
    };

    for (const marker of markers) {
      for (const [cat, regex] of Object.entries(MARKER_CATEGORIES)) {
        if (regex.test(marker)) {
          counts[cat as MarkerCategory]++;
        }
      }
    }

    return counts;
  }

  /**
   * Grant a single title milestone: write the UserTitle record,
   * optionally fire a cache grant, and log the structured event.
   */
  private async applyGrant(
    rootId:   string,
    tier:     MilestoneTier,
    category: string,
    sourceId: string | undefined,
    level:    number,
    counts:   Record<string, number>,
  ): Promise<void> {
    // Write title — silently skip if unique constraint fires
    // (safety net: checkMilestones already checked heldSet, but
    // concurrent requests could race)
    try {
      await this.prisma.userTitle.create({
        data: { rootId, titleId: tier.title_id, sourceId: sourceId ?? null },
      });
    } catch {
      // Already held — no-op
      return;
    }

    this.logger.log(
      `Milestone: ${tier.label} (${tier.title_id}) granted to ${rootId} ` +
      `[${category} × ${tier.count}]`,
    );

    // Log milestone event
    await this.events.log({
      rootId,
      eventType:  'marker.milestone_reached',
      sourceId,
      payload: {
        category,
        threshold:  tier.count,
        title_id:   tier.title_id,
        title_label: tier.label,
        counts_snapshot: counts,
      },
      changes: {
        title_granted: tier.title_id,
        milestone_category: category,
        milestone_threshold: tier.count,
      },
    });

    // Fire cache grant if defined
    if (tier.cache) {
      try {
        await this.loot.grantCache({
          rootId,
          cacheType:  tier.cache.type,
          sourceId,
          trigger:    `milestone:${category}:${tier.count}`,
          level,
          rarityOverride: tier.cache.rarity,
        });

        this.logger.log(
          `  └─ Cache granted: ${tier.cache.rarity} ${tier.cache.type} ` +
          `for ${tier.label} milestone`,
        );
      } catch (err) {
        // Cache grant failure must not block title grant
        this.logger.warn(`Cache grant failed for milestone ${tier.title_id}: ${err}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // OPERATOR / ANALYTICS HELPERS
  // ─────────────────────────────────────────────────────────

  /**
   * Return a full milestone snapshot for a player.
   * Used by the operator dashboard and portal Identity tab.
   *
   * GET /api/users/:root_id/marker-milestones
   */
  async getMilestoneSnapshot(rootId: string) {
    const allMarkers = await this.prisma.fateMarker.findMany({
      where:   { rootId },
      select:  { marker: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const markerStrings = allMarkers.map((m) => m.marker);
    const counts        = this.countByCategory(markerStrings);

    const heldTitles = await this.prisma.userTitle.findMany({
      where:  { rootId },
      select: { titleId: true },
    });
    const heldSet = new Set(heldTitles.map((t) => t.titleId));

    // Build progress object per ladder
    const ladders = Object.entries(TITLE_LADDERS).map(([category, tiers]) => {
      const count = counts[category as MarkerCategory | 'total'] ?? 0;

      const progress = tiers.map((tier) => ({
        threshold:   tier.count,
        title_id:    tier.title_id,
        label:       tier.label,
        earned:      heldSet.has(tier.title_id),
        cache_bonus: tier.cache ?? null,
      }));

      // Find the next uncrossed threshold
      const next = progress.find((p) => !p.earned);

      return {
        category,
        count,
        next_threshold: next?.threshold ?? null,
        next_title:     next?.label     ?? null,
        progress_pct:   next
          ? Math.min(100, Math.round((count / next.threshold) * 100))
          : 100,
        tiers: progress,
      };
    });

    return {
      root_id:         rootId,
      total_markers:   markerStrings.length,
      category_counts: counts,
      ladders,
      // Earliest and latest marker timestamps for operator analytics
      first_marker_at: allMarkers[0]?.createdAt?.toISOString() ?? null,
      last_marker_at:  allMarkers[allMarkers.length - 1]?.createdAt?.toISOString() ?? null,
    };
  }

  /**
   * Aggregate across ALL players: how many have reached each
   * milestone threshold. Useful for investor/operator dashboards.
   *
   * GET /api/analytics/marker-milestones
   */
  async getSystemMilestoneStats() {
    // Count how many players hold each milestone title
    const titleCounts = await this.prisma.userTitle.groupBy({
      by:     ['titleId'],
      _count: { titleId: true },
      orderBy: { _count: { titleId: 'desc' } },
    });

    // Build milestone breakdown keyed by category
    const byCategory: Record<string, unknown[]> = {};

    for (const [category, tiers] of Object.entries(TITLE_LADDERS)) {
      byCategory[category] = tiers.map((tier) => {
        const row = titleCounts.find((r) => r.titleId === tier.title_id);
        return {
          threshold:    tier.count,
          title_id:     tier.title_id,
          label:        tier.label,
          players_held: row?._count?.titleId ?? 0,
        };
      });
    }

    // Total unique players with at least one marker milestone
    const playersWithAnyMilestone = await this.prisma.userTitle.groupBy({
      by: ['rootId'],
    });

    return {
      players_with_milestones: playersWithAnyMilestone.length,
      by_category:             byCategory,
    };
  }
}
