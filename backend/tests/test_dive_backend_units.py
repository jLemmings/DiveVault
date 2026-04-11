from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path

import pytest

from divevault import app as dive_backend


def test_normalize_pem_env_handles_blank_and_escaped_newlines():
    assert dive_backend.normalize_pem_env(None) is None
    assert dive_backend.normalize_pem_env("  line1\\nline2  ") == "line1\nline2"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, None),
        ("", None),
        (" bearer-token ", "bearer-token"),
        ('"bearer-token"', "bearer-token"),
        ("Bearer abc123", "abc123"),
        ("'Bearer abc123'", "abc123"),
    ],
)
def test_normalize_bearer_token(value, expected):
    assert dive_backend.normalize_bearer_token(value) == expected


def test_parse_csv_env_discards_empty_entries():
    assert dive_backend.parse_csv_env(None) == set()
    assert dive_backend.parse_csv_env(" one, two ,, three , ") == {"one", "two", "three"}


def test_sanitize_profile_license_filename_keeps_pdf_name():
    assert dive_backend.sanitize_profile_license_filename(r"C:\Users\joshu\licenses\advanced-open-water") == "advanced-open-water.pdf"
    assert dive_backend.sanitize_profile_license_filename(" rescue-diver.pdf ") == "rescue-diver.pdf"
    assert dive_backend.sanitize_profile_license_filename(None) == "diving-licenses.pdf"


def test_decode_profile_license_payload_accepts_valid_pdf():
    filename, content_type, pdf_bytes = dive_backend.decode_profile_license_payload(
        {
            "filename": "licenses.pdf",
            "content_type": "application/pdf",
            "data_b64": base64.b64encode(b"%PDF-1.7\nexample").decode("ascii"),
        }
    )

    assert filename == "licenses.pdf"
    assert content_type == "application/pdf"
    assert pdf_bytes.startswith(b"%PDF-")


def test_decode_profile_license_payload_rejects_non_pdf():
    with pytest.raises(ValueError, match="License file must be a PDF"):
        dive_backend.decode_profile_license_payload(
            {
                "filename": "licenses.pdf",
                "content_type": "application/pdf",
                "data_b64": base64.b64encode(b"plain text").decode("ascii"),
            }
        )


def test_nominatim_client_search_parses_result_and_caches(monkeypatch):
    calls = {"count": 0}
    seen = {"url": None, "accept_language": None}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            calls["count"] += 1
            return b'[{"display_name":"Blue Hole, Example Reef","address":{"country":"Egypt"},"lat":"25.3104","lon":"-80.2961"}]'

    def fake_urlopen(req, timeout=15):
        seen["url"] = req.full_url
        seen["accept_language"] = req.headers.get("Accept-language")
        return FakeResponse()

    monkeypatch.setattr(dive_backend.urlrequest, "urlopen", fake_urlopen)

    client = dive_backend.NominatimClient(base_url="https://nominatim.example", user_agent="DiveVault/Tests")

    first = client.search("Blue Hole")
    second = client.search("Blue Hole")

    assert first["found"] is True
    assert first["result"]["country"] == "Egypt"
    assert first["result"]["latitude"] == 25.3104
    assert "accept-language=en" in seen["url"]
    assert seen["accept_language"] == "en"
    assert second == first
    assert calls["count"] == 1


def test_nominatim_client_search_requires_query():
    client = dive_backend.NominatimClient(base_url="https://nominatim.example", user_agent="DiveVault/Tests")

    with pytest.raises(ValueError, match="Missing search query"):
        client.search("   ")


def test_translation_client_translate_parses_result_and_caches(monkeypatch):
    calls = {"count": 0, "data": None}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            calls["count"] += 1
            return b'{"translatedText":"Hello diving"}'

    def fake_urlopen(req, timeout=15):
        calls["data"] = req.data.decode("utf-8")
        return FakeResponse()

    monkeypatch.setattr(dive_backend.urlrequest, "urlopen", fake_urlopen)

    client = dive_backend.TranslationClient(base_url="https://translate.example", user_agent="DiveVault/Tests")
    first = client.translate("Hola buceo", target_language="en")
    second = client.translate("Hola buceo", target_language="en")

    assert '"target": "en"' in calls["data"]
    assert first["translated_text"] == "Hello diving"
    assert second == first
    assert calls["count"] == 1


