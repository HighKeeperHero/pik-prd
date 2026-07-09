-- Restoration upgrade economy (2026-07-10, Tim's top build ask).
-- Upgrades now cost essence + materials and take real-world time:
-- sanctum_builds holds one in-flight build per (root, track);
-- material_stocks is the hero's material inventory. Rome, a day, etc.

CREATE TABLE "sanctum_builds" (
    "id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "to_level" INTEGER NOT NULL,
    "essence" INTEGER NOT NULL,
    "materials" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "sanctum_builds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sanctum_builds_root_id_idx" ON "sanctum_builds"("root_id");

CREATE TABLE "material_stocks" (
    "root_id" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "material_stocks_pkey" PRIMARY KEY ("root_id", "material")
);
