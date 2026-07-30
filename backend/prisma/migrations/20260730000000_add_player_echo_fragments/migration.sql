-- Hero Echoes (canon §13.9 unification): per-player fragment
-- progress toward registering a hero of Elysendar at the Altar.
-- The catalog lives in code — new heroes need no migration.
-- Additive; deploying changes nothing until fragments drop.

CREATE TABLE "player_echo_fragments" (
    "fragment_id"   TEXT NOT NULL,
    "root_id"       TEXT NOT NULL,
    "echo_id"       TEXT NOT NULL,
    "fragments"     INTEGER NOT NULL DEFAULT 0,
    "registered_at" TIMESTAMP(3),
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_echo_fragments_pkey" PRIMARY KEY ("fragment_id")
);

CREATE UNIQUE INDEX "player_echo_fragments_root_id_echo_id_key"
    ON "player_echo_fragments"("root_id", "echo_id");

ALTER TABLE "player_echo_fragments"
    ADD CONSTRAINT "player_echo_fragments_root_id_fkey"
    FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
