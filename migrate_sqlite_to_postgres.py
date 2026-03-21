#!/usr/bin/env python3
"""
Migrate dive data from the legacy SQLite database into PostgreSQL.

Usage:
    python migrate_sqlite_to_postgres.py --sqlite-path dives.db --database-url postgresql://dive:dive@localhost:5432/dive
"""

from __future__ import annotations

import argparse
import sqlite3

from postgres_store import import_sqlite_device_state, import_sqlite_dive_rows, open_db


def migrate(sqlite_path: str, database_url: str) -> None:
    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_conn.row_factory = sqlite3.Row
    pg_conn = open_db(database_url)

    try:
        device_state_rows = [dict(row) for row in sqlite_conn.execute("SELECT * FROM device_state").fetchall()]
        dive_rows = [dict(row) for row in sqlite_conn.execute("SELECT * FROM dives ORDER BY id ASC").fetchall()]

        migrated_device_state = import_sqlite_device_state(pg_conn, device_state_rows)
        migrated_dives = import_sqlite_dive_rows(pg_conn, dive_rows)

        print(f"Migrated device state rows: {migrated_device_state}")
        print(f"Migrated dives: {migrated_dives}")
        print(f"Skipped existing dives: {max(0, len(dive_rows) - migrated_dives)}")
    finally:
        sqlite_conn.close()
        pg_conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate dives from SQLite to PostgreSQL.")
    parser.add_argument("--sqlite-path", required=True, help="Path to the legacy SQLite database")
    parser.add_argument("--database-url", required=True, help="PostgreSQL connection string")
    args = parser.parse_args()
    migrate(args.sqlite_path, args.database_url)


if __name__ == "__main__":
    main()
