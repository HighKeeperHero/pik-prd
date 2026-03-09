// src/workshop/workshop.service.ts
// ============================================================
// PIK — Workshop / Forge Service
// Validates recipe, deducts Nexus + components, delivers item.
//
// item_id values map to real rows in gear_items catalog.
// Recipe list matches DEFAULT_RECIPES in VaultScreen.tsx.
// ============================================================
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { GearService } from '../gear/gear.service';

export interface RecipeCost {
  component_id: string;
  quantity:     number;
}

interface RecipeDef {
  recipe_id:   string;
  name:        string;
  slot:        string;
  rarity:      string;
  icon:        string;
  description: string;
  nexus_cost:  number;
  components:  RecipeCost[];
  item_id:     string;  // real gear_items catalog id
}

// ── Recipe registry ──────────────────────────────────────────
// Keep in sync with DEFAULT_RECIPES in VaultScreen.tsx.
const RECIPES: RecipeDef[] = [
  {
    recipe_id:   'craft_runed_sigil',
    name:        'Runed Sigil',
    slot:        'rune', rarity: 'uncommon', icon: '🔮',
    description: 'A carved rune inscribed with faint ward-marks.',
    nexus_cost:  30,
    components:  [{ component_id: 'salvage_shard', quantity: 2 }, { component_id: 'refined_core', quantity: 1 }],
    item_id:     'rune_ember_sigil',
  },
  {
    recipe_id:   'craft_ironveil_arms',
    name:        'Ironveil Gauntlets',
    slot:        'arms', rarity: 'uncommon', icon: '🧤',
    description: 'Layered iron plating over Veil-woven cloth.',
    nexus_cost:  20,
    components:  [{ component_id: 'salvage_shard', quantity: 3 }],
    item_id:     'arms_ironbound_gauntlets',
  },
  {
    recipe_id:   'craft_veilrunner_legs',
    name:        'Veilrunner Boots',
    slot:        'legs', rarity: 'rare', icon: '👢',
    description: 'Shadowstep soles from the Veil Marches.',
    nexus_cost:  60,
    components:  [{ component_id: 'refined_core', quantity: 2 }],
    item_id:     'legs_voidwalker_treads',
  },
  {
    recipe_id:   'craft_embercrest_helm',
    name:        'Embercrest Helm',
    slot:        'helm', rarity: 'rare', icon: '🪖',
    description: 'Forged from cinderwall ore.',
    nexus_cost:  80,
    components:  [{ component_id: 'refined_core', quantity: 2 }, { component_id: 'arcane_essence', quantity: 1 }],
    item_id:     'helm_crown_bleeding_moon',
  },
  {
    recipe_id:   'craft_shadowweave_chest',
    name:        'Shadowweave Chest',
    slot:        'chest', rarity: 'epic', icon: '🛡',
    description: 'Woven from threads of concentrated darkness.',
    nexus_cost:  150,
    components:  [{ component_id: 'arcane_essence', quantity: 3 }],
    item_id:     'chest_veilshroud',
  },
  {
    recipe_id:   'craft_fatebreaker',
    name:        'Fatebreaker',
    slot:        'weapon', rarity: 'epic', icon: '⚔',
    description: 'A blade tempered in the Veil.',
    nexus_cost:  200,
    components:  [{ component_id: 'arcane_essence', quantity: 2 }, { component_id: 'void_fragment', quantity: 1 }],
    item_id:     'weapon_veilcleaver',
  },
];

const RECIPE_MAP = new Map(RECIPES.map(r => [r.recipe_id, r]));

@Injectable()
export class WorkshopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gear:   GearService,
  ) {}

  // GET /api/workshop/recipes
  getRecipes() {
    // Omit internal item_id from client response
    return RECIPES.map(({ item_id: _unused, ...rest }) => rest);
  }

  // POST /api/users/:rootId/workshop/craft
  async craftItem(rootId: string, recipeId: string) {
    const recipe = RECIPE_MAP.get(recipeId);
    if (!recipe) throw new NotFoundException(`Unknown recipe: ${recipeId}`);

    // 1. Check Nexus balance
    const nexusRow = await this.prisma.playerNexus.findUnique({ where: { rootId } });
    const balance  = nexusRow?.balance ?? 0;
    if (balance < recipe.nexus_cost) {
      throw new BadRequestException(
        `Insufficient Nexus. Need ${recipe.nexus_cost}◈, have ${balance}◈.`
      );
    }

    // 2. Check all components
    const compRows = await this.prisma.playerComponents.findMany({ where: { rootId } });
    const compMap  = new Map(compRows.map(c => [c.componentType, c.quantity]));
    for (const cost of recipe.components) {
      if ((compMap.get(cost.component_id) ?? 0) < cost.quantity) {
        throw new BadRequestException(
          `Insufficient ${cost.component_id}. Need ${cost.quantity}, have ${compMap.get(cost.component_id) ?? 0}.`
        );
      }
    }

    // 3. Deduct Nexus
    const updatedNexus = await this.prisma.playerNexus.update({
      where: { rootId },
      data:  { balance: { decrement: recipe.nexus_cost } },
    });

    // 4. Deduct components
    for (const cost of recipe.components) {
      await this.prisma.playerComponents.update({
        where: { rootId_componentType: { rootId, componentType: cost.component_id } },
        data:  { quantity: { decrement: cost.quantity } },
      });
    }

    // 5. Create inventory entry via GearService (handles events + formatting)
    const gearItem = await this.gear.addToInventory({
      rootId,
      itemId:      recipe.item_id,
      acquiredVia: 'crafted',
    });

    // 6. Return updated component balances
    const allComponents = await this.prisma.playerComponents.findMany({ where: { rootId } });
    const newComponents: Record<string, number> = {};
    allComponents.forEach(c => { newComponents[c.componentType] = c.quantity; });

    return {
      gear_item:         gearItem,
      nexus_spent:       recipe.nexus_cost,
      new_nexus_balance: updatedNexus.balance,
      components_spent:  recipe.components,
      new_components:    newComponents,
    };
  }
}
