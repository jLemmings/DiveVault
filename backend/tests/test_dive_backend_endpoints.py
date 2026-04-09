from __future__ import annotations

import base64
import json
import re
import threading
from dataclasses import dataclass
from http.client import HTTPConnection
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from divevault import app as dive_backend


@dataclass
class Response:
    status: int
    headers: dict[str, str]
    body: bytes

    def json(self) -> dict:
        return json.loads(self.body.decode("utf-8"))


class FakeVerifier:
    def verify_request(self, headers) -> dict:
        authorization = headers.get("Authorization", "")
        token = authorization.split(" ", 1)[1].strip() if authorization.lower().startswith("bearer ") else ""
        if not token:
            raise dive_backend.ClerkAuthError(401, "Missing Clerk bearer token")
        if token == "session":
            return {
                "token_type": "session_token",
                "sid": "sid_123",
                "sub": "user-1",
                "email": "diver@example.com",
            }
        if token == "api":
            return {
                "token_type": "api_key",
                "subject": "svc_sync",
                "scopes": ["sync:write"],
            }
        if token == "nouser":
            return {"token_type": "session_token"}
        raise dive_backend.ClerkAuthError(401, "Invalid token")


class FakeCliAuthManager:
    def __init__(self) -> None:
        self._requests: dict[str, dict] = {}

    def create_request(self) -> dict:
        payload = {"code": "ABC123", "status": "pending"}
        self._requests[payload["code"]] = payload
        return payload

    def get_request_status(self, code: str) -> dict | None:
        return self._requests.get(code)

    def approve_request(self, code: str, claims: dict) -> dict | None:
        if code not in self._requests:
            return None
        approved = {
            "status": "approved",
            "email": claims.get("email"),
            "token_expires_at": "2099-01-01T00:00:00Z",
        }
        self._requests[code] = approved
        return approved


class FakeConn:
    def close(self) -> None:  # pragma: no cover - exercised via handler flow
        return None


class FakeNominatimClient:
    def search(self, query: str) -> dict:
        normalized = query.strip()
        if not normalized:
            raise ValueError("Missing search query")
        if normalized.lower() == "missing place":
            return {"query": normalized, "found": False, "result": None}
        if normalized.lower() == "service down":
            raise RuntimeError("Nominatim search failed: upstream unavailable")
        return {
            "query": normalized,
            "found": True,
            "result": {
                "name": f"{normalized}, Example Reef",
                "country": "Egypt",
                "latitude": 25.3104,
                "longitude": -80.2961,
            },
        }


