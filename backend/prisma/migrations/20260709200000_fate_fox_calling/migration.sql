-- Fate Fox Calling (2026-07-09, Tim's companion-creator design).
-- Extends the Sprint 31 thin bond (name + bondedAt) into the full
-- companion profile: archetype from the Calling's virtue scoring,
-- immutable physical traits, player customization, bond growth.
-- Additive + nullable: existing bonded foxes survive and can be
-- back-filled through a future re-Calling.

ALTER TABLE "fate_foxes"
  ADD COLUMN "archetype"          TEXT,
  ADD COLUMN "virtue_profile"     JSONB,
  ADD COLUMN "immutable_traits"   JSONB,
  ADD COLUMN "customization"      JSONB,
  ADD COLUMN "bond_level"         INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "personality_seed"   TEXT,
  ADD COLUMN "unlocked_cosmetics" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "revealed_at"        TIMESTAMP(3);
