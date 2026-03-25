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
                "fields": {},
                "raw_sha256": "sha-1",
                "raw_data_size": 3,
                "samples": [{"time_seconds": 0, "depth_m": 0.0}],
            }
        ],
        "device_state": {},
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
                fields["logbook"] = payload or {}
                dive["fields"] = fields
                return dict(dive)
        return None

    monkeypatch.setattr(dive_backend, "open_db", fake_open_db)
    monkeypatch.setattr(dive_backend, "get_device_state", fake_get_device_state)
    monkeypatch.setattr(dive_backend, "save_device_state", fake_save_device_state)
    monkeypatch.setattr(dive_backend, "list_dives", fake_list_dives)
    monkeypatch.setattr(dive_backend, "get_dive", fake_get_dive)
    monkeypatch.setattr(dive_backend, "insert_dive_record", fake_insert_dive_record)
    monkeypatch.setattr(dive_backend, "get_dive_id_by_uid", fake_get_dive_id_by_uid)
    monkeypatch.setattr(dive_backend, "update_dive_logbook", fake_update_dive_logbook)

    with TemporaryDirectory() as temp_dir:
        frontend_dir = Path(temp_dir)
        (frontend_dir / "index.html").write_text("<html>index</html>", encoding="utf-8")
        (frontend_dir / "asset.js").write_text("console.log('ok')", encoding="utf-8")

        server = dive_backend.ThreadingHTTPServer(("127.0.0.1", 0), dive_backend.DiveBackendHandler)
        server.database_url = "postgresql://unused"
        server.clerk_verifier = FakeVerifier()
        server.clerk_publishable_key = "pk_test_123"
        server.cors_origin = "http://localhost:5173"
        server.frontend_dir = frontend_dir
        server.cli_auth_manager = FakeCliAuthManager()

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


def test_authenticated_get_endpoints(server_fixture):
    server = server_fixture

    no_auth = request(server, "GET", "/api/dives")
    assert no_auth.status == 401

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
    assert dives.json()["stats"]["averageDurationSeconds"] == 2700.0

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

    unknown_cli_request = request(server, "GET", "/api/cli-auth/request?code=NOPE")
    assert unknown_cli_request.status == 404


def test_post_and_put_endpoints(server_fixture):
    server = server_fixture

    create_cli_request = request(server, "POST", "/api/cli-auth/request")
    assert create_cli_request.status == 201
    code = create_cli_request.json()["code"]

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
        payload={"site": "Blue Hole", "buddy": "Sam", "guide": "Kai"},
    )
    assert update_logbook.status == 200
    assert update_logbook.json()["fields"]["logbook"]["site"] == "Blue Hole"

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

    put_not_found = request(server, "PUT", "/api/nope", token="session", payload={})
    assert put_not_found.status == 404


def test_route_manifest_requires_test_updates_for_new_endpoints():
    """Guardrail: when route literals change, this test fails and forces test updates."""
    source = Path("divevault/app.py").read_text(encoding="utf-8")

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
        "/api/auth/me",
        "/api/cli-auth/request",
        "/api/dives",
        "/api/cli-auth/approve",
        "regex:/api/dives/(\\d+)",
        "regex:/api/dives/(\\d+)/logbook",
        "prefix:/api/*",
    }

    discovered = discovered_literals | discovered_regex
    assert discovered == expected_routes