@pytest.fixture()
def server_fixture(monkeypatch):
    store = {
        "dives": [
            {
                "id": 1,
                "vendor": "Mares",
                "product": "Smart Air",
                "dive_uid": "uid-1",
                "max_depth_m": 22.2,
                "duration_seconds": 2700,
                "fields": {
                    "logbook": {
                        "site": "Blue Hole",
                        "buddy": "Sam",
                        "guide": "Kai",
                        "notes": "",
                        "status": "complete",
                        "completed_at": "2026-03-20T08:00:00+00:00",
                    }
                },
                "raw_sha256": "sha-1",
                "raw_data_size": 3,
                "samples": [{"time_seconds": 0, "depth_m": 0.0}],
            }
        ],
        "device_state": {},
        "profile": {
            "name": "Elias Thorne",
            "email": "diver@example.com",
            "public_dives_enabled": True,
            "public_slug": "elias-thorne",
            "dive_sites": [
                {
                    "id": "site-1",
                    "name": "Blue Hole",
                    "location": "Blue Hole, Dahab, Egypt",
                    "country": "Egypt",
                    "latitude": 25.3104,
                    "longitude": -80.2961,
                }
            ],
            "buddies": [
                {
                    "id": "buddy-1",
                    "name": "Sam",
                }
            ],
            "guides": [
                {
                    "id": "guide-1",
                    "name": "Kai",
                }
            ],
            "licenses": [
                {
                    "id": "license-1",
                    "company": "PADI",
                    "certification_name": "Master Scuba Diver",
                    "student_number": "MSD-992-0402-X",
                    "certification_date": "2024-05-18",
                    "instructor_number": "PADI-445566",
                    "pdf": None,
                }
            ],
            "updated_at": "2026-03-29T10:00:00+00:00",
        },
    }

    def fake_open_db(_database_url: str):
        return FakeConn()

    def fake_get_device_state(_conn, user_id: str, vendor: str, product: str):
        return store["device_state"].get((user_id, vendor, product), {
            "vendor": vendor,
            "product": product,
            "fingerprint_hex": None,
            "updated_at": None,
        })

    def fake_save_device_state(_conn, user_id: str, vendor: str, product: str, fingerprint_hex: str | None):
        store["device_state"][(user_id, vendor, product)] = {
            "vendor": vendor,
            "product": product,
            "fingerprint_hex": fingerprint_hex,
            "updated_at": "2026-03-24T00:00:00+00:00",
        }

    def fake_list_device_states(_conn, user_id: str):
        assert user_id == "user-1"
        return [
            dict(state)
            for (entry_user_id, _vendor, _product), state in store["device_state"].items()
            if entry_user_id == user_id
        ]

    def fake_list_dives(_conn, user_id: str, include_samples: bool, include_raw_data: bool, limit: int, offset: int):
        assert user_id == "user-1"
        dives = [dict(item) for item in store["dives"]]
        if not include_samples:
            for dive in dives:
                dive.pop("samples", None)
        if include_raw_data:
            for dive in dives:
                dive["raw_data_b64"] = base64.b64encode(b"abc").decode("ascii")
        return dives[offset : offset + limit], len(dives)

    def fake_get_dive(_conn, user_id: str, dive_id: int, include_raw_data: bool):
        assert user_id == "user-1"
        for dive in store["dives"]:
            if dive["id"] == dive_id:
                payload = dict(dive)
                if include_raw_data:
                    payload["raw_data_b64"] = base64.b64encode(b"abc").decode("ascii")
                return payload
        return None

    def fake_list_all_dives(_conn, user_id: str, include_samples: bool, include_raw_data: bool):
        dives, _ = fake_list_dives(
            _conn,
            user_id,
            include_samples=include_samples,
            include_raw_data=include_raw_data,
            limit=10000,
            offset=0,
        )
        return dives

    def fake_insert_dive_record(_conn, user_id: str, payload: dict):
        assert user_id == "user-1"
        try:
            base64.b64decode(payload["raw_data_b64"], validate=True)
        except Exception as exc:  # noqa: BLE001
            raise ValueError("raw_data_b64 must be valid base64") from exc

        if any(item["dive_uid"] == payload["dive_uid"] for item in store["dives"]):
            return False

        next_id = max((item["id"] for item in store["dives"]), default=0) + 1
        store["dives"].append(
            {
                "id": next_id,
                "vendor": payload["vendor"],
                "product": payload["product"],
                "dive_uid": payload["dive_uid"],
                "duration_seconds": payload.get("duration_seconds"),
                "max_depth_m": payload.get("max_depth_m"),
                "fields": payload.get("fields", {}),
                "raw_sha256": payload["raw_sha256"],
                "raw_data_size": len(payload["raw_data_b64"]),
                "samples": payload.get("samples", []),
            }
        )
        return True

    def fake_get_dive_id_by_uid(_conn, user_id: str, dive_uid: str):
        assert user_id == "user-1"
        for dive in store["dives"]:
            if dive["dive_uid"] == dive_uid:
                return dive["id"]
        return None

    def fake_update_dive_logbook(_conn, user_id: str, dive_id: int, payload: dict | None):
        assert user_id == "user-1"
        for dive in store["dives"]:
            if dive["id"] == dive_id:
                fields = dict(dive.get("fields") or {})
                source = payload or {}
                fields["logbook"] = source.get("logbook") or source
                tank_volume_l = source.get("tank_volume_l")
                if tank_volume_l not in (None, ""):
                    tanks = list(fields.get("tanks") or [])
                    primary_tank = dict(tanks[0]) if tanks and isinstance(tanks[0], dict) else {}
                    primary_tank["volume"] = float(tank_volume_l)
                    if tanks:
                        tanks[0] = primary_tank
                    else:
                        tanks = [primary_tank]
                    fields["tanks"] = tanks
                dive["fields"] = fields
                return dict(dive)
        return None

    def fake_delete_dive(_conn, user_id: str, dive_id: int):
        assert user_id == "user-1"
        for index, dive in enumerate(store["dives"]):
            if dive["id"] == dive_id:
                store["dives"].pop(index)
                return True
        return False

    def fake_get_user_profile(_conn, user_id: str):
        assert user_id == "user-1"
        return dict(store["profile"])

    def fake_save_user_profile(_conn, user_id: str, payload: dict | None):
        assert user_id == "user-1"
        next_profile = dict(store["profile"])
        for key in ("name", "email", "public_slug"):
            if key in (payload or {}):
                next_profile[key] = payload[key]
        if "public_dives_enabled" in (payload or {}):
            next_profile["public_dives_enabled"] = bool(payload["public_dives_enabled"])
        if isinstance((payload or {}).get("dive_sites"), list):
            next_profile["dive_sites"] = payload["dive_sites"]
        if isinstance((payload or {}).get("buddies"), list):
            next_profile["buddies"] = payload["buddies"]
        if isinstance((payload or {}).get("guides"), list):
            next_profile["guides"] = payload["guides"]
        if isinstance((payload or {}).get("licenses"), list):
            next_profile["licenses"] = payload["licenses"]
        next_profile["updated_at"] = "2026-03-29T10:05:00+00:00"
        store["profile"] = next_profile
        return dict(store["profile"])

    def fake_save_user_profile_license_pdf(_conn, user_id: str, *, license_id: str, filename: str, content_type: str, pdf_bytes: bytes):
        assert user_id == "user-1"
        assert any(license["id"] == license_id for license in store["profile"]["licenses"])
        next_profile = dict(store["profile"])
        next_profile["licenses"] = [
            {
                **license,
                "pdf": {
                    "license_id": license_id,
                    "filename": filename,
                    "content_type": content_type,
                    "size_bytes": len(pdf_bytes),
                    "uploaded_at": "2026-03-29T10:06:00+00:00",
                    "preview_url": f"/api/profile/licenses/{license_id}/pdf",
                },
            } if license["id"] == license_id else dict(license)
            for license in next_profile["licenses"]
        ]
        next_profile["updated_at"] = "2026-03-29T10:06:00+00:00"
        store["profile"] = next_profile
        store.setdefault("profile_license_data", {})[license_id] = pdf_bytes
        return dict(store["profile"])

    def fake_get_user_profile_license_pdf(_conn, user_id: str, license_id: str):
        assert user_id == "user-1"
        if license_id not in store.get("profile_license_data", {}):
            return None
        license_entry = next((license for license in store["profile"]["licenses"] if license["id"] == license_id), None)
        if license_entry is None or not license_entry.get("pdf"):
            return None
        return {
            "filename": license_entry["pdf"]["filename"],
            "content_type": license_entry["pdf"]["content_type"],
            "data": store["profile_license_data"][license_id],
            "uploaded_at": license_entry["pdf"]["uploaded_at"],
        }

    def fake_get_public_profile_dives(_conn, public_slug: str):
        if public_slug != store["profile"].get("public_slug") or not store["profile"].get("public_dives_enabled"):
            return None, [], {}
        public_dives = [dict(dive) for dive in store["dives"] if dive.get("fields", {}).get("logbook", {}).get("status") == "complete"]
        return (
            {
                "name": store["profile"]["name"],
                "public_slug": store["profile"]["public_slug"],
            },
            public_dives,
            {"totalDives": len(public_dives)},
        )

    monkeypatch.setattr(dive_backend, "open_db", fake_open_db)
    monkeypatch.setattr(dive_backend, "get_device_state", fake_get_device_state)
    monkeypatch.setattr(dive_backend, "save_device_state", fake_save_device_state)
    monkeypatch.setattr(dive_backend, "list_device_states", fake_list_device_states)
    monkeypatch.setattr(dive_backend, "list_dives", fake_list_dives)
    monkeypatch.setattr(dive_backend, "list_all_dives", fake_list_all_dives)
    monkeypatch.setattr(dive_backend, "get_dive", fake_get_dive)
    monkeypatch.setattr(dive_backend, "get_public_profile_dives", fake_get_public_profile_dives)
    monkeypatch.setattr(dive_backend, "insert_dive_record", fake_insert_dive_record)
    monkeypatch.setattr(dive_backend, "get_dive_id_by_uid", fake_get_dive_id_by_uid)
    monkeypatch.setattr(dive_backend, "update_dive_logbook", fake_update_dive_logbook)
    monkeypatch.setattr(dive_backend, "delete_dive", fake_delete_dive)
    monkeypatch.setattr(dive_backend, "get_user_profile", fake_get_user_profile)
    monkeypatch.setattr(dive_backend, "save_user_profile", fake_save_user_profile)
    monkeypatch.setattr(dive_backend, "save_user_profile_license_pdf", fake_save_user_profile_license_pdf)
    monkeypatch.setattr(dive_backend, "get_user_profile_license_pdf", fake_get_user_profile_license_pdf)

    with TemporaryDirectory() as temp_dir:
        frontend_dir = Path(temp_dir)
        (frontend_dir / "index.html").write_text("<html>index</html>", encoding="utf-8")
        (frontend_dir / "asset.js").write_text("console.log('ok')", encoding="utf-8")

        server = dive_backend.ThreadingHTTPServer(("127.0.0.1", 0), dive_backend.DiveBackendHandler)
        server.database_url = "postgresql://unused"
        server.database_ready = True
        server.database_ready_error = ""
        server.clerk_verifier = FakeVerifier()
        server.clerk_publishable_key = "pk_test_123"
        server.cors_origin = "http://localhost:5173"
        server.max_json_body_bytes = 1024 * 1024
        server.max_list_limit = 200
        server.rate_limiter = dive_backend.FixedWindowRateLimiter()
        server.rate_limit_policies = {
            "cli_auth_request_create": {"limit": 30, "window_seconds": 60},
            "cli_auth_request_status": {"limit": 30, "window_seconds": 60},
            "cli_auth_approve": {"limit": 15, "window_seconds": 60},
            "backup_import": {"limit": 10, "window_seconds": 60},
            "dive_upload": {"limit": 120, "window_seconds": 60},
        }
        server.frontend_dir = frontend_dir
        server.cli_auth_manager = FakeCliAuthManager()
        server.nominatim_client = FakeNominatimClient()

        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield server
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


