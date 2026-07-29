-- Phase 3a: Job progression — a JobXP track independent of Fate XP
-- (canon §13.4). Additive and defaulted, so deploying changes nothing
-- until a hero picks a Job (heroClass, set at L40) and starts earning
-- JobXP. Job Level and JobRank are derived from this column at read
-- time; no rank/level column is stored.

ALTER TABLE "root_identities" ADD COLUMN "job_xp" INTEGER NOT NULL DEFAULT 0;
