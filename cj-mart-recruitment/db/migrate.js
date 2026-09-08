// Runs schema.sql (idempotent: CREATE TABLE IF NOT EXISTS) and, unless
// SKIP_SEED=1 is set, seed.sql (idempotent: ON CONFLICT DO NOTHING).
// Usage: npm run migrate

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in first.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
  });

  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    console.log('Applying schema.sql ...');
    await pool.query(schemaSql);
    console.log('Schema OK.');

    if (process.env.SKIP_SEED !== '1') {
      const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
      console.log('Applying seed.sql (safe to re-run) ...');
      await pool.query(seedSql);
      console.log('Seed OK.');
    }

    console.log('Migration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
