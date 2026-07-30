-- CreateTable
CREATE TABLE "attribute_progress" (
    "attribute_progress_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "attribute" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attribute_progress_pkey" PRIMARY KEY ("attribute_progress_id")
);

-- CreateIndex
CREATE INDEX "attribute_progress_root_id_discipline_idx" ON "attribute_progress"("root_id", "discipline");

-- CreateIndex
CREATE UNIQUE INDEX "attribute_progress_root_id_attribute_key" ON "attribute_progress"("root_id", "attribute");

-- AddForeignKey
ALTER TABLE "attribute_progress" ADD CONSTRAINT "attribute_progress_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;
