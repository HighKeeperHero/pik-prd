-- HEP Phase 2 Slice 2 — venue staff identity and RBAC
--
-- Additive only. Three new tables; no existing table is altered.
--
-- venue_staff is unique on (source_id, email) rather than email alone: a
-- regional manager may legitimately hold an account at several venues, and
-- each is a separate grant with its own role.

CREATE TABLE "venue_staff" (
    "staff_id"        TEXT NOT NULL,
    "source_id"       TEXT NOT NULL,
    "email"           TEXT NOT NULL,
    "password_hash"   TEXT,
    "display_name"    TEXT,
    "role"            TEXT NOT NULL DEFAULT 'viewer',
    "status"          TEXT NOT NULL DEFAULT 'invited',
    "invited_by"      TEXT,
    "invite_hash"     TEXT,
    "invite_expires"  TIMESTAMP(3),
    "last_login_at"   TIMESTAMP(3),
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_staff_pkey" PRIMARY KEY ("staff_id")
);

CREATE UNIQUE INDEX "venue_staff_source_id_email_key" ON "venue_staff"("source_id", "email");
CREATE UNIQUE INDEX "venue_staff_invite_hash_key"     ON "venue_staff"("invite_hash");
CREATE INDEX "venue_staff_source_id_status_idx"       ON "venue_staff"("source_id", "status");

CREATE TABLE "venue_staff_sessions" (
    "session_id" TEXT NOT NULL,
    "staff_id"   TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_staff_sessions_pkey" PRIMARY KEY ("session_id")
);

CREATE UNIQUE INDEX "venue_staff_sessions_token_hash_key" ON "venue_staff_sessions"("token_hash");
CREATE INDEX "venue_staff_sessions_staff_id_idx"          ON "venue_staff_sessions"("staff_id");

CREATE TABLE "venue_audit_entries" (
    "entry_id"   TEXT NOT NULL,
    "source_id"  TEXT NOT NULL,
    "staff_id"   TEXT,
    "action"     TEXT NOT NULL,
    "target"     TEXT,
    "metadata"   JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_audit_entries_pkey" PRIMARY KEY ("entry_id")
);

CREATE INDEX "venue_audit_entries_source_id_created_at_idx" ON "venue_audit_entries"("source_id", "created_at");
CREATE INDEX "venue_audit_entries_staff_id_idx"             ON "venue_audit_entries"("staff_id");

-- Foreign keys
ALTER TABLE "venue_staff" ADD CONSTRAINT "venue_staff_source_id_fkey"
  FOREIGN KEY ("source_id") REFERENCES "sources"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "venue_staff_sessions" ADD CONSTRAINT "venue_staff_sessions_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "venue_staff"("staff_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "venue_audit_entries" ADD CONSTRAINT "venue_audit_entries_source_id_fkey"
  FOREIGN KEY ("source_id") REFERENCES "sources"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL, not CASCADE: removing a staff member must not erase the record
-- of what they did. The audit trail outlives the account.
ALTER TABLE "venue_audit_entries" ADD CONSTRAINT "venue_audit_entries_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "venue_staff"("staff_id") ON DELETE SET NULL ON UPDATE CASCADE;
