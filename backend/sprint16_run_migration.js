// Sprint 16 — Fix fate_accounts.fate_xp (SUM not MAX)
// Run: $env:DATABASE_URL="postgresql://..."; node sprint16_run_migration.js
const { Client } = require('pg');
const fs = require('fs');

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('Connected.');

  const sql = fs.readFileSync('./sprint16_migration.sql', 'utf8');

  // Split on the verify SELECT to run migration + verify separately
  const [migration, verify] = sql.split('-- ── Verify');
  
  console.log('\nRunning migration...');
  await client.query(migration);
  console.log('✅ fate_accounts.fate_xp updated to SUM of hero XP');

  console.log('\nVerification:');
  const res = await client.query(
    `SELECT fa.email, fa.fate_xp AS account_fate_xp, fa.fate_level AS account_fate_level,
            COUNT(ri.root_id) AS hero_count, SUM(ri.hero_xp) AS heroes_xp_sum
     FROM fate_accounts fa
     JOIN root_identities ri ON ri.fate_account_id = fa.account_id
     GROUP BY fa.account_id, fa.email, fa.fate_xp, fa.fate_level
     ORDER BY fa.fate_xp DESC`
  );
  console.table(res.rows);

  await client.end();
  console.log('\nDone.');
}

run().catch(e => { console.error(e); process.exit(1); });
