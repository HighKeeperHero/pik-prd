// src/workshop/workshop.controller.ts
// ============================================================
// PIK — Workshop Controller
//
// GET  /api/workshop/recipes              — All craftable recipes
// POST /api/users/:root_id/workshop/craft — Craft an item
// ============================================================
import { Controller, Get, Post, Param, Body, UseGuards, Req } from '@nestjs/common';
import { WorkshopService } from './workshop.service';
import { AccountGuard } from '../auth/guards/account.guard';

@Controller('api')
export class WorkshopController {
  constructor(private readonly workshop: WorkshopService) {}

  @Get('workshop/recipes')
  getRecipes(): any {
    return this.workshop.getRecipes();
  }

  @Post('users/:root_id/workshop/craft')
  @UseGuards(AccountGuard)
  async craftItem(
    @Param('root_id') rootId: string,
    @Body() body: { recipe_id: string },
    @Req() req: any,
  ): Promise<any> {
    if (req.heroId !== rootId) {
      return { status: 'error', message: 'Unauthorized' };
    }
    return this.workshop.craftItem(rootId, body.recipe_id);
  }
}