def test_translation_client_translate_requires_text_and_target():
    client = dive_backend.TranslationClient(base_url="https://translate.example", user_agent="DiveVault/Tests")

    with pytest.raises(ValueError, match="Missing text to translate"):
        client.translate(" ", target_language="en")
    with pytest.raises(ValueError, match="Missing target language"):
        client.translate("Hola", target_language=" ")


def test_translation_client_cache_is_case_sensitive(monkeypatch):
    calls = {"count": 0}

    class FakeResponse:
        def __init__(self, text: str) -> None:
            self._text = text

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return json.dumps({"translatedText": self._text}).encode("utf-8")

    def fake_urlopen(_req, timeout=15):
        calls["count"] += 1
        return FakeResponse(f"translation-{calls['count']}")

    monkeypatch.setattr(dive_backend.urlrequest, "urlopen", fake_urlopen)

    client = dive_backend.TranslationClient(base_url="https://translate.example", user_agent="DiveVault/Tests")
    upper = client.translate("US Navy", target_language="de")
    lower = client.translate("us navy", target_language="de")

    assert upper["translated_text"] == "translation-1"
    assert lower["translated_text"] == "translation-2"


def test_build_clerk_verifier_derives_jwks_url_and_issuer():
    args = argparse.Namespace(
        clerk_secret_key=None,
        clerk_jwt_key="public-key",
        clerk_jwks_url=None,
        clerk_api_url="https://api.clerk.com",
        clerk_frontend_api_url="https://clerk.example.com/",
        clerk_issuer=None,
        clerk_audience="aud",
        clerk_authorized_parties="https://app.example.com, https://admin.example.com",
        clerk_api_key_scopes="sync:write, dives:read",
    )

    verifier = dive_backend.build_clerk_verifier(args, sync_token_manager=None)

    assert verifier is not None
    assert verifier.jwks_url == "https://clerk.example.com/.well-known/jwks.json"
    assert verifier.issuer == "https://clerk.example.com"
    assert verifier.authorized_parties == {"https://app.example.com", "https://admin.example.com"}
    assert verifier.required_api_key_scopes == {"sync:write", "dives:read"}


def test_build_clerk_verifier_returns_none_when_unconfigured(caplog):
    args = argparse.Namespace(
        clerk_secret_key=None,
        clerk_jwt_key=None,
        clerk_jwks_url=None,
        clerk_api_url="https://api.clerk.com",
        clerk_frontend_api_url=None,
        clerk_issuer=None,
        clerk_audience=None,
        clerk_authorized_parties=None,
        clerk_api_key_scopes=None,
    )

    verifier = dive_backend.build_clerk_verifier(args, sync_token_manager=None)

    assert verifier is None
    assert "Clerk authentication is not configured" in caplog.text


def test_resolve_frontend_dir_uses_existing_directory(tmp_path: Path):
    dist_dir = tmp_path / "frontend" / "dist"
    dist_dir.mkdir(parents=True)

    assert dive_backend.resolve_frontend_dir(dist_dir) == dist_dir.resolve()


def test_resolve_frontend_dir_falls_back_to_legacy_assets(tmp_path: Path):
    frontend_dir = tmp_path / "frontend"
    frontend_dir.mkdir()
    (frontend_dir / "index.html").write_text("ok", encoding="utf-8")

    resolved = dive_backend.resolve_frontend_dir(frontend_dir / "dist")

    assert resolved == frontend_dir.resolve()


def test_frontend_asset_path_serves_existing_asset_and_falls_back_for_missing_or_escape(tmp_path: Path):
    frontend_dir = tmp_path / "frontend"
    frontend_dir.mkdir()
    index_path = frontend_dir / "index.html"
    asset_path = frontend_dir / "assets.js"
    index_path.write_text("<html>app</html>", encoding="utf-8")
    asset_path.write_text("console.log('ok')", encoding="utf-8")

    assert dive_backend.frontend_asset_path(frontend_dir, "/assets.js") == asset_path.resolve()
    assert dive_backend.frontend_asset_path(frontend_dir, "/missing") == index_path.resolve()
    assert dive_backend.frontend_asset_path(frontend_dir, "/../secret.txt") == index_path.resolve()


