#!/bin/sh
set -eu

python /app/migrate_postgres_schema.py

exec "$@"
