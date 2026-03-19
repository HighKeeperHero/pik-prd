-- ============================================================
-- Migration: 20260318120000_loot_sprint_b
-- Loot Sprint B: GearItem Phase 1+2A columns
-- BaseItem and PityCounter tables already created in Sprint A
-- migration — this migration only adds columns to gear_items.
-- ============================================================

-- Phase 1 + 2A: New columns on gear_items
ALTER TABLE "gear_items" ADD COLUMN IF NOT EXISTS "level_band"   TEXT;
ALTER TABLE "gear_items" ADD COLUMN IF NOT EXISTS "region_theme" TEXT;
ALTER TABLE "gear_items" ADD COLUMN IF NOT EXISTS "item_family"  TEXT;
ALTER TABLE "gear_items" ADD COLUMN IF NOT EXISTS "lore_tags"    TEXT[] DEFAULT '{}';
ALTER TABLE "gear_items" ADD COLUMN IF NOT EXISTS "item_power"   INTEGER;
ALTER TABLE "gear_items" ADD COLUMN IF NOT EXISTS "slot_budget"  INTEGER;
ALTER TABLE "gear_items" ADD COLUMN IF NOT EXISTS "base_item_id" TEXT;

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS "gear_items_level_band_idx"   ON "gear_items" ("level_band");
CREATE INDEX IF NOT EXISTS "gear_items_region_theme_idx" ON "gear_items" ("region_theme");