def request(server, method: str, path: str, *, token: str | None = None, payload: dict | None = None) -> Response:
    conn = HTTPConnection("127.0.0.1", server.server_address[1], timeout=5)
    headers = {}
    body = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    conn.request(method, path, body=body, headers=headers)
    raw = conn.getresponse()
    data = raw.read()
    response = Response(raw.status, {k: v for k, v in raw.getheaders()}, data)
    conn.close()
    return response


def test_get_and_options_routes(server_fixture):
    server = server_fixture

    health = request(server, "GET", "/health")
    assert health.status == 200
    assert health.json() == {"status": "ok"}

    api_health = request(server, "GET", "/api/health")
    assert api_health.status == 200
    assert api_health.json() == {"status": "ok"}

    config = request(server, "GET", "/config.js")
    assert config.status == 200
    assert "pk_test_123" in config.body.decode("utf-8")

    static_asset = request(server, "GET", "/asset.js")
    assert static_asset.status == 200

    spa_fallback = request(server, "GET", "/some/client/route")
    assert spa_fallback.status == 200
    assert "index" in spa_fallback.body.decode("utf-8")

    missing_api = request(server, "GET", "/api/not-real")
    assert missing_api.status == 404

    preflight = request(server, "OPTIONS", "/api/dives")
    assert preflight.status == 204
    assert preflight.headers["Access-Control-Allow-Origin"] == "http://localhost:5173"
    assert preflight.headers["X-Content-Type-Options"] == "nosniff"
    assert preflight.headers["X-Frame-Options"] == "DENY"


