-- HEP Phase 2 Slice 9 — venue certification
--
-- One additive table. The gate it feeds defaults to `spatial` mode, so
-- deploying this changes nothing for existing venues: their experiences
-- declare no spatial manifest and are not gated. It arms itself when
-- spatial content arrives, which is when it matters.

-- CreateTable
CREATE TABLE "venue_certifications" (
    "certification_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "experience_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'certified',
    "checks" JSONB NOT NULL DEFAULT '{}',
    "fingerprint" JSONB NOT NULL DEFAULT '{}',
    "reason" TEXT,
    "expires_at" TIMESTAMP(3),
    "certified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "certified_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_certifications_pkey" PRIMARY KEY ("certification_id")
);

-- CreateIndex
CREATE INDEX "venue_certifications_source_id_status_idx" ON "venue_certifications"("source_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "venue_certifications_source_id_experience_id_room_id_key" ON "venue_certifications"("source_id", "experience_id", "room_id");

-- AddForeignKey
ALTER TABLE "venue_certifications" ADD CONSTRAINT "venue_certifications_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_certifications" ADD CONSTRAINT "venue_certifications_experience_id_fkey" FOREIGN KEY ("experience_id") REFERENCES "experiences"("experience_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_certifications" ADD CONSTRAINT "venue_certifications_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "venue_rooms"("room_id") ON DELETE CASCADE ON UPDATE CASCADE;

