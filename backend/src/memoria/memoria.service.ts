// ============================================================
// PIK — Memoria Service
// Sprint 32 / Tier 2 identity-collection
//
// Memoria are kept moments — a breath, a coal, a whisker —
// granted (idempotently) the first time a player crosses a
// defined identity threshold. They carry no power; they exist
// purely as the persistent record of who the hero has become.
//
// The grant logic is backfill-shaped: we never modify existing
// identity-moment handlers. Instead, listForPlayer() rescans
// the player's IdentityEvent ledger + SanctumState on every
// fetch and grants any missing Memoria. New triggers ship by
// adding a resolver here and an INSERT to memoria_defs.
// ============================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';

// Mirrors IdentityService.RANK_TIERS — kept local so this service
// doesn't drag a dependency on IdentityService just for the table.
// If a new tier is introduced, update both call sites.
const RANK_TIERS = [
  { name: 'Bronze',     min: 1,  max: 6   },
  { name: 'Copper',     min: 7,  max: 13  },
  { name: 'Silver',     min: 14, max: 21  },
  { name: 'Gold',       min: 22, max: 29  },
  { name: 'Platinum',   min: 30, max: 39  },
  { name: 'Adamantium', min: 40, max: 40  },
  { name: 'Job Quest',  min: 41, max: 999 },
];

function tierForLevel(level: number): string {
  return (RANK_TIERS.find((t) => level >= t.min && level <= t.max) ?? RANK_TIERS[0]).name;
}

export interface MemoriaListItem {
  id:           string;
  name:         string;
  lore:         string;
  glyph:        string;
  accent:       string;
  owned:        boolean;
  granted_at:   string | null;   // ISO
  display_order: number;
}

interface ResolverHit {
  grantedAt:     Date;
  sourceEventId?: string;
}
type Resolver = (rootId: string) => Promise<ResolverHit | null>;

