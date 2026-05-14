-- Sprint 29 / Arc B — Re-seed world_tears with better radial
-- distribution + tier density.
--
-- The initial seed (20260514000000) used uniform tier counts per
-- city (8/6/4/2) and a single radial band, which produced two
-- visible shortfalls in the L1 and L35 test queries against SF:
--   * L1 (2km radius): only 4 of expected ~9 tears appeared
--     — most seeded tears were beyond the 2km ring.
--   * L35 (5km radius): T3 capped at 4 and T4 at 2 — the entire
--     per-city allocation for those tiers, so high-level players
--     at any city center couldn't satisfy the band's mix.
--
-- New seed per city: 30 tears, layered radially by tier so each
-- band has enough density at its query radius.
--   T1: 10 tears at 0.005-0.014 deg (0.55-1.55 km) — inner ring
--   T2:  8 tears at 0.013-0.022 deg (1.44-2.44 km) — middle
--   T3:  7 tears at 0.018-0.034 deg (2.00-3.78 km) — mid-outer
--   T4:  5 tears at 0.025-0.045 deg (2.78-5.00 km) — outer ring
--
-- Aggregate: 9 cities × 30 = 270 tears (90 T1, 72 T2, 63 T3, 45 T4).
-- Total stays within phase-2.md's "150-300 seeded" target.

-- ── Wipe existing seed ──────────────────────────────────────
-- Safe: no encounter recording references world_tears yet
-- (slice 3 wires that), so no sealed_by_root_id rows to preserve.
DELETE FROM "world_tears";

-- ── Re-insert with layered radial bands ─────────────────────
INSERT INTO "world_tears" (tear_id, lat, lon, tier, status, spawned_at, region_label)
SELECT
    gen_random_uuid()::text,
    city.lat + radial_deg * SIN(angle_rad),
    city.lon + radial_deg * COS(angle_rad) / COS(RADIANS(city.lat)),
    tier,
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
CROSS JOIN generate_series(1, 30) AS idx
CROSS JOIN LATERAL (
    SELECT
        CASE
            WHEN idx <= 10 THEN 'T1'
            WHEN idx <= 18 THEN 'T2'
            WHEN idx <= 25 THEN 'T3'
            ELSE                'T4'
        END AS tier,
        -- Tier-banded radial: linear interpolation within each band
        -- so the closest tear of each tier is at the band's inner edge.
        CASE
            WHEN idx <= 10 THEN 0.005 + 0.009 * ((idx - 1)::float  / 9.0)
            WHEN idx <= 18 THEN 0.013 + 0.009 * ((idx - 11)::float / 7.0)
            WHEN idx <= 25 THEN 0.018 + 0.016 * ((idx - 19)::float / 6.0)
            ELSE                0.025 + 0.020 * ((idx - 26)::float / 4.0)
        END AS radial_deg,
        -- Angle spread: distribute around the city by a fast-cycling
        -- multiplier so consecutive idx values aren't clumped together.
        ((idx * 13.7) + city.seed) AS angle_rad
) AS pos;
