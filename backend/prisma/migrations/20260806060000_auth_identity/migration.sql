-- One row per way into an account.
--
-- fate_accounts.provider / provider_id are scalars on the account row,
-- so an account could describe exactly one identity — Apple or Google,
-- never both — and account linking had nowhere to write. This is where
-- it writes.
--
-- Additive only. Nothing is dropped and no existing column is altered;
-- the legacy columns keep working and are removed in a later release,
-- once reads have moved and production has been observed.

-- CreateTable
CREATE TABLE "auth_identities" (
    "identity_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "email" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("identity_id")
);

-- CreateIndex
CREATE INDEX "auth_identities_account_id_idx" ON "auth_identities"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_provider_id_key" ON "auth_identities"("provider", "provider_id");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "fate_accounts"("account_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Backfill ────────────────────────────────────────────────────────
-- ON CONFLICT DO NOTHING makes re-running safe, but note that it is
-- idempotent about the ROW and silent about its COLUMNS — so verify the
-- result with scripts/verify-auth-identity.ts rather than trusting that
-- "the migration ran".

-- OAuth accounts: the provider's subject is the key. email_verified is
-- true because these rows only exist where a provider vouched for the
-- address — Apple verifies any address it releases, and a synthesized
-- relay address is Apple-controlled and derived from the subject.
INSERT INTO "auth_identities"
  ("identity_id", "account_id", "provider", "provider_id", "email", "email_verified", "linked_at")
SELECT gen_random_uuid(), "account_id", "provider", "provider_id", "email", true, "created_at"
  FROM "fate_accounts"
 WHERE "provider_id" IS NOT NULL
ON CONFLICT ("provider", "provider_id") DO NOTHING;

-- Password accounts: no external subject exists, so the account's own
-- id serves as provider_id — the column is NOT NULL so that the unique
-- constraint actually constrains (Postgres lets NULLs collide freely).
--
-- email_verified is false for every one of these, and that is accurate
-- rather than cautious: register() has never proved that the holder
-- owns the address it stored.
INSERT INTO "auth_identities"
  ("identity_id", "account_id", "provider", "provider_id", "email", "email_verified", "linked_at")
SELECT gen_random_uuid(), "account_id", 'email', "account_id", "email", false, "created_at"
  FROM "fate_accounts"
 WHERE "password_hash" IS NOT NULL
ON CONFLICT ("provider", "provider_id") DO NOTHING;