@Injectable()
export class MemoriaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  /** Public read — runs backfill then returns the full def list with
   *  per-row ownership state, ordered for the iOS collection grid. */
  async listForPlayer(rootId: string): Promise<MemoriaListItem[]> {
    await this.backfillForPlayer(rootId);

    const defs = await this.prisma.memoria.findMany({
      orderBy: { displayOrder: 'asc' },
    });
    const owned = await this.prisma.playerMemoria.findMany({
      where: { rootId },
    });
    const ownedMap = new Map(owned.map((g) => [g.memoriaId, g]));

    return defs.map((d) => {
      const g = ownedMap.get(d.id);
      return {
        id:            d.id,
        name:          d.name,
        lore:          d.lore,
        glyph:         d.glyph,
        accent:        d.accent,
        owned:         Boolean(g),
        granted_at:    g ? g.grantedAt.toISOString() : null,
        display_order: d.displayOrder,
      };
    });
  }

  /** Idempotently grant any Memoria whose trigger has fired for this
   *  player but hasn't yet been recorded. Safe to call on every fetch. */
  async backfillForPlayer(rootId: string): Promise<void> {
    const defs = await this.prisma.memoria.findMany();
    const existing = await this.prisma.playerMemoria.findMany({
      where:  { rootId },
      select: { memoriaId: true },
    });
    const have = new Set(existing.map((g) => g.memoriaId));

    for (const def of defs) {
      if (have.has(def.id)) continue;
      const resolver = this.resolvers[def.triggerKey];
      if (!resolver) continue; // unknown trigger → silently skip; future-proof
      const hit = await resolver(rootId);
      if (!hit) continue;
      await this.grant(rootId, def.id, def.name, hit);
    }
  }

  /** Insert PlayerMemoria + write identity.memoria_granted IdentityEvent.
   *  Race-safe via the (rootId, memoriaId) unique index — duplicate inserts
   *  are caught and treated as already-granted (no Chronicle dupes). */
  private async grant(
    rootId:    string,
    memoriaId: string,
    name:      string,
    hit:       ResolverHit,
  ): Promise<void> {
    try {
      await this.prisma.playerMemoria.create({
        data: {
          rootId,
          memoriaId,
          grantedAt:     hit.grantedAt,
          sourceEventId: hit.sourceEventId ?? null,
        },
      });
    } catch (err) {
      // Unique violation → another request granted concurrently; nothing to do.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return;
      }
      throw err;
    }
    await this.events.log({
      rootId,
      eventType: 'identity.memoria_granted',
      sourceId:  hit.sourceEventId,
      payload:   { memoria_id: memoriaId, name },
    });
  }

  // ── Trigger resolvers ──────────────────────────────────────────
  // Each returns the earliest qualifying moment (timestamp + the
  // IdentityEvent that triggered, when applicable) or null if the
  // player hasn't crossed that threshold yet. Add a new resolver
  // alongside a new memoria_defs INSERT to ship a new Memoria.

  private readonly resolvers: Record<string, Resolver> = {
    first_breath:     this.resolveFirstBreath.bind(this),
    pressed_silver:   this.resolvePressedSilver.bind(this),
    bonded_whisker:   this.resolveBondedWhisker.bind(this),
    first_threshold:  this.resolveFirstThreshold.bind(this),
    hearth_coal:      this.resolveHearthCoal.bind(this),
  };

  private async resolveFirstBreath(rootId: string): Promise<ResolverHit | null> {
    const e = await this.prisma.identityEvent.findFirst({
      where:   { rootId, eventType: 'identity.hero_awakened' },
      orderBy: { createdAt: 'asc' },
    });
    return e ? { grantedAt: e.createdAt, sourceEventId: e.id } : null;
  }

  private async resolvePressedSilver(rootId: string): Promise<ResolverHit | null> {
    const e = await this.prisma.identityEvent.findFirst({
      where:   { rootId, eventType: 'identity.relic_mark_chosen' },
      orderBy: { createdAt: 'asc' },
    });
    return e ? { grantedAt: e.createdAt, sourceEventId: e.id } : null;
  }

  private async resolveBondedWhisker(rootId: string): Promise<ResolverHit | null> {
    const e = await this.prisma.identityEvent.findFirst({
      where:   { rootId, eventType: 'identity.fox_bonded' },
      orderBy: { createdAt: 'asc' },
    });
    return e ? { grantedAt: e.createdAt, sourceEventId: e.id } : null;
  }

  /** First time the player crossed a Rank tier boundary. Scans
   *  progression.level_up events (which the leveling service already
   *  writes) and returns the earliest one whose old→new level changed
   *  tier. Matches the rank-transition logic in IdentityService.getChronicle. */
  private async resolveFirstThreshold(rootId: string): Promise<ResolverHit | null> {
    const events = await this.prisma.identityEvent.findMany({
      where:   { rootId, eventType: 'progression.level_up' },
      orderBy: { createdAt: 'asc' },
    });
    for (const e of events) {
      const p = (e.payload ?? {}) as { old_level?: number; new_level?: number };
      const oldLv = p.old_level ?? 0;
      const newLv = p.new_level ?? 0;
      if (!newLv || newLv <= oldLv) continue;
      if (tierForLevel(oldLv) === tierForLevel(newLv)) continue;
      return { grantedAt: e.createdAt, sourceEventId: e.id };
    }
    return null;
  }

  /** First Hearth claim ever. SanctumState.totalHearthClaims is the
   *  authoritative counter; we use updatedAt for the grant timestamp
   *  since the row is updated on every claim. (Slightly fuzzy on the
   *  exact first-claim moment, but acceptable for a kept-moment record.) */
  private async resolveHearthCoal(rootId: string): Promise<ResolverHit | null> {
    const s = await this.prisma.sanctumState.findUnique({
      where:  { rootId },
      select: { totalHearthClaims: true, updatedAt: true },
    });
    if (!s || s.totalHearthClaims < 1) return null;
    return { grantedAt: s.updatedAt };
  }
}
