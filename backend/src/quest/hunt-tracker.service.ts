// hunt-tracker.service.ts
// Drop at: src/quest/hunt-tracker.service.ts
//
// Receives qualifying events from other services and advances active hunt progress.
// All hunts progress server-side — no client-initiated progress increments accepted.
//
// Event types map to hunt types:
//   'veil_tear_sealed'    → type: 'veil_tear'
//   'component_collected' → type: 'component'
//   'enemy_defeated'      → type: 'enemy'
//
// Call HuntTrackerService.recordEvent() from:
//   GearService.dismantleItem()       → 'component_collected'   (components drop on dismantle)
//   GearService.equipItem()           → wired via quest tracker, not hunts
//   VeilTearService.sealRift()        → 'veil_tear_sealed'      (future: Veil map interaction)
//   EnemyService.resolveDefeat()      → 'enemy_defeated'        (future: enemy spawn system)

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Hunt type → qualifying event mapping
const HUNT_EVENT_MAP: Record<string, string> = {
  veil_tear: 'veil_tear_sealed',
  component: 'component_collected',
  enemy:     'enemy_defeated',
};

// In-memory active hunt store (replace with DB table in production sprint)
// Shape: { [rootId]: { [huntId]: { type, max_progress, progress, status } } }
const ACTIVE_HUNTS: Record<string, Record<string, {
  type: string;
  max_progress: number;
  progress: number;
  status: 'active' | 'completed';
}>> = {};

@Injectable()
export class HuntTrackerService {
  private readonly logger = new Logger(HuntTrackerService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Called by the controller when a hero accepts a hunt ─────────────────
  acceptHunt(rootId: string, huntId: string, type: string, maxProgress: number): void {
    if (!ACTIVE_HUNTS[rootId]) ACTIVE_HUNTS[rootId] = {};
    // Idempotent — don't reset progress if already accepted
    if (!ACTIVE_HUNTS[rootId][huntId]) {
      ACTIVE_HUNTS[rootId][huntId] = { type, max_progress: maxProgress, progress: 0, status: 'active' };
      this.logger.log(`Hunt accepted: ${huntId} for ${rootId}`);
    }
  }

  // ── Called by the controller when a hero abandons a hunt ────────────────
  abandonHunt(rootId: string, huntId: string): void {
    if (ACTIVE_HUNTS[rootId]?.[huntId]) {
      delete ACTIVE_HUNTS[rootId][huntId];
      this.logger.log(`Hunt abandoned: ${huntId} for ${rootId}`);
    }
  }

  // ── Returns the active hunt state for a hero (for polling/display) ──────
  getActiveHunts(rootId: string): Record<string, { type: string; max_progress: number; progress: number; status: string }> {
    return ACTIVE_HUNTS[rootId] ?? {};
  }

  // ── Core method — called by other services when qualifying events occur ──
  // eventType: 'veil_tear_sealed' | 'component_collected' | 'enemy_defeated'
  // metadata: optional payload (e.g. component rarity, enemy type) for future filtering
  recordEvent(rootId: string, eventType: string, metadata?: Record<string, any>): {
    huntId: string;
    newProgress: number;
    completed: boolean;
  }[] {
    const heroHunts = ACTIVE_HUNTS[rootId];
    if (!heroHunts) return [];

    const advanced: { huntId: string; newProgress: number; completed: boolean }[] = [];

    for (const [huntId, hunt] of Object.entries(heroHunts)) {
      if (hunt.status !== 'active') continue;

      // Check if this event qualifies for this hunt type
      const requiredEvent = HUNT_EVENT_MAP[hunt.type];
      if (requiredEvent !== eventType) continue;

      // Advance progress
      const next = Math.min(hunt.progress + 1, hunt.max_progress);
      hunt.progress = next;
      if (next >= hunt.max_progress) {
        hunt.status = 'completed';
        this.logger.log(`Hunt completed: ${huntId} for ${rootId}`);
        // TODO: award XP + Nexus + alignment material via rewards service
      }

      advanced.push({ huntId, newProgress: next, completed: hunt.status === 'completed' });
    }

    return advanced;
  }
}
