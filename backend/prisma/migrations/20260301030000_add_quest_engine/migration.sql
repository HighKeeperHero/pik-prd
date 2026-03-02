-- CreateTable
CREATE TABLE "quest_templates" (
    "quest_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quest_type" TEXT NOT NULL,
    "objectives" JSONB NOT NULL,
    "rewards" JSONB NOT NULL,
    "min_level" INTEGER NOT NULL DEFAULT 1,
    "max_level" INTEGER,
    "source_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quest_templates_pkey" PRIMARY KEY ("quest_id")
);

-- CreateTable
CREATE TABLE "player_quests" (
    "player_quest_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "quest_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "progress" JSONB NOT NULL DEFAULT '[]',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "player_quests_pkey" PRIMARY KEY ("player_quest_id")
);

-- CreateIndex
CREATE INDEX "quest_templates_status_idx" ON "quest_templates"("status");
CREATE INDEX "quest_templates_quest_type_idx" ON "quest_templates"("quest_type");

-- CreateIndex
CREATE UNIQUE INDEX "player_quests_root_id_quest_id_key" ON "player_quests"("root_id", "quest_id");
CREATE INDEX "player_quests_root_id_status_idx" ON "player_quests"("root_id", "status");
CREATE INDEX "player_quests_quest_id_idx" ON "player_quests"("quest_id");

-- AddForeignKey
ALTER TABLE "player_quests" ADD CONSTRAINT "player_quests_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_quests" ADD CONSTRAINT "player_quests_quest_id_fkey" FOREIGN KEY ("quest_id") REFERENCES "quest_templates"("quest_id") ON DELETE CASCADE ON UPDATE CASCADE;
