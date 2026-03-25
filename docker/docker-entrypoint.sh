#!/bin/sh
set -eu

python /app/migrations/migrate_postgres_schema.py

exec "$@"
