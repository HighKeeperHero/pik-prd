-- Sprint 32 / Tier 2 identity-collection — Memoria
--
-- Each Memoria is a kept moment, granted idempotently when the
-- player crosses a defined identity threshold (Awakening, Fox
-- bond, first Mark, first rank-up, first Hearth claim).
--
-- Identity weight only — Memoria do not affect combat, XP, or
-- rewards. The grant trigger logic lives in MemoriaService
-- (TypeScript) keyed by trigger_key; the DB stores only the
-- display metadata + grant ledger.

CREATE TABLE "memoria_defs" (
    "memoria_id"    TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "lore"          TEXT NOT NULL,
    "glyph"         TEXT NOT NULL,
    "accent"        TEXT NOT NULL,
    "trigger_key"   TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "memoria_defs_pkey" PRIMARY KEY ("memoria_id")
);

CREATE TABLE "player_memoria" (
    "player_memoria_id" TEXT NOT NULL,
    "root_id"           TEXT NOT NULL,
    "memoria_id"        TEXT NOT NULL,
    "granted_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_event_id"   TEXT,
    CONSTRAINT "player_memoria_pkey" PRIMARY KEY ("player_memoria_id")
);

CREATE UNIQUE INDEX "player_memoria_root_id_memoria_id_key"
    ON "player_memoria"("root_id", "memoria_id");

CREATE INDEX "player_memoria_root_id_idx"
    ON "player_memoria"("root_id");

ALTER TABLE "player_memoria"
    ADD CONSTRAINT "player_memoria_root_id_fkey"
    FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "player_memoria"
    ADD CONSTRAINT "player_memoria_memoria_id_fkey"
    FOREIGN KEY ("memoria_id") REFERENCES "memoria_defs"("memoria_id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Seed: 5 starter Memoria ────────────────────────────────────
INSERT INTO "memoria_defs"
    ("memoria_id", "name", "lore", "glyph", "accent", "trigger_key", "display_order")
VALUES
    ('first_breath',
     'THE FIRST BREATH',
     'The breath you took when the world named you. You kept it.',
     '⌖', '#FFD86A', 'first_breath', 10),

    ('pressed_silver',
     'THE PRESSED SILVER',
     'A flake from your Reliquary when you first pressed the Mark into it. Tiny. Bright.',
     '◇', '#C8C8C8', 'pressed_silver', 20),

    ('bonded_whisker',
     'THE BONDED WHISKER',
     'A whisker your fox shed when it chose you. Light as nothing. Cannot be lost.',
     '⊹', '#FFB347', 'bonded_whisker', 30),

    ('first_threshold',
     'THE FIRST THRESHOLD',
     'The dust from the first threshold you stepped past. The Sanctum keeps it for you.',
     '⌐', '#9B7CB9', 'first_threshold', 40),

    ('hearth_coal',
     'THE HEARTH COAL',
     'An ember that did not go out. Warm against the silver, even now.',
     '✦', '#FF6F47', 'hearth_coal', 50);
