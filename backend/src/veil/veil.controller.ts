// backend/src/veil/veil.controller.ts
import {
  Controller, Post, Get,
  Param, Body, Query,
  ParseIntPipe, DefaultValuePipe,
  BadRequestException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { VeilService } from './veil.service';

interface RecordEncounterBody {
  root_id:   string;
  tear_type: string;
  tear_name: string;
  outcome:   'won' | 'fled';
  shards:    number;
  lat?:      number;
  lon?:      number;
}

@Controller('api/veil')
export class VeilController {
  constructor(private readonly veilService: VeilService) {}

  // POST /api/veil/encounter
  @Post('encounter')
  @SkipThrottle()
  async recordEncounter(@Body() body: RecordEncounterBody) {
    const { root_id, tear_type, tear_name, outcome, shards, lat, lon } = body;
    if (!root_id)   throw new BadRequestException('root_id is required');
    if (!tear_type) throw new BadRequestException('tear_type is required');
    if (!tear_name) throw new BadRequestException('tear_name is required');
    if (!outcome || !['won', 'fled'].includes(outcome))
      throw new BadRequestException("outcome must be 'won' or 'fled'");

    return this.veilService.recordEncounter(root_id, {
      tearType: tear_type,
      tearName: tear_name,
      outcome:  outcome as 'won' | 'fled',
      shards:   shards ?? 0,
      lat,
      lon,
    });
  }

  // GET /api/veil/encounters/:rootId?limit=20
  @Get('encounters/:rootId')
  async getEncounters(
    @Param('rootId') rootId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.veilService.getEncounters(rootId, limit);
  }

  // GET /api/veil/stats/:rootId
  @Get('stats/:rootId')
  async getStats(@Param('rootId') rootId: string) {
    return this.veilService.getStats(rootId);
  }

  // GET /api/veil/quests/:rootId
  @Get('quests/:rootId')
  async getQuests(@Param('rootId') rootId: string) {
    return this.veilService.getVeilQuests(rootId);
  }

  // GET /api/veil/events/active  (no auth — global data)
  @Get('events/active')
  @SkipThrottle()
  async getActiveEvents() {
    return this.veilService.getActiveEvents();
  }

  // GET /api/veil/shards/:rootId
  @Get('shards/:rootId')
  async getShards(@Param('rootId') rootId: string) {
    return this.veilService.getShardBalance(rootId);
  }
  // GET /api/veil/events/progress — global contribution counters for all active events
  @Get('events/progress')
  @SkipThrottle()
  async getGlobalProgress() {
    return this.veilService.getGlobalProgress();
  }

  // GET /api/veil/events/:eventId/leaderboard — hero + warband contribution rankings
  @Get('events/:eventId/leaderboard')
  async getLeaderboard(
    @Param('eventId') eventId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.veilService.getContributionLeaderboard(eventId, limit);
  }

  // POST /api/veil/events — operator: create a new Convergence Event
  @Post('events')
  async createEvent(@Body() body: {
    name:             string;
    description?:     string;
    flavor_text?:     string;
    affected_tiers:   string[];
    shard_multiplier?: number;
    cache_bonus?:     boolean;
    target_count?:    number;
    starts_at:        string;
    ends_at:          string;
  }) {
    return this.veilService.createEvent(body);
  }

  // POST /api/veil/events/bootstrap — create contribution tables if missing
  @Post('events/bootstrap')
  async bootstrapEvents() {
    const prisma = (this.veilService as any).prisma;
    const results: string[] = [];
    for (const sql of [
      `ALTER TABLE convergence_events ADD COLUMN IF NOT EXISTS contribution_count INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE convergence_events ADD COLUMN IF NOT EXISTS target_count INTEGER NOT NULL DEFAULT 10000`,
      `CREATE TABLE IF NOT EXISTS convergence_contributions (id TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(), event_id TEXT NOT NULL REFERENCES convergence_events(event_id) ON DELETE CASCADE, root_id TEXT NOT NULL REFERENCES root_identities(root_id) ON DELETE CASCADE, warband_id TEXT, count INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMP NOT NULL DEFAULT NOW(), UNIQUE (event_id, root_id))`,
      `CREATE INDEX IF NOT EXISTS convergence_contributions_event_idx ON convergence_contributions (event_id)`,
      `CREATE INDEX IF NOT EXISTS convergence_contributions_root_idx ON convergence_contributions (root_id)`,
    ]) {
      try {
        await prisma.$executeRawUnsafe(sql);
        results.push('ok');
      } catch (e: any) {
        const msg = String(e.message ?? e);
        results.push(msg.includes('already exists') || msg.includes('already') ? 'exists' : `ERR: ${msg.slice(0, 120)}`);
      }
    }
    return { bootstrapped: results };
  }

}
