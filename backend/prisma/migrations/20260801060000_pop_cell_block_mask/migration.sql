-- Placement mask for procedural tear generation.
--
-- A 16x16 bitmap (32 bytes, row-major from the cell's SW corner,
-- ~344 m per sub-cell) marking where a tear must NOT spawn. Written
-- incrementally by scripts/seed-water-mask.ts across ~988k cells, so
-- both columns are nullable: an unmasked cell generates exactly as it
-- did before. Degraded, never broken.
ALTER TABLE "pop_cell" ADD COLUMN "block_mask" BYTEA;
ALTER TABLE "pop_cell" ADD COLUMN "block_mask_src" TEXT;
