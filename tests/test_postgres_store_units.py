from __future__ import annotations

import base64

import pytest

from divevault import postgres_store


def test_decode_dive_row_includes_requested_fields_and_decodes_json_strings():
    raw_data = b"\x00\x01\x02"
    row = {
        "id": 7,
        "vendor": "Mares",
        "product": "Smart Air",
        "fingerprint_hex": "abc123",
        "dive_uid": "uid-7",
        "started_at": "2026-03-24T10:00:00+00:00",
        "duration_seconds": 1800,
        "max_depth_m": 22.4,
        "avg_depth_m": 11.2,
        "fields_json": '{"visibility":"good"}',
        "raw_sha256": "sha-7",
        "raw_data": raw_data,
        "samples_json": '[{"time_seconds":0,"depth_m":0.0},{"time_seconds":60,"depth_m":8.1}]',
        "imported_at": "2026-03-24T11:00:00+00:00",
    }

    payload = postgres_store.decode_dive_row(row, include_samples=True, include_raw_data=True)

    assert payload["id"] == 7
    assert payload["fields"] == {"visibility": "good"}
    assert payload["sample_count"] == 2
    assert payload["samples"][1]["depth_m"] == 8.1
    assert payload["raw_data_size"] == 3
    assert payload["raw_data_b64"] == base64.b64encode(raw_data).decode("ascii")


def test_decode_dive_row_omits_optional_fields_when_not_requested():
    row = {
        "id": 1,
        "vendor": "Mares",
        "product": "Smart Air",
        "fingerprint_hex": None,
        "dive_uid": "uid-1",
        "started_at": None,
        "duration_seconds": None,
        "max_depth_m": None,
        "avg_depth_m": None,
        "fields_json": {},
        "raw_sha256": "sha-1",
        "raw_data": None,
        "samples_json": [],
        "imported_at": "2026-03-24T11:00:00+00:00",
    }

    payload = postgres_store.decode_dive_row(row, include_samples=False, include_raw_data=False)

    assert payload["sample_count"] == 0
    assert payload["raw_data_size"] == 0
    assert "samples" not in payload
    assert "raw_data_b64" not in payload


def test_sanitize_logbook_payload_marks_complete_when_required_fields_present(monkeypatch):
    timestamps = iter(["2026-03-24T12:00:00+00:00", "2026-03-24T12:05:00+00:00"])
    monkeypatch.setattr(postgres_store, "now_iso", lambda: next(timestamps))

    payload = postgres_store.sanitize_logbook_payload(
        {
            "commit": True,
            "site": " Blue Hole ",
            "buddy": " Sam ",
            "guide": " Kai ",
            "notes": " Calm water ",
        }
    )

    assert payload == {
        "site": "Blue Hole",
        "buddy": "Sam",
        "guide": "Kai",
        "notes": "Calm water",
        "updated_at": "2026-03-24T12:00:00+00:00",
        "status": "complete",
        "completed_at": "2026-03-24T12:05:00+00:00",
    }


def test_sanitize_logbook_payload_preserves_existing_completed_at_from_nested_logbook(monkeypatch):
    monkeypatch.setattr(postgres_store, "now_iso", lambda: "2026-03-24T12:00:00+00:00")

    payload = postgres_store.sanitize_logbook_payload(
        {
            "commit": True,
            "logbook": {
                "site": "Blue Hole",
                "buddy": "Sam",
                "guide": "Kai",
                "notes": "Already logged",
                "completed_at": "2026-03-20T08:00:00+00:00",
            },
        }
    )

    assert payload["status"] == "complete"
    assert payload["completed_at"] == "2026-03-20T08:00:00+00:00"


def test_sanitize_logbook_payload_stays_pending_without_commit_or_required_fields(monkeypatch):
    monkeypatch.setattr(postgres_store, "now_iso", lambda: "2026-03-24T12:00:00+00:00")

    payload = postgres_store.sanitize_logbook_payload({"site": "Blue Hole", "buddy": "", "guide": "Kai"})

    assert payload["status"] == "pending"
    assert "completed_at" not in payload


def test_decode_base64_payload_accepts_valid_payload():
    payload = {"raw_data_b64": base64.b64encode(b"abc123").decode("ascii")}

    assert postgres_store.decode_base64_payload(payload) == b"abc123"


def test_decode_base64_payload_rejects_invalid_payload():
    with pytest.raises(ValueError, match="raw_data_b64 must be valid base64"):
        postgres_store.decode_base64_payload({"raw_data_b64": "not base64"})
