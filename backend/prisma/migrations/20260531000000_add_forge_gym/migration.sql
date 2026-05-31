-- The Forge — Sprint 33
-- Gym / workout companion: movement library, regimens, logged
-- sessions, sets, and personal records. Feeds the Forge pillar
-- and Fate XP via the training + leveling services.

-- CreateTable
CREATE TABLE "forge_exercises" (
    "exercise_id" TEXT NOT NULL,
    "slug" TEXT,
    "name" TEXT NOT NULL,
    "theme_name" TEXT,
    "category" TEXT NOT NULL,
    "equipment" TEXT NOT NULL DEFAULT 'barbell',
    "log_type" TEXT NOT NULL DEFAULT 'weight_reps',
    "instructions" TEXT,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "root_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forge_exercises_pkey" PRIMARY KEY ("exercise_id")
);

-- CreateTable
CREATE TABLE "forge_regimens" (
    "regimen_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "theme_title" TEXT,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "order_idx" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forge_regimens_pkey" PRIMARY KEY ("regimen_id")
);

-- CreateTable
CREATE TABLE "forge_regimen_exercises" (
    "regimen_exercise_id" TEXT NOT NULL,
    "regimen_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "order_idx" INTEGER NOT NULL DEFAULT 0,
    "target_sets" INTEGER NOT NULL DEFAULT 3,
    "target_reps" INTEGER,
    "rest_sec" INTEGER NOT NULL DEFAULT 120,
    "notes" TEXT,

    CONSTRAINT "forge_regimen_exercises_pkey" PRIMARY KEY ("regimen_exercise_id")
);

-- CreateTable
CREATE TABLE "forge_sessions" (
    "session_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "regimen_id" TEXT,
    "name" TEXT NOT NULL DEFAULT 'Forge Rite',
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "duration_sec" INTEGER,
    "total_volume" INTEGER NOT NULL DEFAULT 0,
    "total_sets" INTEGER NOT NULL DEFAULT 0,
    "total_reps" INTEGER NOT NULL DEFAULT 0,
    "pr_count" INTEGER NOT NULL DEFAULT 0,
    "fate_xp" INTEGER NOT NULL DEFAULT 0,
    "forge_xp" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "forge_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "forge_session_exercises" (
    "session_exercise_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "order_idx" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "forge_session_exercises_pkey" PRIMARY KEY ("session_exercise_id")
);

-- CreateTable
CREATE TABLE "forge_sets" (
    "set_id" TEXT NOT NULL,
    "session_exercise_id" TEXT NOT NULL,
    "set_number" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION,
    "reps" INTEGER,
    "duration_sec" INTEGER,
    "distance_m" INTEGER,
    "rpe" DOUBLE PRECISION,
    "is_warmup" BOOLEAN NOT NULL DEFAULT false,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "is_pr" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "forge_sets_pkey" PRIMARY KEY ("set_id")
);

-- CreateTable
CREATE TABLE "forge_personal_records" (
    "record_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "record_type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION,
    "reps" INTEGER,
    "session_id" TEXT,
    "achieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forge_personal_records_pkey" PRIMARY KEY ("record_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "forge_exercises_slug_key" ON "forge_exercises"("slug");

-- CreateIndex
CREATE INDEX "forge_exercises_category_status_idx" ON "forge_exercises"("category", "status");

-- CreateIndex
CREATE INDEX "forge_exercises_root_id_idx" ON "forge_exercises"("root_id");

-- CreateIndex
CREATE INDEX "forge_regimens_root_id_archived_idx" ON "forge_regimens"("root_id", "archived");

-- CreateIndex
CREATE INDEX "forge_regimen_exercises_regimen_id_idx" ON "forge_regimen_exercises"("regimen_id");

-- CreateIndex
CREATE INDEX "forge_sessions_root_id_status_idx" ON "forge_sessions"("root_id", "status");

-- CreateIndex
CREATE INDEX "forge_sessions_root_id_started_at_idx" ON "forge_sessions"("root_id", "started_at");

-- CreateIndex
CREATE INDEX "forge_session_exercises_session_id_idx" ON "forge_session_exercises"("session_id");

-- CreateIndex
CREATE INDEX "forge_sets_session_exercise_id_idx" ON "forge_sets"("session_exercise_id");

-- CreateIndex
CREATE INDEX "forge_personal_records_root_id_idx" ON "forge_personal_records"("root_id");

-- CreateIndex
CREATE UNIQUE INDEX "forge_personal_records_root_id_exercise_id_record_type_key" ON "forge_personal_records"("root_id", "exercise_id", "record_type");

-- AddForeignKey
ALTER TABLE "forge_exercises" ADD CONSTRAINT "forge_exercises_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forge_regimens" ADD CONSTRAINT "forge_regimens_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forge_regimen_exercises" ADD CONSTRAINT "forge_regimen_exercises_regimen_id_fkey" FOREIGN KEY ("regimen_id") REFERENCES "forge_regimens"("regimen_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forge_regimen_exercises" ADD CONSTRAINT "forge_regimen_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "forge_exercises"("exercise_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forge_sessions" ADD CONSTRAINT "forge_sessions_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forge_sessions" ADD CONSTRAINT "forge_sessions_regimen_id_fkey" FOREIGN KEY ("regimen_id") REFERENCES "forge_regimens"("regimen_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forge_session_exercises" ADD CONSTRAINT "forge_session_exercises_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "forge_sessions"("session_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forge_session_exercises" ADD CONSTRAINT "forge_session_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "forge_exercises"("exercise_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forge_sets" ADD CONSTRAINT "forge_sets_session_exercise_id_fkey" FOREIGN KEY ("session_exercise_id") REFERENCES "forge_session_exercises"("session_exercise_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forge_personal_records" ADD CONSTRAINT "forge_personal_records_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forge_personal_records" ADD CONSTRAINT "forge_personal_records_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "forge_exercises"("exercise_id") ON DELETE CASCADE ON UPDATE CASCADE;
