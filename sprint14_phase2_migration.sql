-- ============================================================
-- Phase 2: Quests + Convergence Events + Loot Caches
-- Run after sprint13_veil_migration.sql
-- ============================================================

-- ── Convergence Events ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "convergence_events" (
  "event_id"          TEXT          NOT NULL,
  "name"              TEXT          NOT NULL,
  "description"       TEXT,
  "flavor_text"       TEXT,
  "affected_tiers"    TEXT[]        NOT NULL DEFAULT '{}',
  "shard_multiplier"  DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "cache_bonus"       BOOLEAN       NOT NULL DEFAULT FALSE,
  "starts_at"         TIMESTAMP(3)  NOT NULL,
  "ends_at"           TIMESTAMP(3)  NOT NULL,
  "status"            TEXT          NOT NULL DEFAULT 'active',
  "created_at"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "convergence_events_pkey" PRIMARY KEY ("event_id")
);

CREATE INDEX IF NOT EXISTS "convergence_events_status_ends_at_idx"
  ON "convergence_events"("status", "ends_at");

-- ── Seed: Veil Quest Templates ─────────────────────────────────────────────
-- questType prefix 'veil_' marks these as Veil-system quests.
-- objectives JSON: [{ "type": "seal_any"|"seal_type", "tearType"?: string, "target": number }]
-- rewards JSON:    { "xp": number, "cache": { "cacheType": string, "rarity": string } | null }

INSERT INTO "quest_templates"
  ("quest_id", "name", "description", "quest_type", "objectives", "rewards",
   "min_level", "sort_order", "status", "created_at")
VALUES
  -- 1. Tutorial — first blood
  (
    gen_random_uuid(),
    'The First Seal',
    'The Veil bleeds into your world. Seal your first tear and prove yourself worthy.',
    'veil_intro',
    '[{"type":"seal_any","target":1}]',
    '{"xp":75,"cache":{"cacheType":"veil_intro","rarity":"common"}}',
    1, 10, 'active', NOW()
  ),
  -- 2. Minor threat grind
  (
    gen_random_uuid(),
    'Warden of the Threshold',
    'Minor Threats swarm the outskirts. Seal five before they multiply.',
    'veil_seal',
    '[{"type":"seal_type","tearType":"minor","target":5}]',
    '{"xp":200,"cache":{"cacheType":"veil_minor","rarity":"uncommon"}}',
    1, 20, 'active', NOW()
  ),
  -- 3. Wandering shade
  (
    gen_random_uuid(),
    'Ghost Hunter',
    'Wandering Shades drift between worlds. Hunt down three and send them back.',
    'veil_seal',
    '[{"type":"seal_type","tearType":"wander","target":3}]',
    '{"xp":350,"cache":{"cacheType":"veil_shade","rarity":"rare"}}',
    3, 30, 'active', NOW()
  ),
  -- 4. Dormant rift
  (
    gen_random_uuid(),
    'Rift Closer',
    'A Dormant Rift festers at the edge of perception. Close it before it fully opens.',
    'veil_seal',
    '[{"type":"seal_type","tearType":"dormant","target":1}]',
    '{"xp":500,"cache":{"cacheType":"veil_dormant","rarity":"rare"}}',
    5, 40, 'active', NOW()
  ),
  -- 5. Double rift
  (
    gen_random_uuid(),
    'Into the Storm',
    'A Double Rift Event tears reality in two. Only the fearless survive.',
    'veil_seal',
    '[{"type":"seal_type","tearType":"double","target":1}]',
    '{"xp":900,"cache":{"cacheType":"veil_double","rarity":"epic"}}',
    8, 50, 'active', NOW()
  ),
  -- 6. Volume — 10 total
  (
    gen_random_uuid(),
    'Veil Strider',
    'Ten tears sealed. The Veil recognises your footsteps now.',
    'veil_mastery',
    '[{"type":"seal_any","target":10}]',
    '{"xp":600,"cache":{"cacheType":"veil_strider","rarity":"rare"}}',
    3, 60, 'active', NOW()
  ),
  -- 7. Volume — 25 total
  (
    gen_random_uuid(),
    'The Long Watch',
    'Twenty-five tears sealed. You are the bulwark against the dark.',
    'veil_mastery',
    '[{"type":"seal_any","target":25}]',
    '{"xp":1500,"cache":{"cacheType":"veil_veteran","rarity":"epic"}}',
    6, 70, 'active', NOW()
  ),
  -- 8. No retreats — 5 wins without fleeing (tracked cumulatively)
  (
    gen_random_uuid(),
    'Unbroken',
    'Seal five tears without retreating. Stand your ground.',
    'veil_mastery',
    '[{"type":"win_streak","target":5}]',
    '{"xp":400,"cache":{"cacheType":"veil_unbroken","rarity":"rare"}}',
    4, 80, 'active', NOW()
  )
ON CONFLICT DO NOTHING;

-- ── Seed: First Convergence Event (starts now, runs 7 days) ───────────────
INSERT INTO "convergence_events"
  ("event_id", "name", "description", "flavor_text",
   "affected_tiers", "shard_multiplier", "cache_bonus",
   "starts_at", "ends_at", "status")
VALUES (
  gen_random_uuid(),
  'The Thinning',
  'The boundary between worlds grows dangerously thin. All tears yield greater rewards.',
  'Whispers from beyond the Veil grow louder. The shards pulse with renewed energy.',
  ARRAY['minor','wander','dormant','double'],
  1.5,
  TRUE,
  NOW(),
  NOW() + INTERVAL '7 days',
  'active'
)
ON CONFLICT DO NOTHING;
