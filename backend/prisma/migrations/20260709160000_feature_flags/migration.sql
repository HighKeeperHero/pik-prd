-- Feature flags — runtime feature control per release channel
-- (2026-07-09, alpha pipeline). channel '' = all channels; a
-- channel-specific row overrides the default row.

CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feature_flags_key_channel_key" ON "feature_flags"("key", "channel");
