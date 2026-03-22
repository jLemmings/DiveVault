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
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

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
            vendor = self._single_query_arg(query, "vendor")
            product = self._single_query_arg(query, "product")
            if not vendor or not product:
                self._send_json(400, {"error": "vendor and product are required"})
                return

            conn = open_db(self.server.database_url)
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

        if path == "/api/dives":
            include_samples = self._is_truthy(query.get("include_samples", ["0"])[0])
            include_raw_data = self._is_truthy(query.get("include_raw_data", ["0"])[0])
            limit = self._parse_int(query.get("limit", ["100"])[0], default=100)
            offset = self._parse_int(query.get("offset", ["0"])[0], default=0)

            conn = open_db(self.server.database_url)
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
            dive_id = int(match.group(1))
            include_raw_data = self._is_truthy(query.get("include_raw_data", ["0"])[0])

            conn = open_db(self.server.database_url)
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

        conn = open_db(self.server.database_url)
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
            payload = self._read_json_body()
            if payload is None:
                return

            dive_id = int(match.group(1))
            conn = open_db(self.server.database_url)
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

        payload = self._read_json_body()
        if payload is None:
            return

        vendor = payload.get("vendor")
        product = payload.get("product")
        if not vendor or not product:
            LOGGER.warning("Rejected device-state update missing vendor/product")
            self._send_json(400, {"error": "vendor and product are required"})
            return

        conn = open_db(self.server.database_url)
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
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

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