def test_authenticated_get_endpoints(server_fixture):
    server = server_fixture

    no_auth = request(server, "GET", "/api/dives")
    assert no_auth.status == 401

    public_profile = request(server, "GET", "/api/public/divers/elias-thorne")
    assert public_profile.status == 200
    assert public_profile.json()["diver"] == {
        "name": "Elias Thorne",
        "public_slug": "elias-thorne",
    }
    assert public_profile.json()["dives"][0]["id"] == 1
    assert "licenses" not in public_profile.json()["diver"]

    missing_public_profile = request(server, "GET", "/api/public/divers/not-found")
    assert missing_public_profile.status == 404

    me = request(server, "GET", "/api/auth/me", token="session")
    assert me.status == 200
    assert me.json()["user_id"] == "user-1"

    no_principal = request(server, "GET", "/api/dives", token="nouser")
    assert no_principal.status == 403

    dives = request(server, "GET", "/api/dives?include_samples=1&include_raw_data=1&limit=5&offset=0", token="session")
    assert dives.status == 200
    assert dives.json()["total"] == 1
    assert dives.json()["dives"][0]["raw_data_b64"]
    assert dives.json()["stats"]["totalDives"] == 1
    assert dives.json()["imported_count"] == 0
    assert dives.json()["stats"]["averageDurationSeconds"] == 2700.0

    capped_limit = request(server, "GET", "/api/dives?limit=9999&offset=0", token="session")
    assert capped_limit.status == 200
    assert capped_limit.json()["limit"] == 200
    assert capped_limit.headers["X-Content-Type-Options"] == "nosniff"
    assert capped_limit.headers["X-Frame-Options"] == "DENY"

    by_id = request(server, "GET", "/api/dives/1?include_raw_data=true", token="session")
    assert by_id.status == 200
    assert by_id.json()["id"] == 1

    missing_dive = request(server, "GET", "/api/dives/999", token="session")
    assert missing_dive.status == 404

    missing_device_state_args = request(server, "GET", "/api/device-state", token="session")
    assert missing_device_state_args.status == 400

    device_state = request(server, "GET", "/api/device-state?vendor=Mares&product=Smart%20Air", token="session")
    assert device_state.status == 200
    assert device_state.json()["vendor"] == "Mares"

    profile = request(server, "GET", "/api/profile", token="session")
    assert profile.status == 200
    assert profile.json()["public_dives_enabled"] is True
    assert profile.json()["public_slug"] == "elias-thorne"
    assert profile.json()["dive_sites"][0]["name"] == "Blue Hole"
    assert profile.json()["dive_sites"][0]["location"] == "Blue Hole, Dahab, Egypt"
    assert profile.json()["dive_sites"][0]["country"] == "Egypt"
    assert profile.json()["buddies"][0]["name"] == "Sam"
    assert profile.json()["guides"][0]["name"] == "Kai"
    assert profile.json()["licenses"][0]["certification_name"] == "Master Scuba Diver"
    assert profile.json()["licenses"][0]["pdf"] is None

    missing_profile_license = request(server, "GET", "/api/profile/licenses/license-1/pdf", token="session")
    assert missing_profile_license.status == 404

    geocode = request(server, "GET", "/api/geocode/search?q=Blue%20Hole", token="session")
    assert geocode.status == 200
    assert geocode.json()["found"] is True
    assert geocode.json()["result"]["country"] == "Egypt"
    assert geocode.json()["result"]["latitude"] == 25.3104

    geocode_missing_query = request(server, "GET", "/api/geocode/search", token="session")
    assert geocode_missing_query.status == 400

    geocode_not_found = request(server, "GET", "/api/geocode/search?q=missing%20place", token="session")
    assert geocode_not_found.status == 200
    assert geocode_not_found.json()["found"] is False

    geocode_upstream_error = request(server, "GET", "/api/geocode/search?q=service%20down", token="session")
    assert geocode_upstream_error.status == 503

    unknown_cli_request = request(server, "GET", "/api/cli-auth/request?code=NOPE")
    assert unknown_cli_request.status == 404


