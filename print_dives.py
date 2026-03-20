#!/usr/bin/env python3
"""
Print dives from dives.db in a readable format.

Usage:
python print_dives.py --db dives.db
"""

import sqlite3
import json
import argparse

def print_dives(db_path: str):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row


    rows = conn.execute("""
        SELECT *
        FROM dives
        ORDER BY started_at DESC
    """).fetchall()

    if not rows:
        print("No dives found.")

    for i, row in enumerate(rows, 1):
        print(f"\n=== Dive #{i} ===")

        print(f"Start time:       {row['started_at']}")
        print(f"Duration (sec):   {row['duration_seconds']}")
        print(f"Max depth (m):    {row['max_depth_m']}")
        print(f"Avg depth (m):    {row['avg_depth_m']}")
        print(f"Fingerprint:      {row['fingerprint_hex']}")
        print(f"Imported at:      {row['imported_at']}")

        samples = json.loads(row["samples_json"])
        print(f"Samples:          {len(samples)} points")

        if samples:
            print("First 3 samples:")
            for s in samples[:6]:
                print(f"  {s}")

def main():
    parser = argparse.ArgumentParser(description="Print dives from SQLite database")
    parser.add_argument("--db", required=True, help="Path to dives.db")
    args = parser.parse_args()

    print_dives(args.db)

if __name__ == "__main__":
    main()