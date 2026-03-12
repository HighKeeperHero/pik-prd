// ventures.controller.ts — Sprint 20.3 (rev 5)
// Drop at: src/quest/ventures.controller.ts
//
// Hunt progress is SERVER-DRIVEN only.
// Clients call:
//   POST /api/ventures/hunts/:root_id/:hunt_id/accept   → registers hunt server-side
//   POST /api/ventures/hunts/:root_id/:hunt_id/abandon  → removes active hunt
//   GET  /api/ventures/hunts/:root_id/active            → returns live progress (polled on tab focus)
//
// Progress advances via HuntTrackerService.recordEvent() called internally by:
//   GearService.dismantleItem()  → 'component_collected'   ← WIRED (see gear.service.ts patch)
//   VeilTearService.sealRift()   → 'veil_tear_sealed'      ← FUTURE (Veil map sprint)
//   EnemyService.resolveDefeat() → 'enemy_defeated'        ← FUTURE (enemy spawn sprint)
//
// No PVP objectives. No client-initiated progress increments.

import {
  Controller, Get, Post, Param, Body, HttpCode, HttpStatus,
} from '@nestjs/common';
import { HuntTrackerService } from './hunt-tracker.service';

// ── Quest pool ────────────────────────────────────────────────────────────────
const QUEST_POOL = [
  {
    quest_id: 'q_explore_001',
    title: 'New Ground',
    objective: 'Visit a zone you haven\'t checked into this week',
    category: 'Exploration',
    completion_hint: 'Zone check-in logged.',
    max_progress: 1,
    xp_reward: 120,
    nexus_reward: 15,
    loot_cache: 'Common Cache',
    lore: 'The map only grows where boots have walked.',
  },
  {
    quest_id: 'q_explore_002',
    title: 'Waypoint',
    objective: 'Check in at Heroes Veritas today',
    category: 'Exploration',
    completion_hint: 'Venue check-in confirmed.',
    max_progress: 1,
    xp_reward: 90,
    nexus_reward: 10,
    loot_cache: 'Common Cache',
    lore: 'Return to base. Resupply. Reload.',
  },
  {
    quest_id: 'q_discipline_001',
    title: 'The Long Game',
    objective: 'Log in 3 days in a row',
    category: 'Discipline',
    completion_hint: '3-day login streak reached.',
    max_progress: 3,
    xp_reward: 150,
    nexus_reward: 20,
    loot_cache: 'Uncommon Cache',
    lore: 'Presence is the first form of power.',
  },
  {
    quest_id: 'q_gear_001',
    title: 'Armoury Check',
    objective: 'Equip a new piece of gear from your Vault',
    category: 'Gear',
    completion_hint: 'New gear equipped.',
    max_progress: 1,
    xp_reward: 80,
    nexus_reward: 10,
    loot_cache: 'Common Cache',
    lore: 'A hero is only as ready as their kit.',
  },
  {
    quest_id: 'q_discipline_002',
    title: 'Rank Ambition',
    objective: 'Check your position on the Fate Board leaderboard',
    category: 'Discipline',
    completion_hint: 'Leaderboard viewed.',
    max_progress: 1,
    xp_reward: 60,
    nexus_reward: 8,
    loot_cache: 'Common Cache',
    lore: 'Know where you stand before you move.',
  },
  {
    quest_id: 'q_identity_001',
    title: 'Identity Forged',
    objective: 'Set or update your active Title',
    category: 'Identity',
    completion_hint: 'Title updated.',
    max_progress: 1,
    xp_reward: 70,
    nexus_reward: 10,
    loot_cache: 'Common Cache',
    lore: 'A name carries weight only when it\'s claimed.',
  },
  {
    quest_id: 'q_explore_003',
    title: 'Horizon Scout',
    objective: 'Complete a Recon scouting mission',
    category: 'Exploration',
    completion_hint: 'Scouting mission completed.',
    max_progress: 1,
    xp_reward: 110,
    nexus_reward: 15,
    loot_cache: 'Uncommon Cache',
    lore: 'Intelligence is the weapon that never dulls.',
  },
  {
    quest_id: 'q_discipline_003',
    title: 'Full Circuit',
    objective: 'Log in for 5 separate days this week',
    category: 'Discipline',
    completion_hint: '5 login days this week confirmed.',
    max_progress: 5,
    xp_reward: 220,
    nexus_reward: 30,
    loot_cache: 'Rare Cache',
    lore: 'Discipline is the edge that compounds over time.',
  },
];

