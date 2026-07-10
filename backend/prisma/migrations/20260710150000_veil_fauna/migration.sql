-- Veil Fauna (2026-07-10): escaped creatures near tear sites.
-- Spawns are DETERMINISTIC (no spawn table — hashed from tear id +
-- time slot, like the procedural tears). These tables record the
-- hero's side: banishes (idempotence) and the bestiary tallies.

CREATE TABLE "fauna_banish" (
    "root_id" TEXT NOT NULL,
    "fauna_id" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "banished_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fauna_banish_pkey" PRIMARY KEY ("root_id", "fauna_id")
);

CREATE TABLE "hero_fauna" (
    "root_id" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "first_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hero_fauna_pkey" PRIMARY KEY ("root_id", "species")
);
