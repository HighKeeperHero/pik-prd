-- CreateTable
CREATE TABLE "root_identities" (
    "root_id" TEXT NOT NULL,
    "hero_name" TEXT NOT NULL,
    "fate_alignment" TEXT NOT NULL,
    "origin" TEXT,
    "fate_xp" INTEGER NOT NULL DEFAULT 0,
    "fate_level" INTEGER NOT NULL DEFAULT 1,
    "enrolled_by" TEXT NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "root_identities_pkey" PRIMARY KEY ("root_id")
);

-- CreateTable
CREATE TABLE "personas" (
    "persona_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("persona_id")
);

-- CreateTable
CREATE TABLE "auth_keys" (
    "key_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "device_type" TEXT,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "friendly_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "auth_keys_pkey" PRIMARY KEY ("key_id")
);

-- CreateTable
CREATE TABLE "webauthn_challenges" (
    "id" TEXT NOT NULL,
    "root_id" TEXT,
    "challenge" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webauthn_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_tokens" (
    "token_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_tokens_pkey" PRIMARY KEY ("token_id")
);

-- CreateTable
CREATE TABLE "sources" (
    "source_id" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "api_key_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("source_id")
);

-- CreateTable
CREATE TABLE "source_links" (
    "link_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'xp fate_markers titles',
    "granted_by" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoked_by" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "source_links_pkey" PRIMARY KEY ("link_id")
);

-- CreateTable
CREATE TABLE "identity_events" (
    "event_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "source_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "changes_applied" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "titles" (
    "title_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,

    CONSTRAINT "titles_pkey" PRIMARY KEY ("title_id")
);

-- CreateTable
CREATE TABLE "user_titles" (
    "id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_id" TEXT,

    CONSTRAINT "user_titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fate_markers" (
    "id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "marker" TEXT NOT NULL,
    "source_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fate_markers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config" (
    "config_key" TEXT NOT NULL,
    "config_value" TEXT NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_pkey" PRIMARY KEY ("config_key")
);

-- CreateIndex
CREATE INDEX "personas_root_id_idx" ON "personas"("root_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_keys_credential_id_key" ON "auth_keys"("credential_id");

-- CreateIndex
CREATE INDEX "auth_keys_root_id_status_idx" ON "auth_keys"("root_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "webauthn_challenges_challenge_key" ON "webauthn_challenges"("challenge");

-- CreateIndex
CREATE INDEX "webauthn_challenges_challenge_idx" ON "webauthn_challenges"("challenge");

-- CreateIndex
CREATE INDEX "webauthn_challenges_expires_at_idx" ON "webauthn_challenges"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "session_tokens_token_hash_key" ON "session_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "session_tokens_token_hash_idx" ON "session_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "session_tokens_expires_at_idx" ON "session_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "source_links_root_id_source_id_status_idx" ON "source_links"("root_id", "source_id", "status");

-- CreateIndex
CREATE INDEX "identity_events_root_id_created_at_idx" ON "identity_events"("root_id", "created_at");

-- CreateIndex
CREATE INDEX "identity_events_event_type_idx" ON "identity_events"("event_type");

-- CreateIndex
CREATE INDEX "identity_events_source_id_idx" ON "identity_events"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_titles_root_id_title_id_key" ON "user_titles"("root_id", "title_id");

-- CreateIndex
CREATE INDEX "fate_markers_root_id_idx" ON "fate_markers"("root_id");

-- AddForeignKey
ALTER TABLE "personas" ADD CONSTRAINT "personas_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_keys" ADD CONSTRAINT "auth_keys_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_links" ADD CONSTRAINT "source_links_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_links" ADD CONSTRAINT "source_links_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("source_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_events" ADD CONSTRAINT "identity_events_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_titles" ADD CONSTRAINT "user_titles_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_titles" ADD CONSTRAINT "user_titles_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("title_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fate_markers" ADD CONSTRAINT "fate_markers_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;
