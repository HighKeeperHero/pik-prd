-- CreateTable: loot_table (reward pool definitions)
CREATE TABLE "loot_table" (
    "loot_table_id" TEXT NOT NULL,
    "cache_type" TEXT NOT NULL,
    "reward_type" TEXT NOT NULL,
    "reward_value" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "rarity_tier" TEXT NOT NULL DEFAULT 'common',
    "min_level" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "loot_table_pkey" PRIMARY KEY ("loot_table_id")
);

-- CreateTable: fate_caches (player cache instances)
CREATE TABLE "fate_caches" (
    "cache_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "cache_type" TEXT NOT NULL,
    "rarity" TEXT NOT NULL DEFAULT 'common',
    "source_id" TEXT,
    "trigger" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sealed',
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_at" TIMESTAMP(3),
    "reward_type" TEXT,
    "reward_value" TEXT,
    "reward_name" TEXT,
    "reward_rarity" TEXT,

    CONSTRAINT "fate_caches_pkey" PRIMARY KEY ("cache_id")
);

-- CreateIndex
CREATE INDEX "loot_table_cache_type_idx" ON "loot_table"("cache_type");
CREATE INDEX "fate_caches_root_id_idx" ON "fate_caches"("root_id");
CREATE INDEX "fate_caches_root_id_status_idx" ON "fate_caches"("root_id", "status");

-- AddForeignKey
ALTER TABLE "fate_caches" ADD CONSTRAINT "fate_caches_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fate_caches" ADD CONSTRAINT "fate_caches_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("source_id") ON DELETE SET NULL ON UPDATE CASCADE;
