-- ============================================================
-- Migration: 20260319000000_add_hero_class
-- Sprint 22.C: Job Class selection field on root_identities
-- Nullable — null until hero reaches level 40 and selects a class
-- ============================================================

ALTER TABLE "root_identities" ADD COLUMN IF NOT EXISTS "hero_class" TEXT;
