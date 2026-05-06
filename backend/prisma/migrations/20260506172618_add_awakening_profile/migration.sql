-- AlterTable
ALTER TABLE "root_identities" ADD COLUMN     "awakening_completed_at" TIMESTAMP(3),
ADD COLUMN     "calling" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "vice" TEXT,
ADD COLUMN     "virtue" TEXT,
ADD COLUMN     "wound" TEXT;