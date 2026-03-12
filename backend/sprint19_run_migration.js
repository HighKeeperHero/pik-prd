const { Client } = require('pg');
const fs = require('fs');

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) { console.error('DATABASE_URL not set'); process.exit(1); }
  const useSSL = !connectionString.includes('nozomi.proxy');
  const client = new Client({ connectionString, ssl: useSSL ? { rejectUnauthorized: false } : false });
  await client.connect();
  console.log('Connected.');

  const sql = fs.readFileSync('./sprint19_job_quest_migration.sql', 'utf8');
  // Run everything up to the verify queries
  const [migration] = sql.split('-- 3. Verify');
  await client.query(migration);
  console.log('Migration applied.');

  // Verify root_identities columns
  const colResult = await client.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'root_identities'
      AND column_name IN ('job_level', 'job_class')
    ORDER BY column_name;
  `);
  console.log('\nroot_identities new columns:');
  console.table(colResult.rows);

  // Verify job_quests table
  const tableResult = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_name = 'job_quests';
  `);
  console.log('job_quests table exists:', tableResult.rows.length > 0);

  await client.end();
  console.log('\nSprint 19 migration complete.');
}

run().catch(e => { console.error(e); process.exit(1); });
