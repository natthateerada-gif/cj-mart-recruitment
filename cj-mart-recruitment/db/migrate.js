// Runs schema.sql (idempotent: CREATE TABLE IF NOT EXISTS) and, unless
// SKIP_SEED=1 is set, seed.sql (default site text + chatbot answers; idempotent).
// Sample jobs / sample HR contacts live in seed-sample.sql and are loaded unless
// SEED_SAMPLE_DATA=0 (the Docker image sets it to 0 so production starts clean).
// Usage: npm run migrate

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { buildPoolConfig } = require('../src/dbConfig');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in first.');
    process.exit(1);
  }

  const pool = new Pool(buildPoolConfig());

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

      if (process.env.SEED_SAMPLE_DATA !== '0') {
        const sampleSql = fs.readFileSync(path.join(__dirname, 'seed-sample.sql'), 'utf8');
        console.log('Applying seed-sample.sql (sample jobs + HR contacts; set SEED_SAMPLE_DATA=0 to skip) ...');
        await pool.query(sampleSql);
        console.log('Sample data OK.');
      } else {
        console.log('SEED_SAMPLE_DATA=0 -> skipping sample jobs / HR contacts.');
      }
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
