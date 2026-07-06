// ============================================================
// seed-lore.ts — Lore Archive catalog (2026-07-06)
//
// Idempotent (upsert by slug): safe to re-run on any environment.
// Run with:  npm run seed:lore
//
// The Archive is a Pokémon-Go-style collection quest: heroes
// recover entries by sealing tears in the world (rarity-weighted
// drop of a not-yet-found entry — see LoreService). The Library's
// restoration level on the client is weighted by finds. Adding a
// row here ships new collectible content without a redeploy.
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

interface Entry {
  id: string; title: string; category: string; rarity: Rarity;
  glyph: string; body: string;
}

const E = (
  id: string, title: string, category: string, rarity: Rarity,
  glyph: string, body: string,
): Entry => ({ id, title, category, rarity, glyph, body });

const CATALOG: Entry[] = [
  // ── THE VEIL ────────────────────────────────────────────── (10)
  E('veil_the_veil', 'THE VEIL', 'veil', 'common', '✦',
    'Between the world that is and the world that waits, a membrane thinner than breath. Most live and die without brushing it. The Awakened feel it the way a sailor feels weather — before it arrives.'),
  E('veil_first_tear', 'THE FIRST TEAR', 'veil', 'epic', '✦',
    'It opened above the Origin Sands, where the dunes still glow faintly on moonless nights. No record agrees on what came through. Every record agrees the world was quieter before.'),
  E('veil_essence', 'VEIL ESSENCE', 'veil', 'common', '✦',
    'Where the Veil thins, it sheds. The shed light gathers in hollows and wounds of the world, waiting to be carried home. Essence is not power. It is *potential* — refinement decides the rest.'),
  E('veil_wisps', 'WISPS', 'veil', 'common', '✦',
    'Small hungers of light that pool near braziers and old stone. Harmless, mostly. The Awakened harvest them the way farmers gather rain — daily, gratefully, without ceremony.'),
  E('veil_tears_minor', 'MINOR TEARS', 'veil', 'common', '✦',
    'Pinpricks in the membrane, self-sealing given a season. Left alone they whistle. Sealed by a hero, they remember the hand that closed them.'),
  E('veil_tears_wander', 'WANDERING TEARS', 'veil', 'uncommon', '✦',
    'Some tears drift, dragging their thin place behind them like a net. Chasing one across a night is a rite of passage; catching it before it crosses water is a story worth telling.'),
  E('veil_tears_dormant', 'DORMANT RIFTS', 'veil', 'rare', '✦',
    'Old tears that scarred over wrong. They sleep beneath market squares and barrow-hills, breathing slow. Waking one to seal it properly is not bravery. It is housekeeping, at scale.'),
  E('veil_convergence', 'CONVERGENCE', 'veil', 'epic', '✦',
    'When two tears open eye-to-eye, the space between them stops being space. The old orders called it a doubling. Survivors call it something unprintable. Both are correct.'),
  E('veil_the_quiet', 'THE QUIET', 'veil', 'rare', '✦',
    'Where the Veil is whole, there is a stillness the ear mistakes for silence. It is not silence. It is the sound of a seam holding.'),
  E('veil_attunement', 'ATTUNEMENT', 'veil', 'uncommon', '✦',
    'The Veil cannot reach through noise. The Awakened practice stepping outside it — screens dark, hands busy, breath counted — not as virtue, but as maintenance of the only instrument that hears.'),

  // ── REGIONS ─────────────────────────────────────────────── (10)
  E('region_kingvale', 'KINGVALE, THE ORDERED HEART', 'regions', 'common', '⊞',
    'Kingdom of steel and law. Its banners are laundered, its oaths notarized, its heroes registered. The Veil respects none of this, which is why Kingvale trains harder than anyone.'),
  E('region_kingvale_halls', 'THE BANNER HALLS', 'regions', 'uncommon', '⊞',
    'Every oath sworn in Kingvale is recorded twice: once in ink, once in the long memory of the halls themselves. Stones that have heard ten thousand promises begin, faintly, to keep score.'),
  E('region_wylds', 'THE WYLDS, THE LIVING GREEN', 'regions', 'common', '⊞',
    'Untamed forest where the old magic never left — it simply stopped answering to names. Druids do not command the green. They are, at best, on speaking terms.'),
  E('region_wylds_roots', 'OLD MAGIC IN THE ROOTS', 'regions', 'rare', '⊞',
    'Beneath the Wylds the roots braid into something too deliberate to be accident. Hunters who sleep on bare ground there report the same dream: a door, ajar, politely waiting.'),
  E('region_origin_sands', 'ORIGIN SANDS, THE BURNING WASTE', 'regions', 'common', '⊞',
    'Endless dunes and endless markets — the waste sells everything, including directions out. Here the first Veil tore, and here its glow still surfaces after storms, like a wreck refusing to stay sunk.'),
  E('region_sands_markets', 'THE DUNE MARKETS', 'regions', 'uncommon', '⊞',
    'A merchant of the Sands can price anything in thirty seconds: relic, rumor, silence. The one thing never sold is a map to the first tear. Some inventory is reputation.'),
  E('region_lochmaw', 'LOCHMAW, THE DROWNED COAST', 'regions', 'common', '⊞',
    'Salt, storm, and black tide. Lochmaw buries its dead above ground and its secrets below the waterline. Its sailors say the sea remembers better than the Codex — and charges more to forget.'),
  E('region_lochmaw_tide', 'THE BLACK TIDE', 'regions', 'rare', '⊞',
    'Twice a year the tide comes in dark and stays a week. Nets come up empty. Harbor bells ring on their own. The Veil is thin over deep water, and the deep water knows it.'),
  E('region_lochmaw_harbor', 'HARBOR OF THE LOST', 'regions', 'uncommon', '⊞',
    'Every drowned coast keeps one harbor that ships reach without meaning to. Lochmaw\'s is lit all night, every night. Nobody tends the lamps. This is considered rude to mention.'),
  E('region_the_roads', 'THE LONG ROADS', 'regions', 'common', '⊞',
    'Between the four realms run roads older than any of them. Travelers and nomads swear the roads shorten for the grateful and lengthen for the proud. Cartographers have stopped arguing.'),

  // ── RITES OF THE SANCTUM ────────────────────────────────── (8)
  E('rite_sanctum', 'THE SANCTUM', 'rites', 'common', '◈',
    'A Sanctum is not built once. It is built every day. The shelter that turned last spring\'s thunderstorm will need attending before winter. Its strength was never stone. It is upkeep.'),
  E('rite_hearth', 'TENDING THE HEARTH', 'rites', 'common', '◈',
    'The first rite and the humblest: feed the flame, and the flame feeds the house. A hearth tended daily parts differently for its keeper — warmer, older, more like a voice.'),
  E('rite_oath', 'THE DAILY OATH', 'rites', 'common', '◈',
    'An oath sworn once is a decoration. An oath renewed daily is architecture. The Sanctum hears both, and only one holds weight when the walls are tested.'),
  E('rite_augury', 'THE AUGURY', 'rites', 'uncommon', '◈',
    'Three cards, face-down, laid by no hand you can see. The Veil does not tell fortunes — it makes *offers*. Turning all three is not greed. Leaving one unturned is not wisdom. It is only waiting.'),
  E('rite_trial', 'THE WISP HARVEST', 'rites', 'common', '◈',
    'At the courtyard brazier the wisps gather thickest. The daily walk among them — patient, open-handed — is called a trial only because the old word for it, *gleaning*, fell out of use.'),
  E('rite_reliquary', 'THE RELIQUARY', 'rites', 'uncommon', '◈',
    'Raw essence is weather; the Reliquary is the cistern. It bleeds the day\'s gathering into the Void Chamber drop by drop, because refinement — like every honest thing — refuses to be hurried.'),
  E('rite_void_chamber', 'THE VOID CHAMBER', 'rites', 'rare', '◈',
    'Between the Reliquary and the Nexus sits a room with no inside, where essence forgets its shape and learns a better one. Keepers do not enter. Keepers *wait*, which is harder.'),
  E('rite_runemark', 'THE RUNEMARK GLOVES', 'rites', 'legendary', '◈',
    'Worn only by those the Nexus has come to trust, after long proving. With them, refined essence takes lasting form — minted, marked, and bound to its maker\'s name. The gloves do not grant the right. They *recognize* it.'),

  // ── BESTIARY ────────────────────────────────────────────── (7)
  E('beast_tearborn', 'THE TEAR-BORN', 'bestiary', 'common', '⚔',
    'What comes through a tear is rarely a creature and never only an animal. Tear-born wear shapes the way travelers wear borrowed coats — badly, and only until they learn the local cut.'),
  E('beast_veilings', 'VEILINGS', 'bestiary', 'common', '⚔',
    'The small ones. Scraps of otherwhere given appetite. A sealed tear starves them; an ignored one grows them. Every hero\'s first fight is with a veiling, and no hero forgets the smell.'),
  E('beast_duskstalkers', 'DUSK-STALKERS', 'bestiary', 'uncommon', '⚔',
    'They follow wandering tears the way gulls follow ships. Fast, patient, allergic to firelight. Hunters of the Wylds leave a second campfire burning cold — a decoy hearth — and sleep soundly.'),
  E('beast_barrow_wights', 'BARROW-WIGHTS OF LOCHMAW', 'bestiary', 'rare', '⚔',
    'Where dormant rifts sleep under grave-ground, what wakes first is seldom the rift. The barrow-wights are not the dead returned. They are the dead *borrowed*, and the debt is collectible.'),
  E('beast_sandmaw', 'THE SANDMAW', 'bestiary', 'rare', '⚔',
    'The Burning Waste has one story every caravan tells and none can source: a hunger under the dunes older than the first tear, which surfaces only where the Veil-glow shows. The markets sell charms against it. The charms are excellent business.'),
  E('beast_convergent', 'CONVERGENT HORRORS', 'bestiary', 'epic', '⚔',
    'When tears double, what crosses is not from the world that waits — it is from the *between*, and the between does not send its small things. Survivors describe them all differently. Survivors are not contradicting each other.'),
  E('beast_fate_fox', 'THE FATE FOX', 'bestiary', 'uncommon', '⚔',
    'Not tear-born. Not quite worldly either. A fox that finds a hero — never the reverse — and lends its luck the way old friends lend money: freely, and with an unreadable smile.'),

  // ── THE ORDERS ──────────────────────────────────────────── (5)
  E('order_awakened', 'THE AWAKENED', 'orders', 'common', '⚖',
    'Not chosen. Not born. *Woken* — by grief, by wonder, by a tear opening two streets over. What the Awakened share is not power but the inability to pretend they did not see.'),
  E('order_codex', 'THE HEROES\' CODEX', 'orders', 'uncommon', '⚖',
    'The great record that outlives its recorders. Every seal, oath, and title is entered; nothing is ever struck. The Codex does not judge its heroes. It does something worse. It *remembers* them.'),
  E('order_keepers', 'THE KEEPERS', 'orders', 'uncommon', '⚖',
    'Those who hold a Sanctum hold a seam of the world. The old orders ranked warriors above keepers for three centuries, then spent a fourth apologizing.'),
  E('order_wardens', 'THE VEIL WARDENS', 'orders', 'rare', '⚖',
    'Circuit-riders of the thin places. A warden\'s whole doctrine fits on a saddle-tag: *find it, seal it, thank the town, ride on*. Their whole heresy fits there too: *no tear is anyone\'s fault.*'),
  E('order_high_keeper', 'THE HIGH KEEPER', 'orders', 'epic', '⚖',
    'Whether the office is one unbroken life or an unbroken line of lives is the Codex\'s best-kept ambiguity. Petitioners are received at dusk, in the Library, by candlelight that no one lights.'),
];

async function main() {
  console.log('=== SEED: LORE ARCHIVE ===');
  let order = 0;
  for (const e of CATALOG) {
    await prisma.loreEntry.upsert({
      where:  { id: e.id },
      update: {
        title: e.title, category: e.category, rarity: e.rarity,
        body: e.body, glyph: e.glyph, displayOrder: order,
      },
      create: {
        id: e.id, title: e.title, category: e.category, rarity: e.rarity,
        body: e.body, glyph: e.glyph, displayOrder: order,
      },
    });
    order += 10;
  }
  console.log(`  ✓ ${CATALOG.length} lore entries`);
  console.log('=== LORE SEED COMPLETE ===');
}

main()
  .catch((e) => { console.error('Lore seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
