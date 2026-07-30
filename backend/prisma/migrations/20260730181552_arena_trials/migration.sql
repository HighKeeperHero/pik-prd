-- CreateTable
CREATE TABLE "trial_bests" (
    "trial_best_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "trial_id" TEXT NOT NULL,
    "season_key" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "tells" INTEGER NOT NULL,
    "perfect" INTEGER NOT NULL,
    "misses" INTEGER NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 1,
    "achieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trial_bests_pkey" PRIMARY KEY ("trial_best_id")
);

-- CreateIndex
CREATE INDEX "trial_bests_season_key_trial_id_score_idx" ON "trial_bests"("season_key", "trial_id", "score");

-- CreateIndex
CREATE INDEX "trial_bests_season_key_root_id_idx" ON "trial_bests"("season_key", "root_id");

-- CreateIndex
CREATE UNIQUE INDEX "trial_bests_root_id_trial_id_season_key_key" ON "trial_bests"("root_id", "trial_id", "season_key");

-- AddForeignKey
ALTER TABLE "trial_bests" ADD CONSTRAINT "trial_bests_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;
