#!/usr/bin/env python3
"""
Simple dive backend backed by PostgreSQL.

It accepts parsed dives from `mares_smart_air_sync.py` and serves dives to a frontend.

Usage:
    cd backend && python -m divevault.app --database-url postgresql://dive:dive@localhost:5432/dive
"""

from __future__ import annotations

import argparse
import base64
import binascii
import csv
import gzip
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
import hashlib
import hmac
import uuid
import zipfile
from contextlib import contextmanager
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO, StringIO
from pathlib import Path
from xml.etree import ElementTree
from urllib import error as urlerror
from urllib import request as urlrequest
from urllib.parse import parse_qs, urlencode, urlparse

import jwt
import psycopg
from dotenv import load_dotenv
from jwt import InvalidTokenError

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

try:  # pragma: no cover - exercised only when the optional runtime extra is installed
    from psycopg_pool import ConnectionPool
except ImportError:  # pragma: no cover - development environments may not install pool extras immediately
    ConnectionPool = None


LOGGER = logging.getLogger("dive_backend")
BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
MAX_PROFILE_LICENSE_BYTES = 10 * 1024 * 1024
DEMO_ADMIN_USER_ID = "user_demoadmin"
DEMO_ADMIN_USERNAME = "admin"
DEMO_ADMIN_PASSWORD_HASH = (
    "scrypt$000102030405060708090a0b0c0d0e0f$"
    "39e0e8ec42ae38fa261d39c6fbf3caaacc6647921c33a54c99770f5ba0283d90685177b5ff7cbb13a56671fd3f74ebaf442667cdaab09a4a60385cec2980c231"
)

load_dotenv(REPO_ROOT / ".env")


