// ============================================================
// seed-augury-tarot.ts — the tarot Augury deck (2026-07-07)
//
// Tim's design: 8 face archetypes, each bound to ONE reward
// identity; the card's RARITY scales the magnitude. 8 × 5
// rarities = 40 cards. Deactivates the old Sprint 31 deck
// (active=false — never deletes) and upserts the new one.
//
// Idempotent. Run with:  npm run seed:augury
//
// Reward identities:
//   Traveler      → Fate XP (the road teaches)
//   Dragon Slayer → Fate XP, heavier (glory)
//   Merchant      → Veil Essence
//   Queen         → Veil Essence, richer (court favor)
//   Wizard        → Essence + XP (arcane exchange)
//   Scholar       → a Lore Archive entry + XP (the lost page)
//   Huntress      → a sealed cache of the card's rarity
//   King          → Essence + XP; epic/legendary add a cache
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// Magnitude ladder — doubles per step.
const MULT: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 4, epic: 8, legendary: 16 };

// Per-card pick weights (≈ old deck's rarity distribution).
const WEIGHT: Record<Rarity, number> = { common: 90, uncommon: 48, rare: 14, epic: 2, legendary: 1 };

interface Archetype {
  key:    string;                 // id prefix + face art key
  name:   string;
  flavor: string;
  base:   { essence?: number; fate_xp?: number };
  lore?:  boolean;                // Scholar — one Archive entry
  cache?: 'always' | 'epic_up';   // Huntress / King
}

const ARCHETYPES: Archetype[] = [
  { key: 'traveler',     name: 'THE TRAVELER',      flavor: 'Long miles, honest lessons.',                       base: { fate_xp: 8 } },
  { key: 'dragonslayer', name: 'THE DRAGON SLAYER', flavor: 'Glory is heavy. Carry it anyway.',                  base: { fate_xp: 12 } },
  { key: 'merchant',     name: 'THE MERCHANT',      flavor: 'Every deal leaves a residue of fortune.',           base: { essence: 4 } },
  { key: 'queen',        name: 'THE QUEEN',         flavor: 'The court remembers its own.',                      base: { essence: 6 } },
  { key: 'wizard',       name: 'THE WIZARD',        flavor: 'Power answers a practiced hand.',                   base: { essence: 2, fate_xp: 5 } },
  { key: 'scholar',      name: 'THE SCHOLAR',       flavor: 'A page the world thought lost finds you instead.',  base: { fate_xp: 4 }, lore: true },
  { key: 'huntress',     name: 'THE HUNTRESS',      flavor: 'The hunt provides. It always has.',                 base: {}, cache: 'always' },
  { key: 'king',         name: 'THE KING',          flavor: "A crown's gratitude, weighed in gold.",             base: { essence: 4, fate_xp: 6 }, cache: 'epic_up' },
];

function rewardsFor(a: Archetype, rarity: Rarity) {
  const m = MULT[rarity];
  const rewards: Record<string, unknown> = {};
  if (a.base.essence) rewards.essence = a.base.essence * m;
  if (a.base.fate_xp) rewards.fate_xp = a.base.fate_xp * m;
  if (a.lore) rewards.lore = true;
  if (a.cache === 'always' || (a.cache === 'epic_up' && (rarity === 'epic' || rarity === 'legendary'))) {
    rewards.cache = { type: 'level_up', rarity };
  }
  return rewards;
}

async function main() {
  console.log('=== SEED: AUGURY TAROT DECK ===');

  // Retire the previous deck (keep rows — history + rollback).
  const retired = await prisma.auguryCard.updateMany({
    where: { active: true, id: { notIn: ARCHETYPES.flatMap(a => RARITIES.map(r => `${a.key}_${r}`)) } },
    data:  { active: false },
  });
  console.log(`  ✓ retired ${retired.count} previous cards`);

  let n = 0;
  for (const a of ARCHETYPES) {
    for (const rarity of RARITIES) {
      const id = `${a.key}_${rarity}`;
      const row = {
        name:    a.name,
        flavor:  a.flavor,
        rarity,
        weight:  WEIGHT[rarity],
        rewards: rewardsFor(a, rarity) as object,
        active:  true,
        season:  null as string | null,
      };
      await prisma.auguryCard.upsert({
        where:  { id },
        update: row,
        create: { id, ...row },
      });
      n++;
    }
  }
  console.log(`  ✓ ${n} tarot cards (8 archetypes × 5 rarities)`);
  console.log('=== AUGURY TAROT SEED COMPLETE ===');
}

main()
  .catch((e) => { console.error('Augury tarot seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
