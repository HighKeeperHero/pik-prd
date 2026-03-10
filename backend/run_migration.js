const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Sprint 13 — Veil Tears migration
// File lives at: E:\pik_prd\backend\run_migration.js
// SQL lives at:  E:\pik_prd\sprint13_veil_migration.sql

const sql = fs.readFileSync(path.join(__dirname, '..', 'sprint13_veil_migration.sql'), 'utf8');

const client = new Client({
  connectionString: 'postgresql://postgres:xndEXPLVCQSpOXSiJEroPTzGlEcsiwOH@nozomi.proxy.rlwy.net:20321/railway',
  ssl: { rejectUnauthorized: false },
});

client.connect()
  .then(() => {
    console.log('Connected. Running Sprint 13 migration...');
    return client.query(sql);
  })
  .then(() => {
    console.log('Migration OK — tables created.');
    return client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name IN ('veil_shards','tear_encounters') ORDER BY table_name"
    );
  })
  .then(r => {
    const found = r.rows.map(x => x.table_name);
    console.log('Verified tables:', found);
    if (found.length === 2) {
      console.log('✅ Both tables confirmed: veil_shards + tear_encounters');
    } else {
      console.warn('⚠️  Expected 2 tables, found:', found.length);
    }
    client.end();
  })
  .catch(e => {
    console.error('Error:', e.message);
    client.end();
    process.exit(1);
  });
