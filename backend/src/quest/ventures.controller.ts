// ventures.controller.ts
// Sprint 20.3 — Stub endpoints for Ventures / Daily Quests
// Real quest generation (Anthropic API + cron) deferred to later sprint.

import {
  Controller, Get, Post, Param, Body, HttpCode, HttpStatus,
} from '@nestjs/common';

// ── Stub quest pool — will be replaced by Anthropic-generated quests ──────────
// Quests are standalone daily challenges — independent of pillar rites.
// They should feel additive, not duplicative of the rite XP flow.
const QUEST_POOL = [
  {
    quest_id: 'q_social_001',
    title: 'First Contact',
    objective: 'Challenge another Hero to a sparring match',
    category: 'Social',
    max_progress: 1,
    xp_reward: 100,
    lore: 'Strength untested is strength unknown.',
    reward_label: '+100 XP · Challenger Mark',
  },
  {
    quest_id: 'q_social_002',
    title: 'War Council',
    objective: 'Share your Fate Card with another player',
    category: 'Social',
    max_progress: 1,
    xp_reward: 80,
    lore: 'Alliances begin with a single introduction.',
    reward_label: '+80 XP · Envoy Seal',
  },
  {
    quest_id: 'q_explore_001',
    title: 'New Ground',
    objective: 'Visit a zone you haven\'t checked into this week',
    category: 'Exploration',
    max_progress: 1,
    xp_reward: 120,
    lore: 'The map only grows where boots have walked.',
    reward_label: '+120 XP · Pathfinder Token',
  },
  {
    quest_id: 'q_explore_002',
    title: 'Waypoint',
    objective: 'Check in at Heroes Veritas today',
    category: 'Exploration',
    max_progress: 1,
    xp_reward: 90,
    lore: 'Return to base. Resupply. Reload.',
    reward_label: '+90 XP · Venue Seal',
  },
  {
    quest_id: 'q_meta_001',
    title: 'The Long Game',
    objective: 'Log in 3 days in a row',
    category: 'Discipline',
    max_progress: 3,
    xp_reward: 150,
    lore: 'Presence is the first form of power.',
    reward_label: '+150 XP · Streak Shard',
  },
  {
    quest_id: 'q_meta_002',
    title: 'Armoury Check',
    objective: 'Equip a new piece of gear from your Vault',
    category: 'Gear',
    max_progress: 1,
    xp_reward: 80,
    lore: 'A hero is only as ready as their kit.',
    reward_label: '+80 XP · Armourer\'s Mark',
  },
  {
    quest_id: 'q_meta_003',
    title: 'Rank Ambition',
    objective: 'Check your position on the Fate Board',
    category: 'Discipline',
    max_progress: 1,
    xp_reward: 60,
    lore: 'Know where you stand before you move.',
    reward_label: '+60 XP · Scout\'s Eye',
  },
  {
    quest_id: 'q_meta_004',
    title: 'Identity Forged',
    objective: 'Set or update your active Title',
    category: 'Identity',
    max_progress: 1,
    xp_reward: 70,
    lore: 'A name carries weight only when it\'s claimed.',
    reward_label: '+70 XP · Title Shard',
  },
];

// ── Intel card pool — static lore/tips per zone/boss ─────────────────────────
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
    body: 'Boss encounters scale with Fate Level. Higher tiers face elite variants. Alignment affects damage bonus — ORDER and LIGHT gain a 10% bonus against CHAOS bosses.',
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

// ── Scouting mission pool ─────────────────────────────────────────────────────
const SCOUTING_MISSIONS = [
  {
    mission_id: 'scout_001',
    title: 'Sector Survey',
    objective: 'Travel 1km in any direction from your last check-in location',
    distance_m: 1000,
    xp_reward: 80,
    expires_hours: 24,
    reward_label: '+80 XP · Scout Mark',
  },
  {
    mission_id: 'scout_002',
    title: 'Long Range Patrol',
    objective: 'Travel 5km — the Veil extends further than the walls',
    distance_m: 5000,
    xp_reward: 200,
    expires_hours: 72,
    reward_label: '+200 XP · Patrol Token',
  },
  {
    mission_id: 'scout_003',
    title: 'Return to Base',
    objective: 'Visit Heroes Veritas this week',
    distance_m: 0,
    xp_reward: 150,
    expires_hours: 168,
    reward_label: '+150 XP · Venue Seal',
  },
];

