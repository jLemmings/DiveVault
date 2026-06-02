from __future__ import annotations

import json
import logging

from divevault.handlers.request_utils import request_content_type


LOGGER = logging.getLogger("dive_backend")

ZIP_CONTENT_TYPES = {"application/zip", "application/x-zip-compressed", "application/octet-stream"}
JSON_CONTENT_TYPES = {"application/json"}
BACKUP_IMPORT_CONTENT_TYPES = ZIP_CONTENT_TYPES | JSON_CONTENT_TYPES


def handle_get(handler, path: str, *, deps) -> bool:
    if path != "/api/backup/export":
        return False

    user_id = handler._require_principal_id()
    if user_id is None:
        return True

    conn = handler._open_db()
    if conn is None:
        return True
    try:
        payload = deps.build_backup_payload(conn, user_id)
    finally:
        conn.close()

    archive_bytes = deps.build_backup_archive(payload)
    filename = deps.attachment_filename(f"divevault-backup-{deps.timestamp_slug()}.zip")
    LOGGER.info(
        "Returned backup export user_id=%s dives=%d device_states=%d licenses=%d filename=%s",
        user_id,
        len(payload.get("dives") or []),
        len(payload.get("device_states") or []),
        len(payload.get("license_documents") or []),
        filename,
    )
    handler._send_bytes(
        200,
        archive_bytes,
        "application/zip",
        extra_headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
    return True


def handle_post(handler, path: str, *, deps) -> bool:
    if path != "/api/backup/import":
        return False

    if not handler._enforce_rate_limit("backup_import"):
        return True
    user_id = handler._require_principal_id()
    if user_id is None:
        return True

    max_backup_import_bytes = getattr(handler.server, "max_backup_import_bytes", 25 * 1024 * 1024)
    body = handler._read_request_body(max_bytes=max_backup_import_bytes)
    if body is None:
        return True

    content_type = request_content_type(handler)
    if content_type not in BACKUP_IMPORT_CONTENT_TYPES:
        handler._send_json(415, {"error": "Content-Type must be application/json or application/zip"})
        return True

    try:
        if content_type in ZIP_CONTENT_TYPES:
            payload = deps.parse_backup_archive(body, max_uncompressed_bytes=max_backup_import_bytes)
        else:
            payload = json.loads(body.decode("utf-8")) if body else {}
    except (UnicodeDecodeError, json.JSONDecodeError):
        LOGGER.warning("Rejected invalid backup JSON path=%s", handler.path)
        handler._send_json(400, {"error": "Invalid JSON"})
        return True
    except ValueError as exc:
        handler._send_json(400, {"error": str(exc)})
        return True

    conn = handler._open_db()
    if conn is None:
        return True
    try:
        try:
            result = deps.import_backup_payload(conn, user_id, payload)
        except ValueError as exc:
            handler._send_json(400, {"error": str(exc)})
            return True
    finally:
        conn.close()

    LOGGER.info(
        "Imported backup user_id=%s dives_inserted=%d device_states=%d license_documents=%d",
        user_id,
        result["summary"]["dives_inserted"],
        result["summary"]["device_states_imported"],
        result["summary"]["license_documents_imported"],
    )
    handler._send_json(200, result)
    return True
