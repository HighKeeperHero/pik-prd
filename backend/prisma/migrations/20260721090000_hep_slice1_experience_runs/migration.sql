-- HEP Phase 2 Slice 1 — venue experience runs
--
-- Additive only. Five new tables; no existing table is altered, no column is
-- dropped or retyped. Existing Codex behavior is untouched.
--
-- Note on run_participants: the unique constraint is (run_id, root_id) with a
-- NULLABLE root_id. Postgres treats NULLs as distinct in unique indexes, so a
-- run may hold many guest seats while still preventing the same hero from
-- occupying two seats in one run. That is intentional, not an oversight.

CREATE TABLE "experiences" (
    "experience_id"        TEXT NOT NULL,
    "slug"                 TEXT NOT NULL,
    "name"                 TEXT NOT NULL,
    "description"          TEXT,
    "version"              INTEGER NOT NULL DEFAULT 1,
    "min_players"          INTEGER NOT NULL DEFAULT 1,
    "max_players"          INTEGER NOT NULL DEFAULT 6,
    "target_duration_sec"  INTEGER NOT NULL DEFAULT 1200,
    "rewards"              JSONB NOT NULL DEFAULT '{}',
    "status"               TEXT NOT NULL DEFAULT 'active',
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiences_pkey" PRIMARY KEY ("experience_id")
);

CREATE UNIQUE INDEX "experiences_slug_key" ON "experiences"("slug");

CREATE TABLE "venue_experiences" (
    "venue_experience_id" TEXT NOT NULL,
    "source_id"           TEXT NOT NULL,
    "experience_id"       TEXT NOT NULL,
    "enabled"             BOOLEAN NOT NULL DEFAULT true,
    "available_from"      TIMESTAMP(3),
    "available_until"     TIMESTAMP(3),
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_experiences_pkey" PRIMARY KEY ("venue_experience_id")
);

CREATE UNIQUE INDEX "venue_experiences_source_id_experience_id_key"
  ON "venue_experiences"("source_id", "experience_id");
CREATE INDEX "venue_experiences_source_id_enabled_idx"
  ON "venue_experiences"("source_id", "enabled");

CREATE TABLE "experience_runs" (
    "run_id"             TEXT NOT NULL,
    "source_id"          TEXT NOT NULL,
    "experience_id"      TEXT NOT NULL,
    "experience_version" INTEGER NOT NULL,
    "partner_run_key"    TEXT NOT NULL,
    "status"             TEXT NOT NULL DEFAULT 'active',
    "started_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_heartbeat"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at"           TIMESTAMP(3),
    "duration_sec"       INTEGER,
    "milestones_hit"     INTEGER NOT NULL DEFAULT 0,
    "payout_multiplier"  DOUBLE PRECISION,
    "failure_reason"     TEXT,
    "outcome"            JSONB,

    CONSTRAINT "experience_runs_pkey" PRIMARY KEY ("run_id")
);

CREATE UNIQUE INDEX "experience_runs_source_id_partner_run_key_key"
  ON "experience_runs"("source_id", "partner_run_key");
CREATE INDEX "experience_runs_source_id_status_idx"
  ON "experience_runs"("source_id", "status");
CREATE INDEX "experience_runs_experience_id_started_at_idx"
  ON "experience_runs"("experience_id", "started_at");
CREATE INDEX "experience_runs_status_last_heartbeat_idx"
  ON "experience_runs"("status", "last_heartbeat");

CREATE TABLE "run_participants" (
    "participant_id" TEXT NOT NULL,
    "run_id"         TEXT NOT NULL,
    "root_id"        TEXT,
    "guest_label"    TEXT,
    "session_id"     TEXT,
    "role"           TEXT,
    "rewards"        JSONB NOT NULL DEFAULT '{}',
    "reward_state"   TEXT NOT NULL DEFAULT 'pending',
    "applied_at"     TIMESTAMP(3),
    "joined_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_participants_pkey" PRIMARY KEY ("participant_id")
);

CREATE UNIQUE INDEX "run_participants_run_id_root_id_key"
  ON "run_participants"("run_id", "root_id");
CREATE INDEX "run_participants_run_id_idx"  ON "run_participants"("run_id");
CREATE INDEX "run_participants_root_id_idx" ON "run_participants"("root_id");

CREATE TABLE "guest_claims" (
    "claim_id"           TEXT NOT NULL,
    "participant_id"     TEXT NOT NULL,
    "token_hash"         TEXT NOT NULL,
    "source_id"          TEXT NOT NULL,
    "status"             TEXT NOT NULL DEFAULT 'pending',
    "expires_at"         TIMESTAMP(3) NOT NULL,
    "claimed_at"         TIMESTAMP(3),
    "claimed_by_root_id" TEXT,
    "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_claims_pkey" PRIMARY KEY ("claim_id")
);

CREATE UNIQUE INDEX "guest_claims_participant_id_key" ON "guest_claims"("participant_id");
CREATE UNIQUE INDEX "guest_claims_token_hash_key"     ON "guest_claims"("token_hash");
CREATE INDEX "guest_claims_source_id_status_idx"      ON "guest_claims"("source_id", "status");
CREATE INDEX "guest_claims_status_expires_at_idx"     ON "guest_claims"("status", "expires_at");

-- Foreign keys
ALTER TABLE "venue_experiences" ADD CONSTRAINT "venue_experiences_source_id_fkey"
  FOREIGN KEY ("source_id") REFERENCES "sources"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_experiences" ADD CONSTRAINT "venue_experiences_experience_id_fkey"
  FOREIGN KEY ("experience_id") REFERENCES "experiences"("experience_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "experience_runs" ADD CONSTRAINT "experience_runs_source_id_fkey"
  FOREIGN KEY ("source_id") REFERENCES "sources"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "experience_runs" ADD CONSTRAINT "experience_runs_experience_id_fkey"
  FOREIGN KEY ("experience_id") REFERENCES "experiences"("experience_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "run_participants" ADD CONSTRAINT "run_participants_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "experience_runs"("run_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "run_participants" ADD CONSTRAINT "run_participants_root_id_fkey"
  FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guest_claims" ADD CONSTRAINT "guest_claims_participant_id_fkey"
  FOREIGN KEY ("participant_id") REFERENCES "run_participants"("participant_id") ON DELETE CASCADE ON UPDATE CASCADE;
