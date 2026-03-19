// src/gear/gear.service.ts
// ============================================================
// PIK — Gear Service
// Sprint 9+: added dismantleItem, getNexusBalance, getComponents
// ============================================================
import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';
import { HuntTrackerService } from '../quest/hunt-tracker.service';

export interface GearModifiers {
  xp_bonus_pct: number; boss_damage_pct: number; luck_pct: number;
  defense: number; crit_pct: number; cooldown_pct: number; fate_affinity: number;
}

const EMPTY_MODIFIERS: GearModifiers = {
  xp_bonus_pct: 0, boss_damage_pct: 0, luck_pct: 0,
  defense: 0, crit_pct: 0, cooldown_pct: 0, fate_affinity: 0,
};

const VALID_SLOTS = ['weapon', 'helm', 'chest', 'arms', 'legs', 'rune'];

const COMPONENT_META: Record<string, { name: string; icon: string }> = {
  salvage_shard:  { name: 'Salvage Shard',  icon: '🪨' },
  refined_core:   { name: 'Refined Core',   icon: '⚙️' },
  arcane_essence: { name: 'Arcane Essence', icon: '🔮' },
  void_fragment:  { name: 'Void Fragment',  icon: '💠' },
};

// Must match client-side DISMANTLE_YIELD in VaultScreen.tsx
const DISMANTLE_YIELD: Record<string, { nexus: number; components: { type: string; qty: number }[] }> = {
  common:    { nexus: 10,  components: [{ type: 'salvage_shard', qty: 2 }] },
  uncommon:  { nexus: 25,  components: [{ type: 'salvage_shard', qty: 2 }, { type: 'refined_core', qty: 1 }] },
  rare:      { nexus: 50,  components: [{ type: 'refined_core', qty: 2 }, { type: 'arcane_essence', qty: 1 }] },
  epic:      { nexus: 100, components: [{ type: 'arcane_essence', qty: 2 }, { type: 'void_fragment', qty: 1 }] },
  legendary: { nexus: 200, components: [{ type: 'arcane_essence', qty: 2 }, { type: 'void_fragment', qty: 2 }] },
};

@Injectable()
export class GearService {
  private readonly logger = new Logger(GearService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly huntTracker: HuntTrackerService,
  ) {}

  // ── ADD TO INVENTORY ──────────────────────────────────────
  async addToInventory(params: { rootId: string; itemId: string; acquiredVia: string; sourceId?: string }) {
    const item = await this.prisma.gearItem.findUnique({ where: { id: params.itemId } });
    if (!item) throw new NotFoundException(`Gear item not found: ${params.itemId}`);
    const inv = await this.prisma.playerInventory.create({
      data: { rootId: params.rootId, itemId: params.itemId, acquiredVia: params.acquiredVia },
    });
    await this.events.log({
      rootId: params.rootId, eventType: 'gear.item_acquired', sourceId: params.sourceId,
      payload: { inventory_id: inv.id, item_id: params.itemId, item_name: item.name, slot: item.slot, rarity: item.rarityTier, acquired_via: params.acquiredVia },
    });
    this.logger.log(`Gear acquired: ${item.name} (${item.rarityTier} ${item.slot}) → ${params.rootId}`);
    return { inventory_id: inv.id, item_id: item.id, item_name: item.name, slot: item.slot, rarity: item.rarityTier, icon: item.icon, modifiers: item.modifiers };
  }

  // ── EQUIP ITEM ─────────────────────────────────────────────
  async equipItem(rootId: string, inventoryId: string) {
    const invItem = await this.prisma.playerInventory.findUnique({ where: { id: inventoryId }, include: { item: true } });
    if (!invItem) throw new NotFoundException(`Inventory item not found: ${inventoryId}`);
    if (invItem.rootId !== rootId) throw new BadRequestException('This item does not belong to you');
    const slot = invItem.item.slot;
    const existing = await this.prisma.playerEquipment.findUnique({
      where: { rootId_slot: { rootId, slot } }, include: { inventory: { include: { item: true } } },
    });
    if (existing) await this.prisma.playerEquipment.delete({ where: { id: existing.id } });
    await this.prisma.playerEquipment.create({ data: { rootId, slot, inventoryId } });
    await this.events.log({
      rootId, eventType: 'gear.item_equipped',
      payload: { inventory_id: inventoryId, item_id: invItem.item.id, item_name: invItem.item.name, slot, replaced: existing ? { item_id: existing.inventory.item.id, item_name: existing.inventory.item.name } : null },
    });
    return {
      slot,
      equipped: { inventory_id: inventoryId, item_id: invItem.item.id, item_name: invItem.item.name, rarity: invItem.item.rarityTier, icon: invItem.item.icon, modifiers: invItem.item.modifiers },
      replaced: existing ? { inventory_id: existing.inventoryId, item_id: existing.inventory.item.id, item_name: existing.inventory.item.name } : null,
    };
  }

