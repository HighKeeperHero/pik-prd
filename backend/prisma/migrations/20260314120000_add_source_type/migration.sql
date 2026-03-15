-- Migration: 20260314120000_add_source_type
-- Sprint 21.7 — Add source_type column to sources table
-- Distinguishes physical venue sources from in-app platform sources
-- Required for correct Best Venue calculations on HomeScreen

ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "source_type" TEXT NOT NULL DEFAULT 'venue';