// ── Alignment-specific hunt pool — rare, faction-flavoured challenges ─────────
// Hunts should feel distinct from daily life — things a hero earns, not grinds.
// No rite-completion objectives. No streak-gating. Lore-heavy, world-embedded.
const HUNT_POOL: Record<string, any[]> = {
  ORDER: [
    {
      hunt_id: 'hunt_ord_001',
      title: 'The Tribunal',
      objective: 'Reach the top 10 on the Fate Board leaderboard',
      difficulty: 'Epic',
      xp_reward: 600,
      lore: 'Order does not ascend by accident. It earns every rank.',
      icon: '⚖',
    },
    {
      hunt_id: 'hunt_ord_002',
      title: 'Warden\'s Edict',
      objective: 'Challenge and defeat 3 different Heroes in sparring this week',
      difficulty: 'Hard',
      xp_reward: 400,
      lore: 'The Warden does not wait to be tested. It tests others.',
      icon: '⚖',
    },
    {
      hunt_id: 'hunt_ord_003',
      title: 'Iron Covenant',
      objective: 'Equip a full matching gear set (3+ pieces of same rarity)',
      difficulty: 'Medium',
      xp_reward: 280,
      lore: 'Uniformity is not conformity. It is readiness.',
      icon: '⚖',
    },
  ],
  CHAOS: [
    {
      hunt_id: 'hunt_cha_001',
      title: 'The Wildcard',
      objective: 'Complete 5 different quest types across a single week',
      difficulty: 'Hard',
      xp_reward: 420,
      lore: 'Chaos is not random. It is relentless variety.',
      icon: '🜲',
    },
    {
      hunt_id: 'hunt_cha_002',
      title: 'No Fixed Path',
      objective: 'Check in at 3 different zones in one week',
      difficulty: 'Medium',
      xp_reward: 260,
      lore: 'The Unbound go where they choose. Everywhere is the path.',
      icon: '🜲',
    },
    {
      hunt_id: 'hunt_cha_003',
      title: 'Disruption Protocol',
      objective: 'Reach Fate Level 15 while aligned to Chaos',
      difficulty: 'Epic',
      xp_reward: 700,
      lore: 'Ascend on your own terms. Chaos rewards the bold.',
      icon: '🜲',
    },
  ],
  LIGHT: [
    {
      hunt_id: 'hunt_lit_001',
      title: 'The Beacon',
      objective: 'Share your Fate Card 5 times in one week',
      difficulty: 'Medium',
      xp_reward: 240,
      lore: 'Light is nothing if it does not reach others.',
      icon: '☀',
    },
    {
      hunt_id: 'hunt_lit_002',
      title: 'Sustained Radiance',
      objective: 'Accumulate 30 consecutive days on the platform',
      difficulty: 'Epic',
      xp_reward: 800,
      lore: 'Light does not flicker. It endures.',
      icon: '☀',
    },
    {
      hunt_id: 'hunt_lit_003',
      title: 'Full Illumination',
      objective: 'Unlock at least one title from each title category',
      difficulty: 'Hard',
      xp_reward: 480,
      lore: 'To know all paths is to light them all.',
      icon: '☀',
    },
  ],
  DARK: [
    {
      hunt_id: 'hunt_drk_001',
      title: 'The Unseen Hand',
      objective: 'Achieve top 5 on the leaderboard without holding the top spot',
      difficulty: 'Epic',
      xp_reward: 650,
      lore: 'Power held in shadow is twice as dangerous.',
      icon: '☽',
    },
    {
      hunt_id: 'hunt_drk_002',
      title: 'Cartographer of Ruin',
      objective: 'Unlock Recon intel cards for all 3 zones',
      difficulty: 'Hard',
      xp_reward: 380,
      lore: 'Know the terrain before others know you exist.',
      icon: '☽',
    },
    {
      hunt_id: 'hunt_drk_003',
      title: 'Buried Depth',
      objective: 'Collect 5 Legendary or higher rarity items',
      difficulty: 'Epic',
      xp_reward: 720,
      lore: 'Darkness accumulates. Quietly. Inevitably.',
      icon: '☽',
    },
  ],
};

@Controller('api/ventures')
export class VenturesController {

  // ── GET /api/ventures/quests/:root_id/daily ──────────────────────────────
  // Returns 3 daily quests for the hero. Stub: picks from pool deterministically
  // by day-of-year so all heroes get the same quests each day.
  @Get('quests/:root_id/daily')
  getDailyQuests(@Param('root_id') rootId: string) {
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000,
    );
    // Pick 3 quests deterministically per day
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
    // Stub: frontend manages progress locally until persistence is built
    return { status: 'ok', data: { quest_id: questId, increment: body.increment ?? 1 } };
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
      data: {
        scouting_missions: SCOUTING_MISSIONS,
        intel_cards: INTEL_CARDS,
      },
    };
  }

  // ── GET /api/ventures/hunts/:root_id ────────────────────────────────────
  @Get('hunts/:root_id')
  getHunts(@Param('root_id') rootId: string) {
    // Alignment resolved from root_identities — stub returns all pools for now.
    // Real implementation queries DB and filters by hero alignment.
    return { status: 'ok', data: HUNT_POOL };
  }
}
