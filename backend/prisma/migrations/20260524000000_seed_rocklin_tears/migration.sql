-- Sprint 32 / dev-test — seed Veil tears around Rocklin CA
-- (2nd Street, 95677 → 38.7949, -121.2364) so the Map populates
-- for the local tester. Rocklin sits ~13 km from the Folsom seed,
-- outside its radial bands, so the existing 270 don't reach here.
--
-- Mirrors the 20260514010000 radial-band layout exactly: 30 tears
-- layered by tier so each query band has density at its radius.
--   T1: 10 tears at 0.005-0.014 deg (~0.55-1.55 km) — inner ring
--   T2:  8 tears at 0.013-0.022 deg (~1.44-2.44 km) — middle
--   T3:  7 tears at 0.018-0.034 deg (~2.00-3.78 km) — mid-outer
--   T4:  5 tears at 0.025-0.045 deg (~2.78-5.00 km) — outer ring
--
-- ADDITIVE — does NOT wipe existing tears. Brings the total to
-- 300 (still within phase-2.md's 150-300 target).

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
        (38.7949134, -121.2363619, 'rocklin-ca', 5.5::float)
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
        CASE
            WHEN idx <= 10 THEN 0.005 + 0.009 * ((idx - 1)::float  / 9.0)
            WHEN idx <= 18 THEN 0.013 + 0.009 * ((idx - 11)::float / 7.0)
            WHEN idx <= 25 THEN 0.018 + 0.016 * ((idx - 19)::float / 6.0)
            ELSE                0.025 + 0.020 * ((idx - 26)::float / 4.0)
        END AS radial_deg,
        ((idx * 13.7) + city.seed) AS angle_rad
) AS pos;
