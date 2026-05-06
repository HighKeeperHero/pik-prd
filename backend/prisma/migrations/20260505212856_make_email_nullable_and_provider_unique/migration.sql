-- DropForeignKey
ALTER TABLE "pity_counters" DROP CONSTRAINT "pity_counters_root_id_fkey";

-- DropForeignKey
ALTER TABLE "warband_invites" DROP CONSTRAINT "warband_invites_invited_by_root_id_fkey";

-- DropForeignKey
ALTER TABLE "warband_invites" DROP CONSTRAINT "warband_invites_warband_id_fkey";

-- DropForeignKey
ALTER TABLE "warband_memberships" DROP CONSTRAINT "warband_memberships_root_id_fkey";

-- DropForeignKey
ALTER TABLE "warband_memberships" DROP CONSTRAINT "warband_memberships_warband_id_fkey";

-- DropForeignKey
ALTER TABLE "warbands" DROP CONSTRAINT "warbands_founder_root_id_fkey";

-- DropIndex
DROP INDEX "warbands_reputation_idx";

-- AlterTable
ALTER TABLE "base_items" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "fate_accounts" ADD COLUMN     "fate_level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "fate_xp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "pity_counters" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "root_identities" ADD COLUMN     "hero_level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "hero_xp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "warband_invites" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "warband_memberships" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "joined_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "warbands" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "founded_at" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "player_nexus" (
    "nexus_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_nexus_pkey" PRIMARY KEY ("nexus_id")
);

-- CreateTable
CREATE TABLE "player_components" (
    "component_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "component_type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_components_pkey" PRIMARY KEY ("component_id")
);

-- CreateTable
CREATE TABLE "veil_shards" (
    "shard_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "veil_shards_pkey" PRIMARY KEY ("shard_id")
);

-- CreateTable
CREATE TABLE "tear_encounters" (
    "encounter_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "tear_type" TEXT NOT NULL,
    "tear_name" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "shards" INTEGER NOT NULL DEFAULT 0,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tear_encounters_pkey" PRIMARY KEY ("encounter_id")
);

-- CreateTable
CREATE TABLE "convergence_events" (
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "flavor_text" TEXT,
    "affected_tiers" TEXT[],
    "shard_multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "cache_bonus" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contribution_count" INTEGER NOT NULL DEFAULT 0,
    "target_count" INTEGER NOT NULL DEFAULT 10000,

    CONSTRAINT "convergence_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "convergence_contributions" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "root_id" TEXT NOT NULL,
    "warband_id" TEXT,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "convergence_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landmarks" (
    "landmark_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "type" TEXT NOT NULL DEFAULT 'public',
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "radius_meters" INTEGER NOT NULL DEFAULT 100,
    "is_auto_registered" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "landmarks_pkey" PRIMARY KEY ("landmark_id")
);

-- CreateTable
CREATE TABLE "landmark_discoveries" (
    "discovery_id" TEXT NOT NULL,
    "hero_id" TEXT NOT NULL,
    "landmark_id" TEXT NOT NULL,
    "fragment_index" INTEGER NOT NULL,
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "landmark_discoveries_pkey" PRIMARY KEY ("discovery_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "player_nexus_root_id_key" ON "player_nexus"("root_id");

-- CreateIndex
CREATE INDEX "player_nexus_root_id_idx" ON "player_nexus"("root_id");

-- CreateIndex
CREATE INDEX "player_components_root_id_idx" ON "player_components"("root_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_components_root_id_component_type_key" ON "player_components"("root_id", "component_type");

-- CreateIndex
CREATE UNIQUE INDEX "veil_shards_root_id_key" ON "veil_shards"("root_id");

-- CreateIndex
CREATE INDEX "tear_encounters_root_id_created_at_idx" ON "tear_encounters"("root_id", "created_at");

-- CreateIndex
CREATE INDEX "tear_encounters_root_id_outcome_idx" ON "tear_encounters"("root_id", "outcome");

-- CreateIndex
CREATE INDEX "convergence_events_status_ends_at_idx" ON "convergence_events"("status", "ends_at");

-- CreateIndex
CREATE INDEX "convergence_contributions_event_id_idx" ON "convergence_contributions"("event_id");

-- CreateIndex
CREATE INDEX "convergence_contributions_root_id_idx" ON "convergence_contributions"("root_id");

-- CreateIndex
CREATE UNIQUE INDEX "convergence_contributions_event_id_root_id_key" ON "convergence_contributions"("event_id", "root_id");

-- CreateIndex
CREATE INDEX "landmarks_region_idx" ON "landmarks"("region");

-- CreateIndex
CREATE INDEX "landmark_discoveries_hero_id_idx" ON "landmark_discoveries"("hero_id");

-- CreateIndex
CREATE INDEX "landmark_discoveries_landmark_id_idx" ON "landmark_discoveries"("landmark_id");

-- CreateIndex
CREATE UNIQUE INDEX "landmark_discoveries_hero_id_landmark_id_fragment_index_key" ON "landmark_discoveries"("hero_id", "landmark_id", "fragment_index");

-- CreateIndex
CREATE INDEX "warbands_reputation_idx" ON "warbands"("reputation");

-- AddForeignKey
ALTER TABLE "player_nexus" ADD CONSTRAINT "player_nexus_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_components" ADD CONSTRAINT "player_components_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "veil_shards" ADD CONSTRAINT "veil_shards_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tear_encounters" ADD CONSTRAINT "tear_encounters_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convergence_contributions" ADD CONSTRAINT "convergence_contributions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "convergence_events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convergence_contributions" ADD CONSTRAINT "convergence_contributions_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pity_counters" ADD CONSTRAINT "pity_counters_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warbands" ADD CONSTRAINT "warbands_founder_root_id_fkey" FOREIGN KEY ("founder_root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warband_memberships" ADD CONSTRAINT "warband_memberships_warband_id_fkey" FOREIGN KEY ("warband_id") REFERENCES "warbands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warband_memberships" ADD CONSTRAINT "warband_memberships_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warband_invites" ADD CONSTRAINT "warband_invites_warband_id_fkey" FOREIGN KEY ("warband_id") REFERENCES "warbands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warband_invites" ADD CONSTRAINT "warband_invites_invited_by_root_id_fkey" FOREIGN KEY ("invited_by_root_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landmark_discoveries" ADD CONSTRAINT "landmark_discoveries_hero_id_fkey" FOREIGN KEY ("hero_id") REFERENCES "root_identities"("root_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landmark_discoveries" ADD CONSTRAINT "landmark_discoveries_landmark_id_fkey" FOREIGN KEY ("landmark_id") REFERENCES "landmarks"("landmark_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "base_items_region_idx" RENAME TO "base_items_region_theme_idx";

-- RenameIndex
ALTER INDEX "base_items_slot_band_idx" RENAME TO "base_items_slot_level_band_idx";

-- RenameIndex
ALTER INDEX "pity_counters_root_idx" RENAME TO "pity_counters_root_id_idx";

-- RenameIndex
ALTER INDEX "warband_invites_code_idx" RENAME TO "warband_invites_invite_code_idx";

-- RenameIndex
ALTER INDEX "warband_invites_warband_idx" RENAME TO "warband_invites_warband_id_idx";

-- RenameIndex
ALTER INDEX "warband_memberships_root_idx" RENAME TO "warband_memberships_root_id_idx";

-- RenameIndex
ALTER INDEX "warband_memberships_warband_idx" RENAME TO "warband_memberships_warband_id_idx";