// ── Scouting mission pool ─────────────────────────────────────────────────────
const SCOUTING_MISSIONS = [
  {
    mission_id: 'scout_001',
    title: 'Sector Survey',
    objective: 'Travel 1km from your last check-in location',
    distance_m: 1000,
    xp_reward: 80,
    nexus_reward: 12,
    loot_cache: 'Common Cache',
    expires_hours: 24,
  },
  {
    mission_id: 'scout_002',
    title: 'Long Range Patrol',
    objective: 'Travel 5km — the Veil extends further than the walls',
    distance_m: 5000,
    xp_reward: 200,
    nexus_reward: 28,
    loot_cache: 'Uncommon Cache',
    expires_hours: 72,
  },
  {
    mission_id: 'scout_003',
    title: 'Return to Base',
    objective: 'Visit Heroes Veritas this week',
    distance_m: 0,
    xp_reward: 150,
    nexus_reward: 20,
    loot_cache: 'Uncommon Cache',
    expires_hours: 168,
  },
];

// ── Intel card pool ───────────────────────────────────────────────────────────
const INTEL_CARDS = [
  {
    intel_id: 'intel_forge_zone',
    zone: 'The Forge',
    type: 'zone',
    headline: 'Zone Intel: The Forge',
    body: 'The Forge rewards repeated heavy effort. Consecutive pillar completions unlock Sealed Caches. Prioritise oath consistency for bonus multipliers.',
    icon: '🔥',
  },
  {
    intel_id: 'intel_lore_zone',
    zone: 'The Library',
    type: 'zone',
    headline: 'Zone Intel: The Library',
    body: 'Lore pillar mastery unlocks narrative titles unavailable elsewhere. Reading rites grant hidden XP if completed before midnight.',
    icon: '📖',
  },
  {
    intel_id: 'intel_veil_zone',
    zone: 'The Veil',
    type: 'zone',
    headline: 'Zone Intel: The Veil',
    body: 'Boss encounters scale with Fate Level. Higher tiers face elite variants. Alignment affects damage — ORDER and LIGHT gain a bonus against CHAOS bosses.',
    icon: '⚡',
  },
  {
    intel_id: 'intel_boss_wraith',
    zone: 'The Veil',
    type: 'boss',
    headline: 'Boss: The Wraith',
    body: 'High mobility, low HP. Strikes fast but breaks on sustained pressure. Exploit its movement cycle — attack in the window after its lunge.',
    icon: '👁',
  },
  {
    intel_id: 'intel_boss_titan',
    zone: 'The Forge',
    type: 'boss',
    headline: 'Boss: The Forge Titan',
    body: 'Armoured and slow. Weak point is the exposed core after a charged slam. Wait for the slam, then burst. Avoid trading blows — his armour negates most damage.',
    icon: '⚙️',
  },
];

