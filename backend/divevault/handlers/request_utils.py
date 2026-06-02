from __future__ import annotations

import json
import logging
from collections.abc import Callable


LOGGER = logging.getLogger("dive_backend")


class AuthError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def _normalized_content_type(value: str | None) -> str:
    return (value or "").split(";", 1)[0].strip().lower()


def request_content_type(handler) -> str:
    return _normalized_content_type(handler.headers.get("Content-Type"))


def is_json_content_type(value: str | None) -> bool:
    content_type = _normalized_content_type(value)
    return content_type == "application/json" or content_type.endswith("+json")


def require_auth(handler) -> dict | None:
    if getattr(handler, "_auth_checked", False):
        return getattr(handler, "_auth_claims", None)
    verifier = getattr(handler.server, "auth_verifier", None)
    if verifier is None:
        handler._auth_checked = True
        handler._send_json(503, {"error": "Authentication is not configured on the backend"})
        return None

    try:
        claims = verifier.verify_request(handler.headers)
        handler._auth_claims = claims
        handler._auth_checked = True
        return claims
    except AuthError as exc:
        handler._auth_checked = True
        handler._send_json(exc.status, {"error": exc.message})
        return None


def is_admin_claims(claims: dict | None) -> bool:
    return bool(isinstance(claims, dict) and str(claims.get("role") or "").lower() == "admin")


def principal_id_from_claims(claims: dict | None) -> str | None:
    if not isinstance(claims, dict):
        return None
    return claims.get("sub") or claims.get("user_id") or claims.get("subject")


def require_owner_auth(handler, *, get_auth_instance_settings: Callable) -> dict | None:
    if getattr(handler, "_owner_auth_checked", False):
        return getattr(handler, "_owner_auth_claims", None)
    claims = require_auth(handler)
    if claims is None:
        handler._owner_auth_checked = True
        return None
    principal_id = principal_id_from_claims(claims)
    if not principal_id:
        handler._owner_auth_checked = True
        handler._send_json(403, {"error": "Authenticated identity is missing a stable user identifier"})
        return None
    conn = handler._open_db()
    if conn is None:
        handler._owner_auth_checked = True
        return None
    try:
        settings = get_auth_instance_settings(conn)
    finally:
        conn.close()
    if principal_id != settings.get("owner_user_id"):
        handler._owner_auth_checked = True
        handler._send_json(403, {"error": "Instance owner required"})
        return None
    handler._owner_auth_claims = claims
    handler._owner_auth_checked = True
    return claims


def require_browser_session_auth(handler) -> dict | None:
    claims = require_auth(handler)
    if claims is None:
        return None
    if claims.get("token_type") != "session_token":
        handler._send_json(403, {"error": "Desktop sync approval requires an authenticated browser session"})
        return None
    return claims


def require_principal_id(handler) -> str | None:
    if getattr(handler, "_principal_id", None):
        return handler._principal_id
    claims = require_auth(handler)
    if claims is None:
        return None
    principal_id = principal_id_from_claims(claims)
    if principal_id:
        handler._principal_id = principal_id
        return principal_id
    handler._send_json(403, {"error": "Authenticated identity is missing a stable user identifier"})
    return None


def read_request_body(handler, *, max_bytes: int) -> bytes | None:
    max_body_bytes = int(max_bytes)
    content_length = handler.headers.get("Content-Length", "0")
    try:
        length = int(content_length)
    except ValueError:
        handler._send_json(400, {"error": "Invalid Content-Length header"})
        return None
    if length < 0:
        handler._send_json(400, {"error": "Invalid Content-Length header"})
        return None
    if length > max_body_bytes:
        handler._send_json(413, {"error": f"Request body exceeds {max_body_bytes} byte limit"})
        return None
    return handler.rfile.read(length) if length > 0 else b""


def read_json_body(handler, *, max_bytes: int | None = None) -> dict | None:
    route_max_body_bytes = getattr(handler, "_route_max_body_bytes", None)
    max_json_body_bytes = int(max_bytes if max_bytes is not None else route_max_body_bytes or getattr(handler.server, "max_json_body_bytes", 1024 * 1024))
    body = read_request_body(handler, max_bytes=max_json_body_bytes)
    if body is None:
        return None
    if body and not is_json_content_type(handler.headers.get("Content-Type")):
        handler._send_json(415, {"error": "Content-Type must be application/json"})
        return None
    try:
        return json.loads(body.decode("utf-8")) if body else {}
    except (UnicodeDecodeError, json.JSONDecodeError):
        LOGGER.warning("Rejected invalid JSON path=%s", handler.path)
        handler._send_json(400, {"error": "Invalid JSON"})
        return None
