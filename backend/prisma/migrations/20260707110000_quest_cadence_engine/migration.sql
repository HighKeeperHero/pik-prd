-- DropIndex
DROP INDEX "player_quests_root_id_quest_id_key";

-- AlterTable
ALTER TABLE "player_quests" ADD COLUMN     "claimed_at" TIMESTAMP(3),
ADD COLUMN     "period_key" TEXT NOT NULL DEFAULT 'once';

-- AlterTable
ALTER TABLE "quest_templates" ADD COLUMN     "cadence" TEXT NOT NULL DEFAULT 'venue',
ADD COLUMN     "chain_key" TEXT,
ADD COLUMN     "chain_step" INTEGER,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "tag" TEXT;

-- CreateIndex
CREATE INDEX "player_quests_root_id_period_key_idx" ON "player_quests"("root_id", "period_key");

-- CreateIndex
CREATE UNIQUE INDEX "player_quests_root_id_quest_id_period_key_key" ON "player_quests"("root_id", "quest_id", "period_key");

-- CreateIndex
CREATE UNIQUE INDEX "quest_templates_slug_key" ON "quest_templates"("slug");

-- CreateIndex
CREATE INDEX "quest_templates_cadence_status_idx" ON "quest_templates"("cadence", "status");

-- CreateIndex
CREATE INDEX "quest_templates_chain_key_idx" ON "quest_templates"("chain_key");

