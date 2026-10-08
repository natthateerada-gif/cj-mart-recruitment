#!/bin/sh
# Container start-up: apply database migrations (idempotent), then run the server.
#   RUN_MIGRATIONS=false   skip migrations (e.g. IT applies db/schema.sql themselves)
#   MIGRATION_RETRIES      how many times to retry if the database is not up yet (default 10, 3s apart)
set -e

if [ "${RUN_MIGRATIONS:-true}" != "false" ]; then
  tries=0
  max="${MIGRATION_RETRIES:-10}"
  until node db/migrate.js; do
    tries=$((tries + 1))
    if [ "$tries" -ge "$max" ]; then
      echo "Migration failed after $tries attempts - giving up." >&2
      exit 1
    fi
    echo "Migration failed (database not ready?) - retry $tries/$max in 3s ..." >&2
    sleep 3
  done
fi

exec node src/server.js