def normalize_bearer_token(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip()
    if len(normalized) >= 2 and normalized[0] == normalized[-1] and normalized[0] in {'"', "'"}:
        normalized = normalized[1:-1].strip()
    if normalized.lower().startswith("bearer "):
        normalized = normalized.split(" ", 1)[1].strip()
    return normalized or None


class DiveVaultAuthTokenVerifier:
    def __init__(
        self,
        *,
        jwt_secret: str,
        jwt_issuer: str,
        jwt_audience: str,
        sync_token_manager=None,
    ) -> None:
        self.jwt_secret = jwt_secret
        self.issuer = jwt_issuer
        self.audience = jwt_audience
        self.sync_token_manager = sync_token_manager

    @property
    def configured(self) -> bool:
        return bool(self.jwt_secret)

    def verify_request(self, headers) -> dict:
        token = normalize_bearer_token(self._extract_token(headers))
        if not token:
            raise AuthError(401, "Missing authentication bearer token")

        if token.startswith("dvsync_"):
            return self._verify_sync_token(token)
        return self._verify_session_token(token)

    def _verify_session_token(self, token: str) -> dict:
        try:
            claims = jwt.decode(
                token,
                self.jwt_secret,
                algorithms=["HS256"],
                issuer=self.issuer,
                audience=self.audience,
                options={"verify_exp": True},
                leeway=5,
            )
        except InvalidTokenError as exc:
            raise AuthError(401, f"Invalid session token: {exc}") from exc

        claims.setdefault("token_type", "session_token")
        return claims

    def _verify_sync_token(self, token: str) -> dict:
        if self.sync_token_manager is None:
            raise AuthError(503, "Desktop sync login is not configured on the backend")

        claims = self.sync_token_manager.verify_token(token)
        if claims is None:
            raise AuthError(401, "Desktop sync token is invalid or expired")
        return claims

    @staticmethod
    def _extract_token(headers) -> str | None:
        authorization = headers.get("Authorization", "")
        if authorization.lower().startswith("bearer "):
            return authorization.split(" ", 1)[1].strip() or None

        cookie_header = headers.get("Cookie", "")
        if not cookie_header:
            return None

        cookie = SimpleCookie()
        cookie.load(cookie_header)
        session_cookie = cookie.get("__session")
        return session_cookie.value if session_cookie else None


def sanitize_profile_license_filename(value: object) -> str:
    if not isinstance(value, str):
        return "diving-licenses.pdf"
    filename = value.replace("\\", "/").split("/")[-1].strip()
    if not filename:
        return "diving-licenses.pdf"
    return filename if filename.lower().endswith(".pdf") else f"{filename}.pdf"


def decode_profile_license_payload(payload: dict | None) -> tuple[str, str, bytes]:
    source = payload if isinstance(payload, dict) else {}
    data_b64 = source.get("data_b64")
    if not isinstance(data_b64, str) or not data_b64.strip():
        raise ValueError("License PDF upload requires data_b64")

    try:
        pdf_bytes = base64.b64decode(data_b64, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("License PDF must be valid base64") from exc

    if not pdf_bytes.startswith(b"%PDF-"):
        raise ValueError("License file must be a PDF")
    if len(pdf_bytes) > MAX_PROFILE_LICENSE_BYTES:
        raise ValueError(f"License PDF must be {MAX_PROFILE_LICENSE_BYTES // (1024 * 1024)} MB or smaller")

    content_type = (source.get("content_type") or "application/pdf").strip().lower()
    if content_type != "application/pdf":
        raise ValueError("License file must use content_type application/pdf")

    return sanitize_profile_license_filename(source.get("filename")), "application/pdf", pdf_bytes


class NominatimClient:
    def __init__(
        self,
        *,
        base_url: str,
        user_agent: str,
        email: str | None = None,
        min_interval_seconds: float = 1.0,
    ) -> None:
        self.base_url = (base_url or "https://nominatim.openstreetmap.org").rstrip("/")
        self.user_agent = (user_agent or "DiveVault/1.0").strip()
        self.email = email.strip() if email else None
        self.min_interval_seconds = max(min_interval_seconds, 0)
        self._lock = threading.Lock()
        self._cache: dict[str, dict] = {}
        self._last_request_at = 0.0

    def search(self, query: str) -> dict:
        normalized_query = query.strip()
        if not normalized_query:
            raise ValueError("Missing search query")

        cache_key = normalized_query.casefold()
        with self._lock:
            cached = self._cache.get(cache_key)
            if cached is not None:
                return dict(cached)

            delay_seconds = self.min_interval_seconds - max(0.0, time.time() - self._last_request_at)
            if delay_seconds > 0:
                time.sleep(delay_seconds)

            payload = self._perform_search(normalized_query)
            self._cache[cache_key] = payload
            self._last_request_at = time.time()
            return dict(payload)

    def _perform_search(self, query: str) -> dict:
        params = {
            "q": query,
            "format": "jsonv2",
            "limit": "1",
            "addressdetails": "1",
            "accept-language": "en",
        }
        if self.email:
            params["email"] = self.email

        request_url = f"{self.base_url}/search?{urlencode(params)}"
        req = urlrequest.Request(
            request_url,
            headers={
                "User-Agent": self.user_agent,
                "Accept": "application/json",
                "Accept-Language": "en",
            },
            method="GET",
        )

        try:
            with urlrequest.urlopen(req, timeout=15) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urlerror.HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Nominatim search failed with HTTP {exc.code}: {details}") from exc
        except (urlerror.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"Nominatim search failed: {exc}") from exc

        if not isinstance(payload, list) or not payload:
            return {"query": query, "found": False, "result": None}

        first_result = payload[0] if isinstance(payload[0], dict) else {}
        address = first_result.get("address") if isinstance(first_result.get("address"), dict) else {}
        try:
            latitude = float(first_result.get("lat"))
            longitude = float(first_result.get("lon"))
        except (TypeError, ValueError):
            return {"query": query, "found": False, "result": None}

        return {
            "query": query,
            "found": True,
            "result": {
                "name": first_result.get("display_name") or query,
                "country": address.get("country") if isinstance(address.get("country"), str) else "",
                "latitude": latitude,
                "longitude": longitude,
            },
        }


class CliSyncTokenManager:
    def __init__(
        self,
        *,
        request_ttl_seconds: int = 600,
        token_ttl_seconds: int = 1800,
        database_url: str | None = None,
    ) -> None:
        self.request_ttl_seconds = request_ttl_seconds
        self.token_ttl_seconds = token_ttl_seconds
        self.database_url = database_url.strip() if database_url else None
        self._pending_codes: dict[str, dict] = {}
        self._active_tokens: dict[str, dict] = {}
        self._lock = threading.Lock()

    def _cleanup_locked(self, now: float) -> None:
        expired_codes = [code for code, entry in self._pending_codes.items() if entry["expires_at"] <= now]
        for code in expired_codes:
            self._pending_codes.pop(code, None)

        expired_tokens = [token for token, claims in self._active_tokens.items() if claims["expires_at"] <= now]
        for token in expired_tokens:
            self._active_tokens.pop(token, None)

    def _uses_database(self) -> bool:
        return bool(self.database_url)

    def _open_database(self):
        if not self.database_url:
            raise RuntimeError("CLI sync database persistence is not configured")
        return open_db(self.database_url)

    def create_request(self) -> dict:
        now = time.time()
        code = secrets.token_urlsafe(24)
        if self._uses_database():
            conn = self._open_database()
            try:
                entry = create_cli_sync_request(
                    conn,
                    code=code,
                    request_ttl_seconds=self.request_ttl_seconds,
                    now_timestamp=int(now),
                )
            finally:
                conn.close()
            LOGGER.info("Created CLI auth request code=%s created_at=%s expires_at=%s", entry["code"], entry["created_at"], entry["expires_at"])
            return entry

        entry = {
            "code": code,
            "status": "pending",
            "created_at": int(now),
            "expires_at": int(now + self.request_ttl_seconds),
            "token": None,
            "token_expires_at": None,
            "user_id": None,
            "email": None,
        }
        with self._lock:
            self._cleanup_locked(now)
            self._pending_codes[code] = entry
        LOGGER.info("Created CLI auth request code=%s created_at=%s expires_at=%s", entry["code"], entry["created_at"], entry["expires_at"])
        return dict(entry)

    def approve_request(self, code: str, claims: dict) -> dict | None:
        now = time.time()
        if self._uses_database():
            token = f"dvsync_{secrets.token_urlsafe(32)}"
            conn = self._open_database()
            try:
                entry = approve_cli_sync_request(
                    conn,
                    code,
                    claims,
                    token=token,
                    token_ttl_seconds=self.token_ttl_seconds,
                    now_timestamp=int(now),
                )
            finally:
                conn.close()
            if entry is not None:
                LOGGER.info("Approved CLI auth request code=%s user_id=%s token_expires_at=%s", code, entry.get("user_id"), entry.get("token_expires_at"))
            else:
                LOGGER.warning("Rejected CLI auth approval because request was missing or expired code=%s", code)
            return entry

        with self._lock:
            self._cleanup_locked(now)
            entry = self._pending_codes.get(code)
            if not entry or entry["expires_at"] <= now:
                return None

            token = f"dvsync_{secrets.token_urlsafe(32)}"
            token_expires_at = int(now + self.token_ttl_seconds)
            self._active_tokens[token] = {
                "token_type": "cli_sync",
                "sub": claims.get("sub"),
                "email": claims.get("email"),
                "sid": claims.get("sid"),
                "issued_at": int(now),
                "expires_at": token_expires_at,
            }
            entry.update(
                {
                    "status": "approved",
                    "approved_at": int(now),
                    "token": token,
                    "token_expires_at": token_expires_at,
                    "user_id": claims.get("sub"),
                    "email": claims.get("email"),
                }
            )
            LOGGER.info("Approved CLI auth request code=%s user_id=%s token_expires_at=%s", code, entry.get("user_id"), entry.get("token_expires_at"))
            return dict(entry)

    def get_request_status(self, code: str) -> dict | None:
        now = time.time()
        if self._uses_database():
            conn = self._open_database()
            try:
                entry = get_cli_sync_request_status(conn, code, now_timestamp=int(now))
            finally:
                conn.close()
            if entry is None:
                LOGGER.warning("CLI auth request status lookup missed code=%s", code)
            return entry

        with self._lock:
            self._cleanup_locked(now)
            entry = self._pending_codes.get(code)
            if entry is None:
                return None
            return dict(entry)

    def verify_token(self, token: str) -> dict | None:
        now = time.time()
        if self._uses_database():
            conn = self._open_database()
            try:
                claims = verify_cli_sync_token(conn, token, now_timestamp=int(now))
            finally:
                conn.close()
            return claims

        with self._lock:
            self._cleanup_locked(now)
            claims = self._active_tokens.get(token)
            if claims is None:
                return None
            return dict(claims)


def hash_password(password: str, *, salt_hex: str | None = None) -> str:
    salt = bytes.fromhex(salt_hex) if salt_hex else secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=64)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    if not isinstance(password_hash, str) or not password_hash.startswith("scrypt$"):
        return False
    parts = password_hash.split("$")
    if len(parts) != 3:
        return False
    _, salt_hex, expected_hex = parts
    actual_hash = hash_password(password, salt_hex=salt_hex)
    return hmac.compare_digest(actual_hash, password_hash)


def issue_session_token(*, user_id: str, email: str, role: str, jwt_secret: str, issuer: str, audience: str, ttl_seconds: int) -> str:
    now_timestamp = int(time.time())
    payload = {
        "sub": user_id,
        "sid": f"session_{uuid.uuid4().hex}",
        "email": email,
        "role": role,
        "token_type": "session_token",
        "iat": now_timestamp,
        "nbf": now_timestamp,
        "exp": now_timestamp + max(ttl_seconds, 300),
        "iss": issuer,
        "aud": audience,
    }
    return jwt.encode(payload, jwt_secret, algorithm="HS256")


def build_auth_verifier(args: argparse.Namespace, *, sync_token_manager: CliSyncTokenManager | None) -> DiveVaultAuthTokenVerifier:
    return DiveVaultAuthTokenVerifier(
        jwt_secret=args.auth_jwt_secret,
        jwt_issuer=args.auth_jwt_issuer,
        jwt_audience=args.auth_jwt_audience,
        sync_token_manager=sync_token_manager,
    )


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


BACKUP_EXPORT_VERSION = 1
BACKUP_MANIFEST_FILENAME = "backup.json"
PDF_PAGE_WIDTH = 612
PDF_PAGE_HEIGHT = 792
PDF_MARGIN_LEFT = 48
PDF_MARGIN_TOP = 744
PDF_MARGIN_BOTTOM = 48
PDF_TEXT_RE = re.compile(r"[^\x20-\x7E]")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def timestamp_slug(value: datetime | None = None) -> str:
    moment = value or now_utc()
    return moment.strftime("%Y%m%d-%H%M%S")


def attachment_filename(value: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "-", value or "").strip("-.")
    return sanitized or "download"


def json_compact(value: object) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True)


def format_export_datetime(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        return "Unknown"
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return value
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def format_duration_label(duration_seconds: object) -> str:
    if not isinstance(duration_seconds, (int, float)):
        return "Unknown"
    total_seconds = max(int(round(float(duration_seconds))), 0)
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}h {minutes:02d}m"
    if minutes:
        return f"{minutes}m {seconds:02d}s"
    return f"{seconds}s"


def format_depth_label(depth_m: object) -> str:
    if not isinstance(depth_m, (int, float)):
        return "Unknown"
    return f"{float(depth_m):.1f} m"


