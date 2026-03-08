-- CreateTable
CREATE TABLE "rite_templates" (
    "rite_template_id" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "lore_text" TEXT,
    "xp_base" INTEGER NOT NULL DEFAULT 50,
    "difficulty" TEXT NOT NULL DEFAULT 'standard',
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "rite_templates_pkey" PRIMARY KEY ("rite_template_id")
);

-- CreateTable
CREATE TABLE "daily_rites" (
    "daily_rite_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "date_key" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completed_at" TIMESTAMP(3),
    "xp_granted" INTEGER,

    CONSTRAINT "daily_rites_pkey" PRIMARY KEY ("daily_rite_id")
);

-- CreateTable
CREATE TABLE "training_entries" (
    "entry_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "activity_type" TEXT NOT NULL,
    "duration_min" INTEGER,
    "notes" TEXT,
    "xp_granted" INTEGER NOT NULL DEFAULT 0,
    "daily_rite_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_entries_pkey" PRIMARY KEY ("entry_id")
);

-- CreateTable
CREATE TABLE "pillar_progress" (
    "pillar_progress_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "last_activity_at" TIMESTAMP(3),

    CONSTRAINT "pillar_progress_pkey" PRIMARY KEY ("pillar_progress_id")
);

-- CreateTable
CREATE TABLE "oaths" (
    "oath_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "declaration" TEXT NOT NULL,
    "week_of" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolved_at" TIMESTAMP(3),
    "xp_granted" INTEGER,

    CONSTRAINT "oaths_pkey" PRIMARY KEY ("oath_id")
);

-- CreateIndex
CREATE INDEX "rite_templates_pillar_status_idx" ON "rite_templates"("pillar", "status");

-- CreateIndex
CREATE INDEX "daily_rites_root_id_date_key_idx" ON "daily_rites"("root_id", "date_key");

-- CreateIndex
CREATE UNIQUE INDEX "daily_rites_root_id_date_key_pillar_key" ON "daily_rites"("root_id", "date_key", "pillar");

-- CreateIndex
CREATE INDEX "training_entries_root_id_created_at_idx" ON "training_entries"("root_id", "created_at");

-- CreateIndex
CREATE INDEX "training_entries_root_id_pillar_idx" ON "training_entries"("root_id", "pillar");

-- CreateIndex
CREATE INDEX "pillar_progress_root_id_idx" ON "pillar_progress"("root_id");

-- CreateIndex
CREATE UNIQUE INDEX "pillar_progress_root_id_pillar_key" ON "pillar_progress"("root_id", "pillar");

-- CreateIndex
CREATE INDEX "oaths_root_id_status_idx" ON "oaths"("root_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "oaths_root_id_week_of_key" ON "oaths"("root_id", "week_of");

-- AddForeignKey
ALTER TABLE "daily_rites" ADD CONSTRAINT "daily_rites_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_rites" ADD CONSTRAINT "daily_rites_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "rite_templates"("rite_template_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_entries" ADD CONSTRAINT "training_entries_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pillar_progress" ADD CONSTRAINT "pillar_progress_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oaths" ADD CONSTRAINT "oaths_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;
