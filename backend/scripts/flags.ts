// ============================================================
// Feature-flag CLI — list and set flags per channel.
//
//   npm run flags                       → list everything
//   npm run flags -- set <key> on|off             (all channels)
//   npm run flags -- set <key> on|off --channel alpha
//   npm run flags -- rm  <key> [--channel alpha]
//
// Against prod:
//   DATABASE_URL="$(railway variables --json | jq -r .DATABASE_PUBLIC_URL)" \
//     npm run flags -- set trail_whisper off --channel alpha
//
// Known keys the client gates on (defaults are fail-open true
// unless noted):
//   quest_ledger   — the QUESTS pin + Commissions book
//   trail_whisper  — the hub's serialized-tutorial whisper
//   practice_rite  — the rite's practice mode on spent days
//   fate_fox       — The Silent Witness beats (L50 gate server-side)
//   battle_v2      — gesture battles + timing + gear calibration
//   veil_fauna     — fauna markers + chase + bestiary shelf
//                    (client default is FALSE — ships dark; flip
//                    per channel to launch)
// ============================================================
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const cIdx = args.indexOf('--channel');
  const channel = cIdx >= 0 ? (args[cIdx + 1] ?? '') : '';
  // cIdx is -1 when --channel is absent; without the guard the
  // filter drops args[0] (i !== -1 + 1 = 0) and `set`/`rm` silently
  // fall through to list mode.
  const pos = cIdx < 0 ? args : args.filter((_, i) => i !== cIdx && i !== cIdx + 1);

  if (pos[0] === 'set') {
    const [, key, val] = pos;
    if (!key || !['on', 'off'].includes(val)) {
      console.error('usage: flags set <key> on|off [--channel <name>]');
      process.exit(1);
    }
    const enabled = val === 'on';
    await prisma.featureFlag.upsert({
      where:  { key_channel: { key, channel } },
      create: { key, channel, enabled },
      update: { enabled },
    });
    console.log(`${key} [${channel || 'all channels'}] → ${val}`);
  } else if (pos[0] === 'rm') {
    const [, key] = pos;
    await prisma.featureFlag.deleteMany({ where: { key, channel } });
    console.log(`${key} [${channel || 'all channels'}] removed`);
  } else {
    const rows = await prisma.featureFlag.findMany({
      orderBy: [{ key: 'asc' }, { channel: 'asc' }],
    });
    if (rows.length === 0) console.log('(no flags set — clients run on their built-in defaults)');
    for (const r of rows) {
      console.log(`${r.key.padEnd(24)} ${(r.channel || '*').padEnd(10)} ${r.enabled ? 'on' : 'off'}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
