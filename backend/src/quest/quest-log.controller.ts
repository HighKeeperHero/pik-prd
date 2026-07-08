// ============================================================
// PIK — Quest Log Controller (Sprint 32 — Cadence Quest Engine)
//
// /api/quests/log + /api/quests/claim — the hero-facing quest
// log for the iOS app (AccountGuard, like /api/sanctum/*).
// /api/chapters/complete — chapter completion beat: idempotent
// 1,000 XP grant + story-chain progress.
//
// The legacy venue board (Sprint 7.3) stays on quest.controller.
// ============================================================

import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccountGuard } from '../auth/guards/account.guard';
import { QuestLogService } from './quest-log.service';

type AuthedRequest = Request & { accountId: string; heroId: string | null };

function requireHeroId(req: AuthedRequest): string {
  if (!req.heroId) {
    throw new BadRequestException('No hero selected on this session.');
  }
  return req.heroId;
}

@Controller('api/quests')
@UseGuards(AccountGuard)
export class QuestLogController {
  constructor(private readonly questLog: QuestLogService) {}

  @Get('log')
  async getLog(@Req() req: AuthedRequest) {
    return this.questLog.getLog(requireHeroId(req));
  }

  @Post('claim')
  async claim(@Req() req: AuthedRequest, @Body() body: { slug?: string }) {
    if (!body?.slug) throw new BadRequestException('slug is required');
    return this.questLog.claim(requireHeroId(req), body.slug);
  }
}

@Controller('api/chapters')
@UseGuards(AccountGuard)
export class ChaptersController {
  constructor(private readonly questLog: QuestLogService) {}

  @Post('complete')
  async complete(@Req() req: AuthedRequest, @Body() body: { chapter?: number }) {
    const chapter = Number(body?.chapter);
    if (!Number.isInteger(chapter) || chapter < 1) {
      throw new BadRequestException('chapter must be a positive integer');
    }
    return this.questLog.completeChapter(requireHeroId(req), chapter);
  }
}
