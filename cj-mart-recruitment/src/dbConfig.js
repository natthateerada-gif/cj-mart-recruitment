// One place that turns environment variables into a node-postgres config, shared
// by the web app (src/db.js) and the migration runner (db/migrate.js).
//
//   DATABASE_URL   postgresql://user:pass@host:5432/dbname   (required)
//   PGSSL          "true"   (default) TLS on, certificate NOT verified
//                  "verify" TLS on, certificate verified (set PGSSL_CA_FILE if the
//                           server uses a private/internal CA)
//                  "false"  no TLS (typical for a Postgres on the same private network)
//   PGSSL_CA_FILE  path to a PEM CA certificate (only used with PGSSL=verify)
//   PG_POOL_MAX    max connections per app instance (default 10)

const fs = require('fs');

function buildPoolConfig() {
  const mode = String(process.env.PGSSL || 'true').toLowerCase();
  let ssl;
  if (mode === 'false' || mode === '0' || mode === 'off') {
    ssl = false;
  } else if (mode === 'verify') {
    ssl = { rejectUnauthorized: true };
    if (process.env.PGSSL_CA_FILE) ssl.ca = fs.readFileSync(process.env.PGSSL_CA_FILE, 'utf8');
  } else {
    ssl = { rejectUnauthorized: false };
  }
  const max = parseInt(process.env.PG_POOL_MAX, 10);
  return {
    connectionString: process.env.DATABASE_URL,
    ssl,
    max: Number.isFinite(max) && max > 0 ? max : 10,
  };
}

module.exports = { buildPoolConfig };
