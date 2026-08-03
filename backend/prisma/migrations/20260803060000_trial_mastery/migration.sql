-- Permanent Arena mastery.
--
-- trial_best is season-keyed and resets every 8 weeks, so before this
-- the only trace of clearing a gauntlet vanished with the season —
-- which is why the Arena had no progression to speak of. Mastery is
-- the part that keeps: the highest tier ever earned per trial, never
-- reset, and what Arena Renown is summed from.
CREATE TABLE "trial_mastery" (
    "trial_mastery_id" TEXT NOT NULL,
    "root_id"     TEXT NOT NULL,
    "trial_id"    TEXT NOT NULL,
    "tier"        INTEGER NOT NULL,
    "best_score"  INTEGER NOT NULL,
    "best_ratio"  DOUBLE PRECISION NOT NULL,
    "achieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trial_mastery_pkey" PRIMARY KEY ("trial_mastery_id")
);

CREATE UNIQUE INDEX "trial_mastery_root_id_trial_id_key" ON "trial_mastery"("root_id", "trial_id");
CREATE INDEX "trial_mastery_root_id_idx" ON "trial_mastery"("root_id");

ALTER TABLE "trial_mastery" ADD CONSTRAINT "trial_mastery_root_id_fkey"
    FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;
