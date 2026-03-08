-- AlterTable
ALTER TABLE "root_identities" ADD COLUMN     "fate_account_id" TEXT,
ALTER COLUMN "fate_alignment" SET DEFAULT 'NONE',
ALTER COLUMN "enrolled_by" SET DEFAULT 'self';

-- CreateTable
CREATE TABLE "fate_accounts" (
    "account_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'email',
    "provider_id" TEXT,
    "password_hash" TEXT,
    "display_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "fate_accounts_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "account_sessions" (
    "session_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "selected_hero_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fate_accounts_email_key" ON "fate_accounts"("email");

-- CreateIndex
CREATE INDEX "fate_accounts_email_idx" ON "fate_accounts"("email");

-- CreateIndex
CREATE INDEX "fate_accounts_provider_provider_id_idx" ON "fate_accounts"("provider", "provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_sessions_token_hash_key" ON "account_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "account_sessions_token_hash_idx" ON "account_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "account_sessions_account_id_idx" ON "account_sessions"("account_id");

-- CreateIndex
CREATE INDEX "root_identities_fate_account_id_idx" ON "root_identities"("fate_account_id");

-- AddForeignKey
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "fate_accounts"("account_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_selected_hero_id_fkey" FOREIGN KEY ("selected_hero_id") REFERENCES "root_identities"("root_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "root_identities" ADD CONSTRAINT "root_identities_fate_account_id_fkey" FOREIGN KEY ("fate_account_id") REFERENCES "fate_accounts"("account_id") ON DELETE CASCADE ON UPDATE CASCADE;
