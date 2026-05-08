-- CreateTable
CREATE TABLE "sanctum_state" (
    "root_id" TEXT NOT NULL,
    "veil_essence" INTEGER NOT NULL DEFAULT 0,
    "last_hearth_claim" TEXT,
    "oath_today_date" TEXT,
    "oath_today_option" TEXT,
    "total_hearth_claims" INTEGER NOT NULL DEFAULT 0,
    "total_oaths_sworn" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sanctum_state_pkey" PRIMARY KEY ("root_id")
);

-- AddForeignKey
ALTER TABLE "sanctum_state" ADD CONSTRAINT "sanctum_state_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

