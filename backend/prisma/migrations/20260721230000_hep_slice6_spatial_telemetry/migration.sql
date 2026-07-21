-- HEP Phase 2 Slice 6 — spatial telemetry
--
-- One additive table. No existing row changes meaning; a venue that
-- reports no telemetry behaves exactly as before.
--
-- Deliberately generic (metric name + value + unit) rather than a column
-- per measurement: Workstream 9 lists ~25 metrics as INITIAL targets to
-- be tuned after testing, and the partnered firm will learn new ones
-- every week of the pilot. A column-per-metric schema would mean a
-- migration each time.

-- CreateTable
CREATE TABLE "spatial_metrics" (
    "metric_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "run_id" TEXT,
    "room_config_id" TEXT,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "device_profile" TEXT,
    "device_id" TEXT,
    "context" JSONB NOT NULL DEFAULT '{}',
    "captured_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spatial_metrics_pkey" PRIMARY KEY ("metric_id")
);

-- CreateIndex
CREATE INDEX "spatial_metrics_source_id_metric_captured_at_idx" ON "spatial_metrics"("source_id", "metric", "captured_at");

-- CreateIndex
CREATE INDEX "spatial_metrics_room_config_id_metric_idx" ON "spatial_metrics"("room_config_id", "metric");

-- CreateIndex
CREATE INDEX "spatial_metrics_run_id_idx" ON "spatial_metrics"("run_id");

-- AddForeignKey
ALTER TABLE "spatial_metrics" ADD CONSTRAINT "spatial_metrics_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("source_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spatial_metrics" ADD CONSTRAINT "spatial_metrics_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "experience_runs"("run_id") ON DELETE SET NULL ON UPDATE CASCADE;

