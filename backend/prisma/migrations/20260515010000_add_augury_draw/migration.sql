-- Sprint 30 / Slice 5.2 — Augury Draw (daily 3-card weighted reveal)
--
-- Adds the one-per-day gate columns to sanctum_state, mirroring the
-- pattern used for Hearth + Veil Trial:
--   last_augury_date = 'YYYY-MM-DD' UTC of most recent draw (NULL = never)
--   total_auguries   = lifetime draws — for telemetry / titles
--
-- The cards themselves live in code (sanctum.service.ts DECK), not in
-- the DB. We don't persist drawn-card history for v1 — the cards are
-- ephemeral; only their rewards (Veil Essence + Fate XP grants +
-- optional cache rows) materialize.

ALTER TABLE "sanctum_state"
    ADD COLUMN "last_augury_date" TEXT,
    ADD COLUMN "total_auguries"   INTEGER NOT NULL DEFAULT 0;
