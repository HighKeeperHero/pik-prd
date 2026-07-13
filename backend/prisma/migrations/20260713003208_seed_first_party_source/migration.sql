-- Hero creation FK-depends on the first-party source row. Prod has
-- it from the original seed era; fresh environments (staging,
-- 2026-07-12) did not, so POST /api/account/heroes 500'd on FK
-- violation. Idempotent everywhere.
INSERT INTO sources (source_id, source_name, api_key_hash, status, source_type)
VALUES ('src-heroes-veritas-01', 'Heroes Veritas (first-party)', 'unused-first-party', 'active', 'first_party')
ON CONFLICT (source_id) DO NOTHING;
