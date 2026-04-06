#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import psycopg
from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

load_dotenv(REPO_ROOT / ".env")

from divevault.postgres_store import init_db


def main() -> None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise SystemExit("Provide DATABASE_URL or set it in the environment before running schema migration.")

    retries = max(int(os.getenv("DB_MIGRATION_RETRIES", "30")), 1)
    retry_delay_seconds = max(float(os.getenv("DB_MIGRATION_RETRY_DELAY_SECONDS", "2")), 0)
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            with psycopg.connect(database_url) as conn:
                init_db(conn)
            print("PostgreSQL schema migration completed.")
            return
        except Exception as exc:
            last_error = exc
            if attempt == retries:
                break
            print(
                f"PostgreSQL schema migration attempt {attempt}/{retries} failed: {exc}. "
                f"Retrying in {retry_delay_seconds:g}s..."
            )
            time.sleep(retry_delay_seconds)

    raise SystemExit(f"PostgreSQL schema migration failed after {retries} attempts: {last_error}")


if __name__ == "__main__":
    main()
