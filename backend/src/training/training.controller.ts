// src/training/training.controller.ts
// Sprint 10: added GET /api/training/oaths/feed (Oath Accountability Feed)
import {
  Controller, Get, Post, Body, Param, Query,
} from '@nestjs/common';
import { TrainingService } from './training.service';
import {
  LogTrainingDto, CompleteRiteDto, DeclareOathDto, ResolveOathDto,
} from './dto/training.dto';

@Controller('api/training')
export class TrainingController {
  constructor(private readonly service: TrainingService) {}

  @Get('daily/:rootId')
  async getDailyRites(@Param('rootId') rootId: string) {
    return this.service.getDailyRites(rootId);
  }

  @Post('daily/:rootId/complete')
  async completeRite(@Param('rootId') rootId: string, @Body() dto: CompleteRiteDto) {
    return this.service.completeRite(rootId, dto);
  }

  @Post('log/:rootId')
  async logTraining(@Param('rootId') rootId: string, @Body() dto: LogTrainingDto) {
    return this.service.logTraining(rootId, dto);
  }

  @Get('pillars/:rootId')
  async getPillarProgress(@Param('rootId') rootId: string) {
    return this.service.getPillarProgress(rootId);
  }

  @Get('chronicle/:rootId')
  async getChronicle(
    @Param('rootId') rootId: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getChronicle(rootId, limit ? parseInt(limit) : 20);
  }

  // NOTE: 'oaths/feed' MUST be declared before 'oath/:rootId' so NestJS
  // does not treat "oaths" as a rootId param value.
  @Get('oaths/feed')
  async getOathFeed(
    @Query('limit') limit?: string,
    @Query('week') week?: string,
  ) {
    return this.service.getOathFeed(
      limit ? parseInt(limit) : 30,
      week === 'last' ? 'last' : 'current',
    );
  }

  @Get('oath/:rootId')
  async getActiveOath(@Param('rootId') rootId: string) {
    return this.service.getActiveOath(rootId);
  }

  @Post('oath/:rootId')
  async declareOath(@Param('rootId') rootId: string, @Body() dto: DeclareOathDto) {
    return this.service.declareOath(rootId, dto);
  }

  @Post('oath/:rootId/:oathId/resolve')
  async resolveOath(
    @Param('rootId') rootId: string,
    @Param('oathId') oathId: string,
    @Body() dto: ResolveOathDto,
  ) {
    return this.service.resolveOath(rootId, oathId, dto);
  }
}
