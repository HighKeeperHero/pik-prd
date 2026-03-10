// Sprint 16b — Dual XP Curves: Hero vs Fate Account
// Run: $env:DATABASE_URL="postgresql://..."; node sprint16b_run_migration.js
const { Client } = require('pg');
const fs = require('fs');

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('Connected.\n');

  const sql = fs.readFileSync('./sprint16b_migration.sql', 'utf8');
  const [migration] = sql.split('-- ── Verify');

  console.log('Running migration...');
  await client.query(migration);
  console.log('✅ Config keys seeded');
  console.log('✅ hero_level recalculated from hero_xp (250 XP/level)');
  console.log('✅ fate_accounts.fate_xp = SUM of all heroes\' hero_xp');
  console.log('✅ fate_accounts.fate_level recalculated (375 XP/level)');

  console.log('\nVerification:');
  const check = await client.query(`
    SELECT fa.email,
           fa.fate_xp   AS account_fate_xp,
           fa.fate_level AS account_fate_level,
           ri.hero_name,
           ri.hero_xp,
           ri.hero_level
    FROM fate_accounts fa
    JOIN root_identities ri ON ri.fate_account_id = fa.account_id
    ORDER BY fa.email, ri.hero_xp DESC
  `);
  console.table(check.rows);

  const cfg = await client.query(
    `SELECT config_key, config_value FROM config WHERE config_key IN ('fate.xp_per_level','fate.account_xp_per_level')`
  );
  console.log('\nConfig keys:');
  console.table(cfg.rows);

  await client.end();
  console.log('\nDone.');
}

run().catch(e => { console.error(e); process.exit(1); });
