-- Phase 2 Slice 0 — Partner platform hardening
--
-- Additive only. No column is dropped or retyped, and every existing row
-- keeps working: `scopes` backfills to the full progression set, which is
-- exactly what partners were implicitly granted before scope enforcement
-- existed.

-- Partner-level capability ceiling. Intersected with SourceLink.scope to
-- produce the effective scope for a partner write.
ALTER TABLE "sources"
  ADD COLUMN "scopes" TEXT NOT NULL DEFAULT 'xp fate_markers titles';

-- Idempotency ledger for POST /api/ingest. A partner-supplied event_id is
-- unique per source; replays return the stored response instead of
-- re-granting XP and loot.
CREATE TABLE "ingest_receipts" (
    "receipt_id" TEXT NOT NULL,
    "source_id"  TEXT NOT NULL,
    "event_key"  TEXT NOT NULL,
    "root_id"    TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "status"     TEXT NOT NULL DEFAULT 'processing',
    "response"   JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingest_receipts_pkey" PRIMARY KEY ("receipt_id")
);

CREATE UNIQUE INDEX "ingest_receipts_source_id_event_key_key"
  ON "ingest_receipts"("source_id", "event_key");

CREATE INDEX "ingest_receipts_root_id_created_at_idx"
  ON "ingest_receipts"("root_id", "created_at");

ALTER TABLE "ingest_receipts"
  ADD CONSTRAINT "ingest_receipts_source_id_fkey"
  FOREIGN KEY ("source_id") REFERENCES "sources"("source_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
