from __future__ import annotations

import json
import logging
from urllib.parse import parse_qs

from divevault.handlers.request_utils import request_content_type


LOGGER = logging.getLogger("dive_backend")

CSV_CONTENT_TYPES = {"application/json", "text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"}
SUBSURFACE_CONTENT_TYPES = {
    "application/xml",
    "text/xml",
    "application/zip",
    "application/gzip",
    "application/x-gzip",
    "application/octet-stream",
}


def _reject_unsupported_media(handler, *, label: str) -> None:
    handler._send_json(415, {"error": f"Content-Type must be {label}"})


def handle_post(handler, path: str, parsed_request, *, deps) -> bool:
    if path == "/api/imports/csv":
        return _handle_csv_import(handler, parsed_request, deps=deps)
    if path == "/api/imports/subsurface":
        return _handle_subsurface_import(handler, parsed_request, deps=deps)
    return False


def _handle_csv_import(handler, parsed_request, *, deps) -> bool:
    if not handler._enforce_rate_limit("dive_upload"):
        return True
    user_id = handler._require_principal_id()
    if user_id is None:
        return True

    max_csv_import_bytes = getattr(handler.server, "max_csv_import_bytes", 5 * 1024 * 1024)
    body = handler._read_request_body(max_bytes=max_csv_import_bytes)
    if body is None:
        return True

    content_type = request_content_type(handler)
    if content_type not in CSV_CONTENT_TYPES:
        _reject_unsupported_media(handler, label="text/csv or application/json")
        return True

    conn = handler._open_db()
    if conn is None:
        return True
    try:
        try:
            profile = deps.get_user_profile(conn, user_id)
            required_fields = profile.get("required_logbook_fields")
        except ValueError as exc:
            handler._send_json(400, {"error": str(exc)})
            return True

        try:
            if content_type == "application/json":
                payload = json.loads(body.decode("utf-8")) if body else {}
                csv_text = str(payload.get("csv") or "")
            else:
                csv_text = body.decode("utf-8-sig")
            preview = deps.csv_import_preview(csv_text, required_fields=required_fields)
            dive_payloads = preview["payloads"]
        except (UnicodeDecodeError, json.JSONDecodeError):
            handler._send_json(400, {"error": "Invalid CSV import request body"})
            return True
        except ValueError as exc:
            handler._send_json(400, {"error": str(exc)})
            return True

        query = parse_qs(parsed_request.query)
        dry_run = handler._is_truthy(query.get("dry_run", ["0"])[0])
        duplicate_uids = {
            row.get("dive_uid")
            for row in preview["rows"]
            if row.get("valid") and row.get("dive_uid") and deps.get_dive_id_by_uid(conn, user_id, row["dive_uid"]) is not None
        }
        validation_rows = deps.mark_import_preview_duplicates(preview["rows"], duplicate_uids)
        summary = deps.import_validation_summary(validation_rows)
        if dry_run:
            handler._send_json(200, {"dry_run": True, "summary": summary})
            return True
        invalid_row = next((row for row in validation_rows if not row.get("valid")), None)
        if invalid_row:
            row_number = invalid_row.get("row_number")
            error_message = (invalid_row.get("errors") or ["Invalid row"])[0]
            handler._send_json(400, {"error": f"CSV row {row_number}: {error_message}", "summary": summary})
            return True

        inserted_count = 0
        ids: list[int] = []
        payload_iter = iter(dive_payloads)
        for row in validation_rows:
            if not row.get("valid"):
                continue
            dive_payload = next(payload_iter)
            inserted = deps.insert_dive_record(conn, user_id, dive_payload)
            if inserted:
                inserted_count += 1
                row["status"] = "inserted"
                row["duplicate"] = False
            else:
                row["status"] = "duplicate"
                row["duplicate"] = True
            dive_id = deps.get_dive_id_by_uid(conn, user_id, dive_payload["dive_uid"])
            if dive_id is not None:
                ids.append(dive_id)
    finally:
        conn.close()

    LOGGER.info(
        "Imported CSV dives user_id=%s rows=%d inserted=%d",
        user_id,
        len(dive_payloads),
        inserted_count,
    )
    summary = deps.import_validation_summary(validation_rows, inserted=inserted_count, ids=ids)
    handler._send_json(
        200,
        {
            "rows": len(dive_payloads),
            "inserted": inserted_count,
            "duplicates": len(dive_payloads) - inserted_count,
            "ids": ids,
            "summary": summary,
        },
    )
    return True


