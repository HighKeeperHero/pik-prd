// ============================================================
// PIK — Hero Echo Service (canon §13.9 unification, 2026-07-30)
//
// Fragments drop from won tear seals (tier-keyed chance, rarity-
// weighted pick among unregistered heroes — mirrors the Lore
// Archive drop shape). Registration at the Altar is the player's
// deliberate act; a registered Echo IS a Master Echo (Resonance
// additive + Vocation echo signal).
// ============================================================
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  HERO_ECHO_CATALOG, echoById,
  ECHO_FRAGMENTS_REQUIRED, ECHO_RESONANCE, ECHO_DROP_WEIGHT,
} from './echo.catalog';

/** Tier-keyed fragment chance on a WON seal — rarer than lore
 *  (echoes are the long collection). Tunable. */
const ECHO_DROP_CHANCE: Record<string, number> = {
  minor: 0.10, wander: 0.16, dormant: 0.24, double: 0.35,
};

export interface EchoFragmentFound {
  echo_id:   string;
  name:      string;
  epithet:   string;
  rarity:    string;
  fragments: number;
  required:  number;
  /** True when this fragment COMPLETED the set — the Altar can now
   *  register the hero (registration itself stays a deliberate act). */
  complete:  boolean;
}

@Injectable()
export class EchoService {
  constructor(private readonly prisma: PrismaService) {}

  private async rows(rootId: string) {
    return this.prisma.playerEchoFragment.findMany({ where: { rootId } });
  }

  /** Registered-echo Resonance total — the Master Echo half of the
   *  §13.2 additive layer. Consumed by GearService + hero payload. */
  async echoResonance(rootId: string): Promise<number> {
    const rows = await this.prisma.playerEchoFragment.findMany({
      where: { rootId, registeredAt: { not: null } },
      select: { echoId: true },
    });
    return rows.reduce((sum, r) => {
      const def = echoById(r.echoId);
      return def ? sum + ECHO_RESONANCE[def.rarity] : sum;
    }, 0);
  }

  /** Rarity-weighted registered counts per jobLean — the Vocation
   *  echo signal (the heroes you chose to restore). */
  async echoJobShares(rootId: string): Promise<Record<string, number>> {
    const rows = await this.prisma.playerEchoFragment.findMany({
      where: { rootId, registeredAt: { not: null } },
      select: { echoId: true },
    });
    const shares: Record<string, number> = {};
    for (const r of rows) {
      const def = echoById(r.echoId);
      if (!def) continue;
      shares[def.jobLean] = (shares[def.jobLean] ?? 0) + ECHO_RESONANCE[def.rarity];
    }
    return shares;
  }

  /** The Altar registry view: full catalog with per-player progress.
   *  Undiscovered heroes (0 fragments) ship name-hidden — the shelf
   *  shows a silhouette until the first fragment lands. */
  async getState(rootId: string) {
    const rows = await this.rows(rootId);
    const byEcho = new Map(rows.map(r => [r.echoId, r]));
    let registeredCount = 0;
    const echoes = HERO_ECHO_CATALOG.map(def => {
      const row = byEcho.get(def.id);
      const fragments  = row?.fragments ?? 0;
      const registered = !!row?.registeredAt;
      if (registered) registeredCount++;
      const discovered = fragments > 0 || registered;
      return {
        echo_id:   def.id,
        name:      discovered ? def.name : null,
        epithet:   discovered ? def.epithet : null,
        lore:      discovered ? def.lore : null,
        rarity:    def.rarity,
        element:   def.element,
        fragments,
        required:  ECHO_FRAGMENTS_REQUIRED[def.rarity],
        registered,
        resonance: ECHO_RESONANCE[def.rarity],
      };
    });
    return {
      echoes,
      registered_count: registeredCount,
      total:            HERO_ECHO_CATALOG.length,
      echo_resonance:   await this.echoResonance(rootId),
    };
  }

  /** The Altar rite — turn a completed fragment set into a
   *  registered (Master) Echo. */
  async register(rootId: string, echoId: string) {
    const def = echoById(echoId);
    if (!def) throw new NotFoundException(`Unknown echo: ${echoId}`);
    const row = await this.prisma.playerEchoFragment.findUnique({
      where: { rootId_echoId: { rootId, echoId } },
    });
    if (!row) throw new BadRequestException('No fragments of this hero yet.');
    if (row.registeredAt) throw new BadRequestException('Already registered at the Altar.');
    if (row.fragments < ECHO_FRAGMENTS_REQUIRED[def.rarity]) {
      throw new BadRequestException(
        `The set is incomplete: ${row.fragments}/${ECHO_FRAGMENTS_REQUIRED[def.rarity]} fragments.`,
      );
    }
    await this.prisma.playerEchoFragment.update({
      where: { id: row.id }, data: { registeredAt: new Date() },
    });
    await this.prisma.identityEvent.create({
      data: {
        rootId, eventType: 'echo.registered',
        payload: {
          echo_id: echoId, name: def.name, epithet: def.epithet,
          rarity: def.rarity, resonance: ECHO_RESONANCE[def.rarity],
        },
      },
    }).catch(() => { /* non-critical */ });
    return this.getState(rootId);
  }

  /** Fragment drop on a won seal — tier-keyed chance, then a
   *  rarity-weighted pick among heroes NOT yet registered (a full
   *  but unregistered set still receives; the Altar copy nudges).
   *  Returns null on no-hit or when every hero is registered. */
  async maybeDropOnSeal(rootId: string, tearType: string): Promise<EchoFragmentFound | null> {
    const chance = ECHO_DROP_CHANCE[tearType] ?? 0.10;
    if (Math.random() >= chance) return null;

    const rows = await this.rows(rootId);
    const byEcho = new Map(rows.map(r => [r.echoId, r]));
    const pool = HERO_ECHO_CATALOG.filter(def => !byEcho.get(def.id)?.registeredAt);
    if (pool.length === 0) return null;

    const totalWeight = pool.reduce((s, d) => s + ECHO_DROP_WEIGHT[d.rarity], 0);
    let roll = Math.random() * totalWeight;
    let picked = pool[0];
    for (const def of pool) {
      roll -= ECHO_DROP_WEIGHT[def.rarity];
      if (roll <= 0) { picked = def; break; }
    }

    const updated = await this.prisma.playerEchoFragment.upsert({
      where:  { rootId_echoId: { rootId, echoId: picked.id } },
      update: { fragments: { increment: 1 } },
      create: { rootId, echoId: picked.id, fragments: 1 },
    });
    const required = ECHO_FRAGMENTS_REQUIRED[picked.rarity];
    await this.prisma.identityEvent.create({
      data: {
        rootId, eventType: 'echo.fragment_found',
        payload: {
          echo_id: picked.id, name: picked.name, rarity: picked.rarity,
          fragments: updated.fragments, required,
        },
      },
    }).catch(() => { /* non-critical */ });
    return {
      echo_id:   picked.id,
      name:      picked.name,
      epithet:   picked.epithet,
      rarity:    picked.rarity,
      fragments: updated.fragments,
      required,
      complete:  updated.fragments >= required && !updated.registeredAt,
    };
  }
}
