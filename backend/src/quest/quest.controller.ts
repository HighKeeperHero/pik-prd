// ============================================================
// PIK — Quest Controller (Sprint 7.3 — Quest Engine)
//
// REST API for quest management and player interactions.
//
// Place at: src/quest/quest.controller.ts
// ============================================================

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { QuestService } from './quest.service';

@Controller('api/quests')
export class QuestController {
  constructor(private readonly questService: QuestService) {}

  // ── Templates ──────────────────────────────────────────

  @Get('templates')
  @SkipThrottle()
  getTemplates() {
    return this.questService.getTemplates();
  }

  @Post('templates')
  createTemplate(@Body() body: any) {
    return this.questService.createTemplate({
      name: body.name,
      description: body.description,
      questType: body.quest_type,
      objectives: body.objectives,
      rewards: body.rewards,
      minLevel: body.min_level,
      maxLevel: body.max_level,
      sourceId: body.source_id,
      sortOrder: body.sort_order,
    });
  }

  @Post('seed')
  @SkipThrottle()
  seedQuests() {
    return this.questService.seedDefaultQuests();
  }

  // ── Player Quests ──────────────────────────────────────

  @Get('board/:rootId')
  @SkipThrottle()
  getQuestBoard(@Param('rootId') rootId: string) {
    return this.questService.getQuestBoard(rootId);
  }

  @Get('player/:rootId')
  @SkipThrottle()
  getPlayerQuests(@Param('rootId') rootId: string) {
    return this.questService.getPlayerQuests(rootId);
  }

  @Post('accept')
  acceptQuest(@Body() body: { root_id: string; quest_id: string }) {
    return this.questService.acceptQuest(body.root_id, body.quest_id);
  }

  @Post('evaluate/:rootId')
  @SkipThrottle()
  evaluate(@Param('rootId') rootId: string) {
    return this.questService.evaluateForPlayer(rootId);
  }
}
