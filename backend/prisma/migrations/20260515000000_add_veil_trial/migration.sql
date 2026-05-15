-- Sprint 30 / Slice 5.1 — Veil Trial (daily 60s snackable minigame)
--
-- Adds three columns to sanctum_state tracking the player's daily
-- Veil Trial state. Mirrors the lastHearthClaim pattern:
--   last_trial_complete = 'YYYY-MM-DD' UTC date of most recent run
--                         (NULL = never run)
--   total_trials        = lifetime count for telemetry / titles
--   best_trial_score    = personal best for the Sanctum surface
--
-- One row per hero (same key as sanctum_state). Trial reward grants
-- Veil Essence atomically alongside these column updates.

ALTER TABLE "sanctum_state"
    ADD COLUMN "last_trial_complete" TEXT,
    ADD COLUMN "total_trials"        INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "best_trial_score"    INTEGER NOT NULL DEFAULT 0;
