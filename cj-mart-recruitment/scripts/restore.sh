#!/bin/sh
# Restore a dump made by scripts/backup.sh into the database in DATABASE_URL.
#   DATABASE_URL=postgresql://... sh scripts/restore.sh backups/cjmart-YYYYmmdd-HHMMSS.dump
# --clean --if-exists drops and recreates the objects in the dump, so the target
# database's current data is REPLACED. Restore into an empty/staging database first.
set -eu
: "${DATABASE_URL:?DATABASE_URL is not set}"
file="${1:?usage: restore.sh <dump-file>}"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$file"
echo "Restore finished from $file"
