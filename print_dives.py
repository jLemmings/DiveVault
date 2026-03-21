#!/usr/bin/env python3
"""
Print dives from PostgreSQL in a readable format.

Usage:
    python print_dives.py --database-url postgresql://dive:dive@localhost:5432/dive
"""

from __future__ import annotations

import argparse

from postgres_store import open_db


def print_dives(database_url: str) -> None:
    conn = open_db(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, started_at, duration_seconds, max_depth_m, avg_depth_m,
                       fingerprint_hex, imported_at, samples_json
                FROM dives
                ORDER BY started_at DESC, id DESC
                """
            )
            rows = cur.fetchall()

        if not rows:
            print("No dives found.")
            return

        for index, row in enumerate(rows, 1):
            samples = row.get("samples_json") or []
            print(f"\n=== Dive #{index} ===")
            print(f"ID:               {row['id']}")
            print(f"Start time:       {row['started_at']}")
            print(f"Duration (sec):   {row['duration_seconds']}")
            print(f"Max depth (m):    {row['max_depth_m']}")
            print(f"Avg depth (m):    {row['avg_depth_m']}")
            print(f"Fingerprint:      {row['fingerprint_hex']}")
            print(f"Imported at:      {row['imported_at']}")
            print(f"Samples:          {len(samples)} points")
            if samples:
                print("First 6 samples:")
                for sample in samples[:6]:
                    print(f"  {sample}")
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Print dives from PostgreSQL")
    parser.add_argument("--database-url", required=True, help="PostgreSQL connection string")
    args = parser.parse_args()
    print_dives(args.database_url)


if __name__ == "__main__":
    main()
