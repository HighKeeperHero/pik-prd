// ventures.controller.ts
// Sprint 20.3 — Stub endpoints for Ventures / Daily Quests
// Real quest generation (Anthropic API + cron) deferred to later sprint.

import {
  Controller, Get, Post, Param, Body, HttpCode, HttpStatus,
} from '@nestjs/common';

// ── Stub quest pool — will be replaced by Anthropic-generated quests ──────────
const QUEST_POOL = [
  {
    quest_id: 'q_forge_001',
    title: 'Forge Disciple',
    objective: 'Complete Forge pillar rites',
    pillar: 'forge',
    max_progress: 3,
    xp_reward: 120,
    lore: 'The Forge demands proof. Show it your resolve.',
    reward_label: '+120 XP · Forge Seal',
  },
  {
    quest_id: 'q_lore_001',
    title: 'Keeper of Lore',
    objective: 'Complete Lore pillar rites',
    pillar: 'lore',
    max_progress: 3,
    xp_reward: 120,
    lore: 'Knowledge is armour. Seek it.',
    reward_label: '+120 XP · Lore Seal',
  },
  {
    quest_id: 'q_veil_001',
    title: 'Veil Walker',
    objective: 'Complete Veil pillar rites',
    pillar: 'veil',
    max_progress: 3,
    xp_reward: 120,
    lore: 'The Veil does not yield to hesitation.',
    reward_label: '+120 XP · Veil Seal',
  },
  {
    quest_id: 'q_session_001',
    title: 'Oath Keeper',
    objective: 'Complete your weekly oath',
    pillar: 'forge',
    max_progress: 1,
    xp_reward: 200,
    lore: 'Words mean nothing without the weight of action.',
    reward_label: '+200 XP · Oath Seal',
  },
  {
    quest_id: 'q_streak_001',
    title: 'Unbroken',
    objective: 'Maintain your training streak',
    pillar: 'lore',
    max_progress: 5,
    xp_reward: 250,
    lore: 'Consistency is the mark of the disciplined.',
    reward_label: '+250 XP · Streak Shard',
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

// ── Alignment-specific hunt pool (stub — real gen deferred) ──────────────────
const HUNT_POOL: Record<string, any[]> = {
  ORDER: [
    { hunt_id: 'hunt_ord_001', title: 'Enforcer\'s Trial', objective: 'Complete 5 Forge rites without breaking oath', difficulty: 'Hard', xp_reward: 400, lore: 'Order demands the unflinching. Prove you hold the line.', icon: '⚖' },
    { hunt_id: 'hunt_ord_002', title: 'The Vanguard', objective: 'Achieve top 3 on the Fate Board leaderboard', difficulty: 'Epic', xp_reward: 600, lore: 'ORDER does not follow. It leads.', icon: '⚖' },
  ],
  CHAOS: [
    { hunt_id: 'hunt_cha_001', title: 'The Unbound', objective: 'Complete any 3 rites in a single day', difficulty: 'Medium', xp_reward: 300, lore: 'Chaos has no schedule. Only momentum.', icon: '🜲' },
    { hunt_id: 'hunt_cha_002', title: 'Fracture Point', objective: 'Abandon and restart an oath mid-week', difficulty: 'Hard', xp_reward: 350, lore: 'Some bonds are made to shatter.', icon: '🜲' },
  ],
  LIGHT: [
    { hunt_id: 'hunt_lit_001', title: 'Beacon', objective: 'Maintain a 7-day training streak', difficulty: 'Hard', xp_reward: 500, lore: 'Light is sustained. Never flickering.', icon: '☀' },
    { hunt_id: 'hunt_lit_002', title: 'Illuminator', objective: 'Complete all three pillars in one week', difficulty: 'Epic', xp_reward: 650, lore: 'To illuminate all paths is to master your own.', icon: '☀' },
  ],
  DARK: [
    { hunt_id: 'hunt_drk_001', title: 'From the Shadows', objective: 'Complete 3 Veil rites before dawn (before 6am)', difficulty: 'Hard', xp_reward: 450, lore: 'Darkness favours those who move before the world wakes.', icon: '☽' },
    { hunt_id: 'hunt_drk_002', title: 'The Long Night', objective: 'Complete a Lore rite every day for 5 days', difficulty: 'Epic', xp_reward: 600, lore: 'Endurance is the weapon of the dark.', icon: '☽' },
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
