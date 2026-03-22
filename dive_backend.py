#!/usr/bin/env python3
"""
Simple dive backend backed by PostgreSQL.

It accepts parsed dives from `mares_smart_air_sync.py` and serves dives to a frontend.

Usage:
    python dive_backend.py --database-url postgresql://dive:dive@localhost:5432/dive
"""

from __future__ import annotations

import argparse
import json
import logging
import mimetypes
import os
import re
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import jwt
from dotenv import load_dotenv
from jwt import InvalidTokenError, PyJWKClient

from postgres_store import (
    get_device_state,
    get_dive,
    get_dive_id_by_uid,
    insert_dive_record,
    list_dives,
    open_db,
    save_device_state,
    update_dive_logbook,
)


LOGGER = logging.getLogger("dive_backend")

load_dotenv()


class ClerkAuthError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def normalize_pem_env(value: str | None) -> str | None:
    if not value:
        return None
    return value.strip().replace("\\n", "\n")


class ClerkTokenVerifier:
    def __init__(
        self,
        *,
        jwt_key: str | None,
        jwks_url: str | None,
        issuer: str | None,
        audience: str | None,
        authorized_parties: set[str],
    ) -> None:
        self.jwt_key = normalize_pem_env(jwt_key)
        self.jwks_url = jwks_url.strip() if jwks_url else None
        self.issuer = issuer.rstrip("/") if issuer else None
        self.audience = audience.strip() if audience else None
        self.authorized_parties = authorized_parties
        self.jwks_client = PyJWKClient(self.jwks_url) if self.jwks_url and not self.jwt_key else None

    @property
    def configured(self) -> bool:
        return bool(self.jwt_key or self.jwks_client)

    def verify_request(self, headers) -> dict:
        token = self._extract_token(headers)
        if not token:
            raise ClerkAuthError(401, "Missing Clerk session token")

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


def parse_csv_env(value: str | None) -> set[str]:
    if not value:
        return set()
    return {item.strip() for item in value.split(",") if item.strip()}


def build_clerk_verifier(args: argparse.Namespace) -> ClerkTokenVerifier | None:
    frontend_api_url = args.clerk_frontend_api_url.rstrip("/") if args.clerk_frontend_api_url else None
    jwks_url = args.clerk_jwks_url or (f"{frontend_api_url}/.well-known/jwks.json" if frontend_api_url else None)
    issuer = args.clerk_issuer or frontend_api_url
    verifier = ClerkTokenVerifier(
        jwt_key=args.clerk_jwt_key,
        jwks_url=jwks_url,
        issuer=issuer,
        audience=args.clerk_audience,
        authorized_parties=parse_csv_env(args.clerk_authorized_parties),
    )
    if verifier.configured:
        return verifier

    LOGGER.warning(
        "Clerk authentication is not configured. Set CLERK_JWT_KEY or CLERK_JWKS_URL (or CLERK_FRONTEND_API_URL) to protect API routes."
    )
    return None


def resolve_frontend_dir(frontend_dir: Path) -> Path:
    resolved = frontend_dir.resolve()
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