def pdf_text(value: object) -> str:
    text = str(value or "")
    text = PDF_TEXT_RE.sub("?", text)
    text = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return text


def wrap_pdf_text(value: object, width: int = 88) -> list[str]:
    text = PDF_TEXT_RE.sub("?", str(value or "")).strip()
    if not text:
        return []
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if len(candidate) <= width:
            current = candidate
            continue
        if current:
            lines.append(current)
        current = word
    if current:
        lines.append(current)
    return lines


def csv_export_rows(dives: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for dive in dives:
        logbook = dive.get("fields", {}).get("logbook") if isinstance(dive.get("fields"), dict) else {}
        logbook = logbook if isinstance(logbook, dict) else {}
        base_row = {
            "dive_id": dive.get("id"),
            "dive_uid": dive.get("dive_uid"),
            "status": logbook.get("status") or "imported",
            "site": logbook.get("site") or "",
            "buddy": logbook.get("buddy") or "",
            "guide": logbook.get("guide") or "",
            "weather_description": logbook.get("weather_description") or "",
            "visibility": logbook.get("visibility") or "",
            "wetsuit_description": logbook.get("wetsuit_description") or "",
            "weight_description": logbook.get("weight_description") or "",
            "notes": logbook.get("notes") or "",
            "vendor": dive.get("vendor") or "",
            "product": dive.get("product") or "",
            "started_at": dive.get("started_at") or "",
            "imported_at": dive.get("imported_at") or "",
            "duration_seconds": dive.get("duration_seconds") or "",
            "max_depth_m": dive.get("max_depth_m") or "",
            "avg_depth_m": dive.get("avg_depth_m") or "",
            "raw_sha256": dive.get("raw_sha256") or "",
            "sample_count": dive.get("sample_count") or 0,
        }
        samples = dive.get("samples") if isinstance(dive.get("samples"), list) else []
        if not samples:
            rows.append(
                {
                    **base_row,
                    "sample_index": "",
                    "sample_time_seconds": "",
                    "sample_depth_m": "",
                    "sample_temperature_c": "",
                    "sample_tank_pressure_bar": "",
                    "sample_payload_json": "",
                }
            )
            continue

        for index, sample in enumerate(samples):
            sample_dict = sample if isinstance(sample, dict) else {}
            tank_pressure = sample_dict.get("tank_pressure_bar")
            if isinstance(tank_pressure, dict):
                tank_pressure = tank_pressure.get("tank_0")
            rows.append(
                {
                    **base_row,
                    "sample_index": index,
                    "sample_time_seconds": sample_dict.get("time_seconds", ""),
                    "sample_depth_m": sample_dict.get("depth_m", ""),
                    "sample_temperature_c": sample_dict.get("temperature_c", ""),
                    "sample_tank_pressure_bar": tank_pressure if tank_pressure is not None else "",
                    "sample_payload_json": json_compact(sample_dict),
                }
            )
    return rows


def build_dives_csv(dives: list[dict]) -> bytes:
    fieldnames = [
        "dive_id",
        "dive_uid",
        "status",
        "site",
        "buddy",
        "guide",
        "weather_description",
        "visibility",
        "wetsuit_description",
        "weight_description",
        "notes",
        "vendor",
        "product",
        "started_at",
        "imported_at",
        "duration_seconds",
        "max_depth_m",
        "avg_depth_m",
        "raw_sha256",
        "sample_count",
        "sample_index",
        "sample_time_seconds",
        "sample_depth_m",
        "sample_temperature_c",
        "sample_tank_pressure_bar",
        "sample_payload_json",
    ]
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in csv_export_rows(dives):
        writer.writerow(row)
    return buffer.getvalue().encode("utf-8")


CSV_IMPORT_OPTIONAL_FIELDS = [
    "dive_uid",
    "vendor",
    "product",
    "fingerprint_hex",
    "started_at",
    "date",
    "time",
    "duration_seconds",
    "duration_minutes",
    "max_depth_m",
    "avg_depth_m",
    "site",
    "buddy",
    "guide",
    "weather_description",
    "visibility",
    "wetsuit_description",
    "notes",
    "temperature_surface_c",
    "temperature_minimum_c",
    "temperature_maximum_c",
    "tank_volume_l",
    "begin_pressure_bar",
    "end_pressure_bar",
    "gas_o2_percent",
    "gas_he_percent",
    "imported_at",
    "samples_json",
]
CSV_IMPORT_REQUIRED_FIELDS = ["started_at", "duration_seconds", "max_depth_m"]


def clean_csv_value(row: dict, key: str) -> str:
    value = row.get(key)
    return str(value).strip() if value is not None else ""


def parse_csv_float(row: dict, key: str) -> float | None:
    value = clean_csv_value(row, key)
    if value == "":
        return None
    try:
        return float(value)
    except ValueError as exc:
        raise ValueError(f"{key} must be a number") from exc


def parse_csv_positive_seconds(row: dict) -> int:
    seconds = parse_csv_float(row, "duration_seconds")
    if seconds is None:
        minutes = parse_csv_float(row, "duration_minutes")
        if minutes is None:
            raise ValueError("duration_seconds or duration_minutes is required")
        seconds = minutes * 60
    if seconds <= 0:
        raise ValueError("duration must be greater than zero")
    return int(round(seconds))


def parse_csv_started_at(row: dict) -> str:
    started_at = clean_csv_value(row, "started_at")
    if started_at:
        return started_at
    date = clean_csv_value(row, "date")
    time_value = clean_csv_value(row, "time")
    if date and time_value:
        if re.match(r"^\d{2}:\d{2}$", time_value):
            time_value = f"{time_value}:00"
        return f"{date}T{time_value}"
    raise ValueError("started_at is required")


def parse_csv_samples(row: dict) -> list:
    samples_json = clean_csv_value(row, "samples_json")
    if not samples_json:
        return []
    try:
        samples = json.loads(samples_json)
    except json.JSONDecodeError as exc:
        raise ValueError("samples_json must be valid JSON") from exc
    if not isinstance(samples, list):
        raise ValueError("samples_json must be a JSON array")
    return samples


def complete_logbook_if_ready(logbook: dict, *, required_fields: object = None) -> dict:
    required = normalize_required_logbook_fields(required_fields)
    ready = all(isinstance(logbook.get(key), str) and logbook[key].strip() for key in required)
    if ready:
        logbook["status"] = "complete"
        logbook.setdefault("completed_at", now_iso())
    else:
        logbook["status"] = "imported"
        logbook.pop("completed_at", None)
    return logbook


def build_csv_import_fields(row: dict, *, required_fields: object = None) -> dict:
    logbook = {
        "site": clean_csv_value(row, "site"),
        "buddy": clean_csv_value(row, "buddy"),
        "guide": clean_csv_value(row, "guide"),
        "weather_description": clean_csv_value(row, "weather_description"),
        "visibility": clean_csv_value(row, "visibility"),
        "wetsuit_description": clean_csv_value(row, "wetsuit_description"),
        "notes": clean_csv_value(row, "notes"),
    }
    complete_logbook_if_ready(logbook, required_fields=required_fields)
    fields: dict = {"source": "csv", "csv_import": True, "logbook": logbook}

    for csv_key, field_key in (
        ("temperature_surface_c", "temperature_surface_c"),
        ("temperature_minimum_c", "temperature_minimum_c"),
        ("temperature_maximum_c", "temperature_maximum_c"),
    ):
        value = parse_csv_float(row, csv_key)
        if value is not None:
            fields[field_key] = value

    tank: dict = {}
    tank_volume = parse_csv_float(row, "tank_volume_l")
    begin_pressure = parse_csv_float(row, "begin_pressure_bar")
    end_pressure = parse_csv_float(row, "end_pressure_bar")
    gas_o2 = parse_csv_float(row, "gas_o2_percent")
    gas_he = parse_csv_float(row, "gas_he_percent")
    if tank_volume is not None:
        tank["volume"] = tank_volume
    if begin_pressure is not None:
        tank["beginpressure_bar"] = int(round(begin_pressure))
    if end_pressure is not None:
        tank["endpressure_bar"] = int(round(end_pressure))
    if gas_o2 is not None:
        tank["o2_percent"] = gas_o2
    if gas_he is not None:
        tank["he_percent"] = gas_he
    if tank:
        fields["tanks"] = [tank]

    return fields


def import_validation_row_from_payload(payload: dict, *, row_number: int | None = None, source_id: str = "") -> dict:
    fields = payload.get("fields") if isinstance(payload.get("fields"), dict) else {}
    logbook = fields.get("logbook") if isinstance(fields.get("logbook"), dict) else {}
    return {
        "row_number": row_number,
        "source_id": source_id,
        "valid": True,
        "status": "ready",
        "duplicate": False,
        "errors": [],
        "dive_uid": payload.get("dive_uid"),
        "started_at": payload.get("started_at"),
        "site": logbook.get("site") or "",
        "duration_seconds": payload.get("duration_seconds"),
        "max_depth_m": payload.get("max_depth_m"),
        "sample_count": len(payload.get("samples") or []),
    }


def invalid_import_validation_row(*, row_number: int | None = None, source_id: str = "", error: object) -> dict:
    return {
        "row_number": row_number,
        "source_id": source_id,
        "valid": False,
        "status": "invalid",
        "duplicate": False,
        "errors": [str(error)],
        "dive_uid": "",
        "started_at": "",
        "site": "",
        "duration_seconds": None,
        "max_depth_m": None,
        "sample_count": 0,
    }


def csv_import_preview(csv_text: str, *, required_fields: object = None) -> dict:
    if not csv_text.strip():
        raise ValueError("CSV import file is empty")

    reader = csv.DictReader(StringIO(csv_text))
    if not reader.fieldnames:
        raise ValueError("CSV import requires a header row")

    payloads: list[dict] = []
    rows: list[dict] = []
    for row_number, row in enumerate(reader, start=2):
        if not any(str(value or "").strip() for value in row.values()):
            continue
        try:
            started_at = parse_csv_started_at(row)
            duration_seconds = parse_csv_positive_seconds(row)
            max_depth_m = parse_csv_float(row, "max_depth_m")
            if max_depth_m is None:
                raise ValueError("max_depth_m is required")
            avg_depth_m = parse_csv_float(row, "avg_depth_m")
            samples = parse_csv_samples(row)
            fields = build_csv_import_fields(row, required_fields=required_fields)
        except ValueError as exc:
            rows.append(invalid_import_validation_row(row_number=row_number, error=exc))
            continue

        archived_row = {key: clean_csv_value(row, key) for key in (reader.fieldnames or [])}
        raw_source = json.dumps(
            {"source": "csv", "row_number": row_number, "row": archived_row},
            sort_keys=True,
            separators=(",", ":"),
        )
        raw_data_b64 = base64.b64encode(raw_source.encode("utf-8")).decode("ascii")
        raw_sha256 = hashlib.sha256(raw_source.encode("utf-8")).hexdigest()
        dive_uid = clean_csv_value(row, "dive_uid") or f"csv-{raw_sha256[:24]}"

        payload = {
            "vendor": clean_csv_value(row, "vendor") or "CSV",
            "product": clean_csv_value(row, "product") or "Import",
            "fingerprint_hex": clean_csv_value(row, "fingerprint_hex") or None,
            "dive_uid": dive_uid,
            "started_at": started_at,
            "duration_seconds": duration_seconds,
            "max_depth_m": max_depth_m,
            "avg_depth_m": avg_depth_m,
            "fields": fields,
            "raw_sha256": raw_sha256,
            "raw_data_b64": raw_data_b64,
            "samples": samples,
            "imported_at": clean_csv_value(row, "imported_at") or now_iso(),
        }
        payloads.append(payload)
        rows.append(import_validation_row_from_payload(payload, row_number=row_number))

    if not payloads and not rows:
        raise ValueError("CSV import does not contain any dive rows")
    return {"payloads": payloads, "rows": rows}


def csv_import_payloads(csv_text: str, *, required_fields: object = None) -> list[dict]:
    preview = csv_import_preview(csv_text, required_fields=required_fields)
    invalid_row = next((row for row in preview["rows"] if not row.get("valid")), None)
    if invalid_row:
        row_number = invalid_row.get("row_number")
        error = (invalid_row.get("errors") or ["Invalid row"])[0]
        raise ValueError(f"CSV row {row_number}: {error}")
    payloads = preview["payloads"]
    if not payloads:
        raise ValueError("CSV import does not contain any dive rows")
    return payloads


def local_xml_name(element) -> str:
    tag = getattr(element, "tag", "")
    if not isinstance(tag, str):
        return ""
    return tag.rsplit("}", 1)[-1].lower()


def child_text(element, *names: str) -> str:
    wanted = {name.lower() for name in names}
    for child in list(element):
        if local_xml_name(child) in wanted:
            return "".join(child.itertext()).strip()
    return ""


def first_child(element, *names: str):
    wanted = {name.lower() for name in names}
    for child in list(element):
        if local_xml_name(child) in wanted:
            return child
    return None


def parse_subsurface_number(value: object) -> float | None:
    if value is None:
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", str(value))
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def parse_subsurface_depth_m(value: object) -> float | None:
    number = parse_subsurface_number(value)
    if number is None:
        return None
    text = str(value).lower()
    if "ft" in text or "feet" in text:
        return round(number * 0.3048, 3)
    return number


def parse_subsurface_pressure_bar(value: object) -> int | None:
    number = parse_subsurface_number(value)
    if number is None:
        return None
    text = str(value).lower()
    if "psi" in text:
        number = number * 0.0689476
    return int(round(number))


def parse_subsurface_temperature_c(value: object) -> float | None:
    number = parse_subsurface_number(value)
    if number is None:
        return None
    text = str(value).lower()
    if "f" in text and "c" not in text:
        number = (number - 32) * 5 / 9
    return round(number, 2)


def parse_subsurface_duration_seconds(value: object) -> int | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    if not text:
        return None
    match = re.search(r"(\d+):(\d+)(?::(\d+))?", text)
    if match:
        first = int(match.group(1))
        second = int(match.group(2))
        third = int(match.group(3) or 0)
        if match.group(3) is not None:
            return first * 3600 + second * 60 + third
        return first * 60 + second
    number = parse_subsurface_number(text)
    if number is None:
        return None
    if "hour" in text or re.search(r"\bh\b", text):
        return int(round(number * 3600))
    if "sec" in text:
        return int(round(number))
    return int(round(number * 60))


def parse_subsurface_started_at(dive_element) -> str:
    date_value = (dive_element.get("date") or child_text(dive_element, "date")).strip()
    time_value = (dive_element.get("time") or child_text(dive_element, "time")).strip()
    if not date_value:
        raise ValueError("missing dive date")
    if not time_value:
        return date_value
    time_value = time_value.replace("Z", "")
    if re.match(r"^\d{2}:\d{2}$", time_value):
        time_value = f"{time_value}:00"
    return f"{date_value}T{time_value}"


def parse_subsurface_gps(value: object) -> dict | None:
    text = str(value or "").strip()
    if not text:
        return None
    numbers = re.findall(r"-?\d+(?:\.\d+)?", text)
    if len(numbers) < 2:
        return None
    lat = float(numbers[0])
    lon = float(numbers[1])
    if -90 <= lat <= 90 and -180 <= lon <= 180:
        return {"lat": lat, "lon": lon}
    return None


def read_limited_stream(stream, *, max_bytes: int, label: str) -> bytes:
    output = BytesIO()
    remaining = max(max_bytes, 0)
    while True:
        chunk_size = min(1024 * 1024, remaining + 1)
        chunk = stream.read(chunk_size)
        if not chunk:
            break
        output.write(chunk)
        remaining -= len(chunk)
        if remaining < 0:
            raise ValueError(f"{label} exceeds {max_bytes} byte uncompressed limit")
    return output.getvalue()


def decompress_gzip_limited(source: bytes, *, max_bytes: int, label: str) -> bytes:
    try:
        with gzip.GzipFile(fileobj=BytesIO(source)) as stream:
            return read_limited_stream(stream, max_bytes=max_bytes, label=label)
    except (OSError, EOFError) as exc:
        raise ValueError(f"{label} must be a valid gzip file") from exc


def read_zip_member_limited(archive: zipfile.ZipFile, member: str, *, max_bytes: int, label: str) -> bytes:
    try:
        with archive.open(member, "r") as stream:
            return read_limited_stream(stream, max_bytes=max_bytes, label=label)
    except zipfile.BadZipFile as exc:
        raise ValueError(f"{label} must be a valid ZIP entry") from exc


def decode_subsurface_export(body: bytes, *, max_uncompressed_bytes: int) -> str:
    source = body or b""
    if source.startswith(b"\xef\xbb\xbf"):
        source = source[3:]
    if source.startswith(b"\x1f\x8b"):
        source = decompress_gzip_limited(source, max_bytes=max_uncompressed_bytes, label="Subsurface export")
    elif zipfile.is_zipfile(BytesIO(source)):
        with zipfile.ZipFile(BytesIO(source), "r") as archive:
            names = [name for name in archive.namelist() if name.lower().endswith((".xml", ".ssrf"))]
            if not names:
                raise ValueError("Subsurface archive does not contain an XML export")
            source = read_zip_member_limited(
                archive,
                names[0],
                max_bytes=max_uncompressed_bytes,
                label="Subsurface archive XML export",
            )
    elif len(source) > max_uncompressed_bytes:
        raise ValueError(f"Subsurface export exceeds {max_uncompressed_bytes} byte uncompressed limit")
    try:
        return source.decode("utf-8-sig")
    except UnicodeDecodeError:
        return source.decode("latin-1")


def parse_subsurface_sites(root) -> dict[str, dict]:
    sites: dict[str, dict] = {}
    for element in root.iter():
        if local_xml_name(element) not in {"site", "dive_site", "divesite"}:
            continue
        site_id = element.get("uuid") or element.get("id") or element.get("name") or ""
        name = element.get("name") or child_text(element, "name") or "".join(element.itertext()).strip()
        gps = parse_subsurface_gps(element.get("gps") or element.get("location"))
        if site_id:
            sites[site_id] = {"name": name, "gps": gps}
    return sites


def parse_subsurface_location(dive_element, site_lookup: dict[str, dict]) -> tuple[str, dict | None]:
    location_element = first_child(dive_element, "location", "site", "divesite")
    if location_element is not None:
        site_ref = location_element.get("uuid") or location_element.get("ref") or location_element.get("site") or ""
        matched_site = site_lookup.get(site_ref, {})
        name = "".join(location_element.itertext()).strip() or location_element.get("name") or matched_site.get("name") or ""
        gps = parse_subsurface_gps(location_element.get("gps") or location_element.get("location")) or matched_site.get("gps")
        return name, gps
    site_ref = dive_element.get("divesiteid") or dive_element.get("siteid") or dive_element.get("site") or ""
    matched_site = site_lookup.get(site_ref, {})
    return matched_site.get("name") or "", matched_site.get("gps")


def parse_subsurface_samples(divecomputer) -> list[dict]:
    samples: list[dict] = []
    for sample_element in list(divecomputer):
        if local_xml_name(sample_element) != "sample":
            continue
        sample: dict = {}
        time_seconds = parse_subsurface_duration_seconds(sample_element.get("time"))
        depth_m = parse_subsurface_depth_m(sample_element.get("depth"))
        temperature_c = parse_subsurface_temperature_c(sample_element.get("temp") or sample_element.get("temperature"))
        pressure_bar = parse_subsurface_pressure_bar(sample_element.get("pressure") or sample_element.get("tankpressure"))
        if time_seconds is not None:
            sample["time_seconds"] = time_seconds
        if depth_m is not None:
            sample["depth_m"] = depth_m
        if temperature_c is not None:
            sample["temperature_c"] = temperature_c
        if pressure_bar is not None:
            sample["tank_pressure_bar"] = pressure_bar
        if sample:
            samples.append(sample)
    return samples


def build_subsurface_fields(dive_element, divecomputer, *, site: str, gps: dict | None, required_fields: object = None) -> dict:
    logbook = {
        "site": site,
        "buddy": child_text(dive_element, "buddy"),
        "guide": child_text(dive_element, "divemaster", "guide"),
        "weather_description": child_text(dive_element, "weather"),
        "visibility": dive_element.get("visibility") or child_text(dive_element, "visibility"),
        "wetsuit_description": child_text(dive_element, "suit"),
        "notes": child_text(dive_element, "notes"),
    }
    complete_logbook_if_ready(logbook, required_fields=required_fields)
    fields: dict = {"source": "subsurface", "subsurface_import": True, "logbook": logbook}
    if gps:
        fields["location"] = gps
    temperature_element = first_child(divecomputer, "temperature") if divecomputer is not None else None
    if temperature_element is not None:
        water = parse_subsurface_temperature_c(temperature_element.get("water"))
        air = parse_subsurface_temperature_c(temperature_element.get("air"))
        if water is not None:
            fields["temperature_minimum_c"] = water
            fields["temperature_surface_c"] = air if air is not None else water
    cylinder = first_child(dive_element, "cylinder")
    if cylinder is not None:
        tank: dict = {}
        size = parse_subsurface_number(cylinder.get("size"))
        start = parse_subsurface_pressure_bar(cylinder.get("start"))
        end = parse_subsurface_pressure_bar(cylinder.get("end"))
        o2 = parse_subsurface_number(cylinder.get("o2") or cylinder.get("oxygen"))
        he = parse_subsurface_number(cylinder.get("he") or cylinder.get("helium"))
        if size is not None:
            tank["volume"] = size
        if start is not None:
            tank["beginpressure_bar"] = start
        if end is not None:
            tank["endpressure_bar"] = end
        if o2 is not None:
            tank["o2_percent"] = o2
            fields["gasmixes"] = [{"oxygen_fraction": o2 / 100 if o2 > 1 else o2}]
        if he is not None:
            tank["he_percent"] = he
        if tank:
            fields["tanks"] = [tank]
    return fields


def subsurface_import_preview(export_text: str, *, required_fields: object = None) -> dict:
    if not export_text.strip():
        raise ValueError("Subsurface import file is empty")
    try:
        root = ElementTree.fromstring(export_text)
    except ElementTree.ParseError as exc:
        raise ValueError("Subsurface import must be a valid XML export") from exc

    site_lookup = parse_subsurface_sites(root)
    dive_elements = [element for element in root.iter() if local_xml_name(element) == "dive"]
    payloads: list[dict] = []
    rows: list[dict] = []
    for index, dive_element in enumerate(dive_elements, start=1):
        dive_number = dive_element.get("number") or str(index)
        try:
            started_at = parse_subsurface_started_at(dive_element)
            divecomputer = first_child(dive_element, "divecomputer")
            depth_element = first_child(divecomputer, "depth") if divecomputer is not None else None
            max_depth_source = depth_element.get("max") if depth_element is not None else dive_element.get("maxdepth")
            max_depth_m = parse_subsurface_depth_m(max_depth_source)
            avg_depth_m = parse_subsurface_depth_m(depth_element.get("mean")) if depth_element is not None else None
            duration_seconds = parse_subsurface_duration_seconds(dive_element.get("duration") or child_text(dive_element, "duration"))
            if duration_seconds is None:
                raise ValueError("missing duration")
            if max_depth_m is None:
                sample_depths = [sample.get("depth_m") for sample in parse_subsurface_samples(divecomputer) if isinstance(sample.get("depth_m"), (int, float))] if divecomputer is not None else []
                max_depth_m = max(sample_depths) if sample_depths else None
            if max_depth_m is None:
                raise ValueError("missing max depth")
            site, gps = parse_subsurface_location(dive_element, site_lookup)
            samples = parse_subsurface_samples(divecomputer) if divecomputer is not None else []
            fields = build_subsurface_fields(dive_element, divecomputer, site=site, gps=gps, required_fields=required_fields)
        except ValueError as exc:
            rows.append(invalid_import_validation_row(row_number=index, source_id=dive_number, error=exc))
            continue

        source_payload = ElementTree.tostring(dive_element, encoding="unicode")
        raw_data_b64 = base64.b64encode(source_payload.encode("utf-8")).decode("ascii")
        raw_sha256 = hashlib.sha256(source_payload.encode("utf-8")).hexdigest()
        dive_uid = f"subsurface-{raw_sha256[:24]}"
        model = divecomputer.get("model") if divecomputer is not None else ""

        payload = {
            "vendor": "Subsurface",
            "product": model or "Export",
            "dive_uid": dive_uid,
            "started_at": started_at,
            "duration_seconds": duration_seconds,
            "max_depth_m": max_depth_m,
            "avg_depth_m": avg_depth_m,
            "fields": fields,
            "raw_sha256": raw_sha256,
            "raw_data_b64": raw_data_b64,
            "samples": samples,
            "imported_at": now_iso(),
            "subsurface_number": dive_number,
        }
        payloads.append(payload)
        rows.append(import_validation_row_from_payload(payload, row_number=index, source_id=dive_number))

    if not payloads and not rows:
        raise ValueError("Subsurface import does not contain any dives")
    return {"payloads": payloads, "rows": rows}


def subsurface_import_payloads(export_text: str, *, required_fields: object = None) -> list[dict]:
    preview = subsurface_import_preview(export_text, required_fields=required_fields)
    invalid_row = next((row for row in preview["rows"] if not row.get("valid")), None)
    if invalid_row:
        row_number = invalid_row.get("row_number")
        error = (invalid_row.get("errors") or ["Invalid dive"])[0]
        raise ValueError(f"Subsurface dive {row_number}: {error}")
    payloads = preview["payloads"]
    if not payloads:
        raise ValueError("Subsurface import does not contain any dives")
    return payloads


def mark_import_preview_duplicates(rows: list[dict], existing_dive_uids: set[str] | None = None) -> list[dict]:
    existing = existing_dive_uids or set()
    seen: set[str] = set()
    marked_rows: list[dict] = []
    for row in rows:
        next_row = dict(row)
        if next_row.get("valid"):
            dive_uid = str(next_row.get("dive_uid") or "")
            duplicate = bool(dive_uid and (dive_uid in existing or dive_uid in seen))
            next_row["duplicate"] = duplicate
            next_row["status"] = "duplicate" if duplicate else "ready"
            if dive_uid:
                seen.add(dive_uid)
        marked_rows.append(next_row)
    return marked_rows


def import_validation_summary(rows: list[dict], *, inserted: int | None = None, ids: list[int] | None = None) -> dict:
    invalid_rows = sum(1 for row in rows if not row.get("valid"))
    duplicate_rows = sum(1 for row in rows if row.get("duplicate") or row.get("status") == "duplicate")
    ready_rows = sum(1 for row in rows if row.get("status") == "ready")
    valid_rows = sum(1 for row in rows if row.get("valid"))
    summary = {
        "rows": len(rows),
        "valid_rows": valid_rows,
        "invalid_rows": invalid_rows,
        "ready_rows": ready_rows,
        "duplicates": duplicate_rows,
        "dives": rows,
    }
    if inserted is not None:
        summary["inserted"] = inserted
    if ids is not None:
        summary["ids"] = ids
    return summary


def import_payload_summary(payloads: list[dict]) -> dict:
    return {
        "rows": len(payloads),
        "dives": [
            {
                "dive_uid": payload.get("dive_uid"),
                "started_at": payload.get("started_at"),
                "site": ((payload.get("fields") or {}).get("logbook") or {}).get("site") or "",
                "duration_seconds": payload.get("duration_seconds"),
                "max_depth_m": payload.get("max_depth_m"),
                "sample_count": len(payload.get("samples") or []),
            }
            for payload in payloads[:25]
        ],
    }


def build_pdf_lines(dives: list[dict], *, generated_at: datetime) -> list[dict]:
    lines = [
        {"text": "DiveVault Logbook Export", "font": "F2", "size": 20, "gap": 10},
        {"text": f"Generated {generated_at.strftime('%Y-%m-%d %H:%M UTC')}", "font": "F1", "size": 10, "gap": 4},
        {"text": f"{len(dives)} dives included", "font": "F1", "size": 10, "gap": 12},
    ]
    if not dives:
        lines.append({"text": "No dives available for export.", "font": "F1", "size": 12, "gap": 12})
        return lines

    for index, dive in enumerate(dives, start=1):
        logbook = dive.get("fields", {}).get("logbook") if isinstance(dive.get("fields"), dict) else {}
        logbook = logbook if isinstance(logbook, dict) else {}
        site = logbook.get("site") or "Unassigned site"
        title = f"{index}. {site}"
        started_at = format_export_datetime(dive.get("started_at"))
        status = (logbook.get("status") or "imported").upper()
        lines.append({"text": title, "font": "F2", "size": 12, "gap": 4})
        lines.append({"text": f"{started_at} | Status {status}", "font": "F1", "size": 10, "gap": 4})
        lines.append(
            {
                "text": (
                    f"{dive.get('vendor') or 'Unknown'} {dive.get('product') or ''} | "
                    f"Depth {format_depth_label(dive.get('max_depth_m'))} | "
                    f"Duration {format_duration_label(dive.get('duration_seconds'))} | "
                    f"Samples {dive.get('sample_count') or 0}"
                ),
                "font": "F1",
                "size": 10,
                "gap": 4,
            }
        )
        lines.append(
            {
                "text": f"Buddy {logbook.get('buddy') or '-'} | Guide {logbook.get('guide') or '-'}",
                "font": "F1",
                "size": 10,
                "gap": 4,
            }
        )
        optional_details = [
            ("Weather", logbook.get("weather_description")),
            ("Visibility", logbook.get("visibility")),
            ("Wetsuit", logbook.get("wetsuit_description")),
            ("Weights", logbook.get("weight_description")),
        ]
        detail_text = " | ".join(
            f"{label} {value.strip()}"
            for label, value in optional_details
            if isinstance(value, str) and value.strip()
        )
        if detail_text:
            for detail_line in wrap_pdf_text(detail_text, width=92)[:2]:
                lines.append({"text": detail_line, "font": "F1", "size": 10, "gap": 4})
        notes = logbook.get("notes")
        if isinstance(notes, str) and notes.strip():
            wrapped_notes = wrap_pdf_text(f"Notes: {notes.strip()}", width=92)[:3]
            for note_line in wrapped_notes:
                lines.append({"text": note_line, "font": "F1", "size": 10, "gap": 4})
        lines.append({"text": "", "font": "F1", "size": 8, "gap": 8})
    return lines


def paginate_pdf_lines(lines: list[dict]) -> list[list[dict]]:
    pages: list[list[dict]] = []
    current_page: list[dict] = []
    y_cursor = PDF_MARGIN_TOP

    for line in lines:
        required = int(line.get("size", 10)) + int(line.get("gap", 4))
        if current_page and y_cursor - required < PDF_MARGIN_BOTTOM:
            pages.append(current_page)
            current_page = []
            y_cursor = PDF_MARGIN_TOP
        current_page.append(line)
        y_cursor -= required

    if current_page:
        pages.append(current_page)
    return pages or [[{"text": "No dives available for export.", "font": "F1", "size": 12, "gap": 12}]]


def build_pdf_stream(page_lines: list[dict]) -> bytes:
    commands: list[str] = []
    y_cursor = PDF_MARGIN_TOP
    for line in page_lines:
        size = int(line.get("size", 10))
        gap = int(line.get("gap", 4))
        text = pdf_text(line.get("text") or " ")
        font = line.get("font") or "F1"
        commands.append(f"BT /{font} {size} Tf 1 0 0 1 {PDF_MARGIN_LEFT} {y_cursor} Tm ({text}) Tj ET")
        y_cursor -= size + gap
    return "\n".join(commands).encode("latin-1", errors="replace")


def build_pdf_document(dives: list[dict]) -> bytes:
    generated_at = now_utc()
    pages = paginate_pdf_lines(build_pdf_lines(dives, generated_at=generated_at))
    objects: list[bytes] = []

    def add_object(body: bytes | str) -> int:
        body_bytes = body.encode("latin-1") if isinstance(body, str) else body
        objects.append(body_bytes)
        return len(objects)

    add_object("<< /Type /Catalog /Pages 2 0 R >>")
    add_object("<< /Type /Pages /Kids [] /Count 0 >>")
    font_regular_id = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    font_bold_id = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")

    page_ids: list[int] = []
    for page_lines in pages:
        stream = build_pdf_stream(page_lines)
        stream_id = add_object(b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream))
        page_id = add_object(
            (
                f"<< /Type /Page /Parent 2 0 R "
                f"/MediaBox [0 0 {PDF_PAGE_WIDTH} {PDF_PAGE_HEIGHT}] "
                f"/Resources << /Font << /F1 {font_regular_id} 0 R /F2 {font_bold_id} 0 R >> >> "
                f"/Contents {stream_id} 0 R >>"
            ).encode("latin-1")
        )
        page_ids.append(page_id)

    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode("latin-1")

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for index, body in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode("latin-1"))
        output.extend(body)
        output.extend(b"\nendobj\n")

    xref_start = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))
    output.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_start}\n%%EOF\n"
        ).encode("latin-1")
    )
    return bytes(output)