def _handle_subsurface_import(handler, parsed_request, *, deps) -> bool:
    if not handler._enforce_rate_limit("dive_upload"):
        return True
    user_id = handler._require_principal_id()
    if user_id is None:
        return True

    max_subsurface_import_bytes = getattr(handler.server, "max_subsurface_import_bytes", 15 * 1024 * 1024)
    body = handler._read_request_body(max_bytes=max_subsurface_import_bytes)
    if body is None:
        return True

    content_type = request_content_type(handler)
    if content_type not in SUBSURFACE_CONTENT_TYPES:
        _reject_unsupported_media(handler, label="application/xml, text/xml, application/gzip, or application/zip")
        return True

    conn = handler._open_db()
    if conn is None:
        return True
    try:
        try:
            profile = deps.get_user_profile(conn, user_id)
            required_fields = profile.get("required_logbook_fields")
        except ValueError as exc:
            handler._send_json(400, {"error": str(exc)})
            return True
        try:
            export_text = deps.decode_subsurface_export(body, max_uncompressed_bytes=max_subsurface_import_bytes)
            preview = deps.subsurface_import_preview(export_text, required_fields=required_fields)
            dive_payloads = preview["payloads"]
        except (OSError, ValueError) as exc:
            handler._send_json(400, {"error": str(exc)})
            return True

        query = parse_qs(parsed_request.query)
        dry_run = handler._is_truthy(query.get("dry_run", ["0"])[0])
        duplicate_uids = {
            row.get("dive_uid")
            for row in preview["rows"]
            if row.get("valid") and row.get("dive_uid") and deps.get_dive_id_by_uid(conn, user_id, row["dive_uid"]) is not None
        }
        validation_rows = deps.mark_import_preview_duplicates(preview["rows"], duplicate_uids)
        summary = deps.import_validation_summary(validation_rows)
        if dry_run:
            handler._send_json(200, {"dry_run": True, "summary": summary})
            return True
        invalid_row = next((row for row in validation_rows if not row.get("valid")), None)
        if invalid_row:
            row_number = invalid_row.get("row_number")
            error_message = (invalid_row.get("errors") or ["Invalid dive"])[0]
            handler._send_json(400, {"error": f"Subsurface dive {row_number}: {error_message}", "summary": summary})
            return True

        inserted_count = 0
        ids: list[int] = []
        payload_iter = iter(dive_payloads)
        for row in validation_rows:
            if not row.get("valid"):
                continue
            dive_payload = next(payload_iter)
            inserted = deps.insert_dive_record(conn, user_id, dive_payload)
            if inserted:
                inserted_count += 1
                row["status"] = "inserted"
                row["duplicate"] = False
            else:
                row["status"] = "duplicate"
                row["duplicate"] = True
            dive_id = deps.get_dive_id_by_uid(conn, user_id, dive_payload["dive_uid"])
            if dive_id is not None:
                ids.append(dive_id)
    finally:
        conn.close()

    LOGGER.info(
        "Imported Subsurface dives user_id=%s rows=%d inserted=%d",
        user_id,
        len(dive_payloads),
        inserted_count,
    )
    summary = deps.import_validation_summary(validation_rows, inserted=inserted_count, ids=ids)
    handler._send_json(
        200,
        {
            "rows": len(dive_payloads),
            "inserted": inserted_count,
            "duplicates": len(dive_payloads) - inserted_count,
            "ids": ids,
            "summary": summary,
        },
    )
    return True
