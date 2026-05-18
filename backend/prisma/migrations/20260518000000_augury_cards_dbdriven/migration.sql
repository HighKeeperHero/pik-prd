-- Sprint 31 — Modular content-injection (Augury deck → DB rows)
--
-- Per memory:strategic_north_star.md, this is the
-- "platform not game" architectural lever — the deck the daily
-- Augury Draw picks from moves from in-code constants to DB rows
-- so new cards, seasonal cards, and weight rebalancing ship
-- without a redeploy.
--
-- After this migration, sanctum.service.ts queries augury_cards
-- (active = true, optionally filtered by season) instead of the
-- AUGURY_DECK constant.

-- ── Table ───────────────────────────────────────────────────
CREATE TABLE "augury_cards" (
    "card_id"     TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "flavor"      TEXT NOT NULL,
    "rarity"      TEXT NOT NULL,
    "weight"      INTEGER NOT NULL,
    "rewards"     JSONB NOT NULL,
    "active"      BOOLEAN NOT NULL DEFAULT true,
    "season"      TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "augury_cards_pkey" PRIMARY KEY ("card_id")
);

CREATE INDEX "augury_cards_active_idx" ON "augury_cards"("active");
CREATE INDEX "augury_cards_season_idx" ON "augury_cards"("season");

-- ── Seed the v1 deck ────────────────────────────────────────
-- Mirrors the in-code AUGURY_DECK constant from Sprint 30 Slice 5.2.
-- Total weight = 50·4 + 35·3 + 15·2 + 5 + 2 = 342
--   common (58%), uncommon (31%), rare (9%), epic (1.5%), legendary (0.6%)

INSERT INTO "augury_cards" (card_id, name, flavor, rarity, weight, rewards) VALUES
    ('wisp-fragment',
     'WISP FRAGMENT',
     'A pale wisp drifts past your fingers.',
     'common', 50,
     '{"essence": 5}'),
    ('pale-coin',
     'PALE COIN',
     'A coin warmed by hands not your own.',
     'common', 50,
     '{"essence": 6}'),
    ('hearth-ash',
     'HEARTH ASH',
     'Ash from a hearth whose owner has gone.',
     'common', 50,
     '{"essence": 4, "fate_xp": 5}'),
    ('veil-mote',
     'VEIL MOTE',
     'A mote of Veil dust catches on your sleeve.',
     'common', 50,
     '{"fate_xp": 10}'),
    ('forge-spark',
     'FORGE SPARK',
     'A spark from a forge not your own.',
     'uncommon', 35,
     '{"essence": 10, "fate_xp": 10}'),
    ('reliquary-echo',
     'RELIQUARY ECHO',
     'The Reliquary at your throat warms briefly.',
     'uncommon', 35,
     '{"essence": 14}'),
    ('oath-thread',
     'OATH THREAD',
     'A thread pulled from an oath someone kept.',
     'uncommon', 35,
     '{"essence": 8, "fate_xp": 18}'),
    ('sealed-memory',
     'SEALED MEMORY',
     'A memory the Veil tried to keep.',
     'rare', 15,
     '{"essence": 20, "fate_xp": 25}'),
    ('mintmaster-mark',
     'MINTMASTER''S MARK',
     'A token marked by an unfamiliar sigil.',
     'rare', 15,
     '{"essence": 30}'),
    ('empyrean-glimmer',
     'EMPYREAN GLIMMER',
     'A glimmer of Empyrean color, brief but real.',
     'epic', 5,
     '{"essence": 40, "fate_xp": 40}'),
    ('oracular-vision',
     'THE ORACULAR SPEAKS',
     'A vision passes through you. You remember it later.',
     'legendary', 2,
     '{"essence": 30, "fate_xp": 80, "cache": {"type": "augury_legendary", "rarity": "epic"}}');
