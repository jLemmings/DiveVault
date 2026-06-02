from __future__ import annotations

import argparse
import hashlib
import hmac
import logging
import secrets
import threading
import time
import uuid
from http.cookies import SimpleCookie

import jwt
from jwt import InvalidTokenError

from divevault.handlers.request_utils import AuthError
from divevault.repositories.auth import CliSyncRepository


LOGGER = logging.getLogger("dive_backend")


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


class CliSyncTokenManager:
    def __init__(
        self,
        *,
        request_ttl_seconds: int = 600,
        token_ttl_seconds: int = 1800,
        database_url: str | None = None,
        repository: CliSyncRepository | None = None,
    ) -> None:
        self.request_ttl_seconds = request_ttl_seconds
        self.token_ttl_seconds = token_ttl_seconds
        self.database_url = database_url.strip() if database_url else None
        self.repository = repository or CliSyncRepository(self.database_url)
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
        return self.repository.open_connection()

    def _create_cli_sync_request(self, conn, **kwargs) -> dict:
        return self.repository.create_request(conn, **kwargs)

    def _get_cli_sync_request_status(self, conn, code: str, **kwargs) -> dict | None:
        return self.repository.get_request_status(conn, code, **kwargs)

    def _approve_cli_sync_request(self, conn, code: str, claims: dict, **kwargs) -> dict | None:
        return self.repository.approve_request(conn, code, claims, **kwargs)

    def _verify_cli_sync_token(self, conn, token: str, **kwargs) -> dict | None:
        return self.repository.verify_token(conn, token, **kwargs)

    def create_request(self) -> dict:
        now = time.time()
        code = secrets.token_urlsafe(24)
        if self._uses_database():
            conn = self._open_database()
            try:
                entry = self._create_cli_sync_request(
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
                entry = self._approve_cli_sync_request(
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
                entry = self._get_cli_sync_request_status(conn, code, now_timestamp=int(now))
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
                claims = self._verify_cli_sync_token(conn, token, now_timestamp=int(now))
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
    actual_hash = hash_password(password, salt_hex=parts[1])
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
