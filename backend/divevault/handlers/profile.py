from __future__ import annotations

import logging
import re


LOGGER = logging.getLogger("dive_backend")


def handle_get(handler, path: str, query: dict[str, list[str]], *, deps) -> bool:
    match = re.fullmatch(r"/api/public/divers/([a-z0-9-]+)", path)
    if match:
        public_slug = match.group(1)
        conn = handler._open_db()
        if conn is None:
            return True
        try:
            public_profile, dives, stats = deps.get_public_profile_dives(conn, public_slug)
        finally:
            conn.close()

        if not public_profile:
            handler._send_json(404, {"error": "Public dive profile not found"})
            return True

        LOGGER.info(
            "Returned public dive profile slug=%s dives=%d",
            public_slug,
            len(dives),
        )
        handler._send_json(
            200,
            {
                "diver": public_profile,
                "dives": dives,
                "stats": stats,
            },
        )
        return True

    if path == "/api/profile":
        user_id = handler._require_principal_id()
        if user_id is None:
            return True

        conn = handler._open_db()
        if conn is None:
            return True
        try:
            profile = deps.get_user_profile(conn, user_id)
        finally:
            conn.close()

        LOGGER.info(
            "Returned profile user_id=%s license_count=%d licenses_with_pdf=%d",
            user_id,
            len(profile.get("licenses") or []),
            sum(1 for license_entry in profile.get("licenses") or [] if license_entry.get("pdf")),
        )
        handler._send_json(200, profile)
        return True

    match = re.fullmatch(r"/api/profile/licenses/([A-Za-z0-9_-]+)/pdf", path)
    if match:
        user_id = handler._require_principal_id()
        if user_id is None:
            return True
        license_id = match.group(1)

        conn = handler._open_db()
        if conn is None:
            return True
        try:
            license_pdf = deps.get_user_profile_license_pdf(conn, user_id, license_id)
        finally:
            conn.close()

        if not license_pdf:
            handler._send_json(404, {"error": "License PDF not found"})
            return True

        LOGGER.info("Returned profile license user_id=%s license_id=%s filename=%s", user_id, license_id, license_pdf["filename"])
        handler._send_bytes(
            200,
            license_pdf["data"],
            license_pdf["content_type"],
            extra_headers={
                "Content-Disposition": f'inline; filename="{license_pdf["filename"]}"',
                "Cache-Control": "no-store",
            },
        )
        return True

    return False


def handle_put(handler, path: str, *, deps) -> bool:
    if path == "/api/profile":
        user_id = handler._require_principal_id()
        if user_id is None:
            return True
        payload = handler._read_json_body()
        if payload is None:
            return True

        conn = handler._open_db()
        if conn is None:
            return True
        try:
            profile = deps.save_user_profile(conn, user_id, payload)
        finally:
            conn.close()

        LOGGER.info(
            "Updated profile user_id=%s license_count=%d licenses_with_pdf=%d",
            user_id,
            len(profile.get("licenses") or []),
            sum(1 for license_entry in profile.get("licenses") or [] if license_entry.get("pdf")),
        )
        handler._send_json(200, profile)
        return True

    match = re.fullmatch(r"/api/profile/licenses/([A-Za-z0-9_-]+)/pdf", path)
    if match:
        user_id = handler._require_principal_id()
        if user_id is None:
            return True
        license_id = match.group(1)
        payload = handler._read_json_body()
        if payload is None:
            return True

        try:
            filename, content_type, pdf_bytes = deps.decode_profile_license_payload(payload)
        except ValueError as exc:
            handler._send_json(400, {"error": str(exc)})
            return True

        conn = handler._open_db()
        if conn is None:
            return True
        try:
            profile = deps.save_user_profile_license_pdf(
                conn,
                user_id,
                license_id=license_id,
                filename=filename,
                content_type=content_type,
                pdf_bytes=pdf_bytes,
            )
        finally:
            conn.close()

        if profile is None:
            handler._send_json(404, {"error": "License entry not found"})
            return True

        LOGGER.info(
            "Updated profile license user_id=%s license_id=%s filename=%s size_bytes=%d",
            user_id,
            license_id,
            filename,
            len(pdf_bytes),
        )
        handler._send_json(200, profile)
        return True

    return False
