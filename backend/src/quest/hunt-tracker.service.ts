// ============================================================
// HuntTrackerService — Sprint 20.3 + 20.6
//
// In-memory hunt progress tracker.
// Progress advances via recordEvent() called by:
//   GearService.dismantleItem()    → 'component_collected'
//   VeilService.recordEncounter()  → 'veil_tear_sealed'
//   EnemyService.resolveDefeat()   → 'enemy_defeated'  (future)
//
// On completion: grants XP, Nexus, and alignment material
// via PrismaService automatically — no client call needed.
//
// IMPORTANT: VenturesModule must be @Global() so all modules
// share the same singleton instance of this service.
//
// Place at: src/quest/hunt-tracker.service.ts
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { HuntDef } from './ventures.controller';

// ── Alignment material type map ───────────────────────────────────────────────
const ALIGNMENT_MATERIAL: Record<string, string> = {
  ORDER: 'iron_mandate',
  CHAOS: 'fracture_shard',
  LIGHT: 'radiant_core',
  DARK:  'shadow_residue',
};

// ── In-memory state ───────────────────────────────────────────────────────────
interface ActiveHunt {
  type:                  string;
  max_progress:          number;
  progress:              number;
  status:                'active' | 'completed';
  xp_reward:             number;
  nexus_reward:          number;
  alignment_material_qty: number;
  alignment:             string;
}

const EVENT_MAP: Record<string, string> = {
  veil_tear_sealed:    'veil_tear',
  component_collected: 'component',
  enemy_defeated:      'enemy',
};

@Injectable()
export class HuntTrackerService {
  private readonly logger = new Logger(HuntTrackerService.name);
  private readonly ACTIVE_HUNTS = new Map<string, Map<string, ActiveHunt>>();

  constructor(private readonly prisma: PrismaService) {}

  acceptHunt(rootId: string, huntId: string, def: HuntDef) {
    if (!this.ACTIVE_HUNTS.has(rootId)) {
      this.ACTIVE_HUNTS.set(rootId, new Map());
    }
    this.ACTIVE_HUNTS.get(rootId)!.set(huntId, {
      type:                   def.type,
      max_progress:           def.max_progress,
      progress:               0,
      status:                 'active',
      xp_reward:              def.xp_reward,
      nexus_reward:           def.nexus_reward,
      alignment_material_qty: def.alignment_material_qty,
      alignment:              def.alignment,
    });
    this.logger.log(`Hunt accepted: ${rootId} → ${huntId} (${def.type} x${def.max_progress})`);
  }

  abandonHunt(rootId: string, huntId: string) {
    this.ACTIVE_HUNTS.get(rootId)?.delete(huntId);
    this.logger.log(`Hunt abandoned: ${rootId} → ${huntId}`);
  }

  getActiveHunts(rootId: string): Record<string, any> {
    const hunts = this.ACTIVE_HUNTS.get(rootId);
    if (!hunts) return {};
    const result: Record<string, any> = {};
    for (const [huntId, hunt] of hunts.entries()) {
      result[huntId] = {
        type:         hunt.type,
        max_progress: hunt.max_progress,
        progress:     hunt.progress,
        status:       hunt.status,
      };
    }
    return result;
  }

  async recordEvent(
    rootId: string,
    eventType: 'veil_tear_sealed' | 'component_collected' | 'enemy_defeated',
    metadata?: Record<string, unknown>,
  ) {
    const hunts = this.ACTIVE_HUNTS.get(rootId);
    if (!hunts || hunts.size === 0) return;

    const huntType = EVENT_MAP[eventType];
    if (!huntType) return;

    for (const [huntId, hunt] of hunts.entries()) {
      if (hunt.type !== huntType) continue;
      if (hunt.status !== 'active') continue;

      hunt.progress = Math.min(hunt.progress + 1, hunt.max_progress);
      this.logger.log(`Hunt progress: ${rootId} → ${huntId} (${hunt.progress}/${hunt.max_progress})`);

      if (hunt.progress >= hunt.max_progress) {
        hunt.status = 'completed';
        this.logger.log(`Hunt completed: ${rootId} → ${huntId}`);
        await this.grantHuntRewards(rootId, huntId, hunt);
        hunts.delete(huntId);
      }
    }
  }

  private async grantHuntRewards(rootId: string, huntId: string, hunt: ActiveHunt) {
    const materialType = ALIGNMENT_MATERIAL[hunt.alignment];

    try {
      await this.prisma.$transaction([
        this.prisma.rootIdentity.update({
          where: { id: rootId },
          data:  { heroXp: { increment: hunt.xp_reward } },
        }),
        this.prisma.playerNexus.upsert({
          where:  { rootId },
          create: { rootId, balance: hunt.nexus_reward },
          update: { balance: { increment: hunt.nexus_reward } },
        }),
        ...(materialType ? [
          this.prisma.playerComponents.upsert({
            where:  { rootId_componentType: { rootId, componentType: materialType } },
            create: { rootId, componentType: materialType, quantity: hunt.alignment_material_qty },
            update: { quantity: { increment: hunt.alignment_material_qty } },
          }),
        ] : []),
      ]);

      this.logger.log(
        `Hunt rewards: ${rootId} +${hunt.xp_reward} XP, +${hunt.nexus_reward} Nexus, ` +
        `+${hunt.alignment_material_qty} ${materialType ?? 'none'} (${huntId})`
      );
    } catch (err) {
      this.logger.error(`Hunt reward grant failed ${rootId}/${huntId}: ${err}`);
    }
  }

  async getMaterials(rootId: string) {
    const rows = await this.prisma.playerComponents.findMany({
      where: {
        rootId,
        componentType: { in: Object.values(ALIGNMENT_MATERIAL) },
      },
    });

    const balances: Record<string, number> = {
      iron_mandate:   0,
      fracture_shard: 0,
      radiant_core:   0,
      shadow_residue: 0,
    };
    for (const row of rows) {
      if (row.componentType in balances) balances[row.componentType] = row.quantity;
    }

    return {
      status: 'ok',
      data: {
        materials: balances,
        labelled: {
          iron_mandate:   { label: 'Iron Mandate',   qty: balances.iron_mandate,   alignment: 'ORDER' },
          fracture_shard: { label: 'Fracture Shard', qty: balances.fracture_shard, alignment: 'CHAOS' },
          radiant_core:   { label: 'Radiant Core',   qty: balances.radiant_core,   alignment: 'LIGHT' },
          shadow_residue: { label: 'Shadow Residue', qty: balances.shadow_residue, alignment: 'DARK'  },
        },
      },
    };
  }
}
