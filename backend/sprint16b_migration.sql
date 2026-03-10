-- ============================================================
-- Sprint 16b — Dual XP Curves: Hero vs Fate Account
-- ============================================================
-- Hero progression: flat 250 XP/level  (fate.xp_per_level)
-- Fate progression: flat 375 XP/level  (fate.account_xp_per_level)
--
-- Single-hero users are never disadvantaged: both curves use
-- total earned XP for their respective bar. Multi-hero accounts
-- accumulate Fate XP faster but need 1.5x more per level.
-- ============================================================

-- ── 1. Seed config keys ───────────────────────────────────────────────────────
INSERT INTO "config" (config_key, config_value, description)
VALUES
  ('fate.xp_per_level',         '250', 'XP needed per Hero level (flat, per-character)'),
  ('fate.account_xp_per_level', '375', 'XP needed per Fate Account level (flat, account-wide, steeper curve)')
ON CONFLICT (config_key) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      description  = EXCLUDED.description;

-- ── 2. Recalculate root_identities.hero_level from hero_xp ───────────────────
-- Uses flat formula: hero_level = FLOOR(hero_xp / 250) + 1
UPDATE "root_identities"
SET "hero_level" = FLOOR("hero_xp"::numeric / 250) + 1
WHERE "hero_xp" IS NOT NULL;

-- ── 3. Recalculate fate_accounts.fate_xp = SUM of all heroes' hero_xp ────────
UPDATE "fate_accounts" fa
SET "fate_xp" = sub.total_xp
FROM (
  SELECT "fate_account_id",
         SUM(COALESCE("hero_xp", "fate_xp", 0)) AS total_xp
  FROM   "root_identities"
  WHERE  "fate_account_id" IS NOT NULL
  GROUP  BY "fate_account_id"
) sub
WHERE fa."account_id" = sub."fate_account_id";

-- ── 4. Recalculate fate_accounts.fate_level from fate_xp (steeper curve) ─────
-- fate_level = FLOOR(fate_xp / 375) + 1
UPDATE "fate_accounts"
SET "fate_level" = FLOOR("fate_xp"::numeric / 375) + 1
WHERE "fate_xp" IS NOT NULL;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT 'Config keys' AS check, COUNT(*) AS count
  FROM config WHERE config_key IN ('fate.xp_per_level', 'fate.account_xp_per_level')
UNION ALL
SELECT 'Heroes with recalculated hero_level', COUNT(*)
  FROM root_identities WHERE hero_level IS NOT NULL
UNION ALL
SELECT 'Fate accounts with fate_level', COUNT(*)
  FROM fate_accounts WHERE fate_level IS NOT NULL;

-- Preview the expected values for test1@test.com
SELECT
  fa.email,
  fa.fate_xp   AS account_fate_xp,
  fa.fate_level AS account_fate_level,
  ri.hero_name,
  ri.hero_xp,
  ri.hero_level
FROM fate_accounts fa
JOIN root_identities ri ON ri.fate_account_id = fa.account_id
ORDER BY fa.email, ri.hero_xp DESC;
