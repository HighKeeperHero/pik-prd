// backend/src/veil/veil.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface RecordEncounterDto {
  tearType: string;   // minor | wander | dormant | double
  tearName: string;
  outcome: 'won' | 'fled';
  shards: number;
  lat?: number;
  lon?: number;
}

const TIER_ORDER = ['minor', 'wander', 'dormant', 'double'];

@Injectable()
export class VeilService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Record a single battle outcome ──────────────────────────────────────────
  async recordEncounter(rootId: string, dto: RecordEncounterDto) {
    const { tearType, tearName, outcome, shards, lat, lon } = dto;

    // Verify hero exists
    const hero = await this.prisma.rootIdentity.findUnique({ where: { id: rootId } });
    if (!hero) throw new NotFoundException('Hero not found');

    // Write encounter row
    const encounter = await this.prisma.tearEncounter.create({
      data: { rootId, tearType, tearName, outcome, shards, lat, lon },
    });

    // Increment shard balance if victory
    if (outcome === 'won' && shards > 0) {
      await this.prisma.veilShard.upsert({
        where:  { rootId },
        create: { rootId, balance: shards },
        update: { balance: { increment: shards } },
      });
    }

    return { encounter_id: encounter.id, outcome, shards };
  }

  // ── Paginated battle history ─────────────────────────────────────────────────
  async getEncounters(rootId: string, limit = 20) {
    const rows = await this.prisma.tearEncounter.findMany({
      where:   { rootId },
      orderBy: { createdAt: 'desc' },
      take:    Math.min(limit, 100),
    });

    return rows.map(r => ({
      encounter_id: r.id,
      tear_type:    r.tearType,
      tear_name:    r.tearName,
      outcome:      r.outcome,
      shards:       r.shards,
      lat:          r.lat,
      lon:          r.lon,
      ts:           r.createdAt.getTime(),
    }));
  }

  // ── Aggregate stats ──────────────────────────────────────────────────────────
  async getStats(rootId: string) {
    const [encounters, shardRow] = await Promise.all([
      this.prisma.tearEncounter.findMany({
        where:  { rootId },
        select: { tearType: true, outcome: true, shards: true },
      }),
      this.prisma.veilShard.findUnique({ where: { rootId } }),
    ]);

    const wins        = encounters.filter(e => e.outcome === 'won').length;
    const losses      = encounters.filter(e => e.outcome === 'fled').length;
    const total       = encounters.length;
    const totalShards = encounters.filter(e => e.outcome === 'won')
                                   .reduce((s, e) => s + e.shards, 0);

    const byTier: Record<string, { battles: number; wins: number }> = {};
    for (const e of encounters) {
      if (!byTier[e.tearType]) byTier[e.tearType] = { battles: 0, wins: 0 };
      byTier[e.tearType].battles++;
      if (e.outcome === 'won') byTier[e.tearType].wins++;
    }

    // Ensure all four tiers appear in a stable order
    const byTierOrdered = TIER_ORDER.map(k => ({
      tear_type: k,
      battles:   byTier[k]?.battles ?? 0,
      wins:      byTier[k]?.wins    ?? 0,
    })).filter(t => t.battles > 0);

    return {
      total,
      wins,
      losses,
      win_rate:       total > 0 ? Math.round((wins / total) * 100) : 0,
      total_shards:   totalShards,
      shard_balance:  shardRow?.balance ?? 0,
      by_tier:        byTierOrdered,
    };
  }

  // ── Shard balance only ───────────────────────────────────────────────────────
  async getShardBalance(rootId: string) {
    const row = await this.prisma.veilShard.findUnique({ where: { rootId } });
    return { root_id: rootId, balance: row?.balance ?? 0 };
  }
}
