-- Sprint 31 / Tier 2 cosmetic evolution — Reliquary Mark
--
-- The Reliquary is canon-universal (every hero wears one — see
-- heroes-veritas-native:docs/canon/economy.md § 2). Mark is the
-- player's first cosmetic-as-identity hook on it: a small etched
-- glyph rendered on Profile + Sanctum surfaces.
--
-- NULL = unmarked silver (default). Valid mark slugs validated
-- server-side; the column is intentionally a plain TEXT so the
-- allowlist can evolve without a schema change as new Marks are
-- authored.

ALTER TABLE "root_identities"
    ADD COLUMN "relic_mark" TEXT;
