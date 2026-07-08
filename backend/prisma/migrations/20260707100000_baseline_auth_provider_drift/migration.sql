-- Baseline for auth changes that were db-pushed to dev without a migration
-- (passkey/social provider work): email became nullable, the (provider,
-- provider_id) index became unique. Idempotent so it applies cleanly whether
-- or not a target database already carries the change.

ALTER TABLE "fate_accounts" ALTER COLUMN "email" DROP NOT NULL;

DROP INDEX IF EXISTS "fate_accounts_provider_provider_id_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "fate_accounts_provider_provider_id_key"
  ON "fate_accounts"("provider", "provider_id");
