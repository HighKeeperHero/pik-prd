-- Sprint 17: source_type — differentiates physical venues from platform sources
-- Run via: $env:DATABASE_URL="postgresql://..."; node .\sprint17_run_migration.js

-- 1. Add source_type column to sources table
--    All existing rows (physical venues) default to 'venue'
ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'venue';

-- 2. Insert the reserved Codex platform source
--    This is used by training, quests, and other in-app activity systems.
--    api_key_hash is a placeholder — Codex calls are internal and don't use API keys.
INSERT INTO sources (source_id, source_name, api_key_hash, status, source_type)
VALUES (
  'codex-platform',
  'Codex (Platform)',
  'internal-no-key',
  'active',
  'platform'
)
ON CONFLICT (source_id) DO UPDATE
  SET source_type = 'platform',
      source_name = 'Codex (Platform)';

-- 3. Verify
SELECT source_id, source_name, source_type, status FROM sources ORDER BY created_at;
