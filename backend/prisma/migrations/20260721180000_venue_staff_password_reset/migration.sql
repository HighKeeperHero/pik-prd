-- HEP Phase 2 — venue staff password reset
--
-- Additive only. Three nullable columns on venue_staff; no existing row
-- changes meaning and no backfill is needed. A staff member with all
-- three NULL simply has no reset in flight, which is the correct initial
-- state for every row that exists today.

ALTER TABLE "venue_staff" ADD COLUMN "reset_hash" TEXT;
ALTER TABLE "venue_staff" ADD COLUMN "reset_expires" TIMESTAMP(3);
ALTER TABLE "venue_staff" ADD COLUMN "reset_requested_at" TIMESTAMP(3);

-- Unique so a token lookup is a point read and a collision is a write
-- error rather than a silent multi-match. NULLs do not collide in
-- Postgres, so every staff member without a reset in flight is fine.
CREATE UNIQUE INDEX "venue_staff_reset_hash_key" ON "venue_staff"("reset_hash");