def profile_license_documents(conn, user_id: str, profile: dict) -> list[dict]:
    documents: list[dict] = []
    for license_entry in profile.get("licenses") or []:
        if not isinstance(license_entry, dict) or not license_entry.get("pdf"):
            continue
        license_id = license_entry.get("id")
        if not isinstance(license_id, str) or not license_id:
            continue
        license_pdf = get_user_profile_license_pdf(conn, user_id, license_id)
        if not license_pdf:
            continue
        documents.append(
            {
                "license_id": license_id,
                "filename": license_pdf["filename"],
                "content_type": license_pdf["content_type"],
                "uploaded_at": license_pdf.get("uploaded_at"),
                "data_b64": base64.b64encode(license_pdf["data"]).decode("ascii"),
            }
        )
    return documents


def build_backup_payload(conn, user_id: str) -> dict:
    profile = get_user_profile(conn, user_id)
    return {
        "version": BACKUP_EXPORT_VERSION,
        "app": "DiveVault",
        "exported_at": now_utc().isoformat(),
        "source_user_id": user_id,
        "profile": profile,
        "equipment": list_user_equipment(conn, user_id),
        "license_documents": profile_license_documents(conn, user_id, profile),
        "device_states": list_device_states(conn, user_id),
        "dives": list_all_dives(conn, user_id, include_samples=True, include_raw_data=True),
    }


