// Sprint 17 — source_type: differentiate venue vs platform sources
// Run from E:\pik_prd\backend\
// NOTE: Use DATABASE_PUBLIC_URL value from Railway when running locally
//$env:DATABASE_URL="postgresql://postgres:uLbqNhXYdaEvjhksHBFDQlXthABaJnTR@centerbeam.proxy.rlwy.net:20371/railway"; node sprint17_run_migration.js

const { Client } = require('pg');
const fs = require('fs');

async function run() {
  const connectionString = process.env.DATABASE_URL;
  // Use SSL for internal Railway URLs, disable for public proxy connections
  const useSSL = !connectionString?.includes('nozomi.proxy');
  const client = new Client({
    connectionString,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
  });
  await client.connect();
  console.log('Connected.\n');

  const sql = fs.readFileSync('./sprint17_source_type_migration.sql', 'utf8');

  // Split off the trailing SELECT (verify block) so pg doesn't error on multi-result
  const [migration] = sql.split('-- 3. Verify');

  console.log('Running migration...');
  await client.query(migration);
  console.log('✅ source_type column added to sources table');
  console.log('✅ codex-platform source row inserted');

  // Run the verify SELECT separately and print results
  console.log('\nVerifying sources table:');
  const result = await client.query(
    `SELECT source_id, source_name, source_type, status FROM sources ORDER BY created_at`
  );
  console.table(result.rows);

  await client.end();
  console.log('\nDone.');
}

run().catch(e => { console.error(e); process.exit(1); });
