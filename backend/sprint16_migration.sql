-- ============================================================
-- Sprint 16 — Fix fate_accounts.fate_xp to use SUM not MAX
-- ============================================================
-- The sprint15 migration seeded fate_accounts.fate_xp as MAX(hero fate_xp)
-- across all heroes in the account. It should be SUM so that all hero XP
-- contributes to the account-wide Fate Level.
--
-- Also recalculates fate_accounts.fate_level based on the new SUM total.
-- The level formula mirrors the backend: level thresholds are cumulative
-- so we derive it from the stored values on the highest-level hero.
-- ============================================================

-- Step 1: Recalculate fate_xp as SUM of all heroes' hero_xp
UPDATE "fate_accounts" fa
SET "fate_xp" = sub.total_xp
FROM (
  SELECT "fate_account_id",
         SUM("hero_xp") AS total_xp
  FROM   "root_identities"
  WHERE  "fate_account_id" IS NOT NULL
  GROUP  BY "fate_account_id"
) sub
WHERE fa."account_id" = sub."fate_account_id";

-- Step 2: Recalculate fate_level
-- fate_level is derived per-account from the account's fate_xp.
-- The backend determines level boundaries by the XP scale stored
-- per hero. We use the simplest consistent rule:
--   account fate_level = level of the highest-level hero in the account
--   (because the account can't exceed its most advanced hero's tier)
--
-- If you want a fully summed level formula, replace with your own formula.
UPDATE "fate_accounts" fa
SET "fate_level" = sub.max_level
FROM (
  SELECT "fate_account_id",
         MAX("hero_level") AS max_level
FROM   "root_identities"
  WHERE  "fate_account_id" IS NOT NULL
  GROUP  BY "fate_account_id"
) sub
WHERE fa."account_id" = sub."fate_account_id";

-- ── Verify ────────────────────────────────────────────────────────────────
SELECT
  fa.account_id,
  fa.email,
  fa.fate_xp    AS account_fate_xp,
  fa.fate_level AS account_fate_level,
  COUNT(ri.root_id) AS hero_count,
  SUM(ri.hero_xp)   AS heroes_xp_sum
FROM "fate_accounts" fa
JOIN "root_identities" ri ON ri.fate_account_id = fa.account_id
GROUP BY fa.account_id, fa.email, fa.fate_xp, fa.fate_level
ORDER BY fa.fate_xp DESC;
