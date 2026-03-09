// ============================================================
// PIK — Gear Controller (Sprint 6)
//
// GET  /api/users/:root_id/inventory        — Player inventory
// GET  /api/users/:root_id/equipment        — Current loadout
// GET  /api/users/:root_id/modifiers        — Computed stat stack
// POST /api/users/:root_id/equipment/equip  — Equip item
// POST /api/users/:root_id/equipment/unequip — Unequip slot
// GET  /api/gear/catalog                    — Full gear catalog
//
// Place at: src/gear/gear.controller.ts
// ============================================================

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { GearService } from './gear.service';
import { AccountGuard } from '../auth/guards/account.guard';

@Controller('api')
export class GearController {
  constructor(private readonly gear: GearService) {}

  // ── Player endpoints (account-protected) ──────────────────

  @Get('users/:root_id/inventory')
  async getInventory(@Param('root_id') rootId: string) {
    return this.gear.getInventory(rootId);
  }

  @Get('users/:root_id/equipment')
  async getEquipment(@Param('root_id') rootId: string) {
    return this.gear.getEquipment(rootId);
  }

  @Get('users/:root_id/modifiers')
  async getModifiers(@Param('root_id') rootId: string) {
    return this.gear.getComputedModifiers(rootId);
  }

  @Post('users/:root_id/equipment/equip')
  @UseGuards(AccountGuard)
  async equipItem(
    @Param('root_id') rootId: string,
    @Body() body: { inventory_id: string },
    @Req() req: Request & { heroId: string },
  ) {
    if (req.heroId !== rootId) {
      return { status: 'error', message: 'Unauthorized' };
    }
    return this.gear.equipItem(rootId, body.inventory_id);
  }

  @Post('users/:root_id/equipment/unequip')
  @UseGuards(AccountGuard)
  async unequipSlot(
    @Param('root_id') rootId: string,
    @Body() body: { slot: string },
    @Req() req: Request & { heroId: string },
  ) {
    if (req.heroId !== rootId) {
      return { status: 'error', message: 'Unauthorized' };
    }
    return this.gear.unequipSlot(rootId, body.slot);
  }

  // ── Catalog (public / operator) ───────────────────────────

  @Get('gear/catalog')
  async getCatalog(@Query('slot') slot?: string) {
    return this.gear.getCatalog(slot);
  }
}
