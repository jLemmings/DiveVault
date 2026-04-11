#!/usr/bin/env python3
"""Manually migrate exported Clerk users into DiveVault auth_users.

Usage:
  python backend/migrations/migrate_clerk_users_to_auth.py \
    --database-url postgresql://... \
    --input ./clerk-users.json \
    --default-password 'ChangeMe123!'

Input JSON format:
[
  {
    "id": "user_2abc...",          # required, keep Clerk user id to preserve existing per-user data ownership
    "email": "diver@example.com",  # required
    "first_name": "Ava",           # optional
    "last_name": "Diver",          # optional
    "role": "admin",               # optional (default: user)
    "password": "optional-per-user-password",
    "is_active": true                # optional (default: true)
  }
]
"""

from __future__ import annotations

import argparse
import json
import secrets
from pathlib import Path

from divevault.app import hash_password
from divevault.postgres_store import open_db, upsert_auth_user


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import Clerk users into DiveVault's first-party auth table")
    parser.add_argument("--database-url", required=True, help="PostgreSQL connection string")
    parser.add_argument("--input", required=True, help="Path to JSON array of exported users")
    parser.add_argument("--default-password", default="", help="Fallback password when a row omits password")
    parser.add_argument("--dry-run", action="store_true", help="Validate input without writing to database")
    return parser.parse_args()


def random_password() -> str:
    return secrets.token_urlsafe(14) + "!A1"


def main() -> None:
    args = parse_args()
    rows = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise SystemExit("Input must be a JSON array")

    generated_passwords: list[tuple[str, str]] = []

    if args.dry_run:
        print(f"Validated {len(rows)} users (dry-run).")
        return

    conn = open_db(args.database_url)
    try:
        for row in rows:
            if not isinstance(row, dict):
                continue
            user_id = str(row.get("id") or "").strip()
            email = str(row.get("email") or "").strip().lower()
            if not user_id or not email:
                continue

            raw_password = str(row.get("password") or args.default_password or "").strip()
            if not raw_password:
                raw_password = random_password()
                generated_passwords.append((email, raw_password))

            upsert_auth_user(
                conn,
                user_id=user_id,
                email=email,
                password_hash=hash_password(raw_password),
                first_name=str(row.get("first_name") or "").strip(),
                last_name=str(row.get("last_name") or "").strip(),
                role=str(row.get("role") or "user").strip().lower() or "user",
                is_active=bool(row.get("is_active", True)),
            )
    finally:
        conn.close()

    print(f"Imported {len(rows)} users into auth_users.")
    if generated_passwords:
        print("Generated temporary passwords (rotate after first login):")
        for email, password in generated_passwords:
            print(f"  {email}: {password}")


if __name__ == "__main__":
    main()