class DiveBackendHandler(BaseHTTPRequestHandler):
    server_version = "DiveBackend/2.0"

    def do_OPTIONS(self) -> None:
        LOGGER.debug("OPTIONS %s", self.path)
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        LOGGER.info("GET %s query=%s", path, dict(query))

        if path in {"/health", "/api/health"}:
            self._send_json(200, {"status": "ok"})
            return

        if path == "/api/device-state":
            if self._require_auth() is None:
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
                state = get_device_state(conn, vendor, product)
                LOGGER.info(
                    "Returned device state vendor=%s product=%s fingerprint=%s",
                    vendor,
                    product,
                    state.get("fingerprint_hex"),
                )
                self._send_json(200, state)
            finally:
                conn.close()
            return

        if path == "/api/auth/me":
            claims = self._require_auth()
            if claims is None:
                return
            self._send_json(
                200,
                {
                    "session_id": claims.get("sid"),
                    "user_id": claims.get("sub"),
                },
            )
            return

        if path == "/api/dives":
            if self._require_auth() is None:
                return
            include_samples = self._is_truthy(query.get("include_samples", ["0"])[0])
            include_raw_data = self._is_truthy(query.get("include_raw_data", ["0"])[0])
            limit = self._parse_int(query.get("limit", ["100"])[0], default=100)
            offset = self._parse_int(query.get("offset", ["0"])[0], default=0)

            conn = self._open_db()
            if conn is None:
                return
            try:
                dives, total = list_dives(conn, include_samples, include_raw_data, limit, offset)
            finally:
                conn.close()

            LOGGER.info(
                "Returned dives count=%d total=%d include_samples=%s include_raw_data=%s limit=%d offset=%d",
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
                    "limit": limit,
                    "offset": offset,
                    "total": total,
                },
            )
            return

        match = re.fullmatch(r"/api/dives/(\d+)", path)
        if match:
            if self._require_auth() is None:
                return
            dive_id = int(match.group(1))
            include_raw_data = self._is_truthy(query.get("include_raw_data", ["0"])[0])

            conn = self._open_db()
            if conn is None:
                return
            try:
                dive = get_dive(conn, dive_id, include_raw_data)
            finally:
                conn.close()

            if not dive:
                LOGGER.warning("Dive not found id=%d", dive_id)
                self._send_json(404, {"error": "Dive not found"})
                return

            LOGGER.info("Returned dive id=%d include_raw_data=%s", dive_id, include_raw_data)
            self._send_json(200, dive)
            return

        if path.startswith("/api/"):
            LOGGER.warning("Route not found: %s", path)
            self._send_json(404, {"error": "Not found"})
            return

        self._serve_frontend(path)

    def do_POST(self) -> None:
        LOGGER.info("POST %s", self.path)
        if self.path != "/api/dives":
            self._send_json(404, {"error": "Not found"})
            return

        if self._require_auth() is None:
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
                inserted = insert_dive_record(conn, payload)
            except ValueError as exc:
                LOGGER.warning("Rejected dive upload invalid base64 uid=%s", payload.get("dive_uid"))
                self._send_json(400, {"error": str(exc)})
                return
            dive_id = get_dive_id_by_uid(conn, payload["dive_uid"])
        finally:
            conn.close()

        LOGGER.info(
            "Processed dive upload uid=%s inserted=%s id=%s",
            payload["dive_uid"],
            inserted,
            dive_id,
        )
        self._send_json(201 if inserted else 200, {"inserted": inserted, "id": dive_id})

    def do_PUT(self) -> None:
        LOGGER.info("PUT %s", self.path)
        match = re.fullmatch(r"/api/dives/(\d+)/logbook", self.path)
        if match:
            if self._require_auth() is None:
                return
            payload = self._read_json_body()
            if payload is None:
                return

            dive_id = int(match.group(1))
            conn = self._open_db()
            if conn is None:
                return
            try:
                dive = update_dive_logbook(conn, dive_id, payload)
            finally:
                conn.close()

            if not dive:
                LOGGER.warning("Dive not found for logbook update id=%d", dive_id)
                self._send_json(404, {"error": "Dive not found"})
                return

            LOGGER.info("Updated dive logbook id=%d status=%s", dive_id, dive.get("fields", {}).get("logbook", {}).get("status"))
            self._send_json(200, dive)
            return

        if self.path != "/api/device-state":
            self._send_json(404, {"error": "Not found"})
            return

        if self._require_auth() is None:
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
            save_device_state(conn, vendor, product, payload.get("fingerprint_hex"))
            state = get_device_state(conn, vendor, product)
        finally:
            conn.close()

        LOGGER.info(
            "Processed device-state update vendor=%s product=%s fingerprint=%s",
            vendor,
            product,
            state.get("fingerprint_hex"),
        )
        self._send_json(200, state)

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

    def _read_json_body(self) -> dict | None:
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length > 0 else b""
        try:
            return json.loads(body.decode("utf-8")) if body else {}
        except json.JSONDecodeError:
            LOGGER.warning("Rejected invalid JSON path=%s", self.path)
            self._send_json(400, {"error": "Invalid JSON"})
            return None

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, indent=2, sort_keys=True).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", self.server.cors_origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")

    def _serve_frontend(self, path: str) -> None:
        asset_path = frontend_asset_path(self.server.frontend_dir, path)
        if not asset_path.exists():
            LOGGER.warning("Frontend asset not found path=%s", asset_path)
            self._send_json(404, {"error": "Frontend asset not found"})
            return

        content_type, _ = mimetypes.guess_type(asset_path.name)
        body = asset_path.read_bytes()
        self.send_response(200)
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
    def _parse_int(value: str, default: int) -> int:
        try:
            parsed = int(value)
        except ValueError:
            return default
        return max(parsed, 0)


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve dives from PostgreSQL and accept parsed dive uploads.")
    parser.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL"),
        help="PostgreSQL connection string. Defaults to DATABASE_URL.",
    )
    parser.add_argument("--host", default=os.getenv("HOST", "127.0.0.1"), help="Host interface to bind")
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8000")), help="TCP port to bind")
    parser.add_argument("--cors-origin", default=os.getenv("CORS_ORIGIN", "*"), help="Allowed CORS origin for frontend requests")
    parser.add_argument("--frontend-dir", default=os.getenv("FRONTEND_DIR", "frontend/dist"), help="Path to static frontend assets")
    parser.add_argument("--clerk-jwt-key", default=os.getenv("CLERK_JWT_KEY"), help="Clerk JWT public key in PEM format")
    parser.add_argument("--clerk-jwks-url", default=os.getenv("CLERK_JWKS_URL"), help="Clerk JWKS URL")
    parser.add_argument("--clerk-frontend-api-url", default=os.getenv("CLERK_FRONTEND_API_URL"), help="Clerk frontend API URL, used to derive the JWKS URL and issuer")
    parser.add_argument("--clerk-issuer", default=os.getenv("CLERK_ISSUER"), help="Expected Clerk token issuer")
    parser.add_argument("--clerk-audience", default=os.getenv("CLERK_AUDIENCE"), help="Expected Clerk token audience")
    parser.add_argument("--clerk-authorized-parties", default=os.getenv("CLERK_AUTHORIZED_PARTIES"), help="Comma-separated allowed values for the Clerk azp claim")
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

    server = ThreadingHTTPServer((args.host, args.port), DiveBackendHandler)
    server.database_url = args.database_url
    server.clerk_verifier = build_clerk_verifier(args)
    server.cors_origin = args.cors_origin
    server.frontend_dir = resolve_frontend_dir(Path(args.frontend_dir))

    LOGGER.info(
        "Starting backend host=%s port=%d database_url=%s cors_origin=%s frontend_dir=%s",
        args.host,
        args.port,
        redact_database_url(args.database_url),
        args.cors_origin,
        server.frontend_dir,
    )
    print(f"Serving dive backend on http://{args.host}:{args.port}")
    print(f"Database URL: {redact_database_url(args.database_url)}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        LOGGER.info("Received shutdown signal")
    finally:
        LOGGER.info("Stopping backend")
        server.server_close()


if __name__ == "__main__":
    main()
