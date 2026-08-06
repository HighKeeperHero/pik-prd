-- The Arena becomes a restoration track like the other wings.
-- Committed level, server-authoritative, gated on progress points
-- (physical practice + trial mastery) and cross-wing prerequisites.
ALTER TABLE "sanctum_state" ADD COLUMN "arena_level" INTEGER NOT NULL DEFAULT 1;
