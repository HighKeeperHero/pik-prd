-- HEP Phase 2 Slice 4 — spatial data model
--
-- The contract the partnered Tier C design firm builds against.
--
-- Purely additive: six new tables plus two columns on `experiences`.
-- No existing row changes meaning, and a venue with no rooms behaves
-- exactly as it did. Safe to deploy ahead of any XR client existing —
-- which is the point, since the partner needs the contract before they
-- start rather than after.

-- AlterTable
ALTER TABLE "experiences" ADD COLUMN     "manifest" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "manifest_schema_version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "venue_rooms" (
    "room_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profile" JSONB NOT NULL DEFAULT '{}',
    "active_config_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_rooms_pkey" PRIMARY KEY ("room_id")
);

-- CreateTable
CREATE TABLE "room_configs" (
    "room_config_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "experience_id" TEXT,
    "experience_version" INTEGER,
    "origin_mode" TEXT NOT NULL DEFAULT 'fiducial',
    "orientation_reference" JSONB,
    "validation" JSONB NOT NULL DEFAULT '{}',
    "supported_device_profiles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "published_at" TIMESTAMP(3),
    "published_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_configs_pkey" PRIMARY KEY ("room_config_id")
);

-- CreateTable
CREATE TABLE "anchor_records" (
    "anchor_id" TEXT NOT NULL,
    "room_config_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'content',
    "provider" TEXT NOT NULL,
    "provider_anchor_id" TEXT,
    "marker_id" TEXT,
    "local_position" DOUBLE PRECISION[],
    "local_rotation" DOUBLE PRECISION[],
    "tracking_confidence" DOUBLE PRECISION,
    "captured_by_device" TEXT,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),

    CONSTRAINT "anchor_records_pkey" PRIMARY KEY ("anchor_id")
);

-- CreateTable
CREATE TABLE "content_placements" (
    "placement_id" TEXT NOT NULL,
    "room_config_id" TEXT NOT NULL,
    "anchor_name" TEXT NOT NULL,
    "local_position" DOUBLE PRECISION[],
    "local_rotation" DOUBLE PRECISION[],
    "local_scale" DOUBLE PRECISION[] DEFAULT ARRAY[1, 1, 1]::DOUBLE PRECISION[],
    "notes" TEXT,

    CONSTRAINT "content_placements_pkey" PRIMARY KEY ("placement_id")
);

-- CreateTable
CREATE TABLE "spatial_zones" (
    "zone_id" TEXT NOT NULL,
    "room_config_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "shape" TEXT NOT NULL,
    "geometry" JSONB NOT NULL,
    "local_position" DOUBLE PRECISION[],
    "local_rotation" DOUBLE PRECISION[] DEFAULT ARRAY[0, 0, 0]::DOUBLE PRECISION[],

    CONSTRAINT "spatial_zones_pkey" PRIMARY KEY ("zone_id")
);

-- CreateTable
CREATE TABLE "device_capability_profiles" (
    "profile_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "supports_shared_anchors" BOOLEAN NOT NULL DEFAULT false,
    "supports_persistent_anchors" BOOLEAN NOT NULL DEFAULT false,
    "supports_scene_mesh" BOOLEAN NOT NULL DEFAULT false,
    "supports_hand_tracking" BOOLEAN NOT NULL DEFAULT false,
    "supports_occlusion" BOOLEAN NOT NULL DEFAULT false,
    "budgets" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_capability_profiles_pkey" PRIMARY KEY ("profile_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "venue_rooms_active_config_id_key" ON "venue_rooms"("active_config_id");

-- CreateIndex
CREATE INDEX "venue_rooms_source_id_status_idx" ON "venue_rooms"("source_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "venue_rooms_source_id_slug_key" ON "venue_rooms"("source_id", "slug");

-- CreateIndex
CREATE INDEX "room_configs_room_id_status_idx" ON "room_configs"("room_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "room_configs_room_id_version_key" ON "room_configs"("room_id", "version");

-- CreateIndex
CREATE INDEX "anchor_records_room_config_id_role_idx" ON "anchor_records"("room_config_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "anchor_records_room_config_id_name_key" ON "anchor_records"("room_config_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "content_placements_room_config_id_anchor_name_key" ON "content_placements"("room_config_id", "anchor_name");

-- CreateIndex
CREATE INDEX "spatial_zones_room_config_id_kind_idx" ON "spatial_zones"("room_config_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "spatial_zones_room_config_id_name_key" ON "spatial_zones"("room_config_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "device_capability_profiles_slug_key" ON "device_capability_profiles"("slug");

-- AddForeignKey
ALTER TABLE "venue_rooms" ADD CONSTRAINT "venue_rooms_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_rooms" ADD CONSTRAINT "venue_rooms_active_config_id_fkey" FOREIGN KEY ("active_config_id") REFERENCES "room_configs"("room_config_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_configs" ADD CONSTRAINT "room_configs_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "venue_rooms"("room_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anchor_records" ADD CONSTRAINT "anchor_records_room_config_id_fkey" FOREIGN KEY ("room_config_id") REFERENCES "room_configs"("room_config_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_placements" ADD CONSTRAINT "content_placements_room_config_id_fkey" FOREIGN KEY ("room_config_id") REFERENCES "room_configs"("room_config_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spatial_zones" ADD CONSTRAINT "spatial_zones_room_config_id_fkey" FOREIGN KEY ("room_config_id") REFERENCES "room_configs"("room_config_id") ON DELETE CASCADE ON UPDATE CASCADE;

