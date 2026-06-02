#!/usr/bin/env python3
"""
Simple dive backend backed by PostgreSQL.

It accepts parsed dives from `mares_smart_air_sync.py` and serves dives to a frontend.

Usage:
    cd backend && python -m divevault.app --database-url postgresql://dive:dive@localhost:5432/dive
"""

from __future__ import annotations

import argparse
import json
import logging
import mimetypes
import os
import re
import secrets
import signal
import sys
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import request as urlrequest
from urllib.parse import parse_qs, urlencode, urlparse

import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

from divevault.database import PooledConnectionProxy
from divevault.handlers.errors import AppError, MethodNotAllowed, NotFound, PayloadTooLarge, UnsupportedMediaType, send_error
from divevault.handlers.manifest import (
    API_ROUTE_MANIFEST,
    BACKUP_IMPORT_TYPES,
    CSV_IMPORT_TYPES,
    JSON_TYPES,
    ROUTES,
    SUBSURFACE_IMPORT_TYPES,
)
from divevault.handlers.metrics import PrometheusMetrics
from divevault.handlers.request_utils import (
    AuthError,
    is_admin_claims,
    principal_id_from_claims,
    request_content_type,
    read_json_body,
    read_request_body,
    require_auth,
    require_browser_session_auth,
    require_owner_auth,
    require_principal_id,
)
from divevault.handlers.routes import (
    AUTH_ANY,
    AUTH_BROWSER_SESSION,
    AUTH_OWNER,
    AUTH_PRINCIPAL,
    RoutePolicy,
    allowed_methods_for_path,
    match_route,
)
from divevault.postgres_store import (
    CURRENT_SCHEMA_VERSION,
    approve_cli_sync_request,
    create_auth_invite,
    create_cli_sync_request,
    create_auth_user,
    create_auth_user_from_invite,
    create_bootstrap_auth_user,
    delete_auth_user,
    delete_dive,
    get_auth_instance_settings,
    get_auth_invite_by_token,
    get_device_state,
    get_db_schema_version,
    get_cli_sync_request_status,
    get_auth_user_by_email,
    get_auth_user_by_id,
    get_dive,
    get_dive_id_by_uid,
    get_public_profile_dives,
    get_user_profile,
    get_user_profile_license_pdf,
    is_logbook_complete,
    insert_dive_record,
    list_all_dives,
    list_auth_users,
    list_device_states,
    list_user_equipment,
    mark_equipment_serviced,
    list_dives,
    normalize_required_logbook_fields,
    now_iso,
    open_db,
    save_user_profile,
    save_user_profile_license_pdf,
    save_device_state,
    save_user_equipment,
    count_auth_users,
    update_auth_instance_settings,
    update_auth_user,
    update_auth_user_last_login,
    summarize_dives,
    update_dive_logbook,
    verify_cli_sync_token,
)
from divevault.rate_limit import FixedWindowRateLimiter
from divevault.static_assets import (
    frontend_asset_path,
    resolve_frontend_dir as resolve_frontend_dir_for_repo,
    resolve_repo_path as resolve_repo_path_for_repo,
)
from divevault.services.auth import (
    CliSyncTokenManager as BaseCliSyncTokenManager,
    DiveVaultAuthTokenVerifier,
    build_auth_verifier,
    hash_password,
    issue_session_token,
    normalize_bearer_token,
    verify_password,
)
from divevault.services.exports import (
    attachment_filename,
    build_dives_csv,
    build_pdf_lines,
    build_pdf_document,
    build_pdf_stream,
    csv_export_rows,
    format_depth_label,
    format_duration_label,
    format_export_datetime,
    json_compact,
    now_utc,
    paginate_pdf_lines,
    pdf_text,
    timestamp_slug,
    wrap_pdf_text,
)
from divevault.services.geocode import NominatimClient
from divevault.services.profile_documents import (
    MAX_PROFILE_LICENSE_BYTES,
    decode_profile_license_payload,
    sanitize_profile_license_filename,
)
from divevault.services.importers import (
    CSV_IMPORT_OPTIONAL_FIELDS,
    CSV_IMPORT_REQUIRED_FIELDS,
    build_csv_import_fields,
    build_subsurface_fields,
    child_text,
    clean_csv_value,
    complete_logbook_if_ready,
    csv_import_payloads,
    csv_import_preview,
    decode_subsurface_export,
    decompress_gzip_limited,
    first_child,
    import_payload_summary,
    import_validation_row_from_payload,
    import_validation_summary,
    invalid_import_validation_row,
    local_xml_name,
    mark_import_preview_duplicates,
    parse_csv_float,
    parse_csv_positive_seconds,
    parse_csv_samples,
    parse_csv_started_at,
    parse_subsurface_depth_m,
    parse_subsurface_duration_seconds,
    parse_subsurface_gps,
    parse_subsurface_location,
    parse_subsurface_number,
    parse_subsurface_pressure_bar,
    parse_subsurface_samples,
    parse_subsurface_sites,
    parse_subsurface_started_at,
    parse_subsurface_temperature_c,
    read_limited_stream,
    read_zip_member_limited,
    subsurface_import_payloads,
    subsurface_import_preview,
)
from divevault.services.backup import (
    BACKUP_EXPORT_VERSION,
    BACKUP_MANIFEST_FILENAME,
    backup_archive_license_path,
    build_backup_archive,
    build_backup_payload as service_build_backup_payload,
    import_backup_payload as service_import_backup_payload,
    is_safe_backup_member_path,
    parse_backup_archive,
    parse_backup_payload,
    profile_license_documents as service_profile_license_documents,
)

