// src/forge/forge.controller.ts
// ============================================================
// The Forge — REST surface (Sprint 33)
//
// All routes are scoped /api/forge/:rootId/... mirroring the
// existing training controller (rootId in the path). Route order
// matters: static segments (sessions/active, sessions/start) are
// declared before the parameterised :sessionId routes so Nest
// does not capture "active"/"start" as an id.
// ============================================================

import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
} from '@nestjs/common';
import { ForgeService } from './forge.service';
import {
  CreateExerciseDto, SaveRegimenDto, StartSessionDto,
  AddSessionExerciseDto, LogSetDto, UpdateSetDto, FinishSessionDto,
} from './dto/forge.dto';

@Controller('api/forge')
export class ForgeController {
  constructor(private readonly service: ForgeService) {}

  // ── Exercise library ──────────────────────────────────────────────────────────
  @Get(':rootId/exercises')
  listExercises(
    @Param('rootId') rootId: string,
    @Query('category') category?: string,
    @Query('equipment') equipment?: string,
    @Query('q') q?: string,
  ) {
    return this.service.listExercises(rootId, { category, equipment, q });
  }

  @Post(':rootId/exercises')
  createExercise(@Param('rootId') rootId: string, @Body() dto: CreateExerciseDto) {
    return this.service.createExercise(rootId, dto);
  }

  @Get(':rootId/exercises/:exerciseId/history')
  exerciseHistory(@Param('rootId') rootId: string, @Param('exerciseId') exerciseId: string) {
    return this.service.getExerciseHistory(rootId, exerciseId);
  }

  // ── Regimens ──────────────────────────────────────────────────────────────────
  @Get(':rootId/regimens')
  listRegimens(@Param('rootId') rootId: string) {
    return this.service.listRegimens(rootId);
  }

  @Post(':rootId/regimens')
  saveRegimen(@Param('rootId') rootId: string, @Body() dto: SaveRegimenDto) {
    return this.service.saveRegimen(rootId, dto);
  }

  @Get(':rootId/regimens/:regimenId')
  getRegimen(@Param('rootId') rootId: string, @Param('regimenId') regimenId: string) {
    return this.service.getRegimen(rootId, regimenId);
  }

  @Put(':rootId/regimens/:regimenId')
  updateRegimen(
    @Param('rootId') rootId: string,
    @Param('regimenId') regimenId: string,
    @Body() dto: SaveRegimenDto,
  ) {
    return this.service.updateRegimen(rootId, regimenId, dto);
  }

  @Delete(':rootId/regimens/:regimenId')
  deleteRegimen(@Param('rootId') rootId: string, @Param('regimenId') regimenId: string) {
    return this.service.deleteRegimen(rootId, regimenId);
  }

  // ── History / Feats / Stats ─────────────────────────────────────────────────
  @Get(':rootId/history')
  history(@Param('rootId') rootId: string, @Query('limit') limit?: string) {
    return this.service.listHistory(rootId, limit ? parseInt(limit, 10) : 20);
  }

  @Get(':rootId/records')
  records(@Param('rootId') rootId: string) {
    return this.service.getRecords(rootId);
  }

  @Get(':rootId/stats')
  stats(@Param('rootId') rootId: string) {
    return this.service.getStats(rootId);
  }

  // ── Sessions ──────────────────────────────────────────────────────────────────
  // Static segments first.
  @Post(':rootId/sessions/start')
  startSession(@Param('rootId') rootId: string, @Body() dto: StartSessionDto) {
    return this.service.startSession(rootId, dto);
  }

  @Get(':rootId/sessions/active')
  activeSession(@Param('rootId') rootId: string) {
    return this.service.getActiveSession(rootId);
  }

  // Set mutations addressed by setId (independent of session path).
  @Put(':rootId/sets/:setId')
  updateSet(@Param('rootId') rootId: string, @Param('setId') setId: string, @Body() dto: UpdateSetDto) {
    return this.service.updateSet(rootId, setId, dto);
  }

  @Delete(':rootId/sets/:setId')
  deleteSet(@Param('rootId') rootId: string, @Param('setId') setId: string) {
    return this.service.deleteSet(rootId, setId);
  }

  // Parameterised session routes.
  @Get(':rootId/sessions/:sessionId')
  getSession(@Param('rootId') rootId: string, @Param('sessionId') sessionId: string) {
    return this.service.getSession(rootId, sessionId);
  }

  @Post(':rootId/sessions/:sessionId/exercises')
  addExercise(
    @Param('rootId') rootId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: AddSessionExerciseDto,
  ) {
    return this.service.addSessionExercise(rootId, sessionId, dto);
  }

  @Delete(':rootId/sessions/:sessionId/exercises/:sessionExerciseId')
  removeExercise(
    @Param('rootId') rootId: string,
    @Param('sessionId') sessionId: string,
    @Param('sessionExerciseId') sessionExerciseId: string,
  ) {
    return this.service.removeSessionExercise(rootId, sessionId, sessionExerciseId);
  }

  @Post(':rootId/sessions/:sessionId/sets')
  logSet(
    @Param('rootId') rootId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: LogSetDto,
  ) {
    return this.service.logSet(rootId, sessionId, dto);
  }

  @Post(':rootId/sessions/:sessionId/finish')
  finishSession(
    @Param('rootId') rootId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: FinishSessionDto,
  ) {
    return this.service.finishSession(rootId, sessionId, dto);
  }

  @Post(':rootId/sessions/:sessionId/discard')
  discardSession(@Param('rootId') rootId: string, @Param('sessionId') sessionId: string) {
    return this.service.discardSession(rootId, sessionId);
  }
}
