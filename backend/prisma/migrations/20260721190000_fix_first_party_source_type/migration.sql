-- Correct the first-party source's TYPE, not just its existence.
--
-- 20260713003208_seed_first_party_source inserts this row with
-- source_type='first_party' ... ON CONFLICT (source_id) DO NOTHING.
--
-- That is idempotent about the ROW but silent about its COLUMNS. Any
-- environment where 'src-heroes-veritas-01' already existed — i.e. every
-- environment old enough to have players — kept its original
-- source_type='venue' and never learned it was first-party. Fresh
-- environments got it right, so staging has been green while production
-- has been wrong since 2026-07-13.
--
-- What that costs, concretely: ConsentService refuses withdrawal only
-- when sourceType === 'first_party'. With the row typed 'venue', Heroes'
-- Codex appears in "Who Witnesses You" as withdrawable and the WITHDRAW
-- button works. Every hero is FK-linked to this source, so a player who
-- pressed it severed themselves from their own game — which is the exact
-- outcome the guard was written to prevent.
--
-- Verified before writing this: production had source_type='venue' with
-- 3 live links; staging had 'first_party'.
--
-- UPDATE, not INSERT: the row is here, it is simply mislabelled.
-- Idempotent, and scoped to the one id — a blanket update by name would
-- catch real venues.

UPDATE sources
SET source_type = 'first_party',
    -- Also player-visible. Production still reads "Heroes' Veritas —
    -- Venue 01" in the consent list, which describes the game itself as
    -- a venue and undercuts the distinction the guard enforces.
    source_name = 'Heroes Veritas (first-party)'
WHERE source_id = 'src-heroes-veritas-01'
  AND source_type <> 'first_party';