try:  # pragma: no cover - exercised only when the optional runtime extra is installed
    from psycopg_pool import ConnectionPool
except ImportError:  # pragma: no cover - development environments may not install pool extras immediately
    ConnectionPool = None


LOGGER = logging.getLogger("dive_backend")
BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent

DEMO_ADMIN_USER_ID = "user_demoadmin"
DEMO_ADMIN_USERNAME = "admin"
DEMO_ADMIN_PASSWORD_HASH = (
    "scrypt$000102030405060708090a0b0c0d0e0f$"
    "39e0e8ec42ae38fa261d39c6fbf3caaacc6647921c33a54c99770f5ba0283d90685177b5ff7cbb13a56671fd3f74ebaf442667cdaab09a4a60385cec2980c231"
)

load_dotenv(REPO_ROOT / ".env")


class CliSyncTokenManager(BaseCliSyncTokenManager):
    def _open_database(self):
        if not self.database_url:
            raise RuntimeError("CLI sync database persistence is not configured")
        return open_db(self.database_url)

    def _create_cli_sync_request(self, conn, **kwargs) -> dict:
        return create_cli_sync_request(conn, **kwargs)

    def _get_cli_sync_request_status(self, conn, code: str, **kwargs) -> dict | None:
        return get_cli_sync_request_status(conn, code, **kwargs)

    def _approve_cli_sync_request(self, conn, code: str, claims: dict, **kwargs) -> dict | None:
        return approve_cli_sync_request(conn, code, claims, **kwargs)

    def _verify_cli_sync_token(self, conn, token: str, **kwargs) -> dict | None:
        return verify_cli_sync_token(conn, token, **kwargs)


def resolve_repo_path(path_value: str | Path) -> Path:
    return resolve_repo_path_for_repo(REPO_ROOT, path_value)


def resolve_frontend_dir(frontend_dir: str | Path) -> Path:
    resolved = resolve_frontend_dir_for_repo(REPO_ROOT, frontend_dir)
    configured = resolve_repo_path(frontend_dir)
    legacy_dir = configured.parent if configured.name == "dist" else None
    if resolved != configured and legacy_dir is not None:
        LOGGER.warning(
            "Configured frontend_dir=%s is missing; falling back to legacy frontend assets at %s",
            configured,
            resolved,
        )
    return resolved


def redact_database_url(database_url: str) -> str:
    parsed = urlparse(database_url)
    if "@" not in parsed.netloc:
        return database_url
    auth_part, host_part = parsed.netloc.rsplit("@", 1)
    if ":" not in auth_part:
        return database_url
    username, _password = auth_part.split(":", 1)
    netloc = f"{username}:***@{host_part}"
    return parsed._replace(netloc=netloc).geturl()


