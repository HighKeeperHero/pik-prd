const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },  // required for Railway public endpoint
});

client.connect()
  .then(() => client.query(`
    SELECT quest_id, name, quest_type, min_level, sort_order
    FROM quest_templates
    WHERE quest_type LIKE 'veil%'
    ORDER BY sort_order
  `))
  .then(r => {
    console.log(`Found ${r.rows.length} veil quest templates:`);
    r.rows.forEach(q => console.log(` - [${q.sort_order}] ${q.name} (${q.quest_type}, min lvl ${q.min_level})`));
    if (r.rows.length === 0) console.log('⚠️  No seeds found — re-run sprint14_phase2_migration.sql');
    else console.log('✅ Seeds confirmed');
    return client.query(`
      SELECT event_id, name, shard_multiplier, cache_bonus, ends_at
      FROM convergence_events
      WHERE status = 'active'
    `);
  })
  .then(r => {
    console.log(`\nFound ${r.rows.length} active convergence event(s):`);
    r.rows.forEach(e => console.log(` - ${e.name} (×${e.shard_multiplier}, cache_bonus: ${e.cache_bonus}, ends: ${e.ends_at})`));
    if (r.rows.length === 0) console.log('⚠️  No active events — check if convergence_events table exists');
    else console.log('✅ Convergence events confirmed');
    client.end();
  })
  .catch(e => {
    console.error('Error:', e.message);
    if (e.message.includes('relation') && e.message.includes('does not exist')) {
      console.error('⚠️  Table missing — schema.prisma ConvergenceEvent model not deployed yet');
    }
    client.end();
    process.exit(1);
  });
