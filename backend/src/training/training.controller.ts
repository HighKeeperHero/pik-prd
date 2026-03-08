// src/training/training.controller.ts
// ============================================================
// Routes: /api/training/*
// All routes take root_id as URL param (no auth guard yet —
// matches existing pattern in the codebase)
// ============================================================

import {
  Controller, Get, Post, Body, Param, Query,
} from '@nestjs/common';
import { TrainingService } from './training.service';
import {
  LogTrainingDto,
  CompleteRiteDto,
  DeclareOathDto,
  ResolveOathDto,
} from './dto/training.dto';

@Controller('api/training')
export class TrainingController {
  constructor(private readonly service: TrainingService) {}

  // ── Daily Rites ────────────────────────────────────────────────────────────

  // GET  /api/training/daily/:rootId
  // Returns today's 3 rites (generates them if first request of the day)
  @Get('daily/:rootId')
  async getDailyRites(@Param('rootId') rootId: string) {
    return this.service.getDailyRites(rootId);
  }

  // POST /api/training/daily/:rootId/complete
  // Marks a rite complete and grants XP
  // Body: { rite_id, notes? }
  @Post('daily/:rootId/complete')
  async completeRite(
    @Param('rootId') rootId: string,
    @Body() dto: CompleteRiteDto,
  ) {
    return this.service.completeRite(rootId, dto);
  }

  // ── Free Training Log ──────────────────────────────────────────────────────

  // POST /api/training/log/:rootId
  // Log any training activity — grants pillar XP only
  // Body: { pillar, activity_type, duration_min?, notes? }
  @Post('log/:rootId')
  async logTraining(
    @Param('rootId') rootId: string,
    @Body() dto: LogTrainingDto,
  ) {
    return this.service.logTraining(rootId, dto);
  }

  // ── Pillar Progress ────────────────────────────────────────────────────────

  // GET /api/training/pillars/:rootId
  @Get('pillars/:rootId')
  async getPillarProgress(@Param('rootId') rootId: string) {
    return this.service.getPillarProgress(rootId);
  }

  // ── Chronicle ──────────────────────────────────────────────────────────────

  // GET /api/training/chronicle/:rootId?limit=20
  @Get('chronicle/:rootId')
  async getChronicle(
    @Param('rootId') rootId: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getChronicle(rootId, limit ? parseInt(limit) : 20);
  }

  // ── Oaths ──────────────────────────────────────────────────────────────────

  // GET  /api/training/oath/:rootId       — get active oath for this week
  @Get('oath/:rootId')
  async getActiveOath(@Param('rootId') rootId: string) {
    return this.service.getActiveOath(rootId);
  }

  // POST /api/training/oath/:rootId       — declare this week's oath
  // Body: { pillar, declaration }
  @Post('oath/:rootId')
  async declareOath(
    @Param('rootId') rootId: string,
    @Body() dto: DeclareOathDto,
  ) {
    return this.service.declareOath(rootId, dto);
  }

  // POST /api/training/oath/:rootId/:oathId/resolve
  // Body: { status: 'kept' | 'broken' }
  @Post('oath/:rootId/:oathId/resolve')
  async resolveOath(
    @Param('rootId') rootId: string,
    @Param('oathId') oathId: string,
    @Body() dto: ResolveOathDto,
  ) {
    return this.service.resolveOath(rootId, oathId, dto);
  }
}
