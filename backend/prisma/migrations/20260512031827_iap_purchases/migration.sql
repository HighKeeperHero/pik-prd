-- CreateTable
CREATE TABLE "iap_purchases" (
    "iap_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "essence_granted" INTEGER NOT NULL,
    "apple_transaction_id" TEXT NOT NULL,
    "apple_environment" TEXT NOT NULL,
    "apple_bundle_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'granted',
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iap_purchases_pkey" PRIMARY KEY ("iap_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "iap_purchases_apple_transaction_id_key" ON "iap_purchases"("apple_transaction_id");

-- CreateIndex
CREATE INDEX "iap_purchases_root_id_created_at_idx" ON "iap_purchases"("root_id", "created_at");

-- AddForeignKey
ALTER TABLE "iap_purchases" ADD CONSTRAINT "iap_purchases_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

