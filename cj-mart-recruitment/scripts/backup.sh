#!/bin/sh
# Dump the whole database (applications, attachments, jobs, settings ...) to a
# compressed file. Needs the PostgreSQL client tools (pg_dump) on the machine
# running it - or run it where the database lives.
#   DATABASE_URL=postgresql://... sh scripts/backup.sh [output_dir]
#   RETENTION_DAYS=30   delete dumps older than this many days (default 30, 0 = keep all)
# The dump contains applicants' personal data (incl. resumes/photos): store it
# encrypted / access-controlled, and apply the company retention policy.
set -eu
: "${DATABASE_URL:?DATABASE_URL is not set}"
dir="${1:-./backups}"
mkdir -p "$dir"
umask 077
file="$dir/cjmart-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$file"
echo "Backup written: $file"
days="${RETENTION_DAYS:-30}"
if [ "$days" -gt 0 ]; then
  find "$dir" -name 'cjmart-*.dump' -type f -mtime +"$days" -print -delete
fi
