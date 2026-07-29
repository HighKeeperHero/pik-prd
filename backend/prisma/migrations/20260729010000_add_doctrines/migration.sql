-- Phase 4: Doctrine (canon §13.5). One nullable JSONB column holding
-- the player's chosen branch node ids. Core nodes are implicit from
-- Job Level and doctrine definitions live in code (doctrine.catalog),
-- so future doctrines add NO migration. Additive + nullable —
-- deploying changes nothing until a hero chooses a branch.

ALTER TABLE "root_identities" ADD COLUMN "doctrines" JSONB;
