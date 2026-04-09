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
import json
import logging
import mimetypes
import os
import re
import secrets
import signal
import threading
import time
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import StringIO
from pathlib import Path
from urllib import error as urlerror
from urllib import request as urlrequest
from urllib.parse import parse_qs, urlencode, urlparse

import jwt
import psycopg
from dotenv import load_dotenv
from jwt import InvalidTokenError, PyJWKClient

from divevault.postgres_store import (
    approve_cli_sync_request,
    create_cli_sync_request,
    delete_dive,
    get_device_state,
    get_db_schema_version,
    get_cli_sync_request_status,
    get_dive,
    get_dive_id_by_uid,
    get_public_profile_dives,
    get_user_profile,
    get_user_profile_license_pdf,
    is_logbook_complete,
    insert_dive_record,
    list_all_dives,
    list_device_states,
    list_dives,
    open_db,
    save_user_profile,
    save_user_profile_license_pdf,
    save_device_state,
    summarize_dives,
    update_dive_logbook,
    verify_cli_sync_token,
)


LOGGER = logging.getLogger("dive_backend")
BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
MAX_PROFILE_LICENSE_BYTES = 10 * 1024 * 1024

load_dotenv(REPO_ROOT / ".env")


class ClerkAuthError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


class FixedWindowRateLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._windows: dict[str, dict[str, int]] = {}

    def allow(self, key: str, *, limit: int, window_seconds: int, now: int | None = None) -> tuple[bool, int]:
        if limit <= 0:
            return True, 0
        now_ts = int(now if now is not None else time.time())
        window = max(int(window_seconds), 1)
        current_window_start = now_ts - (now_ts % window)
        expires_at = current_window_start + window
        with self._lock:
            stale_keys = [
                existing_key
                for existing_key, existing_entry in self._windows.items()
                if int(existing_entry.get("expires_at", 0)) <= now_ts
            ]
            for stale_key in stale_keys:
                self._windows.pop(stale_key, None)

            entry = self._windows.get(key)
            if entry is None or entry["window_start"] != current_window_start:
                entry = {"window_start": current_window_start, "expires_at": expires_at, "count": 0}
                self._windows[key] = entry
            if entry["count"] >= limit:
                return False, max(expires_at - now_ts, 1)
            entry["count"] += 1
            entry["expires_at"] = expires_at
            return True, max(expires_at - now_ts, 1)


def normalize_pem_env(value: str | None) -> str | None:
    if not value:
        return None
    return value.strip().replace("\\n", "\n")


