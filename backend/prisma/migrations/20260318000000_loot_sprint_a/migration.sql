-- ============================================================
-- Migration: 20260318000000_loot_sprint_a
-- Sprint Loot-A: Phase 1 Base Item Library + Phase 4 Pity Counters
-- ============================================================

-- Phase 1: Base Item Library table
-- Stores the canonical Elysendar item templates (8 bands × 6 slots)
-- These are templates, not instanced items. Instanced gear lives in GearItem.
CREATE TABLE IF NOT EXISTS "base_items" (
  "id"             TEXT    NOT NULL PRIMARY KEY,
  "name"           TEXT    NOT NULL,
  "slot"           TEXT    NOT NULL,
  "level_min"      INTEGER NOT NULL,
  "level_max"      INTEGER NOT NULL,
  "level_band"     TEXT    NOT NULL,
  "region_theme"   TEXT    NOT NULL,
  "item_family"    TEXT    NOT NULL,
  "rarity_allowed" TEXT[]  NOT NULL,
  "pre40_only"     BOOLEAN NOT NULL DEFAULT true,
  "lore_tags"      TEXT[]  NOT NULL DEFAULT '{}',
  "created_at"     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "base_items_slot_band_idx"
  ON "base_items" ("slot", "level_band");

CREATE INDEX IF NOT EXISTS "base_items_region_idx"
  ON "base_items" ("region_theme");

-- Phase 4: Pity counter tracking per hero
-- Tracks how many eligible rolls have passed without an epic/legendary drop
-- Counters reset when the target rarity is obtained
CREATE TABLE IF NOT EXISTS "pity_counters" (
  "id"         TEXT    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "root_id"    TEXT    NOT NULL REFERENCES "root_identities"("id") ON DELETE CASCADE,
  "pity_type"  TEXT    NOT NULL,  -- 'epic_pity' | 'legendary_pity'
  "counter"    INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE ("root_id", "pity_type")
);

CREATE INDEX IF NOT EXISTS "pity_counters_root_idx"
  ON "pity_counters" ("root_id");