def backup_archive_license_path(license_id: str, filename: str, used_paths: set[str]) -> str:
    safe_license_id = re.sub(r"[^A-Za-z0-9_-]+", "-", license_id).strip("-") or "license"
    safe_filename = sanitize_profile_license_filename(filename)
    base_path = f"licenses/{safe_license_id}/{safe_filename}"
    path = base_path
    suffix = 2
    while path in used_paths:
        stem = Path(safe_filename).stem or "license"
        extension = Path(safe_filename).suffix or ".pdf"
        path = f"licenses/{safe_license_id}/{stem}-{suffix}{extension}"
        suffix += 1
    used_paths.add(path)
    return path


def build_backup_archive(payload: dict) -> bytes:
    manifest = dict(payload)
    license_documents: list[dict] = []
    files: list[tuple[str, bytes]] = []
    used_paths: set[str] = set()

    for entry in payload.get("license_documents") or []:
        if not isinstance(entry, dict):
            continue
        data_b64 = entry.get("data_b64")
        if not isinstance(data_b64, str) or not data_b64:
            continue
        try:
            pdf_bytes = base64.b64decode(data_b64, validate=True)
        except (ValueError, binascii.Error):
            continue
        license_id = str(entry.get("license_id") or "").strip()
        if not license_id:
            continue
        file_path = backup_archive_license_path(license_id, entry.get("filename") or "license.pdf", used_paths)
        document = {key: value for key, value in entry.items() if key != "data_b64"}
        document["file_path"] = file_path
        license_documents.append(document)
        files.append((file_path, pdf_bytes))

    manifest["license_documents"] = license_documents

    output = BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            BACKUP_MANIFEST_FILENAME,
            json.dumps(manifest, indent=2, sort_keys=True).encode("utf-8"),
        )
        for file_path, pdf_bytes in files:
            archive.writestr(file_path, pdf_bytes)
    return output.getvalue()


