// src/gear/gear.controller.ts
// ============================================================
// PIK — Gear Controller
// Sprint 9+: added /dismantle, /nexus, /components routes
// ============================================================
import { Controller, Get, Post, Param, Query, Body, UseGuards, Req } from '@nestjs/common';
import { GearService } from './gear.service';
import { AccountGuard } from '../auth/guards/account.guard';

@Controller('api')
export class GearController {
  constructor(private readonly gear: GearService) {}

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
    if (req.heroId !== rootId) return { status: 'error', message: 'Unauthorized' };
    return this.gear.equipItem(rootId, body.inventory_id);
  }

  @Post('users/:root_id/equipment/unequip')
  @UseGuards(AccountGuard)
  async unequipSlot(
    @Param('root_id') rootId: string,
    @Body() body: { slot: string },
    @Req() req: Request & { heroId: string },
  ) {
    if (req.heroId !== rootId) return { status: 'error', message: 'Unauthorized' };
    return this.gear.unequipSlot(rootId, body.slot);
  }

  @Get('gear/catalog')
  async getCatalog(@Query('slot') slot?: string) {
    return this.gear.getCatalog(slot);
  }

  // ── NEW: Dismantle ─────────────────────────────────────────
  // POST /api/users/:root_id/gear/:inventory_id/dismantle
  @Post('users/:root_id/gear/:inventory_id/dismantle')
  @UseGuards(AccountGuard)
  async dismantleItem(
    @Param('root_id') rootId: string,
    @Param('inventory_id') inventoryId: string,
    @Req() req: Request & { heroId: string },
  ) {
    if (req.heroId !== rootId) return { status: 'error', message: 'Unauthorized' };
    return this.gear.dismantleItem(rootId, inventoryId);
  }

  // ── NEW: Nexus balance ─────────────────────────────────────
  // GET /api/users/:root_id/nexus
  @Get('users/:root_id/nexus')
  async getNexus(@Param('root_id') rootId: string) {
    return this.gear.getNexusBalance(rootId);
  }

  // ── NEW: Component stash ────────────────────────────────────
  // GET /api/users/:root_id/components
  @Get('users/:root_id/components')
  async getComponents(@Param('root_id') rootId: string) {
    return this.gear.getComponents(rootId);
  }
}
