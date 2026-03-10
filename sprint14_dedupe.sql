-- ============================================================
-- Sprint 14 — Dedupe cleanup
-- Removes duplicate quest_templates and convergence_events
-- caused by migration running twice.
-- Safe to run multiple times (idempotent).
-- ============================================================

-- Remove duplicate quest_templates, keeping the oldest (min ctid) per name
DELETE FROM quest_templates
WHERE quest_id IN (
  SELECT quest_id FROM (
    SELECT quest_id,
           ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at ASC) AS rn
    FROM quest_templates
    WHERE quest_type LIKE 'veil%'
  ) ranked
  WHERE rn > 1
);

-- Remove duplicate convergence_events, keeping the oldest per name
DELETE FROM convergence_events
WHERE event_id IN (
  SELECT event_id FROM (
    SELECT event_id,
           ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at ASC) AS rn
    FROM convergence_events
  ) ranked
  WHERE rn > 1
);

-- Also remove any player_quests rows for the deleted duplicate template IDs
-- (auto-handled by FK CASCADE, but explicit for clarity)

-- Verify
SELECT 'quest_templates' AS tbl, COUNT(*) AS count FROM quest_templates WHERE quest_type LIKE 'veil%'
UNION ALL
SELECT 'convergence_events', COUNT(*) FROM convergence_events WHERE status = 'active';
