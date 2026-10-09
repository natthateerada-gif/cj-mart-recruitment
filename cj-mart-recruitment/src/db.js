const { Pool } = require('pg');
const { buildPoolConfig } = require('./dbConfig');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

// DATE columns (birth_date, start_date) come back as plain 'YYYY-MM-DD' strings instead
// of JS Dates, so the day can never shift with the server's time zone.
require('pg').types.setTypeParser(1082, (v) => v);

const pool = new Pool(buildPoolConfig());

pool.on('error', (err) => {
  // A background/idle client error should never crash the whole process.
  console.error('Unexpected Postgres pool error:', err);
});

module.exports = pool;
