-- Phase 2 Arc B slice 4 — procedural, population-weighted Veil tears.
-- Creates the two empty tables that back on-the-fly tear generation:
--   * pop_cell  — precomputed population grid (seeded separately by
--                 scripts/seed-pop-grid.ts; NOT loaded here, too large
--                 for `migrate deploy`).
--   * tear_seal — seal overlay for generated tears (cooldown-gated).
-- world_tears is intentionally left intact as the rollout fallback.

-- CreateTable
CREATE TABLE "pop_cell" (
    "cell_key" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "region_label" TEXT,
    "center_lat" DOUBLE PRECISION NOT NULL,
    "center_lon" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "pop_cell_pkey" PRIMARY KEY ("cell_key")
);

-- CreateTable
CREATE TABLE "tear_seal" (
    "tear_id" TEXT NOT NULL,
    "cell_key" TEXT NOT NULL,
    "sealed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sealed_by_root_id" TEXT,
    "cooldown_until" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tear_seal_pkey" PRIMARY KEY ("tear_id")
);

-- CreateIndex
CREATE INDEX "tear_seal_cooldown_until_idx" ON "tear_seal"("cooldown_until");

-- CreateIndex
CREATE INDEX "tear_seal_cell_key_idx" ON "tear_seal"("cell_key");