def is_safe_backup_member_path(path: str) -> bool:
    if not isinstance(path, str) or not path or path.startswith(("/", "\\")):
        return False
    normalized = Path(path)
    return not normalized.is_absolute() and ".." not in normalized.parts


def parse_backup_archive(archive_bytes: bytes, *, max_uncompressed_bytes: int) -> dict:
    try:
        with zipfile.ZipFile(BytesIO(archive_bytes), "r") as archive:
            infos = archive.infolist()
            if sum(info.file_size for info in infos) > max_uncompressed_bytes:
                raise ValueError(f"Backup archive exceeds {max_uncompressed_bytes} byte uncompressed limit")
            names = {info.filename for info in infos}
            if BACKUP_MANIFEST_FILENAME not in names:
                raise ValueError(f"Backup archive is missing {BACKUP_MANIFEST_FILENAME}")
            for name in names:
                if not is_safe_backup_member_path(name):
                    raise ValueError(f"Backup archive contains unsafe path {name!r}")
            try:
                remaining_uncompressed_bytes = max_uncompressed_bytes
                manifest_bytes = read_zip_member_limited(
                    archive,
                    BACKUP_MANIFEST_FILENAME,
                    max_bytes=remaining_uncompressed_bytes,
                    label=f"Backup archive {BACKUP_MANIFEST_FILENAME}",
                )
                remaining_uncompressed_bytes -= len(manifest_bytes)
                manifest = json.loads(manifest_bytes.decode("utf-8"))
            except json.JSONDecodeError as exc:
                raise ValueError(f"Backup archive {BACKUP_MANIFEST_FILENAME} is invalid JSON") from exc
            if not isinstance(manifest, dict):
                raise ValueError(f"Backup archive {BACKUP_MANIFEST_FILENAME} must contain a JSON object")

            license_documents: list[dict] = []
            for index, entry in enumerate(manifest.get("license_documents") or [], start=1):
                if not isinstance(entry, dict):
                    raise ValueError(f"Backup license document #{index} must be an object")
                if entry.get("data_b64"):
                    license_documents.append(entry)
                    continue
                file_path = entry.get("file_path")
                if not is_safe_backup_member_path(file_path) or file_path not in names:
                    raise ValueError(f"Backup license document #{index} references a missing file")
                document = {key: value for key, value in entry.items() if key != "file_path"}
                document_bytes = read_zip_member_limited(
                    archive,
                    file_path,
                    max_bytes=remaining_uncompressed_bytes,
                    label=f"Backup archive {file_path}",
                )
                remaining_uncompressed_bytes -= len(document_bytes)
                document["data_b64"] = base64.b64encode(document_bytes).decode("ascii")
                license_documents.append(document)
            manifest["license_documents"] = license_documents
            return manifest
    except zipfile.BadZipFile as exc:
        raise ValueError("Backup file must be a valid ZIP archive") from exc