  // ── UNEQUIP SLOT ───────────────────────────────────────────
  async unequipSlot(rootId: string, slot: string) {
    if (!VALID_SLOTS.includes(slot)) throw new BadRequestException(`Invalid slot: ${slot}`);
    const equipment = await this.prisma.playerEquipment.findUnique({
      where: { rootId_slot: { rootId, slot } }, include: { inventory: { include: { item: true } } },
    });
    if (!equipment) throw new BadRequestException(`Nothing equipped in ${slot}`);
    await this.prisma.playerEquipment.delete({ where: { id: equipment.id } });
    await this.events.log({ rootId, eventType: 'gear.item_unequipped', payload: { slot, item_id: equipment.inventory.item.id, item_name: equipment.inventory.item.name } });
    return { slot, unequipped: equipment.inventory.item.name };
  }

  // ── GET INVENTORY ──────────────────────────────────────────
  async getInventory(rootId: string) {
    const items = await this.prisma.playerInventory.findMany({
      where: { rootId }, include: { item: true, equipment: true }, orderBy: { acquiredAt: 'desc' },
    });
    return items.map(inv => ({
      inventory_id: inv.id, item_id: inv.item.id, item_name: inv.item.name,
      slot: inv.item.slot, rarity: inv.item.rarityTier, icon: inv.item.icon,
      description: inv.item.description, lore_text: inv.item.loreText,
      modifiers: inv.item.modifiers, acquired_via: inv.acquiredVia,
      acquired_at: inv.acquiredAt.toISOString(), is_equipped: !!inv.equipment,
    }));
  }

  // ── GET EQUIPMENT ──────────────────────────────────────────
  async getEquipment(rootId: string) {
    const equipped = await this.prisma.playerEquipment.findMany({ where: { rootId }, include: { inventory: { include: { item: true } } } });
    const loadout: Record<string, unknown> = {};
    for (const slot of VALID_SLOTS) {
      const eq = equipped.find(e => e.slot === slot);
      loadout[slot] = eq ? { inventory_id: eq.inventoryId, item_id: eq.inventory.item.id, item_name: eq.inventory.item.name, rarity: eq.inventory.item.rarityTier, icon: eq.inventory.item.icon, modifiers: eq.inventory.item.modifiers } : null;
    }
    return loadout;
  }

  // ── COMPUTED MODIFIERS ─────────────────────────────────────
  async getComputedModifiers(rootId: string): Promise<GearModifiers> {
    const equipped = await this.prisma.playerEquipment.findMany({ where: { rootId }, include: { inventory: { include: { item: true } } } });
    const totals = { ...EMPTY_MODIFIERS };
    for (const eq of equipped) {
      const mods = (eq.inventory.item.modifiers || {}) as Record<string, number>;
      for (const [key, val] of Object.entries(mods)) {
        if (key in totals) (totals as Record<string, number>)[key] += val;
      }
    }
    return totals;
  }

  // ── GEAR CATALOG ───────────────────────────────────────────
  async getCatalog(slot?: string) {
    const where: Record<string, unknown> = {};
    if (slot) where.slot = slot;
    const items = await this.prisma.gearItem.findMany({ where, orderBy: [{ slot: 'asc' }, { minLevel: 'asc' }, { rarityTier: 'asc' }] });
    return items.map(i => ({ item_id: i.id, name: i.name, slot: i.slot, rarity: i.rarityTier, icon: i.icon, min_level: i.minLevel, description: i.description, lore_text: i.loreText, modifiers: i.modifiers }));
  }

  // ── DISMANTLE ITEM ─────────────────────────────────────────
  async dismantleItem(rootId: string, inventoryId: string) {
    const invItem = await this.prisma.playerInventory.findUnique({
      where: { id: inventoryId }, include: { item: true, equipment: true },
    });
    if (!invItem) throw new NotFoundException(`Inventory item not found: ${inventoryId}`);
    if (invItem.rootId !== rootId) throw new BadRequestException('This item does not belong to you');
    if (invItem.equipment) throw new BadRequestException('Cannot dismantle an equipped item. Unequip it first.');

    const rarity   = invItem.item.rarityTier as string;
    const yieldDef = DISMANTLE_YIELD[rarity] ?? DISMANTLE_YIELD['common'];

    // Atomic: delete inventory row + upsert nexus
    const [, nexusRow] = await this.prisma.$transaction([
      this.prisma.playerInventory.delete({ where: { id: inventoryId } }),
      this.prisma.playerNexus.upsert({
        where:  { rootId },
        update: { balance: { increment: yieldDef.nexus } },
        create: { rootId, balance: yieldDef.nexus },
      }),
    ]);

    // Upsert each component
    for (const comp of yieldDef.components) {
      await this.prisma.playerComponents.upsert({
        where:  { rootId_componentType: { rootId, componentType: comp.type } },
        update: { quantity: { increment: comp.qty } },
        create: { rootId, componentType: comp.type, quantity: comp.qty },
      });
    }

    const allComponents = await this.prisma.playerComponents.findMany({ where: { rootId } });
    const componentMap: Record<string, number> = {};
    allComponents.forEach(c => { componentMap[c.componentType] = c.quantity; });

    await this.events.log({
      rootId, eventType: 'gear.item_dismantled',
      payload: { inventory_id: inventoryId, item_id: invItem.item.id, item_name: invItem.item.name, rarity, nexus_gained: yieldDef.nexus, components_gained: yieldDef.components },
    });
    this.logger.log(`Dismantled: ${invItem.item.name} (${rarity}) for ${rootId} → +${yieldDef.nexus}◈`);

    // ── Hunt tracker: each component drop fires a qualifying event ────────
    // Advances any accepted component hunt server-side — no client input needed.
    const totalComponentsDropped = yieldDef.components.reduce((sum, c) => sum + c.qty, 0);
    for (let i = 0; i < totalComponentsDropped; i++) {
      this.huntTracker.recordEvent(rootId, 'component_collected', {
        item_id: invItem.item.id,
        rarity,
      });
    }

    return {
      nexus_gained:      yieldDef.nexus,
      components_gained: yieldDef.components.map(c => ({
        id: c.type, name: COMPONENT_META[c.type]?.name ?? c.type, icon: COMPONENT_META[c.type]?.icon ?? '🔷', quantity: c.qty,
      })),
      new_nexus_balance: nexusRow.balance,
      new_components:    componentMap,
    };
  }


