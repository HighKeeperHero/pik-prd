-- Android IAP support on iap_purchases.
-- Apple columns become nullable (Android rows have none); add platform
-- discriminator + Google Play dedup fields. orderId is the dedup key.

ALTER TABLE "iap_purchases" ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'ios';
ALTER TABLE "iap_purchases" ADD COLUMN "google_order_id" TEXT;
ALTER TABLE "iap_purchases" ADD COLUMN "google_purchase_token" TEXT;

ALTER TABLE "iap_purchases" ALTER COLUMN "apple_transaction_id" DROP NOT NULL;
ALTER TABLE "iap_purchases" ALTER COLUMN "apple_environment" DROP NOT NULL;
ALTER TABLE "iap_purchases" ALTER COLUMN "apple_bundle_id" DROP NOT NULL;

-- CreateIndex (unique; Postgres allows multiple NULLs for iOS rows)
CREATE UNIQUE INDEX "iap_purchases_google_order_id_key" ON "iap_purchases"("google_order_id");