def parse_backup_payload(payload: dict | None) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Backup import requires a JSON object")

    version = payload.get("version")
    if version != BACKUP_EXPORT_VERSION:
        raise ValueError(f"Unsupported backup version: {version!r}")

    profile = payload.get("profile") or {}
    if not isinstance(profile, dict):
        raise ValueError("Backup profile must be an object")

    device_states = payload.get("device_states") or []
    if not isinstance(device_states, list):
        raise ValueError("Backup device_states must be an array")

    equipment = payload.get("equipment") or []
    if not isinstance(equipment, list):
        raise ValueError("Backup equipment must be an array")

    normalized_device_states: list[dict] = []
    for index, entry in enumerate(device_states, start=1):
        if not isinstance(entry, dict):
            raise ValueError(f"Backup device state #{index} must be an object")
        vendor = str(entry.get("vendor") or "").strip()
        product = str(entry.get("product") or "").strip()
        if not vendor or not product:
            raise ValueError(f"Backup device state #{index} is missing vendor or product")
        normalized_device_states.append(
            {
                "vendor": vendor,
                "product": product,
                "fingerprint_hex": entry.get("fingerprint_hex"),
            }
        )

    dives = payload.get("dives") or []
    if not isinstance(dives, list):
        raise ValueError("Backup dives must be an array")

    normalized_dives: list[dict] = []
    for index, entry in enumerate(dives, start=1):
        if not isinstance(entry, dict):
            raise ValueError(f"Backup dive #{index} must be an object")
        missing = [key for key in ("vendor", "product", "dive_uid", "raw_sha256", "raw_data_b64") if not entry.get(key)]
        if missing:
            raise ValueError(f"Backup dive #{index} is missing required fields: {', '.join(missing)}")
        try:
            base64.b64decode(entry["raw_data_b64"], validate=True)
        except (ValueError, binascii.Error) as exc:
            raise ValueError(f"Backup dive #{index} has invalid raw_data_b64") from exc
        samples = entry.get("samples") if isinstance(entry.get("samples"), list) else []
        fields = entry.get("fields") if isinstance(entry.get("fields"), dict) else {}
        normalized_dives.append(
            {
                "vendor": entry["vendor"],
                "product": entry["product"],
                "fingerprint_hex": entry.get("fingerprint_hex"),
                "dive_uid": entry["dive_uid"],
                "started_at": entry.get("started_at"),
                "duration_ms": entry.get("duration_ms"),
                "duration_seconds": entry.get("duration_seconds"),
                "max_depth_m": entry.get("max_depth_m"),
                "avg_depth_m": entry.get("avg_depth_m"),
                "fields": fields,
                "raw_sha256": entry["raw_sha256"],
                "raw_data_b64": entry["raw_data_b64"],
                "samples": samples,
                "imported_at": entry.get("imported_at"),
            }
        )

    license_documents = payload.get("license_documents") or []
    if not isinstance(license_documents, list):
        raise ValueError("Backup license_documents must be an array")

    allowed_license_ids = {
        str(license.get("id")).strip()
        for license in profile.get("licenses") or []
        if isinstance(license, dict) and str(license.get("id") or "").strip()
    }
    normalized_license_documents: list[dict] = []
    for index, entry in enumerate(license_documents, start=1):
        if not isinstance(entry, dict):
            raise ValueError(f"Backup license document #{index} must be an object")
        license_id = str(entry.get("license_id") or "").strip()
        if not license_id:
            raise ValueError(f"Backup license document #{index} is missing license_id")
        if allowed_license_ids and license_id not in allowed_license_ids:
            raise ValueError(f"Backup license document #{index} references unknown license_id {license_id}")
        data_b64 = entry.get("data_b64")
        if not isinstance(data_b64, str) or not data_b64.strip():
            raise ValueError(f"Backup license document #{index} is missing data_b64")
        try:
            pdf_bytes = base64.b64decode(data_b64, validate=True)
        except (ValueError, binascii.Error) as exc:
            raise ValueError(f"Backup license document #{index} has invalid data_b64") from exc
        normalized_license_documents.append(
            {
                "license_id": license_id,
                "filename": sanitize_profile_license_filename(entry.get("filename")),
                "content_type": (entry.get("content_type") or "application/pdf").strip().lower(),
                "pdf_bytes": pdf_bytes,
            }
        )

    return {
        "profile": {
            "name": profile.get("name"),
            "email": profile.get("email"),
            "licenses": profile.get("licenses"),
            "dive_sites": profile.get("dive_sites"),
            "buddies": profile.get("buddies"),
            "guides": profile.get("guides"),
        },
        "equipment": equipment,
        "device_states": normalized_device_states,
        "dives": normalized_dives,
        "license_documents": normalized_license_documents,
    }


