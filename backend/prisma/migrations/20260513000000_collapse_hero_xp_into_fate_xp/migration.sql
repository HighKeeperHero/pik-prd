-- Sprint 28 — collapse hero_xp / hero_level into fate_xp / fate_level.
--
-- Implements the schema rename sequenced by
-- heroes-veritas-native:docs/canon/progression.md § 12.
--
-- Under the four-axis canon (Fate / Resonance / Sanctum Integrity /
-- Renown), there is exactly ONE account-wide progression number:
-- Fate XP. The pre-Sprint-28 schema split it across two columns
-- per hero (hero_xp + fate_xp) and a third on fate_accounts. After
-- this migration:
--
--   * root_identities.fate_xp / fate_level are the canonical store
--   * root_identities.hero_xp / hero_level are dropped
--   * fate_accounts.fate_xp / fate_level are dropped (single-hero
--     AAA pivot makes the account-level aggregation vestigial)
--
-- Data preservation: per row, take MAX(fate_xp, hero_xp). For all
-- accounts since the Sprint 15 introduction of hero_xp, the two
-- columns have been mirrored or hero_xp > fate_xp (since hero_xp
-- was the actively-granted column). MAX is safe across both eras.

-- Preserve the greater of the two columns into the canonical fate_*
UPDATE "root_identities"
   SET "fate_xp"    = GREATEST("fate_xp",    "hero_xp"),
       "fate_level" = GREATEST("fate_level", "hero_level");

-- Drop the per-hero duplicate progression fields
ALTER TABLE "root_identities" DROP COLUMN "hero_xp";
ALTER TABLE "root_identities" DROP COLUMN "hero_level";

-- Drop the unused account-wide Fate mirror. Under single-hero-per-
-- account the per-hero number IS the account-wide number; the sum-
-- across-heroes aggregation is no longer meaningful.
ALTER TABLE "fate_accounts" DROP COLUMN "fate_xp";
ALTER TABLE "fate_accounts" DROP COLUMN "fate_level";
