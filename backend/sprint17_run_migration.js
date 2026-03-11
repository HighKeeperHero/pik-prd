const { Client } = require('pg');
const fs = require('fs');

async function run() {
  const connectionString = process.env.DATABASE_URL;
  const useSSL = !connectionString?.includes('nozomi.proxy');
  const client = new Client({
    connectionString,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
  });
  await client.connect();
  console.log('Connected.\n');

  const sql = fs.readFileSync('./sprint17_source_type_migration.sql', 'utf8');
  const [migration] = sql.split('-- 3. Verify');

  console.log('Running migration...');
  await client.query(migration);
  console.log('source_type column added');
  console.log('codex-platform source row inserted');

  const result = await client.query(
    'SELECT source_id, source_name, source_type, status FROM sources ORDER BY created_at'
  );
  console.table(result.rows);

  await client.end();
  console.log('Done.');
}

run().catch(e => { console.error(e); process.exit(1); });