def normalize_bearer_token(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip()
    if len(normalized) >= 2 and normalized[0] == normalized[-1] and normalized[0] in {'"', "'"}:
        normalized = normalized[1:-1].strip()
    if normalized.lower().startswith("bearer "):
        normalized = normalized.split(" ", 1)[1].strip()
    return normalized or None


class ClerkTokenVerifier:
    def __init__(
        self,
        *,
        secret_key: str | None,
        jwt_key: str | None,
        jwks_url: str | None,
        api_url: str | None,
        issuer: str | None,
        audience: str | None,
        authorized_parties: set[str],
        required_api_key_scopes: set[str],
        sync_token_manager=None,
    ) -> None:
        self.secret_key = secret_key.strip() if secret_key else None
        self.jwt_key = normalize_pem_env(jwt_key)
        self.jwks_url = jwks_url.strip() if jwks_url else None
        self.api_url = (api_url or "https://api.clerk.com").rstrip("/")
        self.issuer = issuer.rstrip("/") if issuer else None
        self.audience = audience.strip() if audience else None
        self.authorized_parties = authorized_parties
        self.required_api_key_scopes = required_api_key_scopes
        self.sync_token_manager = sync_token_manager
        self.jwks_client = PyJWKClient(self.jwks_url) if self.jwks_url and not self.jwt_key else None

    @property
    def configured(self) -> bool:
        return bool(self.secret_key or self.jwt_key or self.jwks_client)

    def verify_request(self, headers) -> dict:
        token = normalize_bearer_token(self._extract_token(headers))
        if not token:
            raise ClerkAuthError(401, "Missing Clerk bearer token")

        if token.startswith("dvsync_"):
            return self._verify_sync_token(token)
        if token.startswith("ak_"):
            return self._verify_api_key(token)
        if token.startswith("sk_"):
            raise ClerkAuthError(401, "Received CLERK_SECRET_KEY instead of a Clerk API key secret. Use a user or organization API key that starts with ak_.")
        if token.startswith("pk_"):
            raise ClerkAuthError(401, "Received Clerk publishable key instead of an API credential. Use a Clerk API key secret that starts with ak_.")

        return self._verify_session_token(token)

    def _verify_session_token(self, token: str) -> dict:
        if not self.jwt_key and not self.jwks_client:
            raise ClerkAuthError(503, "Clerk session token verification is not configured on the backend")

        signing_key = self.jwt_key
        if not signing_key and self.jwks_client:
            try:
                signing_key = self.jwks_client.get_signing_key_from_jwt(token).key
            except Exception as exc:  # pragma: no cover - network/JWKS failures are runtime-dependent
                raise ClerkAuthError(503, f"Unable to resolve Clerk signing key: {exc}") from exc

        if not signing_key:
            raise ClerkAuthError(503, "Clerk authentication is not configured on the backend")

        decode_kwargs = {
            "algorithms": ["RS256"],
            "issuer": self.issuer,
            "options": {
                "verify_aud": bool(self.audience),
                "verify_iss": bool(self.issuer),
            },
            "leeway": 5,
        }
        if self.audience:
            decode_kwargs["audience"] = self.audience

        try:
            claims = jwt.decode(token, signing_key, **decode_kwargs)
        except InvalidTokenError as exc:
            raise ClerkAuthError(401, f"Invalid Clerk session token: {exc}") from exc

        if self.authorized_parties:
            authorized_party = claims.get("azp")
            if authorized_party not in self.authorized_parties:
                raise ClerkAuthError(401, "Clerk session token origin is not allowed")

        claims.setdefault("token_type", "session_token")
        return claims

    def _verify_sync_token(self, token: str) -> dict:
        if self.sync_token_manager is None:
            raise ClerkAuthError(503, "Desktop sync login is not configured on the backend")

        claims = self.sync_token_manager.verify_token(token)
        if claims is None:
            raise ClerkAuthError(401, "Desktop sync token is invalid or expired")
        return claims

    def _verify_api_key(self, token: str) -> dict:
        if not self.secret_key:
            raise ClerkAuthError(503, "Clerk API key verification requires CLERK_SECRET_KEY on the backend")

        req = urlrequest.Request(
            f"{self.api_url}/v1/api_keys/verify",
            data=json.dumps({"secret": token}).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.secret_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )

        try:
            with urlrequest.urlopen(req, timeout=15) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urlerror.HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")
            if exc.code == 403 and ("Cloudflare" in details or "Error 1010" in details or "Access denied" in details):
                raise ClerkAuthError(
                    503,
                    "Clerk API key verification is blocked by Cloudflare from this network. The backend cannot validate API keys from the current IP.",
                ) from exc
            if exc.code >= 500:
                raise ClerkAuthError(503, f"Clerk API key verification failed: {details}") from exc
            raise ClerkAuthError(401, "Invalid Clerk API key") from exc
        except (urlerror.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise ClerkAuthError(503, f"Unable to verify Clerk API key: {exc}") from exc

        api_key_scopes = set(payload.get("scopes") or [])
        if self.required_api_key_scopes and not self.required_api_key_scopes.issubset(api_key_scopes):
            raise ClerkAuthError(403, "Clerk API key is missing required scopes")

        payload.setdefault("token_type", "api_key")
        return payload

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


def parse_csv_env(value: str | None) -> set[str]:
    if not value:
        return set()
    return {item.strip() for item in value.split(",") if item.strip()}


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


def build_clerk_verifier(args: argparse.Namespace, *, sync_token_manager: CliSyncTokenManager | None) -> ClerkTokenVerifier | None:
    frontend_api_url = args.clerk_frontend_api_url.rstrip("/") if args.clerk_frontend_api_url else None
    jwks_url = args.clerk_jwks_url or (f"{frontend_api_url}/.well-known/jwks.json" if frontend_api_url else None)
    issuer = args.clerk_issuer or frontend_api_url
    verifier = ClerkTokenVerifier(
        secret_key=args.clerk_secret_key,
        jwt_key=args.clerk_jwt_key,
        jwks_url=jwks_url,
        api_url=args.clerk_api_url,
        issuer=issuer,
        audience=args.clerk_audience,
        authorized_parties=parse_csv_env(args.clerk_authorized_parties),
        required_api_key_scopes=parse_csv_env(args.clerk_api_key_scopes),
        sync_token_manager=sync_token_manager,
    )
    if verifier.configured:
        return verifier

    LOGGER.warning(
        "Clerk authentication is not configured. Set CLERK_SECRET_KEY for API keys and CLERK_JWT_KEY or CLERK_JWKS_URL (or CLERK_FRONTEND_API_URL) for session tokens."
    )
    return None


def resolve_repo_path(path_value: str | Path) -> Path:
    candidate = Path(path_value)
    if not candidate.is_absolute():
        candidate = REPO_ROOT / candidate
    return candidate.resolve()


def resolve_frontend_dir(frontend_dir: str | Path) -> Path:
    resolved = resolve_repo_path(frontend_dir)
    if resolved.exists():
        return resolved

    legacy_dir = resolved.parent if resolved.name == "dist" else None
    if legacy_dir and (legacy_dir / "index.html").is_file():
        LOGGER.warning(
            "Configured frontend_dir=%s is missing; falling back to legacy frontend assets at %s",
            resolved,
            legacy_dir,
        )
        return legacy_dir

    return resolved


def frontend_asset_path(frontend_dir: Path, request_path: str) -> Path:
    relative = request_path.lstrip("/") or "index.html"
    candidate = (frontend_dir / relative).resolve()
    frontend_root = frontend_dir.resolve()
    if frontend_root not in candidate.parents and candidate != frontend_root:
        return frontend_root / "index.html"
    if candidate.is_file():
        return candidate
    return frontend_root / "index.html"


def redact_database_url(database_url: str) -> str:
    parsed = urlparse(database_url)
    if not parsed.password:
        return database_url
    netloc = parsed.netloc.replace(f":{parsed.password}@", ":***@")
    return parsed._replace(netloc=netloc).geturl()


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


def get_current_database_schema_version(database_url: str) -> int:
    conn = None
    try:
        conn = open_db(database_url)
        return get_db_schema_version(conn)
    finally:
        if conn is not None:
            conn.close()


BACKUP_EXPORT_VERSION = 1
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
        "license_documents": profile_license_documents(conn, user_id, profile),
        "device_states": list_device_states(conn, user_id),
        "dives": list_all_dives(conn, user_id, include_samples=True, include_raw_data=True),
    }


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
        "device_states": normalized_device_states,
        "dives": normalized_dives,
        "license_documents": normalized_license_documents,
    }


