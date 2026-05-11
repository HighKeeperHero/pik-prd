-- AlterTable
ALTER TABLE "root_identities" ADD COLUMN     "push_token" TEXT,
ADD COLUMN     "push_updated_at" TIMESTAMP(3);