// ── Hunt pool ─────────────────────────────────────────────────────────────────
export const HUNT_POOL: Record<string, any[]> = {
  ORDER: [
    {
      hunt_id: 'hunt_ord_vt_001',
      type: 'veil_tear',
      title: 'Rift Suppression',
      objective: 'Seal 3 active Veil Tears before they escalate',
      difficulty: 'Hard',
      max_progress: 3,
      xp_reward: 450,
      nexus_reward: 60,
      alignment_material_qty: 3,
      lore: 'Order does not wait for a rift to widen. It closes them before chaos spills through.',
      icon: '⚡',
    },
    {
      hunt_id: 'hunt_ord_comp_001',
      type: 'component',
      title: 'Vault Manifest',
      objective: 'Collect 5 components from sealed Veil Tears',
      difficulty: 'Medium',
      max_progress: 5,
      xp_reward: 280,
      nexus_reward: 38,
      alignment_material_qty: 2,
      lore: 'Every sealed rift leaves residue. Order catalogues it. Stores it. Uses it.',
      icon: '⬡',
    },
    {
      hunt_id: 'hunt_ord_en_001',
      type: 'enemy',
      title: 'Containment Protocol',
      objective: 'Defeat 5 enemies that have escaped an open rift',
      difficulty: 'Epic',
      max_progress: 5,
      xp_reward: 600,
      nexus_reward: 80,
      alignment_material_qty: 5,
      lore: 'What escapes the Veil is Order\'s responsibility to reclaim.',
      icon: '☠',
    },
  ],
  CHAOS: [
    {
      hunt_id: 'hunt_cha_vt_001',
      type: 'veil_tear',
      title: 'Into the Breach',
      objective: 'Enter and survive 2 active Veil Tears',
      difficulty: 'Hard',
      max_progress: 2,
      xp_reward: 400,
      nexus_reward: 52,
      alignment_material_qty: 3,
      lore: 'Most flee the rift. Chaos walks in.',
      icon: '⚡',
    },
    {
      hunt_id: 'hunt_cha_comp_001',
      type: 'component',
      title: 'Scavenger\'s Right',
      objective: 'Collect 8 components — any source, any method',
      difficulty: 'Medium',
      max_progress: 8,
      xp_reward: 320,
      nexus_reward: 42,
      alignment_material_qty: 2,
      lore: 'Structure is for those who can\'t improvise. Chaos takes what it finds.',
      icon: '⬡',
    },
    {
      hunt_id: 'hunt_cha_en_001',
      type: 'enemy',
      title: 'Feed the Storm',
      objective: 'Defeat 3 enemies within 60 seconds of a rift opening',
      difficulty: 'Epic',
      max_progress: 3,
      xp_reward: 580,
      nexus_reward: 75,
      alignment_material_qty: 5,
      lore: 'Strike while the rift still screams. That is the Chaos way.',
      icon: '☠',
    },
  ],
  LIGHT: [
    {
      hunt_id: 'hunt_lit_vt_001',
      type: 'veil_tear',
      title: 'The Closing Light',
      objective: 'Seal 5 Veil Tears — the Veil must not spread',
      difficulty: 'Epic',
      max_progress: 5,
      xp_reward: 650,
      nexus_reward: 85,
      alignment_material_qty: 5,
      lore: 'Every rift left open is a wound in the world. Light heals. Light closes.',
      icon: '⚡',
    },
    {
      hunt_id: 'hunt_lit_comp_001',
      type: 'component',
      title: 'Consecrated Yield',
      objective: 'Collect 4 rare or higher rarity components',
      difficulty: 'Hard',
      max_progress: 4,
      xp_reward: 420,
      nexus_reward: 55,
      alignment_material_qty: 3,
      lore: 'Light refines. What others leave scattered, we elevate.',
      icon: '⬡',
    },
    {
      hunt_id: 'hunt_lit_en_001',
      type: 'enemy',
      title: 'Expulsion',
      objective: 'Defeat 6 enemies that escaped through open rifts this week',
      difficulty: 'Hard',
      max_progress: 6,
      xp_reward: 500,
      nexus_reward: 65,
      alignment_material_qty: 4,
      lore: 'What the Veil releases must be returned to darkness. We are the boundary.',
      icon: '☠',
    },
  ],
  DARK: [
    {
      hunt_id: 'hunt_drk_vt_001',
      type: 'veil_tear',
      title: 'Rift Warden',
      objective: 'Hold an open Veil Tear for 2 minutes before sealing it',
      difficulty: 'Epic',
      max_progress: 1,
      xp_reward: 700,
      nexus_reward: 90,
      alignment_material_qty: 6,
      lore: 'The rift is not the threat. The Dark knows how to use it.',
      icon: '⚡',
    },
    {
      hunt_id: 'hunt_drk_comp_001',
      type: 'component',
      title: 'Extraction',
      objective: 'Collect 6 components from unseen or unopened rifts',
      difficulty: 'Hard',
      max_progress: 6,
      xp_reward: 480,
      nexus_reward: 62,
      alignment_material_qty: 4,
      lore: 'Darkness moves before the light knows a rift exists.',
      icon: '⬡',
    },
    {
      hunt_id: 'hunt_drk_en_001',
      type: 'enemy',
      title: 'The Culling',
      objective: 'Defeat the first enemy through each of 3 different rifts',
      difficulty: 'Epic',
      max_progress: 3,
      xp_reward: 620,
      nexus_reward: 80,
      alignment_material_qty: 5,
      lore: 'The first through the rift is the strongest. Darkness claims that kill.',
      icon: '☠',
    },
  ],
};

