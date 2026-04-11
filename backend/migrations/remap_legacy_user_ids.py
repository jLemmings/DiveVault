#!/usr/bin/env python3
"""Remap DiveVault data from legacy user ids to existing internal auth users.

Use this when you already created replacement users in DiveVault auth_users and need
to move all application-owned rows from the old ids to the new ids.

Input JSON format:
[
  {
    "old_user_id": "user_old_clerk_id",
    "new_user_id": "user_new_internal_id",
    "email": "optional@example.com"
  }
]
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from divevault.postgres_store import open_db


STRICT_USER_ID_TABLES: tuple[tuple[str, str], ...] = (
    ("device_state", "user_id"),
    ("dives", "user_id"),
    ("user_profile", "user_id"),
    ("user_profile_license_documents", "user_id"),
    ("user_profile_licenses", "user_id"),
    ("user_profile_dive_sites", "user_id"),
    ("user_profile_buddies", "user_id"),
    ("user_profile_guides", "user_id"),
)

REFERENCE_USER_ID_TABLES: tuple[tuple[str, str], ...] = (
    ("cli_sync_auth_requests", "user_id"),
    ("auth_instance_settings", "owner_user_id"),
    ("auth_user_invites", "invited_by_user_id"),
)


@dataclass(frozen=True)
class UserIdRemap:
    old_user_id: str
    new_user_id: str
    email: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Remap legacy DiveVault user ids to existing internal auth user ids")
    parser.add_argument("--database-url", required=True, help="PostgreSQL connection string")
    parser.add_argument("--input", required=True, help="Path to JSON remap file")
    parser.add_argument("--dry-run", action="store_true", help="Validate and report without writing changes")
    parser.add_argument(
        "--delete-old-auth-users",
        action="store_true",
        help="Delete matching old auth_users rows after remapping. Use only when replacement users already exist in auth_users.",
    )
    return parser.parse_args()


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _normalize_email(value: object) -> str:
    return _clean_text(value).lower()


def load_remaps(path: Path) -> list[UserIdRemap]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise SystemExit("Input must be a JSON array")

    remaps: list[UserIdRemap] = []
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            raise SystemExit(f"Input row {index} must be an object")
        old_user_id = _clean_text(row.get("old_user_id") or row.get("old_id") or row.get("from_user_id"))
        new_user_id = _clean_text(row.get("new_user_id") or row.get("new_id") or row.get("to_user_id"))
        email = _normalize_email(row.get("email"))
        if not old_user_id or not new_user_id:
            raise SystemExit(f"Input row {index} must include old_user_id and new_user_id")
        if old_user_id == new_user_id:
            raise SystemExit(f"Input row {index} maps {old_user_id!r} to itself; remove it from the remap file")
        remaps.append(UserIdRemap(old_user_id=old_user_id, new_user_id=new_user_id, email=email))

    old_ids = [item.old_user_id for item in remaps]
    new_ids = [item.new_user_id for item in remaps]
    if len(set(old_ids)) != len(old_ids):
        raise SystemExit("Each old_user_id must appear only once")
    if len(set(new_ids)) != len(new_ids):
        raise SystemExit("Each new_user_id must appear only once")
    overlap = set(old_ids) & set(new_ids)
    if overlap:
        overlap_list = ", ".join(sorted(overlap))
        raise SystemExit(
            "For safety this script requires old and new id sets to be disjoint. "
            f"Overlapping ids: {overlap_list}"
        )
    return remaps


def count_rows(cur, table: str, column: str, user_id: str) -> int:
    cur.execute(f"SELECT COUNT(*) AS count FROM {table} WHERE {column}=%s", (user_id,))
    row = cur.fetchone() or {}
    return int((row or {}).get("count") or 0)


def validate_remaps(cur, remaps: list[UserIdRemap]) -> list[str]:
    report_lines: list[str] = []

    for remap in remaps:
        cur.execute("SELECT id, email FROM auth_users WHERE id=%s", (remap.new_user_id,))
        new_auth_user = cur.fetchone()
        if not new_auth_user:
            raise SystemExit(f"Target auth user {remap.new_user_id!r} does not exist in auth_users")
        target_email = _normalize_email(new_auth_user.get("email"))
        if remap.email and remap.email != target_email:
            raise SystemExit(
                f"Target auth user {remap.new_user_id!r} has email {target_email!r}, "
                f"but the remap file expected {remap.email!r}"
            )

        cur.execute("SELECT id, email FROM auth_users WHERE id=%s", (remap.old_user_id,))
        old_auth_user = cur.fetchone()

        report_lines.append(f"{remap.old_user_id} -> {remap.new_user_id} ({target_email or 'no target email'})")
        report_lines.append(
            f"  auth_users: old_exists={'yes' if old_auth_user else 'no'} new_exists=yes"
        )

        conflicting_tables: list[str] = []
        for table, column in STRICT_USER_ID_TABLES:
            old_count = count_rows(cur, table, column, remap.old_user_id)
            new_count = count_rows(cur, table, column, remap.new_user_id)
            report_lines.append(f"  {table}: source_rows={old_count} target_rows={new_count}")
            if new_count > 0:
                conflicting_tables.append(table)

        for table, column in REFERENCE_USER_ID_TABLES:
            old_count = count_rows(cur, table, column, remap.old_user_id)
            new_count = count_rows(cur, table, column, remap.new_user_id)
            report_lines.append(f"  {table}: source_refs={old_count} target_refs={new_count}")

        if conflicting_tables:
            joined = ", ".join(conflicting_tables)
            raise SystemExit(
                f"Refusing to remap {remap.old_user_id!r} -> {remap.new_user_id!r} because the target id already owns rows in: {joined}. "
                "Clean up those target-owned rows first, then rerun."
            )

    return report_lines


def apply_remaps(cur, remaps: list[UserIdRemap], *, delete_old_auth_users: bool) -> list[str]:
    summary: list[str] = []
    for remap in remaps:
        updated_counts: list[str] = []
        for table, column in STRICT_USER_ID_TABLES + REFERENCE_USER_ID_TABLES:
            cur.execute(f"UPDATE {table} SET {column}=%s WHERE {column}=%s", (remap.new_user_id, remap.old_user_id))
            if cur.rowcount:
                updated_counts.append(f"{table}={cur.rowcount}")
        if delete_old_auth_users:
            cur.execute("DELETE FROM auth_users WHERE id=%s", (remap.old_user_id,))
            if cur.rowcount:
                updated_counts.append(f"auth_users_deleted={cur.rowcount}")
        summary.append(f"{remap.old_user_id} -> {remap.new_user_id}: " + (", ".join(updated_counts) or "no rows changed"))
    return summary


def main() -> None:
    args = parse_args()
    remaps = load_remaps(Path(args.input))

    conn = open_db(args.database_url)
    try:
        with conn.cursor() as cur:
            report_lines = validate_remaps(cur, remaps)

        print("Preflight report:")
        for line in report_lines:
            print(line)

        if args.dry_run:
            conn.rollback()
            print("Dry run only. No changes were written.")
            return

        # The preflight SELECTs open an implicit transaction on psycopg connections.
        # End that transaction before starting the write transaction so the remap
        # actually commits instead of being left inside an outer uncommitted block.
        conn.rollback()
        with conn.transaction():
            with conn.cursor() as cur:
                summary_lines = apply_remaps(cur, remaps, delete_old_auth_users=bool(args.delete_old_auth_users))

        print("Remap completed:")
        for line in summary_lines:
            print(line)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