def test_redact_database_url_masks_password_only():
    assert (
        dive_backend.redact_database_url("postgresql://user:secret@example.com:5432/dive")
        == "postgresql://user:***@example.com:5432/dive"
    )
    assert dive_backend.redact_database_url("postgresql://user@example.com:5432/dive") == "postgresql://user@example.com:5432/dive"


def test_extract_token_prefers_authorization_header():
    headers = {
        "Authorization": "Bearer auth-token",
        "Cookie": "__session=cookie-token",
    }

    assert dive_backend.ClerkTokenVerifier._extract_token(headers) == "auth-token"


def test_extract_token_uses_session_cookie_when_authorization_missing():
    headers = {"Cookie": "theme=dark; __session=cookie-token; csrftoken=abc"}

    assert dive_backend.ClerkTokenVerifier._extract_token(headers) == "cookie-token"


def test_principal_id_from_claims_accepts_multiple_claim_names():
    assert dive_backend.DiveBackendHandler._principal_id_from_claims({"sub": "user-1"}) == "user-1"
    assert dive_backend.DiveBackendHandler._principal_id_from_claims({"user_id": "user-2"}) == "user-2"
    assert dive_backend.DiveBackendHandler._principal_id_from_claims({"subject": "svc-sync"}) == "svc-sync"
    assert dive_backend.DiveBackendHandler._principal_id_from_claims(None) is None


def test_parse_int_and_truthy_helpers():
    assert dive_backend.DiveBackendHandler._is_truthy("YES") is True
    assert dive_backend.DiveBackendHandler._is_truthy("0") is False
    assert dive_backend.DiveBackendHandler._parse_int("12", default=5) == 12
    assert dive_backend.DiveBackendHandler._parse_int("-12", default=5) == 0
    assert dive_backend.DiveBackendHandler._parse_int("bad", default=5) == 5


def test_wait_for_database_succeeds_after_retry(monkeypatch):
    attempts = {"count": 0}
    sleep_calls: list[float] = []

    class FakeConn:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    def fake_connect(*args, **kwargs):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise RuntimeError("connection refused")
        return FakeConn()

    monkeypatch.setattr(dive_backend.psycopg, "connect", fake_connect)
    monkeypatch.setattr(dive_backend.time, "sleep", lambda seconds: sleep_calls.append(seconds))

    dive_backend.wait_for_database(
        "postgresql://user:secret@example.com:5432/dive",
        retries=3,
        retry_delay_seconds=1.5,
        connect_timeout_seconds=4,
    )

    assert attempts["count"] == 2
    assert sleep_calls == [1.5]


def test_wait_for_database_raises_clear_error_when_unreachable(monkeypatch):
    monkeypatch.setattr(dive_backend.psycopg, "connect", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("connection refused")))
    monkeypatch.setattr(dive_backend.time, "sleep", lambda seconds: None)

    with pytest.raises(SystemExit, match="Database is unreachable after 2 attempt\\(s\\): connection refused"):
        dive_backend.wait_for_database(
            "postgresql://user:secret@example.com:5432/dive",
            retries=2,
            retry_delay_seconds=0.1,
            connect_timeout_seconds=3,
        )


def test_run_startup_database_migrations_opens_and_closes_connection(monkeypatch):
    calls = {"opened": 0, "closed": 0}

    class FakeConn:
        def close(self):
            calls["closed"] += 1

    def fake_open_db(database_url: str, *, ensure_schema: bool = False):
        calls["opened"] += 1
        assert database_url == "postgresql://user:secret@example.com:5432/dive"
        assert ensure_schema is True
        return FakeConn()

    monkeypatch.setattr(dive_backend, "open_db", fake_open_db)
    monkeypatch.setattr(dive_backend, "get_db_schema_version", lambda conn: 4)

    schema_version = dive_backend.run_startup_database_migrations("postgresql://user:secret@example.com:5432/dive")

    assert calls == {"opened": 1, "closed": 1}
    assert schema_version == 4


def test_require_expected_schema_version_accepts_matching_version():
    dive_backend.require_expected_schema_version(5, expected_schema_version=5)


def test_require_expected_schema_version_raises_on_mismatch():
    with pytest.raises(SystemExit, match="Expected 5, found 4"):
        dive_backend.require_expected_schema_version(4, expected_schema_version=5)


