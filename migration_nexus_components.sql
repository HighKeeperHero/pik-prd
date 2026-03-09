-- Migration: Add Nexus balance + player components tables
-- Folder:  backend/prisma/migrations/20260310000000_add_nexus_and_components/
-- File:    migration.sql
--
-- Run manually on Railway DB if not using prisma migrate deploy:
--   railway run psql $DATABASE_URL < migration.sql

CREATE TABLE IF NOT EXISTS "player_nexus" (
  "nexus_id"   TEXT NOT NULL DEFAULT gen_random_uuid(),
  "root_id"    TEXT NOT NULL,
  "balance"    INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "player_nexus_pkey"       PRIMARY KEY ("nexus_id"),
  CONSTRAINT "player_nexus_root_id_key" UNIQUE ("root_id"),
  CONSTRAINT "player_nexus_root_id_fkey"
    FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "player_components" (
  "component_id"   TEXT NOT NULL DEFAULT gen_random_uuid(),
  "root_id"        TEXT NOT NULL,
  "component_type" TEXT NOT NULL,
  "quantity"       INTEGER NOT NULL DEFAULT 0,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "player_components_pkey"                PRIMARY KEY ("component_id"),
  CONSTRAINT "player_components_root_component_key"  UNIQUE ("root_id", "component_type"),
  CONSTRAINT "player_components_root_id_fkey"
    FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "player_nexus_root_id_idx"      ON "player_nexus"("root_id");
CREATE INDEX IF NOT EXISTS "player_components_root_id_idx" ON "player_components"("root_id");
