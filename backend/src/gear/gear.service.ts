// ============================================================
// PIK — Gear Service (Sprint 6)
//
// Manages the soulbound gear system: inventory, equipment
// slots, and computed modifier stacking.
//
// Place at: src/gear/gear.service.ts
// ============================================================

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';

/** The 7 modifier stats. All values are percentages or flat numbers. */
export interface GearModifiers {
  xp_bonus_pct: number;
  boss_damage_pct: number;
  luck_pct: number;
  defense: number;
  crit_pct: number;
  cooldown_pct: number;
  fate_affinity: number;
}

const EMPTY_MODIFIERS: GearModifiers = {
  xp_bonus_pct: 0,
  boss_damage_pct: 0,
  luck_pct: 0,
  defense: 0,
  crit_pct: 0,
  cooldown_pct: 0,
  fate_affinity: 0,
};

const VALID_SLOTS = ['weapon', 'helm', 'chest', 'arms', 'legs', 'rune'];

@Injectable()
export class GearService {
  private readonly logger = new Logger(GearService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  // ── ADD TO INVENTORY ──────────────────────────────────────

  /**
   * Add a gear item to a player's inventory (soulbound).
   * Called by LootService when a cache yields gear.
   */
  async addToInventory(params: {
    rootId: string;
    itemId: string;
    acquiredVia: string;
    sourceId?: string;
  }) {
    // Verify item exists
    const item = await this.prisma.gearItem.findUnique({
      where: { id: params.itemId },
    });
    if (!item) {
      throw new NotFoundException(`Gear item not found: ${params.itemId}`);
    }

    const inv = await this.prisma.playerInventory.create({
      data: {
        rootId: params.rootId,
        itemId: params.itemId,
        acquiredVia: params.acquiredVia,
      },
    });

    await this.events.log({
      rootId: params.rootId,
      eventType: 'gear.item_acquired',
      sourceId: params.sourceId,
      payload: {
        inventory_id: inv.id,
        item_id: params.itemId,
        item_name: item.name,
        slot: item.slot,
        rarity: item.rarityTier,
        acquired_via: params.acquiredVia,
      },
    });

    this.logger.log(
      `Gear acquired: ${item.name} (${item.rarityTier} ${item.slot}) → ${params.rootId}`,
    );

    return {
      inventory_id: inv.id,
      item_id: item.id,
      item_name: item.name,
      slot: item.slot,
      rarity: item.rarityTier,
      icon: item.icon,
      modifiers: item.modifiers,
    };
  }

  // ── EQUIP ITEM ────────────────────────────────────────────

  async equipItem(rootId: string, inventoryId: string) {
    // Get the inventory item with gear details
    const invItem = await this.prisma.playerInventory.findUnique({
      where: { id: inventoryId },
      include: { item: true },
    });

    if (!invItem) {
      throw new NotFoundException(`Inventory item not found: ${inventoryId}`);
    }
    if (invItem.rootId !== rootId) {
      throw new BadRequestException('This item does not belong to you');
    }

    const slot = invItem.item.slot;

    // Remove any existing equipment in this slot
    const existing = await this.prisma.playerEquipment.findUnique({
      where: { rootId_slot: { rootId, slot } },
      include: {
        inventory: { include: { item: true } },
      },
    });

    if (existing) {
      await this.prisma.playerEquipment.delete({
        where: { id: existing.id },
      });
    }

    // Equip the new item
    await this.prisma.playerEquipment.create({
      data: { rootId, slot, inventoryId },
    });

    await this.events.log({
      rootId,
      eventType: 'gear.item_equipped',
      payload: {
        inventory_id: inventoryId,
        item_id: invItem.item.id,
        item_name: invItem.item.name,
        slot,
        replaced: existing
          ? { item_id: existing.inventory.item.id, item_name: existing.inventory.item.name }
          : null,
      },
    });

    this.logger.log(
      `Gear equipped: ${invItem.item.name} in ${slot} for ${rootId}` +
        (existing ? ` (replaced ${existing.inventory.item.name})` : ''),
    );

    return {
      slot,
      equipped: {
        inventory_id: inventoryId,
        item_id: invItem.item.id,
        item_name: invItem.item.name,
        rarity: invItem.item.rarityTier,
        icon: invItem.item.icon,
        modifiers: invItem.item.modifiers,
      },
      replaced: existing
        ? {
            inventory_id: existing.inventoryId,
            item_id: existing.inventory.item.id,
            item_name: existing.inventory.item.name,
          }
        : null,
    };
  }

  // ── UNEQUIP ITEM ──────────────────────────────────────────

  async unequipSlot(rootId: string, slot: string) {
    if (!VALID_SLOTS.includes(slot)) {
      throw new BadRequestException(`Invalid slot: ${slot}`);
    }

    const equipment = await this.prisma.playerEquipment.findUnique({
      where: { rootId_slot: { rootId, slot } },
      include: { inventory: { include: { item: true } } },
    });

    if (!equipment) {
      throw new BadRequestException(`Nothing equipped in ${slot}`);
    }

    await this.prisma.playerEquipment.delete({
      where: { id: equipment.id },
    });

    await this.events.log({
      rootId,
      eventType: 'gear.item_unequipped',
      payload: {
        slot,
        item_id: equipment.inventory.item.id,
        item_name: equipment.inventory.item.name,
      },
    });

    return { slot, unequipped: equipment.inventory.item.name };
  }

  // ── GET INVENTORY ─────────────────────────────────────────

  async getInventory(rootId: string) {
    const items = await this.prisma.playerInventory.findMany({
      where: { rootId },
      include: {
        item: true,
        equipment: true,
      },
      orderBy: { acquiredAt: 'desc' },
    });

    return items.map((inv) => ({
      inventory_id: inv.id,
      item_id: inv.item.id,
      item_name: inv.item.name,
      slot: inv.item.slot,
      rarity: inv.item.rarityTier,
      icon: inv.item.icon,
      description: inv.item.description,
      lore_text: inv.item.loreText,
      modifiers: inv.item.modifiers,
      acquired_via: inv.acquiredVia,
      acquired_at: inv.acquiredAt.toISOString(),
      is_equipped: !!inv.equipment,
    }));
  }

  // ── GET EQUIPMENT (active loadout) ────────────────────────

  async getEquipment(rootId: string) {
    const equipped = await this.prisma.playerEquipment.findMany({
      where: { rootId },
      include: {
        inventory: { include: { item: true } },
      },
    });

    const loadout: Record<string, unknown> = {};
    for (const slot of VALID_SLOTS) {
      const eq = equipped.find((e) => e.slot === slot);
      loadout[slot] = eq
        ? {
            inventory_id: eq.inventoryId,
            item_id: eq.inventory.item.id,
            item_name: eq.inventory.item.name,
            rarity: eq.inventory.item.rarityTier,
            icon: eq.inventory.item.icon,
            modifiers: eq.inventory.item.modifiers,
          }
        : null;
    }

    return loadout;
  }

  // ── COMPUTED MODIFIERS (stacked from all equipped gear) ───

  async getComputedModifiers(rootId: string): Promise<GearModifiers> {
    const equipped = await this.prisma.playerEquipment.findMany({
      where: { rootId },
      include: {
        inventory: { include: { item: true } },
      },
    });

    const totals = { ...EMPTY_MODIFIERS };

    for (const eq of equipped) {
      const mods = (eq.inventory.item.modifiers || {}) as Record<string, number>;
      for (const [key, val] of Object.entries(mods)) {
        if (key in totals) {
          (totals as Record<string, number>)[key] += val;
        }
      }
    }

    return totals;
  }

  // ── GEAR CATALOG (operator/reference) ─────────────────────

  async getCatalog(slot?: string) {
    const where: Record<string, unknown> = {};
    if (slot) where.slot = slot;

    const items = await this.prisma.gearItem.findMany({
      where,
      orderBy: [{ slot: 'asc' }, { minLevel: 'asc' }, { rarityTier: 'asc' }],
    });

    return items.map((i) => ({
      item_id: i.id,
      name: i.name,
      slot: i.slot,
      rarity: i.rarityTier,
      icon: i.icon,
      min_level: i.minLevel,
      description: i.description,
      lore_text: i.loreText,
      modifiers: i.modifiers,
    }));
  }
}
