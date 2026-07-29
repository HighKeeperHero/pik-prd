// src/gear/gear.service.ts
// ============================================================
// PIK — Gear Service
// Sprint 9+: added dismantleItem, getNexusBalance, getComponents
// ============================================================
import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { QuestLogService } from '../quest/quest-log.service';
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

// ── Paradigm (canon §13.3) ─────────────────────────────────
// Gear-derived PLAYSTYLE axis — distinct from Resonance (power).
// Four paradigms map 1:1 to the four Jobs, so a hero's dominant
// paradigm feeds the L40 Vocation recommendation directly.
export type Paradigm = 'bulwark' | 'onslaught' | 'verdant' | 'reap';
const PARADIGMS: Paradigm[] = ['bulwark', 'onslaught', 'verdant', 'reap'];
const PARADIGM_JOB: Record<Paradigm, string> = {
  bulwark: 'AEGIS', onslaught: 'SCALESWORN', verdant: 'DRYADIC', reap: 'HARVESTER',
};
// Which paradigm each gear modifier leans toward. Seeded catalog
// items carry these; the modifier's value is its point contribution.
const MODIFIER_PARADIGM: Record<string, Paradigm> = {
  defense:         'bulwark',
  boss_damage_pct: 'onslaught',
  crit_pct:        'onslaught',
  cooldown_pct:    'verdant',
  luck_pct:        'reap',
  xp_bonus_pct:    'reap',
  fate_affinity:   'reap',
};
// Fallback lean by slot for loot-engine items, which carry itemPower
// but no modifiers. itemPower is routed here, divided down so a full
// loadout spans the 25/50/100/150/200 thresholds rather than one
// legendary blowing past 200 on its own.
const SLOT_PARADIGM: Record<string, Paradigm> = {
  weapon: 'onslaught', arms: 'onslaught',
  chest:  'bulwark',   legs: 'bulwark',
  helm:   'reap',      rune: 'verdant',
};
const ITEMPOWER_DIVISOR = 8;
const PARADIGM_THRESHOLDS = [25, 50, 100, 150, 200];
// Modest playstyle perks (Tim, 2026-07-29) — style, not raw power;
// combat power stays Resonance (canon §11). value = perTier × tier.
const PARADIGM_PERK: Record<Paradigm, { key: string; label: string; perTier: number; unit: string }> = {
  bulwark:   { key: 'stability_bonus',    label: 'Stability',      perTier: 1, unit: 'hp'  },
  onslaught: { key: 'crit_pct',           label: 'Crit Chance',    perTier: 2, unit: 'pct' },
  verdant:   { key: 'resonance_gain_pct', label: 'Resonance Gain', perTier: 4, unit: 'pct' },
  reap:      { key: 'luck_pct',           label: 'Loot Luck',      perTier: 3, unit: 'pct' },
};
/** Threshold tier reached (0–5) for a paradigm point total. */
function paradigmTier(total: number): number {
  let t = 0;
  for (const th of PARADIGM_THRESHOLDS) if (total >= th) t++;
  return t;
}

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
    private readonly questLog: QuestLogService,
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
    // 2026-07-10 — Chapter I 'Arms of the Covenant' advances on
    // first equip (recordEvent never throws).
    await this.questLog.recordEvent(rootId, { type: 'gear_equip' });
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
      modifiers: inv.item.modifiers, item_power: inv.item.itemPower,
      acquired_via: inv.acquiredVia,
      acquired_at: inv.acquiredAt.toISOString(), is_equipped: !!inv.equipment,
    }));
  }

  // ── GET EQUIPMENT ──────────────────────────────────────────
  async getEquipment(rootId: string) {
    const equipped = await this.prisma.playerEquipment.findMany({ where: { rootId }, include: { inventory: { include: { item: true } } } });
    const loadout: Record<string, unknown> = {};
    for (const slot of VALID_SLOTS) {
      const eq = equipped.find(e => e.slot === slot);
      loadout[slot] = eq ? { inventory_id: eq.inventoryId, item_id: eq.inventory.item.id, item_name: eq.inventory.item.name, rarity: eq.inventory.item.rarityTier, icon: eq.inventory.item.icon, modifiers: eq.inventory.item.modifiers, item_power: eq.inventory.item.itemPower } : null;
    }
    return loadout;
  }

  // ── COMPUTED RESONANCE (canon §3, §13.2) ───────────────────
  // Gear-derived combat power. Slot-averaged over the six gear
  // slots so progression pressure runs *across* slots rather than
  // concentrating in a single weapon — empty slots count as zero
  // and drag the average down.
  //   Resonance = floor( gear_average + additive_grant_layer )
  // The additive layer (Master Echoes + Doctrine nodes) is not yet
  // built and is 0 until those systems ship (canon §13.2 / §13.5).
  // itemPower is written per item by the loot engine
  // (addEngineItemToInventory); catalog items with null itemPower
  // contribute 0 here — the client applies a rarity fallback for
  // display only.
  async getComputedResonance(rootId: string): Promise<{
    resonance: number;
    gear_average: number;
    additive_layer: number;
    per_slot: Record<string, number>;
  }> {
    const equipped = await this.prisma.playerEquipment.findMany({
      where: { rootId }, include: { inventory: { include: { item: true } } },
    });
    const perSlot: Record<string, number> = {};
    let sum = 0;
    for (const slot of VALID_SLOTS) {
      const eq = equipped.find(e => e.slot === slot);
      const power = eq?.inventory.item.itemPower ?? 0;
      perSlot[slot] = power;
      sum += power;
    }
    const gearAverage = sum / VALID_SLOTS.length;
    const additiveLayer = 0; // Master Echoes + Doctrine nodes — canon §13.2, not yet built
    return {
      resonance: Math.floor(gearAverage + additiveLayer),
      gear_average: gearAverage,
      additive_layer: additiveLayer,
      per_slot: perSlot,
    };
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

  // ── COMPUTED PARADIGM (canon §13.3) ────────────────────────
  // Gear-derived playstyle. Each equipped item adds points to a
  // paradigm — seeded items via their modifier lean, loot-engine
  // items via itemPower routed by slot. Dominant paradigm is the
  // Vocation recommender's 40% input; thresholds grant modest
  // playstyle perks (never raw combat power — that stays Resonance).
  async getComputedParadigm(rootId: string): Promise<{
    totals: Record<Paradigm, number>;
    dominant: Paradigm | null;
    recommended_job: string | null;
    perks: Array<{ paradigm: Paradigm; tier: number; threshold: number; key: string; label: string; unit: string; value: number }>;
  }> {
    const equipped = await this.prisma.playerEquipment.findMany({
      where: { rootId }, include: { inventory: { include: { item: true } } },
    });
    const totals: Record<Paradigm, number> = { bulwark: 0, onslaught: 0, verdant: 0, reap: 0 };
    for (const eq of equipped) {
      const item = eq.inventory.item;
      const mods = (item.modifiers || {}) as Record<string, number>;
      for (const [key, val] of Object.entries(mods)) {
        const p = MODIFIER_PARADIGM[key];
        if (p && val) totals[p] += val;
      }
      // itemPower base — loot-engine items (empty modifiers) get their
      // whole paradigm signal here; seeded items (itemPower null) rely
      // on their modifiers above.
      const ip = item.itemPower ?? 0;
      if (ip > 0) {
        const p = SLOT_PARADIGM[item.slot] ?? 'onslaught';
        totals[p] += Math.round(ip / ITEMPOWER_DIVISOR);
      }
    }
    const perks = PARADIGMS.flatMap(p => {
      const tier = paradigmTier(totals[p]);
      if (tier < 1) return [];
      const def = PARADIGM_PERK[p];
      return [{
        paradigm: p, tier, threshold: PARADIGM_THRESHOLDS[tier - 1],
        key: def.key, label: def.label, unit: def.unit, value: def.perTier * tier,
      }];
    });
    let dominant: Paradigm = 'bulwark';
    for (const p of PARADIGMS) if (totals[p] > totals[dominant]) dominant = p;
    const anyPoints = PARADIGMS.some(p => totals[p] > 0);
    return {
      totals,
      dominant: anyPoints ? dominant : null,
      recommended_job: anyPoints ? PARADIGM_JOB[dominant] : null,
      perks,
    };
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
    // The engine catalog says 'Hands'; the equipment model's slot is
    // 'arms' (client, resonance math, canon). Items minted 'hands'
    // could never be equipped (Tim, 2026-07-13).
    const rawSlot = engineResult.slot.toLowerCase();
    const slotLower = rawSlot === 'hands' ? 'arms' : rawSlot;

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