def import_backup_payload(conn, user_id: str, payload: dict | None) -> dict:
    normalized = parse_backup_payload(payload)
    profile = save_user_profile(conn, user_id, normalized["profile"])
    save_user_equipment(conn, user_id, normalized["equipment"])

    licenses_imported = 0
    for license_document in normalized["license_documents"]:
        if license_document["content_type"] != "application/pdf":
            raise ValueError(f"License {license_document['license_id']} must use content_type application/pdf")
        updated_profile = save_user_profile_license_pdf(
            conn,
            user_id,
            license_id=license_document["license_id"],
            filename=license_document["filename"],
            content_type=license_document["content_type"],
            pdf_bytes=license_document["pdf_bytes"],
        )
        if updated_profile is None:
            raise ValueError(f"License {license_document['license_id']} does not exist in the imported profile")
        profile = updated_profile
        licenses_imported += 1

    for device_state in normalized["device_states"]:
        save_device_state(
            conn,
            user_id,
            device_state["vendor"],
            device_state["product"],
            device_state.get("fingerprint_hex"),
        )

    dives_inserted = 0
    for dive in normalized["dives"]:
        if insert_dive_record(conn, user_id, dive):
            dives_inserted += 1

    return {
        "profile": profile,
        "summary": {
            "dives_in_backup": len(normalized["dives"]),
            "dives_inserted": dives_inserted,
            "device_states_imported": len(normalized["device_states"]),
            "license_documents_imported": licenses_imported,
        },
    }


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
            kwargs={"autocommit": True},
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
