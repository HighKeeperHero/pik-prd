-- CreateTable
CREATE TABLE "player_sessions" (
    "session_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "zone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_heartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_out_at" TIMESTAMP(3),
    "duration_sec" INTEGER,
    "summary" JSONB,

    CONSTRAINT "player_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateIndex
CREATE INDEX "player_sessions_root_id_idx" ON "player_sessions"("root_id");

-- CreateIndex
CREATE INDEX "player_sessions_status_idx" ON "player_sessions"("status");

-- CreateIndex
CREATE INDEX "player_sessions_source_id_status_idx" ON "player_sessions"("source_id", "status");

-- CreateIndex
CREATE INDEX "player_sessions_checked_in_at_idx" ON "player_sessions"("checked_in_at");

-- AddForeignKey
ALTER TABLE "player_sessions" ADD CONSTRAINT "player_sessions_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;