function findHunt(huntId: string): { type: string; max_progress: number } | null {
  for (const pool of Object.values(HUNT_POOL)) {
    const h = (pool as any[]).find(h => h.hunt_id === huntId);
    if (h) return { type: h.type, max_progress: h.max_progress };
  }
  return null;
}

@Controller('api/ventures')
export class VenturesController {
  constructor(private readonly huntTracker: HuntTrackerService) {}

  // ── GET /api/ventures/quests/:root_id/daily ──────────────────────────────
  @Get('quests/:root_id/daily')
  getDailyQuests(@Param('root_id') rootId: string) {
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000,
    );
    const selected = [0, 1, 2].map(i => {
      const idx = (dayOfYear + i) % QUEST_POOL.length;
      return { ...QUEST_POOL[idx], progress: 0, status: 'active' };
    });
    return { status: 'ok', data: selected };
  }

  // ── POST /api/ventures/quests/:root_id/:quest_id/progress ───────────────
  @Post('quests/:root_id/:quest_id/progress')
  @HttpCode(HttpStatus.OK)
  progressQuest(
    @Param('root_id') rootId: string,
    @Param('quest_id') questId: string,
    @Body() body: { increment?: number },
  ) {
    return { status: 'ok', data: { quest_id: questId, increment: body.increment ?? 1 } };
  }

  // ── POST /api/ventures/quests/:root_id/:quest_id/complete ───────────────
  @Post('quests/:root_id/:quest_id/complete')
  @HttpCode(HttpStatus.OK)
  completeQuest(
    @Param('root_id') rootId: string,
    @Param('quest_id') questId: string,
  ) {
    return { status: 'ok', data: { quest_id: questId, completed: true } };
  }

  // ── POST /api/ventures/quests/:root_id/:quest_id/abandon ────────────────
  @Post('quests/:root_id/:quest_id/abandon')
  @HttpCode(HttpStatus.OK)
  abandonQuest(
    @Param('root_id') rootId: string,
    @Param('quest_id') questId: string,
  ) {
    return { status: 'ok', data: { quest_id: questId, abandoned: true } };
  }

  // ── GET /api/ventures/recon/:root_id ────────────────────────────────────
  @Get('recon/:root_id')
  getRecon(@Param('root_id') rootId: string) {
    return {
      status: 'ok',
      data: { scouting_missions: SCOUTING_MISSIONS, intel_cards: INTEL_CARDS },
    };
  }

  // ── GET /api/ventures/hunts/:root_id ────────────────────────────────────
  @Get('hunts/:root_id')
  getHunts(@Param('root_id') rootId: string) {
    return { status: 'ok', data: HUNT_POOL };
  }

  // ── GET /api/ventures/hunts/:root_id/active ─────────────────────────────
  // Returns server-authoritative progress for all accepted hunts.
  // Frontend polls this on tab focus to sync display. Shape:
  //   { [hunt_id]: { type, max_progress, progress, status } }
  @Get('hunts/:root_id/active')
  getActiveHunts(@Param('root_id') rootId: string) {
    return { status: 'ok', data: this.huntTracker.getActiveHunts(rootId) };
  }

  // ── POST /api/ventures/hunts/:root_id/:hunt_id/accept ───────────────────
  // Registers the hunt server-side so qualifying events can advance it.
  @Post('hunts/:root_id/:hunt_id/accept')
  @HttpCode(HttpStatus.OK)
  acceptHunt(
    @Param('root_id') rootId: string,
    @Param('hunt_id') huntId: string,
  ) {
    const def = findHunt(huntId);
    if (!def) return { status: 'error', data: { message: 'Unknown hunt ID' } };
    this.huntTracker.acceptHunt(rootId, huntId, def.type, def.max_progress);
    return { status: 'ok', data: { hunt_id: huntId, accepted: true } };
  }

  // ── POST /api/ventures/hunts/:root_id/:hunt_id/abandon ──────────────────
  @Post('hunts/:root_id/:hunt_id/abandon')
  @HttpCode(HttpStatus.OK)
  abandonHunt(
    @Param('root_id') rootId: string,
    @Param('hunt_id') huntId: string,
  ) {
    this.huntTracker.abandonHunt(rootId, huntId);
    return { status: 'ok', data: { hunt_id: huntId, abandoned: true } };
  }
}