def import_backup_payload(conn, user_id: str, payload: dict | None) -> dict:
    normalized = parse_backup_payload(payload)
    profile = save_user_profile(conn, user_id, normalized["profile"])

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
        LOGGER.debug("OPTIONS %s", self.path)
        self.send_response(204)
        self._send_cors_headers()
        self._send_security_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        LOGGER.info("GET %s query=%s", path, dict(query))

        if path in {"/health", "/api/health"}:
            database_ready = bool(getattr(self.server, "database_ready", False))
            database_ready_error = getattr(self.server, "database_ready_error", "")
            if not database_ready:
                payload = {
                    "status": "starting",
                    "database": "migrating",
                }
                if database_ready_error:
                    payload["error"] = database_ready_error
                self._send_json(503, payload)
                return
            self._send_json(200, {"status": "ok"})
            return

        if path == "/config.js":
            self._send_config_js()
            return

        match = re.fullmatch(r"/api/public/divers/([a-z0-9-]+)", path)
        if match:
            public_slug = match.group(1)
            conn = self._open_db()
            if conn is None:
                return
            try:
                public_profile, dives, stats = get_public_profile_dives(conn, public_slug)
            finally:
                conn.close()

            if not public_profile:
                self._send_json(404, {"error": "Public dive profile not found"})
                return

            LOGGER.info(
                "Returned public dive profile slug=%s dives=%d",
                public_slug,
                len(dives),
            )
            self._send_json(
                200,
                {
                    "diver": public_profile,
                    "dives": dives,
                    "stats": stats,
                },
            )
            return

        if path == "/api/device-state":
            user_id = self._require_principal_id()
            if user_id is None:
                return
            vendor = self._single_query_arg(query, "vendor")
            product = self._single_query_arg(query, "product")
            if not vendor or not product:
                self._send_json(400, {"error": "vendor and product are required"})
                return

            conn = self._open_db()
            if conn is None:
                return
            try:
                state = get_device_state(conn, user_id, vendor, product)
                LOGGER.info(
                    "Returned device state user_id=%s vendor=%s product=%s fingerprint=%s",
                    user_id,
                    vendor,
                    product,
                    state.get("fingerprint_hex"),
                )
                self._send_json(200, state)
            finally:
                conn.close()
            return

        if path == "/api/profile":
            user_id = self._require_principal_id()
            if user_id is None:
                return

            conn = self._open_db()
            if conn is None:
                return
            try:
                profile = get_user_profile(conn, user_id)
            finally:
                conn.close()

            LOGGER.info(
                "Returned profile user_id=%s license_count=%d licenses_with_pdf=%d",
                user_id,
                len(profile.get("licenses") or []),
                sum(1 for license_entry in profile.get("licenses") or [] if license_entry.get("pdf")),
            )
            self._send_json(200, profile)
            return

        if path == "/api/exports/dives.csv":
            user_id = self._require_principal_id()
            if user_id is None:
                return

            conn = self._open_db()
            if conn is None:
                return
            try:
                dives = list_all_dives(conn, user_id, include_samples=True, include_raw_data=False)
            finally:
                conn.close()

            filename = attachment_filename(f"divevault-dives-{timestamp_slug()}.csv")
            LOGGER.info("Returned dive CSV export user_id=%s dives=%d filename=%s", user_id, len(dives), filename)
            self._send_bytes(
                200,
                build_dives_csv(dives),
                "text/csv; charset=utf-8",
                extra_headers={
                    "Content-Disposition": f'attachment; filename="{filename}"',
                    "Cache-Control": "no-store",
                },
            )
            return

        if path == "/api/exports/dives.pdf":
            user_id = self._require_principal_id()
            if user_id is None:
                return

            conn = self._open_db()
            if conn is None:
                return
            try:
                dives = list_all_dives(conn, user_id, include_samples=True, include_raw_data=False)
            finally:
                conn.close()

            filename = attachment_filename(f"divevault-dives-{timestamp_slug()}.pdf")
            LOGGER.info("Returned dive PDF export user_id=%s dives=%d filename=%s", user_id, len(dives), filename)
            self._send_bytes(
                200,
                build_pdf_document(dives),
                "application/pdf",
                extra_headers={
                    "Content-Disposition": f'attachment; filename="{filename}"',
                    "Cache-Control": "no-store",
                },
            )
            return

        if path == "/api/backup/export":
            user_id = self._require_principal_id()
            if user_id is None:
                return

            conn = self._open_db()
            if conn is None:
                return
            try:
                payload = build_backup_payload(conn, user_id)
            finally:
                conn.close()

            filename = attachment_filename(f"divevault-backup-{timestamp_slug()}.json")
            LOGGER.info(
                "Returned backup export user_id=%s dives=%d device_states=%d licenses=%d filename=%s",
                user_id,
                len(payload.get("dives") or []),
                len(payload.get("device_states") or []),
                len(payload.get("license_documents") or []),
                filename,
            )
            self._send_bytes(
                200,
                json.dumps(payload, indent=2, sort_keys=True).encode("utf-8"),
                "application/json; charset=utf-8",
                extra_headers={
                    "Content-Disposition": f'attachment; filename="{filename}"',
                    "Cache-Control": "no-store",
                },
            )
            return

        if path == "/api/geocode/search":
            user_id = self._require_principal_id()
            if user_id is None:
                return

            query_value = self._single_query_arg(query, "q")
            if not query_value or not query_value.strip():
                self._send_json(400, {"error": "Missing q query parameter"})
                return

            try:
                result = self.server.nominatim_client.search(query_value)
            except ValueError as exc:
                self._send_json(400, {"error": str(exc)})
                return
            except RuntimeError as exc:
                self._send_json(503, {"error": str(exc)})
                return

            LOGGER.info("Completed geocode lookup user_id=%s query=%s found=%s", user_id, query_value, result.get("found"))
            self._send_json(200, result)
            return

        match = re.fullmatch(r"/api/profile/licenses/([A-Za-z0-9_-]+)/pdf", path)
        if match:
            user_id = self._require_principal_id()
            if user_id is None:
                return
            license_id = match.group(1)

            conn = self._open_db()
            if conn is None:
                return
            try:
                license_pdf = get_user_profile_license_pdf(conn, user_id, license_id)
            finally:
                conn.close()

            if not license_pdf:
                self._send_json(404, {"error": "License PDF not found"})
                return

            LOGGER.info("Returned profile license user_id=%s license_id=%s filename=%s", user_id, license_id, license_pdf["filename"])
            self._send_bytes(
                200,
                license_pdf["data"],
                license_pdf["content_type"],
                extra_headers={
                    "Content-Disposition": f'inline; filename="{license_pdf["filename"]}"',
                    "Cache-Control": "no-store",
                },
            )
            return

        if path == "/api/auth/me":
            claims = self._require_auth()
            if claims is None:
                return
            self._send_json(
                200,
                {
                    "token_type": claims.get("token_type", "session_token"),
                    "session_id": claims.get("sid"),
                    "user_id": claims.get("sub"),
                    "subject": claims.get("subject"),
                    "scopes": claims.get("scopes"),
                },
            )
            return

        if path == "/api/cli-auth/request":
            if not self._enforce_rate_limit("cli_auth_request_status"):
                return
            code = self._single_query_arg(query, "code")
            if not code:
                self._send_json(400, {"error": "Missing code query parameter"})
                return
            payload = self.server.cli_auth_manager.get_request_status(code)
            if payload is None:
                self._send_json(404, {"error": "CLI auth request not found or expired"})
                return
            self._send_json(200, payload)
            return

        if path == "/api/dives":
            user_id = self._require_principal_id()
            if user_id is None:
                return
            include_samples = self._is_truthy(query.get("include_samples", ["0"])[0])
            include_raw_data = self._is_truthy(query.get("include_raw_data", ["0"])[0])
            limit = self._parse_int(
                query.get("limit", ["100"])[0],
                default=100,
                max_value=getattr(self.server, "max_list_limit", 200),
            )
            offset = self._parse_int(query.get("offset", ["0"])[0], default=0)

            conn = self._open_db()
            if conn is None:
                return
            try:
                dives, total = list_dives(conn, user_id, include_samples, include_raw_data, limit, offset)
            finally:
                conn.close()

            LOGGER.info(
                "Returned dives user_id=%s count=%d total=%d include_samples=%s include_raw_data=%s limit=%d offset=%d",
                user_id,
                len(dives),
                total,
                include_samples,
                include_raw_data,
                limit,
                offset,
            )
            self._send_json(
                200,
                {
                    "dives": dives,
                    "stats": summarize_dives(
                        [dive for dive in dives if is_logbook_complete(dive.get("fields", {}).get("logbook"))],
                        sum(1 for dive in dives if is_logbook_complete(dive.get("fields", {}).get("logbook"))),
                    ),
                    "imported_count": sum(
                        1 for dive in dives if not is_logbook_complete(dive.get("fields", {}).get("logbook"))
                    ),
                    "limit": limit,
                    "offset": offset,
                    "total": total,
                },
            )
            return

        match = re.fullmatch(r"/api/dives/(\d+)", path)
        if match:
            user_id = self._require_principal_id()
            if user_id is None:
                return
            dive_id = int(match.group(1))
            include_raw_data = self._is_truthy(query.get("include_raw_data", ["0"])[0])

            conn = self._open_db()
            if conn is None:
                return
            try:
                dive = get_dive(conn, user_id, dive_id, include_raw_data)
            finally:
                conn.close()

            if not dive:
                LOGGER.warning("Dive not found id=%d", dive_id)
                self._send_json(404, {"error": "Dive not found"})
                return

            LOGGER.info("Returned dive user_id=%s id=%d include_raw_data=%s", user_id, dive_id, include_raw_data)
            self._send_json(200, dive)
            return

        if path.startswith("/api/"):
            LOGGER.warning("Route not found: %s", path)
            self._send_json(404, {"error": "Not found"})
            return

        self._serve_frontend(path)

    def do_POST(self) -> None:
        LOGGER.info("POST %s", self.path)
        if self.path == "/api/cli-auth/request":
            if not self._enforce_rate_limit("cli_auth_request_create"):
                return
            payload = self.server.cli_auth_manager.create_request()
            self._send_json(201, payload)
            return

        if self.path == "/api/backup/import":
            if not self._enforce_rate_limit("backup_import"):
                return
            user_id = self._require_principal_id()
            if user_id is None:
                return

            payload = self._read_json_body(max_bytes=getattr(self.server, "max_backup_import_bytes", 25 * 1024 * 1024))
            if payload is None:
                return

            conn = self._open_db()
            if conn is None:
                return
            try:
                try:
                    result = import_backup_payload(conn, user_id, payload)
                except ValueError as exc:
                    self._send_json(400, {"error": str(exc)})
                    return
            finally:
                conn.close()

            LOGGER.info(
                "Imported backup user_id=%s dives_inserted=%d device_states=%d license_documents=%d",
                user_id,
                result["summary"]["dives_inserted"],
                result["summary"]["device_states_imported"],
                result["summary"]["license_documents_imported"],
            )
            self._send_json(200, result)
            return

        if self.path == "/api/cli-auth/approve":
            if not self._enforce_rate_limit("cli_auth_approve"):
                return
            claims = self._require_browser_session_auth()
            if claims is None:
                return
            payload = self._read_json_body()
            if payload is None:
                return
            code = (payload.get("code") or "").strip()
            if not code:
                self._send_json(400, {"error": "Missing CLI auth code"})
                return
            approval = self.server.cli_auth_manager.approve_request(code, claims)
            if approval is None:
                self._send_json(404, {"error": "CLI auth request not found or expired"})
                return
            self._send_json(
                200,
                {
                    "status": approval["status"],
                    "email": approval.get("email"),
                    "token_expires_at": approval.get("token_expires_at"),
                },
            )
            return

        if self.path != "/api/dives":
            self._send_json(404, {"error": "Not found"})
            return

        user_id = self._require_principal_id()
        if user_id is None:
            return
        if not self._enforce_rate_limit("dive_upload"):
            return

        payload = self._read_json_body()
        if payload is None:
            return

        missing = [
            key
            for key in ("vendor", "product", "dive_uid", "raw_sha256", "raw_data_b64")
            if not payload.get(key)
        ]
        if missing:
            LOGGER.warning("Rejected dive upload missing=%s", ",".join(missing))
            self._send_json(400, {"error": f"Missing required fields: {', '.join(missing)}"})
            return

        conn = self._open_db()
        if conn is None:
            return
        try:
            try:
                inserted = insert_dive_record(conn, user_id, payload)
            except ValueError as exc:
                LOGGER.warning("Rejected dive upload invalid base64 uid=%s", payload.get("dive_uid"))
                self._send_json(400, {"error": str(exc)})
                return
            dive_id = get_dive_id_by_uid(conn, user_id, payload["dive_uid"])
        finally:
            conn.close()

        LOGGER.info(
            "Processed dive upload user_id=%s uid=%s inserted=%s id=%s",
            user_id,
            payload["dive_uid"],
            inserted,
            dive_id,
        )
        self._send_json(201 if inserted else 200, {"inserted": inserted, "id": dive_id})

    def do_PUT(self) -> None:
        LOGGER.info("PUT %s", self.path)
        if self.path == "/api/profile":
            user_id = self._require_principal_id()
            if user_id is None:
                return
            payload = self._read_json_body()
            if payload is None:
                return

            conn = self._open_db()
            if conn is None:
                return
            try:
                profile = save_user_profile(conn, user_id, payload)
            finally:
                conn.close()

            LOGGER.info(
                "Updated profile user_id=%s license_count=%d licenses_with_pdf=%d",
                user_id,
                len(profile.get("licenses") or []),
                sum(1 for license_entry in profile.get("licenses") or [] if license_entry.get("pdf")),
            )
            self._send_json(200, profile)
            return

        match = re.fullmatch(r"/api/profile/licenses/([A-Za-z0-9_-]+)/pdf", self.path)
        if match:
            user_id = self._require_principal_id()
            if user_id is None:
                return
            license_id = match.group(1)
            payload = self._read_json_body()
            if payload is None:
                return

            try:
                filename, content_type, pdf_bytes = decode_profile_license_payload(payload)
            except ValueError as exc:
                self._send_json(400, {"error": str(exc)})
                return

            conn = self._open_db()
            if conn is None:
                return
            try:
                profile = save_user_profile_license_pdf(
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
                self._send_json(404, {"error": "License entry not found"})
                return

            LOGGER.info(
                "Updated profile license user_id=%s license_id=%s filename=%s size_bytes=%d",
                user_id,
                license_id,
                filename,
                len(pdf_bytes),
            )
            self._send_json(200, profile)
            return

        match = re.fullmatch(r"/api/dives/(\d+)/logbook", self.path)
        if match:
            user_id = self._require_principal_id()
            if user_id is None:
                return
            payload = self._read_json_body()
            if payload is None:
                return

            dive_id = int(match.group(1))
            conn = self._open_db()
            if conn is None:
                return
            try:
                dive = update_dive_logbook(conn, user_id, dive_id, payload)
            finally:
                conn.close()

            if not dive:
                LOGGER.warning("Dive not found for logbook update id=%d", dive_id)
                self._send_json(404, {"error": "Dive not found"})
                return

            LOGGER.info(
                "Updated dive logbook user_id=%s id=%d status=%s",
                user_id,
                dive_id,
                dive.get("fields", {}).get("logbook", {}).get("status"),
            )
            self._send_json(200, dive)
            return

        if self.path != "/api/device-state":
            self._send_json(404, {"error": "Not found"})
            return

        user_id = self._require_principal_id()
        if user_id is None:
            return

        payload = self._read_json_body()
        if payload is None:
            return

        vendor = payload.get("vendor")
        product = payload.get("product")
        if not vendor or not product:
            LOGGER.warning("Rejected device-state update missing vendor/product")
            self._send_json(400, {"error": "vendor and product are required"})
            return

        conn = self._open_db()
        if conn is None:
            return
        try:
            save_device_state(conn, user_id, vendor, product, payload.get("fingerprint_hex"))
            state = get_device_state(conn, user_id, vendor, product)
        finally:
            conn.close()

        LOGGER.info(
            "Processed device-state update user_id=%s vendor=%s product=%s fingerprint=%s",
            user_id,
            vendor,
            product,
            state.get("fingerprint_hex"),
        )
        self._send_json(200, state)

    def do_DELETE(self) -> None:
        LOGGER.info("DELETE %s", self.path)
        match = re.fullmatch(r"/api/dives/(\d+)", self.path)
        if not match:
            self._send_json(404, {"error": "Not found"})
            return

        user_id = self._require_principal_id()
        if user_id is None:
            return

        dive_id = int(match.group(1))
        conn = self._open_db()
        if conn is None:
            return
        try:
            deleted = delete_dive(conn, user_id, dive_id)
        finally:
            conn.close()

        if not deleted:
            LOGGER.warning("Dive not found for delete id=%d", dive_id)
            self._send_json(404, {"error": "Dive not found"})
            return

        LOGGER.info("Deleted dive user_id=%s id=%d", user_id, dive_id)
        self._send_json(200, {"deleted": True, "id": dive_id})

    def log_message(self, fmt: str, *args) -> None:
        LOGGER.debug("HTTP %s - %s", self.address_string(), fmt % args)

    def _open_db(self):
        try:
            return open_db(self.server.database_url)
        except Exception as exc:  # pragma: no cover - depends on runtime DB availability
            LOGGER.exception("Database connection failed")
            self._send_json(503, {"error": f"Database unavailable: {exc}"})
            return None

    def _require_auth(self) -> dict | None:
        verifier = getattr(self.server, "clerk_verifier", None)
        if verifier is None:
            self._send_json(503, {"error": "Clerk authentication is not configured on the backend"})
            return None

        try:
            return verifier.verify_request(self.headers)
        except ClerkAuthError as exc:
            self._send_json(exc.status, {"error": exc.message})
            return None

    def _require_browser_session_auth(self) -> dict | None:
        claims = self._require_auth()
        if claims is None:
            return None
        if claims.get("token_type") != "session_token":
            self._send_json(403, {"error": "Desktop sync approval requires an authenticated browser session"})
            return None
        return claims

    @staticmethod
    def _principal_id_from_claims(claims: dict | None) -> str | None:
        if not isinstance(claims, dict):
            return None
        return claims.get("sub") or claims.get("user_id") or claims.get("subject")

    def _require_principal_id(self) -> str | None:
        claims = self._require_auth()
        if claims is None:
            return None
        principal_id = self._principal_id_from_claims(claims)
        if principal_id:
            return principal_id
        self._send_json(403, {"error": "Authenticated identity is missing a stable user identifier"})
        return None

    def _read_json_body(self, *, max_bytes: int | None = None) -> dict | None:
        max_json_body_bytes = int(max_bytes if max_bytes is not None else getattr(self.server, "max_json_body_bytes", 1024 * 1024))
        content_length = self.headers.get("Content-Length", "0")
        try:
            length = int(content_length)
        except ValueError:
            self._send_json(400, {"error": "Invalid Content-Length header"})
            return None
        if length < 0:
            self._send_json(400, {"error": "Invalid Content-Length header"})
            return None
        if length > max_json_body_bytes:
            self._send_json(413, {"error": f"Request body exceeds {max_json_body_bytes} byte limit"})
            return None
        body = self.rfile.read(length) if length > 0 else b""
        try:
            return json.loads(body.decode("utf-8")) if body else {}
        except json.JSONDecodeError:
            LOGGER.warning("Rejected invalid JSON path=%s", self.path)
            self._send_json(400, {"error": "Invalid JSON"})
            return None

    def _send_security_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)")

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

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", self.server.cors_origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")

    def _enforce_rate_limit(self, scope: str) -> bool:
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
            + json.dumps({"clerkPublishableKey": self.server.clerk_publishable_key})
            + ";\n"
        ).encode("utf-8")
        self.send_response(200)
        self._send_security_headers()
        self.send_header("Content-Type", "application/javascript; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

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
    parser.add_argument("--clerk-publishable-key", default=os.getenv("VITE_CLERK_PUBLISHABLE_KEY"), help="Clerk publishable key exposed to the frontend at runtime")
    parser.add_argument("--clerk-secret-key", default=os.getenv("CLERK_SECRET_KEY"), help="Clerk secret key, required to verify Clerk API keys")
    parser.add_argument("--clerk-api-url", default=os.getenv("CLERK_API_URL", "https://api.clerk.com"), help="Clerk Backend API base URL")
    parser.add_argument("--clerk-jwt-key", default=os.getenv("CLERK_JWT_KEY"), help="Clerk JWT public key in PEM format")
    parser.add_argument("--clerk-jwks-url", default=os.getenv("CLERK_JWKS_URL"), help="Clerk JWKS URL")
    parser.add_argument("--clerk-frontend-api-url", default=os.getenv("CLERK_FRONTEND_API_URL"), help="Clerk frontend API URL, used to derive the JWKS URL and issuer")
    parser.add_argument("--clerk-issuer", default=os.getenv("CLERK_ISSUER"), help="Expected Clerk token issuer")
    parser.add_argument("--clerk-audience", default=os.getenv("CLERK_AUDIENCE"), help="Expected Clerk token audience")
    parser.add_argument("--clerk-authorized-parties", default=os.getenv("CLERK_AUTHORIZED_PARTIES"), help="Comma-separated allowed values for the Clerk azp claim")
    parser.add_argument("--clerk-api-key-scopes", default=os.getenv("CLERK_API_KEY_SCOPES"), help="Comma-separated Clerk API key scopes required for backend access")
    parser.add_argument("--cli-auth-request-ttl", type=int, default=int(os.getenv("CLI_AUTH_REQUEST_TTL", "600")), help="Seconds a desktop login request stays valid")
    parser.add_argument("--cli-auth-token-ttl", type=int, default=int(os.getenv("CLI_AUTH_TOKEN_TTL", "1800")), help="Seconds an approved desktop sync token stays valid")
    parser.add_argument("--nominatim-base-url", default=os.getenv("NOMINATIM_BASE_URL", "https://nominatim.openstreetmap.org"), help="Base URL for the Nominatim search service")
    parser.add_argument("--nominatim-user-agent", default=os.getenv("NOMINATIM_USER_AGENT", "DiveVault/1.0"), help="User-Agent sent to the Nominatim search service")
    parser.add_argument("--nominatim-email", default=os.getenv("NOMINATIM_EMAIL"), help="Optional email sent to the Nominatim search service")
    parser.add_argument("--db-startup-retries", type=int, default=int(os.getenv("DB_STARTUP_RETRIES", "5")), help="Number of startup checks to confirm PostgreSQL is reachable")
    parser.add_argument("--db-startup-retry-delay-seconds", type=float, default=float(os.getenv("DB_STARTUP_RETRY_DELAY_SECONDS", "2")), help="Delay between PostgreSQL startup checks")
    parser.add_argument("--db-connect-timeout-seconds", type=int, default=int(os.getenv("DB_CONNECT_TIMEOUT_SECONDS", "5")), help="Connection timeout for each PostgreSQL startup check")
    parser.add_argument(
        "--startup-migrations",
        default=os.getenv("STARTUP_MIGRATIONS", "enabled"),
        choices=["enabled", "disabled"],
        help="Whether to run schema migrations at backend startup. Use disabled when migrations run externally (for example, a Kubernetes Job).",
    )
    parser.add_argument("--max-json-body-bytes", type=int, default=int(os.getenv("MAX_JSON_BODY_BYTES", str(1024 * 1024))), help="Maximum JSON request body size in bytes")
    parser.add_argument("--max-backup-import-bytes", type=int, default=int(os.getenv("MAX_BACKUP_IMPORT_BYTES", str(25 * 1024 * 1024))), help="Maximum JSON body size accepted by /api/backup/import")
    parser.add_argument("--max-list-limit", type=int, default=int(os.getenv("MAX_LIST_LIMIT", "200")), help="Maximum list endpoint page size")
    parser.add_argument("--rate-limit-window-seconds", type=int, default=int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60")), help="Rate limit window in seconds")
    parser.add_argument("--rate-limit-cli-request-per-window", type=int, default=int(os.getenv("RATE_LIMIT_CLI_REQUEST_PER_WINDOW", "30")), help="Max CLI auth request create/status calls per IP and window")
    parser.add_argument("--rate-limit-cli-approve-per-window", type=int, default=int(os.getenv("RATE_LIMIT_CLI_APPROVE_PER_WINDOW", "15")), help="Max CLI auth approve calls per IP and window")
    parser.add_argument("--rate-limit-backup-import-per-window", type=int, default=int(os.getenv("RATE_LIMIT_BACKUP_IMPORT_PER_WINDOW", "10")), help="Max backup import calls per IP and window")
    parser.add_argument("--rate-limit-dive-upload-per-window", type=int, default=int(os.getenv("RATE_LIMIT_DIVE_UPLOAD_PER_WINDOW", "120")), help="Max dive upload calls per IP and window")
    parser.add_argument(
        "--log-level",
        default=os.getenv("LOG_LEVEL", "INFO"),
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging verbosity",
    )
    args = parser.parse_args()

    if not args.database_url:
        parser.error("Provide --database-url or set DATABASE_URL.")

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

    server = ThreadingHTTPServer((args.host, args.port), DiveBackendHandler)
    server.database_url = args.database_url
    server.database_ready = True
    server.database_ready_error = ""
    server.database_schema_version = schema_version
    server.cli_auth_manager = CliSyncTokenManager(
        request_ttl_seconds=args.cli_auth_request_ttl,
        token_ttl_seconds=args.cli_auth_token_ttl,
        database_url=args.database_url,
    )
    server.clerk_verifier = build_clerk_verifier(args, sync_token_manager=server.cli_auth_manager)
    server.clerk_publishable_key = args.clerk_publishable_key
    server.cors_origin = args.cors_origin
    server.max_json_body_bytes = max(args.max_json_body_bytes, 1)
    server.max_backup_import_bytes = max(args.max_backup_import_bytes, 1)
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

    LOGGER.info(
        "Starting backend host=%s port=%d database_url=%s cors_origin=%s frontend_dir=%s schema_version=%d",
        args.host,
        args.port,
        redact_database_url(args.database_url),
        args.cors_origin,
        server.frontend_dir,
        schema_version,
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
        server.server_close()


if __name__ == "__main__":
    main()