def test_health_reports_starting_until_database_ready(server_fixture):
    server = server_fixture
    server.database_ready = False
    server.database_ready_error = "startup migrations still running"

    health = request(server, "GET", "/health")
    assert health.status == 503
    assert health.json() == {
        "status": "starting",
        "database": "migrating",
        "error": "startup migrations still running",
    }


def test_post_and_put_endpoints(server_fixture):
    server = server_fixture

    create_cli_request = request(server, "POST", "/api/cli-auth/request")
    assert create_cli_request.status == 201
    code = create_cli_request.json()["code"]

    server.rate_limit_policies["cli_auth_request_create"]["limit"] = 1
    second_cli_request = request(server, "POST", "/api/cli-auth/request")
    assert second_cli_request.status == 429
    assert second_cli_request.headers["Retry-After"]
    server.rate_limit_policies["cli_auth_request_create"]["limit"] = 30

    cli_request_status = request(server, "GET", f"/api/cli-auth/request?code={code}")
    assert cli_request_status.status == 200

    approve_missing_auth = request(server, "POST", "/api/cli-auth/approve", payload={"code": code})
    assert approve_missing_auth.status == 401

    approve_non_session = request(server, "POST", "/api/cli-auth/approve", token="api", payload={"code": code})
    assert approve_non_session.status == 403

    approve_missing_code = request(server, "POST", "/api/cli-auth/approve", token="session", payload={})
    assert approve_missing_code.status == 400

    approve = request(server, "POST", "/api/cli-auth/approve", token="session", payload={"code": code})
    assert approve.status == 200
    assert approve.json()["status"] == "approved"

    not_found_post = request(server, "POST", "/api/unknown", token="session")
    assert not_found_post.status == 404

    missing_fields = request(server, "POST", "/api/dives", token="session", payload={"vendor": "Mares"})
    assert missing_fields.status == 400

    invalid_raw_payload = request(
        server,
        "POST",
        "/api/dives",
        token="session",
        payload={
            "vendor": "Mares",
            "product": "Smart Air",
            "dive_uid": "uid-bad",
            "raw_sha256": "sha-bad",
            "raw_data_b64": "not base64",
        },
    )
    assert invalid_raw_payload.status == 400

    valid_insert = request(
        server,
        "POST",
        "/api/dives",
        token="session",
        payload={
            "vendor": "Mares",
            "product": "Smart Air",
            "dive_uid": "uid-2",
            "raw_sha256": "sha-2",
            "raw_data_b64": base64.b64encode(b"123").decode("ascii"),
            "max_depth_m": 30.5,
        },
    )
    assert valid_insert.status == 201

    server.max_json_body_bytes = 64
    oversized_insert = request(
        server,
        "POST",
        "/api/dives",
        token="session",
        payload={
            "vendor": "Mares",
            "product": "Smart Air",
            "dive_uid": "uid-oversized",
            "raw_sha256": "sha-oversized",
            "raw_data_b64": base64.b64encode(b"a" * 256).decode("ascii"),
        },
    )
    assert oversized_insert.status == 413
    server.max_json_body_bytes = 1024 * 1024

    duplicate_insert = request(
        server,
        "POST",
        "/api/dives",
        token="session",
        payload={
            "vendor": "Mares",
            "product": "Smart Air",
            "dive_uid": "uid-2",
            "raw_sha256": "sha-2",
            "raw_data_b64": base64.b64encode(b"123").decode("ascii"),
        },
    )
    assert duplicate_insert.status == 200

    update_logbook = request(
        server,
        "PUT",
        "/api/dives/1/logbook",
        token="session",
        payload={"site": "Blue Hole", "buddy": "Sam", "guide": "Kai", "tank_volume_l": 12},
    )
    assert update_logbook.status == 200
    assert update_logbook.json()["fields"]["logbook"]["site"] == "Blue Hole"
    assert update_logbook.json()["fields"]["tanks"][0]["volume"] == 12.0

    missing_logbook_dive = request(server, "PUT", "/api/dives/999/logbook", token="session", payload={"site": "X"})
    assert missing_logbook_dive.status == 404

    update_device_state_missing = request(server, "PUT", "/api/device-state", token="session", payload={"vendor": "Mares"})
    assert update_device_state_missing.status == 400

    update_device_state = request(
        server,
        "PUT",
        "/api/device-state",
        token="session",
        payload={"vendor": "Mares", "product": "Smart Air", "fingerprint_hex": "abc123"},
    )
    assert update_device_state.status == 200
    assert update_device_state.json()["fingerprint_hex"] == "abc123"

    update_profile = request(
        server,
        "PUT",
        "/api/profile",
        token="session",
        payload={
            "dive_sites": [
                {
                    "id": "site-1",
                    "name": "Blue Hole",
                    "location": "Blue Hole, Dahab, Egypt",
                    "country": "Egypt",
                    "latitude": 25.3104,
                    "longitude": -80.2961,
                },
                {
                    "id": "site-2",
                    "name": "House Reef",
                    "location": "House Reef, Marsa Alam, Egypt",
                    "country": "Egypt",
                    "latitude": 24.4672,
                    "longitude": 54.3501,
                }
            ],
            "buddies": [
                {
                    "id": "buddy-1",
                    "name": "Sam",
                },
                {
                    "id": "buddy-2",
                    "name": "Kai",
                }
            ],
            "guides": [
                {
                    "id": "guide-1",
                    "name": "Kai",
                },
                {
                    "id": "guide-2",
                    "name": "Mira",
                }
            ],
            "licenses": [
                {
                    "id": "license-1",
                    "company": "SSI",
                    "certification_name": "Rescue Diver",
                    "student_number": "RD-2026-01",
                    "certification_date": "2025-08-01",
                    "instructor_number": "SSI-998877",
                },
                {
                    "id": "license-2",
                    "company": "TDI",
                    "certification_name": "Nitrox",
                    "student_number": "NX-44",
                    "certification_date": "2025-09-15",
                    "instructor_number": "TDI-3344",
                }
            ]
        },
    )
    assert update_profile.status == 200
    assert len(update_profile.json()["dive_sites"]) == 2
    assert update_profile.json()["dive_sites"][1]["name"] == "House Reef"
    assert update_profile.json()["dive_sites"][1]["location"] == "House Reef, Marsa Alam, Egypt"
    assert update_profile.json()["dive_sites"][1]["country"] == "Egypt"
    assert len(update_profile.json()["buddies"]) == 2
    assert update_profile.json()["buddies"][1]["name"] == "Kai"
    assert len(update_profile.json()["guides"]) == 2
    assert update_profile.json()["guides"][1]["name"] == "Mira"
    assert len(update_profile.json()["licenses"]) == 2
    assert update_profile.json()["licenses"][0]["company"] == "SSI"
    assert update_profile.json()["licenses"][1]["company"] == "TDI"

    invalid_profile_license = request(
        server,
        "PUT",
        "/api/profile/licenses/license-1/pdf",
        token="session",
        payload={"filename": "license.txt", "content_type": "text/plain", "data_b64": base64.b64encode(b"not a pdf").decode("ascii")},
    )
    assert invalid_profile_license.status == 400

    valid_profile_license = request(
        server,
        "PUT",
        "/api/profile/licenses/license-1/pdf",
        token="session",
        payload={
            "filename": "my-license.pdf",
            "content_type": "application/pdf",
            "data_b64": base64.b64encode(b"%PDF-1.7\nlicense").decode("ascii"),
        },
    )
    assert valid_profile_license.status == 200
    assert valid_profile_license.json()["licenses"][0]["pdf"]["filename"] == "my-license.pdf"

    download_profile_license = request(server, "GET", "/api/profile/licenses/license-1/pdf", token="session")
    assert download_profile_license.status == 200
    assert download_profile_license.headers["Content-Type"] == "application/pdf"
    assert download_profile_license.body.startswith(b"%PDF-")

    put_not_found = request(server, "PUT", "/api/nope", token="session", payload={})
    assert put_not_found.status == 404


