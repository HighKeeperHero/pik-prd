-- Sprint 31 / Tier 2 companion-bond — Fate Fox
--
-- Per docs/canon/progression.md § 6, every Awakened may bond one
-- Fate Fox. The bond is permanent on both sides; rootId is unique.
-- Fox is a modifier layer (XP yield, cache nudges, future seasonal
-- effects) — NEVER combat power.
--
-- v1 stores only id/rootId/name/bondedAt. Level is derived in-app
-- from fate_level (canon: "Fox Level grows alongside Fate at a
-- smaller multiplier"). Cosmetic / modifier-slot configuration
-- comes in later slices.

CREATE TABLE "fate_foxes" (
    "fox_id"    TEXT NOT NULL,
    "root_id"   TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "bonded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fate_foxes_pkey" PRIMARY KEY ("fox_id")
);

CREATE UNIQUE INDEX "fate_foxes_root_id_key" ON "fate_foxes"("root_id");

ALTER TABLE "fate_foxes"
    ADD CONSTRAINT "fate_foxes_root_id_fkey"
    FOREIGN KEY ("root_id") REFERENCES "root_identities"("root_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
