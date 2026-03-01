-- CreateTable
CREATE TABLE "identity_tokens" (
    "token_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "token_type" TEXT NOT NULL,
    "token_uid" TEXT NOT NULL,
    "friendly_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "last_tap_at" TIMESTAMP(3),
    "tap_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,

    CONSTRAINT "identity_tokens_pkey" PRIMARY KEY ("token_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "identity_tokens_token_uid_key" ON "identity_tokens"("token_uid");

-- CreateIndex
CREATE INDEX "identity_tokens_root_id_idx" ON "identity_tokens"("root_id");

-- CreateIndex
CREATE INDEX "identity_tokens_status_idx" ON "identity_tokens"("status");

-- AddForeignKey
ALTER TABLE "identity_tokens" ADD CONSTRAINT "identity_tokens_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;
