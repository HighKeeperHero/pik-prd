// ============================================================
// Sprint 15 — run_migration.js
// Run: $env:DATABASE_URL="postgresql://..."; node .\run_migration.js
// (place this file in E:\pik_prd\backend\)
// ============================================================
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, 'sprint15_migration.sql'),
  'utf8'
);

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('Connected. Running Sprint 15 migration...');

  await client.query(sql);

  // Print verification
  const { rows } = await client.query(`
    SELECT 'veil loot entries' AS label, COUNT(*)::int AS count
      FROM loot_table WHERE cache_type LIKE 'veil%'
    UNION ALL
    SELECT 'heroes with hero_level', COUNT(*)::int
      FROM root_identities WHERE hero_level IS NOT NULL
    UNION ALL
    SELECT 'accounts with fate_level', COUNT(*)::int
      FROM fate_accounts WHERE fate_level IS NOT NULL
  `);
  console.table(rows);
  console.log('✅ Sprint 15 migration complete');
  await client.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
