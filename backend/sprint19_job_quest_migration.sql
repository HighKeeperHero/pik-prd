-- ============================================================
-- Sprint 19 · Job Quest Schema Migration
-- Heroes' Veritas · PIK Backend
-- Run against Railway Postgres via sprint19_run_migration.js
-- ============================================================

-- 1. Add job progression columns to root_identities
ALTER TABLE root_identities
  ADD COLUMN IF NOT EXISTS job_level   INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS job_class   VARCHAR(50)  NULL;

-- 2. Create job_quests table
CREATE TABLE IF NOT EXISTS job_quests (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  root_id        TEXT          NOT NULL REFERENCES root_identities(root_id) ON DELETE CASCADE,
  job_class      VARCHAR(50)   NOT NULL,
  status         VARCHAR(20)   NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','active','completed','failed')),
  started_at     TIMESTAMPTZ   NULL,
  completed_at   TIMESTAMPTZ   NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_quests_root_id ON job_quests(root_id);
CREATE INDEX IF NOT EXISTS idx_job_quests_status  ON job_quests(status);

-- 3. Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'root_identities'
  AND column_name IN ('job_level', 'job_class')
ORDER BY column_name;

SELECT table_name FROM information_schema.tables
WHERE table_name = 'job_quests';