def test_export_and_backup_endpoints(server_fixture):
    server = server_fixture

    csv_export = request(server, "GET", "/api/exports/dives.csv", token="session")
    assert csv_export.status == 200
    assert csv_export.headers["Content-Type"] == "text/csv; charset=utf-8"
    assert "attachment;" in csv_export.headers["Content-Disposition"]
    assert "dive_uid" in csv_export.body.decode("utf-8")
    assert "uid-1" in csv_export.body.decode("utf-8")

    pdf_export = request(server, "GET", "/api/exports/dives.pdf", token="session")
    assert pdf_export.status == 200
    assert pdf_export.headers["Content-Type"] == "application/pdf"
    assert pdf_export.body.startswith(b"%PDF-")

    backup_export = request(server, "GET", "/api/backup/export", token="session")
    assert backup_export.status == 200
    assert backup_export.headers["Content-Type"] == "application/json; charset=utf-8"
    backup_payload = backup_export.json()
    assert backup_payload["version"] == 1
    assert len(backup_payload["dives"]) == 1
    assert backup_payload["profile"]["dive_sites"][0]["name"] == "Blue Hole"
    assert backup_payload["license_documents"] == []

    invalid_import = request(server, "POST", "/api/backup/import", token="session", payload={"version": 999})
    assert invalid_import.status == 400

    imported_backup = request(
        server,
        "POST",
        "/api/backup/import",
        token="session",
        payload={
            "version": 1,
            "profile": {
                "name": "Elias Thorne",
                "email": "diver@example.com",
                "licenses": [
                    {
                        "id": "license-1",
                        "company": "PADI",
                        "certification_name": "Advanced Open Water",
                        "student_number": "AOW-55",
                        "certification_date": "2025-06-01",
                        "instructor_number": "PADI-7788",
                    }
                ],
                "dive_sites": [
                    {
                        "id": "site-1",
                        "name": "Blue Hole",
                        "location": "Blue Hole, Dahab, Egypt",
                        "latitude": 25.3104,
                        "longitude": -80.2961,
                    },
                    {
                        "id": "site-2",
                        "name": "Elphinstone",
                        "location": "Elphinstone Reef, Egypt",
                        "latitude": 24.9103,
                        "longitude": 35.8552,
                    }
                ],
                "buddies": [{"id": "buddy-1", "name": "Sam"}],
                "guides": [{"id": "guide-1", "name": "Kai"}],
            },
            "license_documents": [
                {
                    "license_id": "license-1",
                    "filename": "license.pdf",
                    "content_type": "application/pdf",
                    "data_b64": base64.b64encode(b"%PDF-1.7\nbackup").decode("ascii"),
                }
            ],
            "device_states": [
                {
                    "vendor": "Mares",
                    "product": "Smart Air",
                    "fingerprint_hex": "ff00aa",
                }
            ],
            "dives": [
                {
                    "vendor": "Mares",
                    "product": "Smart Air",
                    "fingerprint_hex": "ff00aa",
                    "dive_uid": "uid-backup-1",
                    "started_at": "2026-03-25T08:00:00+00:00",
                    "duration_seconds": 3200,
                    "max_depth_m": 28.4,
                    "avg_depth_m": 14.1,
                    "fields": {
                        "logbook": {
                            "site": "Elphinstone",
                            "buddy": "Sam",
                            "guide": "Kai",
                            "notes": "Backup import dive",
                            "status": "complete",
                        }
                    },
                    "raw_sha256": "sha-backup-1",
                    "raw_data_b64": base64.b64encode(b"backup-raw").decode("ascii"),
                    "samples": [{"time_seconds": 0, "depth_m": 0.0}],
                    "imported_at": "2026-03-25T10:00:00+00:00",
                }
            ],
        },
    )
    assert imported_backup.status == 200
    assert imported_backup.json()["summary"]["dives_inserted"] == 1
    assert imported_backup.json()["summary"]["device_states_imported"] == 1
    assert imported_backup.json()["summary"]["license_documents_imported"] == 1
    assert imported_backup.json()["profile"]["dive_sites"][1]["name"] == "Elphinstone"

    dives_after_import = request(server, "GET", "/api/dives?include_samples=1", token="session")
    assert dives_after_import.status == 200
    assert dives_after_import.json()["total"] == 2

    device_state_after_import = request(server, "GET", "/api/device-state?vendor=Mares&product=Smart%20Air", token="session")
    assert device_state_after_import.status == 200
    assert device_state_after_import.json()["fingerprint_hex"] == "ff00aa"

    license_after_import = request(server, "GET", "/api/profile/licenses/license-1/pdf", token="session")
    assert license_after_import.status == 200
    assert license_after_import.body.startswith(b"%PDF-")


