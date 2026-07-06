// ============================================================
// PIK — Lore Service (2026-07-06)
//
// The Lore Archive: a Pokémon-Go-style collection quest. Heroes
// recover catalog entries by sealing tears out in the world —
// each won seal rolls a tier-keyed drop chance, and a hit grants
// a rarity-weighted random entry the hero doesn't own yet.
//
// The catalog lives in lore_entries (seeded by npm run seed:lore);
// per-hero finds live in hero_lore. The client weights Library
// restoration by find count. Parallel to — not replacing — the
// future Hero Echo system.
// ============================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Chance that a WON seal yields a lore find, keyed by tear tier.
// Rarer tears are stronger "expeditions" — better lore odds.
const DROP_CHANCE_BY_TEAR_TIER: Record<string, number> = {
  minor:   0.35,
  wander:  0.50,
  dormant: 0.75,
  double:  1.0,
};

// Weighted-random pick weights per entry rarity.
const RARITY_WEIGHT: Record<string, number> = {
  common:    100,
  uncommon:  55,
  rare:      25,
  epic:      10,
  legendary: 3,
};

export interface LoreListItem {
  id:            string;
  title:         string;
  category:      string;
  rarity:        string;
  glyph:         string;
  /** Entry text — only present once found (undiscovered rows are
   *  silhouettes: title + rarity visible, body withheld). */
  body:          string | null;
  found:         boolean;
  found_at:      string | null;   // ISO
  display_order: number;
}

export interface LoreFound {
  id:     string;
  title:  string;
  category: string;
  rarity: string;
  glyph:  string;
  body:   string;
}

@Injectable()
export class LoreService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public read — the full catalog with per-hero find state.
   *  Undiscovered entries are returned as silhouettes (no body). */
  async listForPlayer(rootId: string): Promise<LoreListItem[]> {
    const defs = await this.prisma.loreEntry.findMany({
      where:   { active: true },
      orderBy: { displayOrder: 'asc' },
    });
    const finds = await this.prisma.heroLore.findMany({ where: { rootId } });
    const foundMap = new Map(finds.map((f) => [f.loreId, f]));

    return defs.map((d) => {
      const f = foundMap.get(d.id);
      return {
        id:            d.id,
        title:         d.title,
        category:      d.category,
        rarity:        d.rarity,
        glyph:         d.glyph,
        body:          f ? d.body : null,
        found:         !!f,
        found_at:      f ? f.foundAt.toISOString() : null,
        display_order: d.displayOrder,
      };
    });
  }

  /** Roll the tear-seal lore drop. Returns the granted entry, or
   *  null (no hit / collection already complete). Never throws —
   *  a lore drop must not fail a seal. */
  async maybeDropOnSeal(rootId: string, tearType: string): Promise<LoreFound | null> {
    try {
      const chance = DROP_CHANCE_BY_TEAR_TIER[tearType] ?? 0.35;
      if (Math.random() > chance) return null;

      const [defs, finds] = await Promise.all([
        this.prisma.loreEntry.findMany({ where: { active: true } }),
        this.prisma.heroLore.findMany({ where: { rootId }, select: { loreId: true } }),
      ]);
      const owned = new Set(finds.map((f) => f.loreId));
      const pool  = defs.filter((d) => !owned.has(d.id));
      if (pool.length === 0) return null;   // archive complete

      const total = pool.reduce((s, d) => s + (RARITY_WEIGHT[d.rarity] ?? 1), 0);
      let roll = Math.random() * total;
      let pick = pool[pool.length - 1];
      for (const d of pool) {
        roll -= RARITY_WEIGHT[d.rarity] ?? 1;
        if (roll <= 0) { pick = d; break; }
      }

      await this.prisma.heroLore.create({
        data: { rootId, loreId: pick.id, source: 'tear_seal' },
      });

      return {
        id:       pick.id,
        title:    pick.title,
        category: pick.category,
        rarity:   pick.rarity,
        glyph:    pick.glyph,
        body:     pick.body,
      };
    } catch (err) {
      // Unique-violation race (double-tap seals) or transient DB issue —
      // swallow; the seal result matters more than the lore roll.
      return null;
    }
  }
}