  // ── ADD ENGINE ITEM TO INVENTORY (Loot Sprint B) ──────────
  // Called by openCache() when the LootEngine produces a result.
  // Creates a dynamic GearItem row from the engine output, then
  // adds it to inventory. Unlike addToInventory(), this does NOT
  // require a pre-existing GearItem record.
  async addEngineItemToInventory(params: {
    rootId:      string;
    engineResult: {
      base_item_id:   string;
      base_item_name: string;
      slot:           string;
      rarity:         string;
      region_theme:   string;
      level_band:     string;
      item_power:     number;
      slot_budget:    number;
    };
    acquiredVia: string;
    sourceId?:   string;
  }) {
    const { rootId, engineResult, acquiredVia, sourceId } = params;

    // Slot icon map
    const SLOT_ICON: Record<string, string> = {
      Helm: '⛑', Chest: '🥋', Hands: '🧤',
      Legs: '👢', Weapon: '⚔', Rune: '🔮',
    };

    // Unique ID: base_item_id + timestamp + random suffix
    // Ensures every cache open produces a distinct GearItem row
    const itemId = `${engineResult.base_item_id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const slotLower = engineResult.slot.toLowerCase();

    // Create the instanced GearItem row
    const item = await this.prisma.gearItem.create({
      data: {
        id:          itemId,
        name:        engineResult.base_item_name,
        slot:        slotLower,
        rarityTier:  engineResult.rarity,
        icon:        SLOT_ICON[engineResult.slot] ?? '⚔',
        minLevel:    1,
        modifiers:   {},
        levelBand:   engineResult.level_band,
        regionTheme: engineResult.region_theme,
        itemPower:   engineResult.item_power,
        slotBudget:  engineResult.slot_budget,
        baseItemId:  engineResult.base_item_id,
      },
    });

    // Add to inventory
    const inv = await this.prisma.playerInventory.create({
      data: { rootId, itemId: item.id, acquiredVia },
    });

    await this.events.log({
      rootId,
      eventType: 'gear.item_acquired',
      sourceId,
      payload: {
        inventory_id: inv.id,
        item_id:      item.id,
        item_name:    item.name,
        slot:         item.slot,
        rarity:       item.rarityTier,
        region_theme: item.regionTheme,
        level_band:   item.levelBand,
        item_power:   item.itemPower,
        acquired_via: acquiredVia,
        source:       'loot_engine',
      },
    });

    this.logger.log(
      `Engine gear acquired: ${item.name} (${item.rarityTier} ${item.slot} ${item.levelBand} IP:${item.itemPower}) → ${rootId}`
    );

    return {
      inventory_id: inv.id,
      item_id:      item.id,
      item_name:    item.name,
      slot:         item.slot,
      rarity:       item.rarityTier,
      icon:         item.icon,
      region_theme: item.regionTheme,
      level_band:   item.levelBand,
      item_power:   item.itemPower,
      modifiers:    item.modifiers,
    };
  }

  // ── NEXUS BALANCE ──────────────────────────────────────────
  async getNexusBalance(rootId: string) {
    const row = await this.prisma.playerNexus.findUnique({ where: { rootId } });
    return { balance: row?.balance ?? 0 };
  }

  // ── COMPONENT STASH ────────────────────────────────────────
  async getComponents(rootId: string) {
    const rows = await this.prisma.playerComponents.findMany({ where: { rootId } });
    return rows.map(r => ({
      id: r.componentType, name: COMPONENT_META[r.componentType]?.name ?? r.componentType,
      icon: COMPONENT_META[r.componentType]?.icon ?? '🔷', quantity: r.quantity,
    }));
  }
}
