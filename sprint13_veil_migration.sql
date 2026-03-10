-- ============================================================
-- Sprint 13: Veil Tears Backend Persistence
-- Run against Railway PostgreSQL via psql or run_migration.js
-- ============================================================

-- Shard balance (one row per hero)
CREATE TABLE IF NOT EXISTS "veil_shards" (
  "shard_id"   TEXT        NOT NULL,
  "root_id"    TEXT        NOT NULL,
  "balance"    INTEGER     NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "veil_shards_pkey" PRIMARY KEY ("shard_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "veil_shards_root_id_key"
  ON "veil_shards"("root_id");

ALTER TABLE "veil_shards"
  DROP CONSTRAINT IF EXISTS "veil_shards_root_id_fkey";
ALTER TABLE "veil_shards"
  ADD CONSTRAINT "veil_shards_root_id_fkey"
  FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Individual battle records
CREATE TABLE IF NOT EXISTS "tear_encounters" (
  "encounter_id" TEXT           NOT NULL,
  "root_id"      TEXT           NOT NULL,
  "tear_type"    TEXT           NOT NULL,  -- minor | wander | dormant | double
  "tear_name"    TEXT           NOT NULL,
  "outcome"      TEXT           NOT NULL,  -- won | fled
  "shards"       INTEGER        NOT NULL DEFAULT 0,
  "lat"          DOUBLE PRECISION,
  "lon"          DOUBLE PRECISION,
  "created_at"   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tear_encounters_pkey" PRIMARY KEY ("encounter_id")
);

CREATE INDEX IF NOT EXISTS "tear_encounters_root_id_created_at_idx"
  ON "tear_encounters"("root_id", "created_at");

CREATE INDEX IF NOT EXISTS "tear_encounters_root_id_outcome_idx"
  ON "tear_encounters"("root_id", "outcome");

ALTER TABLE "tear_encounters"
  DROP CONSTRAINT IF EXISTS "tear_encounters_root_id_fkey";
ALTER TABLE "tear_encounters"
  ADD CONSTRAINT "tear_encounters_root_id_fkey"
  FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
