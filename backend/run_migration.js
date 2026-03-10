const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Dedupe — removes duplicate quest_templates + convergence_events
// from migration running twice.
// SQL lives at: E:\pik_prd\sprint14_dedupe.sql

const sql = fs.readFileSync(path.join(__dirname, '..', 'sprint14_dedupe.sql'), 'utf8');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

client.connect()
  .then(() => {
    console.log('Connected. Running dedupe...');
    return client.query(sql);
  })
  .then(results => {
    // Last query is the verification SELECT
    const rows = Array.isArray(results) ? results[results.length - 1].rows : results.rows;
    console.log('Remaining rows after dedupe:');
    rows.forEach(r => console.log(` - ${r.tbl}: ${r.count}`));
    const qt = rows.find(r => r.tbl === 'quest_templates');
    const ce = rows.find(r => r.tbl === 'convergence_events');
    if (qt?.count == 8 && ce?.count == 1) {
      console.log('✅ Dedupe complete — 8 quest templates, 1 convergence event');
    } else {
      console.log('⚠️  Unexpected counts — check manually');
    }
    client.end();
  })
  .catch(e => {
    console.error('Error:', e.message);
    client.end();
    process.exit(1);
  });
