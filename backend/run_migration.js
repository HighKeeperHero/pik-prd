const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'migration_nexus_components.sql'), 'utf8');

const client = new Client({
  connectionString: 'postgresql://postgres:xndEXPLVCQSpOXSiJEroPTzGlEcsiwOH@nozomi.proxy.rlwy.net:20321/railway',
  ssl: { rejectUnauthorized: false },
});

client.connect()
  .then(() => {
    console.log('Connected. Running migration...');
    return client.query(sql);
  })
  .then(() => {
    console.log('Migration OK — tables created.');
    return client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name IN ('player_nexus','player_components') ORDER BY table_name"
    );
  })
  .then(r => {
    console.log('Verified tables:', r.rows.map(x => x.table_name));
    client.end();
  })
  .catch(e => {
    console.error('Error:', e.message);
    client.end();
    process.exit(1);
  });