def test_cli_sync_token_manager_tracks_requests_and_tokens(monkeypatch):
    manager = dive_backend.CliSyncTokenManager(request_ttl_seconds=10, token_ttl_seconds=30)
    clock = iter([100.0, 105.0, 106.0, 120.0, 141.0])

    monkeypatch.setattr(dive_backend.time, "time", lambda: next(clock))
    monkeypatch.setattr(
        dive_backend.secrets,
        "token_urlsafe",
        lambda size: {24: "request-code", 32: "sync-token"}.get(size, f"token-{size}"),
    )

    created = manager.create_request()
    approved = manager.approve_request("request-code", {"sub": "user-1", "email": "diver@example.com", "sid": "sid-1"})
    request_status = manager.get_request_status("request-code")
    claims = manager.verify_token("dvsync_sync-token")
    expired_claims = manager.verify_token("dvsync_sync-token")

    assert created["status"] == "pending"
    assert created["code"] == "request-code"
    assert approved is not None
    assert approved["status"] == "approved"
    assert approved["token"] == "dvsync_sync-token"
    assert approved["user_id"] == "user-1"
    assert request_status is not None
    assert request_status["status"] == "approved"
    assert claims is not None
    assert claims["token_type"] == "cli_sync"
    assert claims["sub"] == "user-1"
    assert expired_claims is None


def test_cli_sync_token_manager_rejects_missing_or_expired_request(monkeypatch):
    manager = dive_backend.CliSyncTokenManager(request_ttl_seconds=5, token_ttl_seconds=30)
    clock = iter([100.0, 106.0])

    monkeypatch.setattr(dive_backend.time, "time", lambda: next(clock))
    monkeypatch.setattr(dive_backend.secrets, "token_urlsafe", lambda size: "expired-code" if size == 24 else "unused")

    manager.create_request()

    assert manager.approve_request("expired-code", {"sub": "user-1"}) is None


def test_cli_sync_token_manager_uses_database_persistence(monkeypatch):
    calls = []

    class FakeConn:
        def close(self):
            calls.append(("close",))

    monkeypatch.setattr(dive_backend, "open_db", lambda database_url: calls.append(("open_db", database_url)) or FakeConn())
    monkeypatch.setattr(
        dive_backend,
        "create_cli_sync_request",
        lambda conn, **kwargs: calls.append(("create", kwargs)) or {"code": kwargs["code"], "status": "pending", "created_at": kwargs["now_timestamp"], "expires_at": kwargs["now_timestamp"] + kwargs["request_ttl_seconds"], "token": None, "token_expires_at": None, "user_id": None, "email": None},
    )
    monkeypatch.setattr(
        dive_backend,
        "get_cli_sync_request_status",
        lambda conn, code, **kwargs: calls.append(("status", code, kwargs)) or {"code": code, "status": "pending"},
    )
    monkeypatch.setattr(
        dive_backend,
        "approve_cli_sync_request",
        lambda conn, code, claims, **kwargs: calls.append(("approve", code, claims, kwargs)) or {"code": code, "status": "approved", "token": kwargs["token"], "token_expires_at": kwargs["now_timestamp"] + kwargs["token_ttl_seconds"], "user_id": claims["sub"], "email": claims.get("email")},
    )
    monkeypatch.setattr(
        dive_backend,
        "verify_cli_sync_token",
        lambda conn, token, **kwargs: calls.append(("verify", token, kwargs)) or {"token_type": "cli_sync", "sub": "user-1", "expires_at": kwargs["now_timestamp"] + 30},
    )
    monkeypatch.setattr(dive_backend.time, "time", lambda: 100.0)
    monkeypatch.setattr(dive_backend.secrets, "token_urlsafe", lambda size: {24: "request-code", 32: "sync-token"}.get(size, f"token-{size}"))

    manager = dive_backend.CliSyncTokenManager(
        request_ttl_seconds=10,
        token_ttl_seconds=30,
        database_url="postgresql://user:secret@example.com:5432/dive",
    )

    created = manager.create_request()
    status = manager.get_request_status("request-code")
    approved = manager.approve_request("request-code", {"sub": "user-1", "email": "diver@example.com"})
    claims = manager.verify_token("dvsync_sync-token")

    assert created["code"] == "request-code"
    assert status == {"code": "request-code", "status": "pending"}
    assert approved["status"] == "approved"
    assert approved["token"] == "dvsync_sync-token"
    assert claims["token_type"] == "cli_sync"
    assert ("open_db", "postgresql://user:secret@example.com:5432/dive") in calls