def parse_bool(value: object, *, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on", "enabled"}


def wait_for_database(
    database_url: str,
    *,
    retries: int,
    retry_delay_seconds: float,
    connect_timeout_seconds: int,
) -> None:
    retries = max(retries, 1)
    retry_delay_seconds = max(retry_delay_seconds, 0)
    connect_timeout_seconds = max(connect_timeout_seconds, 1)
    redacted_database_url = redact_database_url(database_url)
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            with psycopg.connect(database_url, connect_timeout=connect_timeout_seconds):
                LOGGER.info("Database is reachable database_url=%s", redacted_database_url)
                return
        except Exception as exc:
            last_error = exc
            if attempt == retries:
                break
            LOGGER.warning(
                "Database is unavailable at startup attempt=%d/%d database_url=%s error=%s",
                attempt,
                retries,
                redacted_database_url,
                exc,
            )
            time.sleep(retry_delay_seconds)

    raise SystemExit(
        f"Database is unreachable after {retries} attempt(s): {last_error}. "
        f"Check that PostgreSQL is running and DATABASE_URL points to {redacted_database_url}."
    )


def run_startup_database_migrations(database_url: str) -> int:
    redacted_database_url = redact_database_url(database_url)
    started_at = time.perf_counter()
    LOGGER.info("Running database migrations database_url=%s", redacted_database_url)
    conn = None
    schema_version = 0
    try:
        conn = open_db(database_url, ensure_schema=True)
        schema_version = get_db_schema_version(conn)
    except Exception:
        LOGGER.exception("Database migrations failed database_url=%s", redacted_database_url)
        raise
    finally:
        if conn is not None:
            conn.close()

    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    LOGGER.info(
        "Database migrations completed database_url=%s elapsed_ms=%d schema_version=%d",
        redacted_database_url,
        elapsed_ms,
        schema_version,
    )
    return schema_version


def ensure_demo_admin_user(database_url: str) -> None:
    timestamp = datetime.now(timezone.utc).isoformat()
    with open_db(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM auth_users WHERE email=%s AND id<>%s", (DEMO_ADMIN_USERNAME, DEMO_ADMIN_USER_ID))
            cur.execute(
                """
                INSERT INTO auth_users(
                    id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at, last_login_at
                )
                VALUES (%s, %s, %s, 'Demo', 'Diver', 'admin', TRUE, %s, %s, NULL)
                ON CONFLICT (id)
                DO UPDATE SET
                    email=excluded.email,
                    password_hash=excluded.password_hash,
                    first_name=excluded.first_name,
                    last_name=excluded.last_name,
                    role=excluded.role,
                    is_active=TRUE,
                    updated_at=excluded.updated_at
                """,
                (DEMO_ADMIN_USER_ID, DEMO_ADMIN_USERNAME, DEMO_ADMIN_PASSWORD_HASH, timestamp, timestamp),
            )
            cur.execute(
                """
                INSERT INTO auth_instance_settings(singleton, initialized, public_registration_enabled, owner_user_id, updated_at)
                VALUES (TRUE, TRUE, FALSE, %s, %s)
                ON CONFLICT (singleton)
                DO UPDATE SET
                    initialized=TRUE,
                    public_registration_enabled=FALSE,
                    owner_user_id=excluded.owner_user_id,
                    updated_at=excluded.updated_at
                """,
                (DEMO_ADMIN_USER_ID, timestamp),
            )
        conn.commit()
    LOGGER.info("Ensured demo admin user username=%s user_id=%s", DEMO_ADMIN_USERNAME, DEMO_ADMIN_USER_ID)


def get_current_database_schema_version(database_url: str) -> int:
    conn = None
    try:
        conn = open_db(database_url)
        return get_db_schema_version(conn)
    finally:
        if conn is not None:
            conn.close()


def require_expected_schema_version(schema_version: int, *, expected_schema_version: int = CURRENT_SCHEMA_VERSION) -> None:
    if schema_version == expected_schema_version:
        return
    raise SystemExit(
        "Database schema version mismatch. "
        f"Expected {expected_schema_version}, found {schema_version}. "
        "Run the schema migration job before starting backend pods."
    )


def _app_backup_repository():
    return sys.modules[__name__]


def profile_license_documents(conn, user_id: str, profile: dict) -> list[dict]:
    return service_profile_license_documents(conn, user_id, profile, repo=_app_backup_repository())


def build_backup_payload(conn, user_id: str) -> dict:
    return service_build_backup_payload(conn, user_id, repo=_app_backup_repository())


def import_backup_payload(conn, user_id: str, payload: dict | None) -> dict:
    return service_import_backup_payload(conn, user_id, payload, repo=_app_backup_repository())











class DiveBackendHandler(BaseHTTPRequestHandler):
    server_version = "DiveBackend/2.0"

    def do_OPTIONS(self) -> None:
        self._mark_request_started()
        LOGGER.debug("OPTIONS %s", self.path)
        self.send_response(204)
        self._send_cors_headers()
        self._send_security_headers()
        self.end_headers()
        self._observe_response(204)

    def do_GET(self) -> None:
        self._handle_method("GET")

    def do_POST(self) -> None:
        self._handle_method("POST")

    def do_PUT(self) -> None:
        self._handle_method("PUT")

    def do_DELETE(self) -> None:
        self._handle_method("DELETE")

    def log_message(self, fmt: str, *args) -> None:
        LOGGER.debug("HTTP %s - %s", self.address_string(), fmt % args)

    def _handle_method(self, method: str) -> None:
        self._mark_request_started()
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        if path in {"/health", "/api/health"}:
            LOGGER.debug("%s %s query=%s request_id=%s", method, path, dict(query), self._request_id)
        else:
            LOGGER.info("%s %s query=%s request_id=%s", method, path, dict(query), self._request_id)

        route, match = match_route(ROUTES, method, path)
        try:
            if route is None:
                allowed = allowed_methods_for_path(ROUTES, path)
                if allowed:
                    raise MethodNotAllowed(
                        "Method not allowed",
                        headers={"Allow": ", ".join(allowed)},
                    )
                if method == "GET" and not path.startswith("/api/"):
                    self._request_route_label = "frontend"
                    self._serve_frontend(path)
                    return
                LOGGER.warning("Route not found: %s", path)
                raise NotFound("Not found")

            self._request_route_label = route.route_label
            self._route_policy = route.policy
            if not self._apply_route_policy(route.policy):
                return
            route.handler(self, match, parsed, query, deps=sys.modules[__name__])
        except AppError as exc:
            send_error(self, exc)
        except Exception:
            LOGGER.exception("Unhandled request error request_id=%s method=%s path=%s", self._request_id, method, path)
            send_error(self, AppError())

    def _apply_route_policy(self, policy: RoutePolicy) -> bool:
        self._route_max_body_bytes = self._route_body_limit(policy)
        if self._route_max_body_bytes is not None:
            content_length = self.headers.get("Content-Length")
            if content_length:
                try:
                    length = int(content_length)
                except ValueError:
                    raise AppError("Invalid Content-Length header", status=400)
                if length < 0:
                    raise AppError("Invalid Content-Length header", status=400)
                if length > self._route_max_body_bytes:
                    raise PayloadTooLarge(f"Request body exceeds {self._route_max_body_bytes} byte limit")

        if policy.content_types and int(self.headers.get("Content-Length") or "0") > 0:
            content_type = request_content_type(self)
            if content_type not in policy.content_types:
                accepted = ", ".join(sorted(policy.content_types))
                if policy.content_types == JSON_TYPES:
                    accepted = "application/json"
                elif policy.content_types == BACKUP_IMPORT_TYPES:
                    accepted = "application/json or application/zip"
                elif policy.content_types == CSV_IMPORT_TYPES:
                    accepted = "text/csv or application/json"
                elif policy.content_types == SUBSURFACE_IMPORT_TYPES:
                    accepted = "application/xml, text/xml, application/gzip, or application/zip"
                raise UnsupportedMediaType(f"Content-Type must be {accepted}")

        if policy.rate_limit_scope:
            if not self._enforce_rate_limit(policy.rate_limit_scope):
                return False
            self._rate_limit_scopes_enforced.add(policy.rate_limit_scope)

        if policy.auth == AUTH_ANY:
            if self._require_auth() is None:
                return False
        elif policy.auth == AUTH_PRINCIPAL:
            if self._require_principal_id() is None:
                return False
        elif policy.auth == AUTH_OWNER:
            if self._require_owner_auth() is None:
                return False
        elif policy.auth == AUTH_BROWSER_SESSION:
            if self._require_browser_session_auth() is None:
                return False
        return True

    def _route_body_limit(self, policy: RoutePolicy) -> int | None:
        if policy.max_body_attr is None:
            return policy.max_body_default
        return int(getattr(self.server, policy.max_body_attr, policy.max_body_default or 0))

    @contextmanager
    def _db(self):
        try:
            conn = self._open_database_connection()
        except Exception as exc:  # pragma: no cover - depends on runtime DB availability
            LOGGER.exception("Database connection failed")
            raise AppError(f"Database unavailable: {exc}", status=503) from exc
        try:
            yield conn
        finally:
            conn.close()

    def _open_database_connection(self):
        pool = getattr(self.server, "database_pool", None)
        if pool is not None:
            return PooledConnectionProxy(pool)
        return open_db(self.server.database_url)

    def _open_db(self):
        try:
            return self._open_database_connection()
        except Exception as exc:  # pragma: no cover - depends on runtime DB availability
            LOGGER.exception("Database connection failed")
            self._send_json(503, {"error": f"Database unavailable: {exc}"})
            return None

    def _require_auth(self) -> dict | None:
        return require_auth(self)

    @staticmethod
    def _is_admin_claims(claims: dict | None) -> bool:
        return is_admin_claims(claims)

    def _require_owner_auth(self) -> dict | None:
        return require_owner_auth(self, get_auth_instance_settings=get_auth_instance_settings)

    @staticmethod
    def _normalize_user_role(value: object) -> str | None:
        normalized = str(value or "user").strip().lower()
        if normalized not in {"user", "admin"}:
            return None
        return normalized

    def _require_browser_session_auth(self) -> dict | None:
        return require_browser_session_auth(self)

    @staticmethod
    def _principal_id_from_claims(claims: dict | None) -> str | None:
        return principal_id_from_claims(claims)

    def _require_principal_id(self) -> str | None:
        return require_principal_id(self)

    def _read_request_body(self, *, max_bytes: int) -> bytes | None:
        return read_request_body(self, max_bytes=max_bytes)

    def _read_json_body(self, *, max_bytes: int | None = None) -> dict | None:
        return read_json_body(self, max_bytes=max_bytes)

    def _send_security_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)")

    def _mark_request_started(self) -> None:
        self._request_started_at = time.perf_counter()
        self._response_observed = False
        self._request_id = uuid.uuid4().hex[:12]
        self._request_route_label = ""
        self._route_policy = RoutePolicy()
        self._route_max_body_bytes = None
        self._auth_claims = None
        self._auth_checked = False
        self._principal_id = None
        self._owner_auth_claims = None
        self._owner_auth_checked = False
        self._rate_limit_scopes_enforced = set()

    def _observe_response(self, status: int) -> None:
        if getattr(self, "_response_observed", False):
            return
        self._response_observed = True
        metrics = getattr(self.server, "metrics", None)
        parsed = urlparse(self.path)
        started_at = getattr(self, "_request_started_at", None)
        duration_seconds = time.perf_counter() - started_at if isinstance(started_at, float) else 0.0
        if metrics is not None:
            metrics.observe_request(
                method=getattr(self, "command", ""),
                path=parsed.path,
                status=status,
                duration_seconds=duration_seconds,
            )
        LOGGER.info(
            "request_complete request_id=%s method=%s route=%s path=%s status=%d duration_ms=%d principal_id=%s",
            getattr(self, "_request_id", ""),
            getattr(self, "command", ""),
            getattr(self, "_request_route_label", "") or parsed.path,
            parsed.path,
            status,
            int(duration_seconds * 1000),
            getattr(self, "_principal_id", None) or "",
        )

    def _send_json(self, status: int, payload: dict, *, extra_headers: dict[str, str] | None = None) -> None:
        body = json.dumps(payload, indent=2, sort_keys=True).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self._send_security_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)
        self._observe_response(status)

    def _send_bytes(self, status: int, body: bytes, content_type: str, *, extra_headers: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self._send_cors_headers()
        self._send_security_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)
        self._observe_response(status)

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", self.server.cors_origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")

    def _enforce_rate_limit(self, scope: str) -> bool:
        if scope in getattr(self, "_rate_limit_scopes_enforced", set()):
            return True
        limiter = getattr(self.server, "rate_limiter", None)
        if limiter is None:
            return True
        policies = getattr(self.server, "rate_limit_policies", {})
        policy = policies.get(scope)
        if not isinstance(policy, dict):
            return True
        limit = int(policy.get("limit", 0))
        window_seconds = int(policy.get("window_seconds", 60))
        if limit <= 0:
            return True
        client_ip = self.client_address[0] if self.client_address else "unknown"
        allowed, retry_after_seconds = limiter.allow(
            f"{scope}:{client_ip}",
            limit=limit,
            window_seconds=window_seconds,
        )
        if allowed:
            return True
        self._send_json(
            429,
            {"error": "Rate limit exceeded. Please retry later."},
            extra_headers={"Retry-After": str(retry_after_seconds)},
        )
        return False

    def _send_config_js(self) -> None:
        body = (
            "window.__APP_CONFIG__ = "
            + json.dumps({
                "authEnabled": True,
                "demoMode": bool(getattr(self.server, "demo_mode", False)),
            })
            + ";\n"
        ).encode("utf-8")
        self.send_response(200)
        self._send_security_headers()
        self.send_header("Content-Type", "application/javascript; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        self._observe_response(200)

    def _serve_frontend(self, path: str) -> None:
        asset_path = frontend_asset_path(self.server.frontend_dir, path)
        if not asset_path.exists():
            LOGGER.warning("Frontend asset not found path=%s", asset_path)
            self._send_json(404, {"error": "Frontend asset not found"})
            return

        content_type, _ = mimetypes.guess_type(asset_path.name)
        body = asset_path.read_bytes()
        self.send_response(200)
        self._send_security_headers()
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        LOGGER.info("Served frontend asset path=%s", asset_path.name)
        self._observe_response(200)

    @staticmethod
    def _single_query_arg(query: dict[str, list[str]], key: str) -> str | None:
        values = query.get(key)
        return values[0] if values else None

    @staticmethod
    def _is_truthy(value: str) -> bool:
        return value.lower() in {"1", "true", "yes", "on"}

    @staticmethod
    def _parse_int(value: str, default: int, *, max_value: int | None = None) -> int:
        try:
            parsed = int(value)
        except ValueError:
            parsed = default
        normalized = max(parsed, 0)
        if max_value is None:
            return normalized
        return min(normalized, max(max_value, 0))


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve dives from PostgreSQL and accept parsed dive uploads.")
    parser.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL"),
        help="PostgreSQL connection string. Defaults to DATABASE_URL.",
    )
    parser.add_argument("--host", default=os.getenv("HOST", "127.0.0.1"), help="Host interface to bind")
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8000")), help="TCP port to bind")
    parser.add_argument("--cors-origin", default=os.getenv("CORS_ORIGIN", "http://localhost:5173"), help="Allowed CORS origin for frontend requests")
    parser.add_argument(
        "--frontend-dir",
        default=os.getenv("FRONTEND_DIR", "frontend/dist"),
        help="Path to static frontend assets, resolved relative to the repository root when not absolute",
    )
    parser.add_argument("--auth-jwt-secret", default=os.getenv("AUTH_JWT_SECRET", "dev-only-change-me"), help="Shared secret used to sign and verify first-party DiveVault session tokens")
    parser.add_argument("--auth-jwt-issuer", default=os.getenv("AUTH_JWT_ISSUER", "divevault.local"), help="JWT issuer for first-party DiveVault tokens")
    parser.add_argument("--auth-jwt-audience", default=os.getenv("AUTH_JWT_AUDIENCE", "divevault.app"), help="JWT audience for first-party DiveVault tokens")
    parser.add_argument("--auth-token-ttl-seconds", type=int, default=int(os.getenv("AUTH_TOKEN_TTL_SECONDS", "43200")), help="Session token TTL in seconds")
    parser.add_argument(
        "--demo-mode",
        nargs="?",
        const="true",
        default=os.getenv("DEMO_MODE", "false"),
        help="Show public demo messaging in the frontend. Use --demo-mode, --demo-mode true, or DEMO_MODE=true.",
    )
    parser.add_argument("--cli-auth-request-ttl", type=int, default=int(os.getenv("CLI_AUTH_REQUEST_TTL", "600")), help="Seconds a desktop login request stays valid")
    parser.add_argument("--cli-auth-token-ttl", type=int, default=int(os.getenv("CLI_AUTH_TOKEN_TTL", "1800")), help="Seconds an approved desktop sync token stays valid")
    parser.add_argument("--nominatim-base-url", default=os.getenv("NOMINATIM_BASE_URL", "https://nominatim.openstreetmap.org"), help="Base URL for the Nominatim search service")
    parser.add_argument("--nominatim-user-agent", default=os.getenv("NOMINATIM_USER_AGENT", "DiveVault/1.0"), help="User-Agent sent to the Nominatim search service")
    parser.add_argument("--nominatim-email", default=os.getenv("NOMINATIM_EMAIL"), help="Optional email sent to the Nominatim search service")
    parser.add_argument("--db-startup-retries", type=int, default=int(os.getenv("DB_STARTUP_RETRIES", "5")), help="Number of startup checks to confirm PostgreSQL is reachable")
    parser.add_argument("--db-startup-retry-delay-seconds", type=float, default=float(os.getenv("DB_STARTUP_RETRY_DELAY_SECONDS", "2")), help="Delay between PostgreSQL startup checks")
    parser.add_argument("--db-connect-timeout-seconds", type=int, default=int(os.getenv("DB_CONNECT_TIMEOUT_SECONDS", "5")), help="Connection timeout for each PostgreSQL startup check")
    parser.add_argument("--db-pool-size", type=int, default=int(os.getenv("DB_POOL_SIZE", "5")), help="Maximum pooled PostgreSQL connections for request handling; set 0 to disable pooling")
    parser.add_argument(
        "--startup-migrations",
        default=os.getenv("STARTUP_MIGRATIONS", "enabled"),
        choices=["enabled", "disabled"],
        help="Whether to run schema migrations at backend startup. Use disabled when migrations run externally (for example, a Kubernetes Job).",
    )
    parser.add_argument("--max-json-body-bytes", type=int, default=int(os.getenv("MAX_JSON_BODY_BYTES", str(1024 * 1024))), help="Maximum JSON request body size in bytes")
    parser.add_argument("--max-backup-import-bytes", type=int, default=int(os.getenv("MAX_BACKUP_IMPORT_BYTES", str(25 * 1024 * 1024))), help="Maximum backup archive body size accepted by /api/backup/import")
    parser.add_argument("--max-csv-import-bytes", type=int, default=int(os.getenv("MAX_CSV_IMPORT_BYTES", str(5 * 1024 * 1024))), help="Maximum CSV body size accepted by /api/imports/csv")
    parser.add_argument("--max-subsurface-import-bytes", type=int, default=int(os.getenv("MAX_SUBSURFACE_IMPORT_BYTES", str(15 * 1024 * 1024))), help="Maximum Subsurface XML body size accepted by /api/imports/subsurface")
    parser.add_argument("--max-list-limit", type=int, default=int(os.getenv("MAX_LIST_LIMIT", "200")), help="Maximum list endpoint page size")
    parser.add_argument("--rate-limit-window-seconds", type=int, default=int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60")), help="Rate limit window in seconds")
    parser.add_argument("--rate-limit-cli-request-per-window", type=int, default=int(os.getenv("RATE_LIMIT_CLI_REQUEST_PER_WINDOW", "30")), help="Max CLI auth request create/status calls per IP and window")
    parser.add_argument("--rate-limit-cli-approve-per-window", type=int, default=int(os.getenv("RATE_LIMIT_CLI_APPROVE_PER_WINDOW", "15")), help="Max CLI auth approve calls per IP and window")
    parser.add_argument("--rate-limit-backup-import-per-window", type=int, default=int(os.getenv("RATE_LIMIT_BACKUP_IMPORT_PER_WINDOW", "10")), help="Max backup import calls per IP and window")
    parser.add_argument("--rate-limit-dive-upload-per-window", type=int, default=int(os.getenv("RATE_LIMIT_DIVE_UPLOAD_PER_WINDOW", "120")), help="Max dive upload calls per IP and window")
    parser.add_argument(
        "--metrics",
        default=os.getenv("METRICS_ENABLED", "disabled"),
        choices=["enabled", "disabled"],
        help="Expose Prometheus-scrapable metrics at /metrics when enabled.",
    )
    parser.add_argument(
        "--log-level",
        default=os.getenv("LOG_LEVEL", "INFO"),
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging verbosity",
    )
    args = parser.parse_args()

    if not args.database_url:
        parser.error("Provide --database-url or set DATABASE_URL.")
    demo_mode = parse_bool(args.demo_mode)

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    wait_for_database(
        args.database_url,
        retries=args.db_startup_retries,
        retry_delay_seconds=args.db_startup_retry_delay_seconds,
        connect_timeout_seconds=args.db_connect_timeout_seconds,
    )
    if args.startup_migrations == "enabled":
        schema_version = run_startup_database_migrations(args.database_url)
    else:
        schema_version = get_current_database_schema_version(args.database_url)
        LOGGER.info(
            "Skipping startup migrations because startup_migrations=%s schema_version=%d",
            args.startup_migrations,
            schema_version,
        )
    require_expected_schema_version(schema_version)
    if demo_mode:
        ensure_demo_admin_user(args.database_url)

    server = ThreadingHTTPServer((args.host, args.port), DiveBackendHandler)
    server.database_url = args.database_url
    server.database_ready = True
    server.database_ready_error = ""
    server.database_schema_version = schema_version
    server.database_pool = None
    server.demo_mode = demo_mode
    server.metrics_enabled = args.metrics == "enabled"
    server.metrics = PrometheusMetrics() if server.metrics_enabled else None
    server.cli_auth_manager = CliSyncTokenManager(
        request_ttl_seconds=args.cli_auth_request_ttl,
        token_ttl_seconds=args.cli_auth_token_ttl,
        database_url=args.database_url,
    )
    server.auth_verifier = build_auth_verifier(args, sync_token_manager=server.cli_auth_manager)
    server.auth_jwt_secret = args.auth_jwt_secret
    server.auth_jwt_issuer = args.auth_jwt_issuer
    server.auth_jwt_audience = args.auth_jwt_audience
    server.auth_token_ttl_seconds = max(args.auth_token_ttl_seconds, 300)
    server.cors_origin = args.cors_origin
    server.max_json_body_bytes = max(args.max_json_body_bytes, 1)
    server.max_backup_import_bytes = max(args.max_backup_import_bytes, 1)
    server.max_csv_import_bytes = max(args.max_csv_import_bytes, 1)
    server.max_subsurface_import_bytes = max(args.max_subsurface_import_bytes, 1)
    server.max_list_limit = max(args.max_list_limit, 1)
    rate_limit_window_seconds = max(args.rate_limit_window_seconds, 1)
    server.rate_limiter = FixedWindowRateLimiter()
    server.rate_limit_policies = {
        "cli_auth_request_create": {
            "limit": max(args.rate_limit_cli_request_per_window, 0),
            "window_seconds": rate_limit_window_seconds,
        },
        "cli_auth_request_status": {
            "limit": max(args.rate_limit_cli_request_per_window, 0),
            "window_seconds": rate_limit_window_seconds,
        },
        "cli_auth_approve": {
            "limit": max(args.rate_limit_cli_approve_per_window, 0),
            "window_seconds": rate_limit_window_seconds,
        },
        "backup_import": {
            "limit": max(args.rate_limit_backup_import_per_window, 0),
            "window_seconds": rate_limit_window_seconds,
        },
        "dive_upload": {
            "limit": max(args.rate_limit_dive_upload_per_window, 0),
            "window_seconds": rate_limit_window_seconds,
        },
    }
    server.frontend_dir = resolve_frontend_dir(args.frontend_dir)
    server.nominatim_client = NominatimClient(
        base_url=args.nominatim_base_url,
        user_agent=args.nominatim_user_agent,
        email=args.nominatim_email,
    )
    db_pool_size = max(args.db_pool_size, 0)
    if db_pool_size > 0 and ConnectionPool is not None:
        server.database_pool = ConnectionPool(
            args.database_url,
            min_size=1,
            max_size=db_pool_size,
            kwargs={"autocommit": True, "row_factory": dict_row},
            open=True,
        )
    elif db_pool_size > 0:
        LOGGER.warning("DB_POOL_SIZE=%d requested but psycopg_pool is not installed; falling back to per-request connections", db_pool_size)

    LOGGER.info(
        "Starting backend host=%s port=%d database_url=%s cors_origin=%s frontend_dir=%s schema_version=%d demo_mode=%s metrics=%s db_pool_size=%d",
        args.host,
        args.port,
        redact_database_url(args.database_url),
        args.cors_origin,
        server.frontend_dir,
        schema_version,
        server.demo_mode,
        args.metrics,
        db_pool_size if server.database_pool is not None else 0,
    )
    shutdown_started = threading.Event()

    def _handle_shutdown_signal(signum, _frame) -> None:
        if shutdown_started.is_set():
            return
        shutdown_started.set()
        signal_name = signal.Signals(signum).name if signum in (signal.SIGINT, signal.SIGTERM) else str(signum)
        LOGGER.info("Received shutdown signal=%s", signal_name)
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, _handle_shutdown_signal)
    signal.signal(signal.SIGINT, _handle_shutdown_signal)

    try:
        server.serve_forever()
    finally:
        LOGGER.info("Stopping backend")
        if getattr(server, "database_pool", None) is not None:
            server.database_pool.close()
        server.server_close()


if __name__ == "__main__":
    main()
