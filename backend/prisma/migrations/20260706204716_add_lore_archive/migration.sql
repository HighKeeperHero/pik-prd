-- CreateTable
CREATE TABLE "lore_entries" (
    "lore_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "rarity" TEXT NOT NULL DEFAULT 'common',
    "body" TEXT NOT NULL,
    "glyph" TEXT NOT NULL DEFAULT '◈',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lore_entries_pkey" PRIMARY KEY ("lore_id")
);

-- CreateTable
CREATE TABLE "hero_lore" (
    "hero_lore_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "lore_id" TEXT NOT NULL,
    "found_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,

    CONSTRAINT "hero_lore_pkey" PRIMARY KEY ("hero_lore_id")
);

-- CreateIndex
CREATE INDEX "hero_lore_root_id_idx" ON "hero_lore"("root_id");

-- CreateIndex
CREATE UNIQUE INDEX "hero_lore_root_id_lore_id_key" ON "hero_lore"("root_id", "lore_id");

-- AddForeignKey
ALTER TABLE "hero_lore" ADD CONSTRAINT "hero_lore_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_lore" ADD CONSTRAINT "hero_lore_lore_id_fkey" FOREIGN KEY ("lore_id") REFERENCES "lore_entries"("lore_id") ON DELETE CASCADE ON UPDATE CASCADE;

