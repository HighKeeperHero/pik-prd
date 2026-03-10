-- ============================================================
-- Sprint 15 — Three bug fixes
-- Run: $env:DATABASE_URL="postgresql://..."; node .\run_migration.js
-- ============================================================

-- ── Fix 1: Seed loot_table for all veil cache types ───────────────────────
-- Columns: loot_table_id, cache_type, reward_type, reward_value,
--          display_name, weight, rarity_tier, min_level

INSERT INTO "loot_table"
  ("loot_table_id","cache_type","reward_type","reward_value","display_name","weight","rarity_tier","min_level")
VALUES
  -- veil_minor (common — 15% drop chance)
  (gen_random_uuid(),'veil_minor','xp','75','Residual Energy',50,'common',1),
  (gen_random_uuid(),'veil_minor','component','veil_fragment','Veil Fragment',35,'common',1),
  (gen_random_uuid(),'veil_minor','nexus','30','Minor Nexus Cache',15,'common',1),

  -- veil_shade (uncommon — 25% drop chance)
  (gen_random_uuid(),'veil_shade','xp','150','Shade Resonance',40,'uncommon',1),
  (gen_random_uuid(),'veil_shade','component','shade_essence','Shade Essence',35,'uncommon',1),
  (gen_random_uuid(),'veil_shade','nexus','60','Shade Nexus Cache',15,'uncommon',1),
  (gen_random_uuid(),'veil_shade','component','veil_fragment','Veil Fragment',10,'common',1),

  -- veil_dormant (rare — 40% drop chance)
  (gen_random_uuid(),'veil_dormant','xp','300','Rift Energy',35,'rare',3),
  (gen_random_uuid(),'veil_dormant','component','rift_shard','Rift Shard',30,'rare',3),
  (gen_random_uuid(),'veil_dormant','nexus','120','Dormant Nexus Cache',20,'rare',3),
  (gen_random_uuid(),'veil_dormant','component','shade_essence','Shade Essence',10,'uncommon',1),
  (gen_random_uuid(),'veil_dormant','xp','500','Deep Rift Resonance',5,'epic',5),

  -- veil_double (epic — 60% drop chance)
  (gen_random_uuid(),'veil_double','xp','600','Twin Rift Energy',30,'epic',5),
  (gen_random_uuid(),'veil_double','component','twin_rift_core','Twin Rift Core',25,'epic',5),
  (gen_random_uuid(),'veil_double','nexus','250','Double Rift Nexus',20,'epic',5),
  (gen_random_uuid(),'veil_double','component','rift_shard','Rift Shard',15,'rare',3),
  (gen_random_uuid(),'veil_double','xp','1000','Convergence Burst',10,'legendary',8),

  -- veil_intro (tutorial cache — First Seal quest reward)
  (gen_random_uuid(),'veil_intro','xp','50','Veil Essence',60,'common',1),
  (gen_random_uuid(),'veil_intro','component','veil_fragment','Veil Fragment',30,'common',1),
  (gen_random_uuid(),'veil_intro','nexus','25','Nexus Coin Cache',10,'common',1),

  -- veil_unbroken (rare — Unbroken quest reward)
  (gen_random_uuid(),'veil_unbroken','xp','400','Unbroken Will',40,'rare',4),
  (gen_random_uuid(),'veil_unbroken','component','rift_shard','Rift Shard',35,'rare',3),
  (gen_random_uuid(),'veil_unbroken','nexus','150','Unbroken Nexus Cache',25,'rare',4),

  -- veil_strider (rare — Veil Strider quest reward)
  (gen_random_uuid(),'veil_strider','xp','600','Strider Resonance',40,'rare',3),
  (gen_random_uuid(),'veil_strider','component','shade_essence','Shade Essence',35,'uncommon',1),
  (gen_random_uuid(),'veil_strider','nexus','200','Strider Nexus Cache',25,'rare',3),

  -- veil_veteran (epic — The Long Watch quest reward)
  (gen_random_uuid(),'veil_veteran','xp','1500','Veteran Resonance',35,'epic',6),
  (gen_random_uuid(),'veil_veteran','component','twin_rift_core','Twin Rift Core',30,'epic',5),
  (gen_random_uuid(),'veil_veteran','nexus','500','Veteran Nexus Cache',25,'epic',6),
  (gen_random_uuid(),'veil_veteran','xp','2500','Elder Veil Resonance',10,'legendary',8),

  -- veil_convergence (convergence event bonus cache)
  (gen_random_uuid(),'veil_convergence','xp','200','Convergence Energy',35,'uncommon',1),
  (gen_random_uuid(),'veil_convergence','component','rift_shard','Rift Shard',30,'rare',3),
  (gen_random_uuid(),'veil_convergence','nexus','100','Convergence Nexus',20,'uncommon',1),
  (gen_random_uuid(),'veil_convergence','component','twin_rift_core','Twin Rift Core',15,'epic',5)

ON CONFLICT DO NOTHING;

-- ── Fix 2: Add hero_xp + hero_level to root_identities ───────────────────
ALTER TABLE "root_identities"
  ADD COLUMN IF NOT EXISTS "hero_xp"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "hero_level" INTEGER NOT NULL DEFAULT 1;

-- Seed hero_xp/hero_level from existing fate_xp/fate_level
-- (veil encounters will now credit hero_xp, not fate_xp)
UPDATE "root_identities"
SET "hero_xp"    = "fate_xp",
    "hero_level" = "fate_level"
WHERE "hero_xp" = 0 AND "hero_level" = 1;

-- ── Fix 3: Add fate_xp + fate_level to fate_accounts ─────────────────────
ALTER TABLE "fate_accounts"
  ADD COLUMN IF NOT EXISTS "fate_xp"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "fate_level" INTEGER NOT NULL DEFAULT 1;

-- Seed fate_accounts.fate_xp with max of its heroes' current fate_xp
UPDATE "fate_accounts" fa
SET "fate_xp"    = sub.max_xp,
    "fate_level" = sub.max_level
FROM (
  SELECT "fate_account_id",
         MAX("fate_xp")    AS max_xp,
         MAX("fate_level") AS max_level
  FROM   "root_identities"
  WHERE  "fate_account_id" IS NOT NULL
  GROUP  BY "fate_account_id"
) sub
WHERE fa."account_id" = sub."fate_account_id";

-- ── Verify ────────────────────────────────────────────────────────────────
SELECT 'veil loot_table entries' AS check, COUNT(*) AS count
  FROM loot_table WHERE cache_type LIKE 'veil%'
UNION ALL
SELECT 'root_identities with hero_level col', COUNT(*)
  FROM root_identities WHERE hero_level IS NOT NULL
UNION ALL
SELECT 'fate_accounts with fate_level col', COUNT(*)
  FROM fate_accounts WHERE fate_level IS NOT NULL;
