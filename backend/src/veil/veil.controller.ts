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
}
