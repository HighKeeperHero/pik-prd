-- ============================================================
-- Migration: 20260319120000_add_warbands
-- Sprint 23: Warband Formation — schema + invite system
-- NOTE: root_identities PK column is "root_id" (not "id")
-- ============================================================

CREATE TABLE IF NOT EXISTS "warbands" (
  "id"               TEXT      NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"             TEXT      NOT NULL,
  "emblem"           TEXT      NOT NULL DEFAULT '⚔',
  "alignment"        TEXT      NOT NULL DEFAULT 'NONE',
  "reputation"       INTEGER   NOT NULL DEFAULT 0,
  "founded_at"       TIMESTAMP NOT NULL DEFAULT NOW(),
  "founder_root_id"  TEXT      NOT NULL REFERENCES "root_identities"("root_id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "warbands_alignment_idx"   ON "warbands" ("alignment");
CREATE INDEX IF NOT EXISTS "warbands_reputation_idx"  ON "warbands" ("reputation" DESC);

CREATE TABLE IF NOT EXISTS "warband_memberships" (
  "id"               TEXT      NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "warband_id"       TEXT      NOT NULL REFERENCES "warbands"("id") ON DELETE CASCADE,
  "root_id"          TEXT      NOT NULL REFERENCES "root_identities"("root_id") ON DELETE CASCADE,
  "rank"             TEXT      NOT NULL DEFAULT 'MEMBER',
  "alignment_bonus"  BOOLEAN   NOT NULL DEFAULT false,
  "joined_at"        TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE ("warband_id", "root_id")
);

CREATE INDEX IF NOT EXISTS "warband_memberships_root_idx"    ON "warband_memberships" ("root_id");
CREATE INDEX IF NOT EXISTS "warband_memberships_warband_idx" ON "warband_memberships" ("warband_id");

CREATE TABLE IF NOT EXISTS "warband_invites" (
  "id"                   TEXT      NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "warband_id"           TEXT      NOT NULL REFERENCES "warbands"("id") ON DELETE CASCADE,
  "invited_by_root_id"   TEXT      NOT NULL REFERENCES "root_identities"("root_id") ON DELETE CASCADE,
  "invite_code"          TEXT      NOT NULL UNIQUE,
  "status"               TEXT      NOT NULL DEFAULT 'pending',
  "expires_at"           TIMESTAMP NOT NULL,
  "created_at"           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "warband_invites_code_idx"    ON "warband_invites" ("invite_code");
CREATE INDEX IF NOT EXISTS "warband_invites_warband_idx" ON "warband_invites" ("warband_id");