def test_delete_endpoints(server_fixture):
    server = server_fixture

    missing_auth = request(server, "DELETE", "/api/dives/1")
    assert missing_auth.status == 401

    deleted = request(server, "DELETE", "/api/dives/1", token="session")
    assert deleted.status == 200
    assert deleted.json() == {"deleted": True, "id": 1}

    missing_dive = request(server, "DELETE", "/api/dives/999", token="session")
    assert missing_dive.status == 404

    delete_not_found = request(server, "DELETE", "/api/nope", token="session")
    assert delete_not_found.status == 404


def test_route_manifest_requires_test_updates_for_new_endpoints():
    """Guardrail: when route literals change, this test fails and forces test updates."""
    source = (Path(__file__).resolve().parents[1] / "divevault" / "app.py").read_text(encoding="utf-8")

    discovered_literals = set(re.findall(r'if (?:path|self\.path) == "([^"]+)"', source))
    discovered_regex = {f"regex:{pattern}" for pattern in re.findall(r're\.fullmatch\(r"([^"]+)"', source)}

    set_membership = re.findall(r'if path in \{([^}]+)\}:', source)
    for membership_block in set_membership:
        discovered_literals.update(re.findall(r'"([^"]+)"', membership_block))

    if 'if path.startswith("/api/"):' in source:
        discovered_literals.add("prefix:/api/*")

    expected_routes = {
        "/health",
        "/api/health",
        "/config.js",
        "/api/device-state",
        "/api/profile",
        "/api/exports/dives.csv",
            "/api/exports/dives.pdf",
            "/api/backup/export",
            "/api/geocode/search",
            "/api/auth/me",
            "/api/cli-auth/request",
            "/api/dives",
            "/api/backup/import",
            "/api/cli-auth/approve",
            "regex:/api/public/divers/([a-z0-9-]+)",
            "regex:/api/dives/(\\d+)",
            "regex:/api/dives/(\\d+)/logbook",
            "regex:/api/profile/licenses/([A-Za-z0-9_-]+)/pdf",
        "prefix:/api/*",
    }

    discovered = discovered_literals | discovered_regex
    assert discovered == expected_routes
