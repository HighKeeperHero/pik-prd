-- Sprint 29 / Arc B — Geo-Aware Rifts (Slice 1)
--
-- Creates the world_tears inventory + seeds ~180 tears across the
-- starter city set from docs/roadmap/phase-2.md § Arc B. The iOS
-- Map screen will swap procedural spawnTears for GET /api/veil/
-- tears/nearby queries against this table.
--
-- Schema follows phase-2.md spec:
--   world_tears(id, lat, lon, tier, status, spawned_at, expires_at,
--               sealed_by_root_id)
-- Plus region_label for analytics. tier maps 1:1 to client tear
-- type (T1 minor / T2 wander / T3 dormant / T4 double).

-- ── Table ───────────────────────────────────────────────────
CREATE TABLE "world_tears" (
    "tear_id"             TEXT NOT NULL,
    "lat"                 DOUBLE PRECISION NOT NULL,
    "lon"                 DOUBLE PRECISION NOT NULL,
    "tier"                TEXT NOT NULL,
    "status"              TEXT NOT NULL DEFAULT 'active',
    "spawned_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at"          TIMESTAMP(3),
    "sealed_at"           TIMESTAMP(3),
    "sealed_by_root_id"   TEXT,
    "region_label"        TEXT,

    CONSTRAINT "world_tears_pkey" PRIMARY KEY ("tear_id")
);

CREATE INDEX "world_tears_status_lat_lon_idx"     ON "world_tears"("status", "lat", "lon");
CREATE INDEX "world_tears_sealed_by_root_id_idx"  ON "world_tears"("sealed_by_root_id");
CREATE INDEX "world_tears_region_label_status_idx" ON "world_tears"("region_label", "status");

ALTER TABLE "world_tears"
  ADD CONSTRAINT "world_tears_sealed_by_root_id_fkey"
  FOREIGN KEY ("sealed_by_root_id") REFERENCES "root_identities"("root_id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Seed: 180 tears across 9 cities ─────────────────────────
-- 20 tears per city. Per-city tier mix:
--   idx  1-8   → T1 (8)
--   idx  9-14  → T2 (6)
--   idx 15-18  → T3 (4)
--   idx 19-20  → T4 (2)
-- Total: 72 T1, 54 T2, 36 T3, 18 T4 — provides enough density to
-- satisfy any level band's tier weights from phase-2.md.
--
-- Position: angle = (idx · 2π / 20) + per-city seed-rotation.
-- Radial distance = 0.012-0.04 degrees from center (~1.3-4.4 km).
-- Longitude scaled by cos(lat) so cities at high latitudes don't
-- stretch east-west on a flat-degree grid.
INSERT INTO "world_tears" (tear_id, lat, lon, tier, status, spawned_at, region_label)
SELECT
    gen_random_uuid()::text,
    city.lat + radial_deg * SIN(angle_rad),
    city.lon + radial_deg * COS(angle_rad) / COS(RADIANS(city.lat)),
    CASE
        WHEN idx <=  8 THEN 'T1'
        WHEN idx <= 14 THEN 'T2'
        WHEN idx <= 18 THEN 'T3'
        ELSE                'T4'
    END,
    'active',
    NOW(),
    city.label
FROM (
    VALUES
        (38.6779, -121.1761, 'folsom-ca',    0.1::float),
        (37.7749, -122.4194, 'sf-ca',         0.7::float),
        (40.7128,  -74.0060, 'nyc-ny',        1.3::float),
        (34.0522, -118.2437, 'la-ca',         1.9::float),
        (47.6062, -122.3321, 'seattle-wa',    2.5::float),
        (30.2672,  -97.7431, 'austin-tx',     3.1::float),
        (41.8781,  -87.6298, 'chicago-il',    3.7::float),
        (51.5074,   -0.1278, 'london-uk',     4.3::float),
        (35.6762,  139.6503, 'tokyo-jp',      4.9::float)
) AS city(lat, lon, label, seed)
CROSS JOIN generate_series(1, 20) AS idx
CROSS JOIN LATERAL (
    SELECT
        (idx * 2 * PI() / 20.0) + city.seed AS angle_rad,
        0.012 + 0.028 * (((idx * 17) % 10)::float / 10.0) AS radial_deg
) AS pos;
