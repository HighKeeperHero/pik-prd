-- CreateTable: gear_items (reference catalog)
CREATE TABLE "gear_items" (
    "item_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "rarity_tier" TEXT NOT NULL DEFAULT 'common',
    "description" TEXT,
    "lore_text" TEXT,
    "icon" TEXT NOT NULL DEFAULT '⚔',
    "min_level" INTEGER NOT NULL DEFAULT 1,
    "modifiers" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "gear_items_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable: player_inventory (soulbound items)
CREATE TABLE "player_inventory" (
    "inventory_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "acquired_via" TEXT NOT NULL DEFAULT 'cache',
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_inventory_pkey" PRIMARY KEY ("inventory_id")
);

-- CreateTable: player_equipment (equipped slots)
CREATE TABLE "player_equipment" (
    "equipment_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "inventory_id" TEXT NOT NULL,
    "equipped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_equipment_pkey" PRIMARY KEY ("equipment_id")
);

-- CreateIndex
CREATE INDEX "gear_items_slot_idx" ON "gear_items"("slot");
CREATE INDEX "gear_items_rarity_tier_idx" ON "gear_items"("rarity_tier");
CREATE INDEX "player_inventory_root_id_idx" ON "player_inventory"("root_id");
CREATE UNIQUE INDEX "player_equipment_inventory_id_key" ON "player_equipment"("inventory_id");
CREATE UNIQUE INDEX "player_equipment_root_id_slot_key" ON "player_equipment"("root_id", "slot");

-- AddForeignKey
ALTER TABLE "player_inventory" ADD CONSTRAINT "player_inventory_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_inventory" ADD CONSTRAINT "player_inventory_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "gear_items"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "player_equipment" ADD CONSTRAINT "player_equipment_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_equipment" ADD CONSTRAINT "player_equipment_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "player_inventory"("inventory_id") ON DELETE RESTRICT ON UPDATE CASCADE;
