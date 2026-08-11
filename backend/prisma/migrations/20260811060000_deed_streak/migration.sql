-- AlterTable
ALTER TABLE "sanctum_state" ADD COLUMN     "deed_streak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_deed_date" TEXT,
ADD COLUMN     "longest_deed_streak" INTEGER NOT NULL DEFAULT 0;

