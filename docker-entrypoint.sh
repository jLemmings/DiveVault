#!/bin/sh
set -eu

python -m migrations.migrate_postgres_schema

exec "$@"
