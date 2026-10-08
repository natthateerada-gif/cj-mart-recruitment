const { Pool } = require('pg');
const { buildPoolConfig } = require('./dbConfig');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

const pool = new Pool(buildPoolConfig());

pool.on('error', (err) => {
  // A background/idle client error should never crash the whole process.
  console.error('Unexpected Postgres pool error:', err);
});

module.exports = pool;
