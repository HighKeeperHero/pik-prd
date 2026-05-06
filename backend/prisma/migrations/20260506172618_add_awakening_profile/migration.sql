/*
  Warnings:

  - A unique constraint covering the columns `[provider,provider_id]` on the table `fate_accounts` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "fate_accounts_provider_provider_id_idx";

-- AlterTable
ALTER TABLE "fate_accounts" ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "root_identities" ADD COLUMN     "awakening_completed_at" TIMESTAMP(3),
ADD COLUMN     "calling" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "vice" TEXT,
ADD COLUMN     "virtue" TEXT,
ADD COLUMN     "wound" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "fate_accounts_provider_provider_id_key" ON "fate_accounts"("provider", "provider_id");
