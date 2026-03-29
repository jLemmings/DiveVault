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
    assert payload["duration_ms"] == 1800000
    assert payload["duration_seconds"] == 1800
    assert payload["fields"] == {
        "visibility": "good",
        "sample_time_unit": "seconds",
        "logbook": {"site": "", "buddy": "", "guide": "", "notes": "", "status": "imported"},
    }
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

    assert payload["duration_ms"] is None
    assert payload["sample_count"] == 0
    assert payload["raw_data_size"] == 0
    assert "samples" not in payload
    assert "raw_data_b64" not in payload


def test_build_import_payload_preserves_unknown_values_and_omits_transport_base64():
    payload = {
        "vendor": "Mares",
        "product": "Smart Air",
        "duration_seconds": 1800,
        "raw_data_b64": base64.b64encode(b"abc123").decode("ascii"),
        "custom_top_level": {"gps": "present"},
        "fields": {"location": {"lat": 1.23, "lon": 4.56}},
        "samples": [{"time_seconds": 12, "event": {"type": "bookmark"}}],
    }

    archived = postgres_store.build_import_payload(payload, imported_at="2026-03-24T11:00:00+00:00")

    assert archived["vendor"] == "Mares"
    assert archived["duration_ms"] == 1800000
    assert archived["custom_top_level"] == {"gps": "present"}
    assert archived["fields"]["location"]["lat"] == 1.23
    assert archived["samples"][0]["event"]["type"] == "bookmark"
    assert archived["imported_at"] == "2026-03-24T11:00:00+00:00"
    assert "raw_data_b64" not in archived


def test_build_import_payload_from_row_reconstructs_legacy_archive():
    archived = postgres_store.build_import_payload_from_row(
        {
            "vendor": "Mares",
            "product": "Smart Air",
            "fingerprint_hex": "abc123",
            "dive_uid": "uid-7",
            "started_at": "2026-03-24T10:00:00+00:00",
            "duration_seconds": 1800,
            "max_depth_m": 22.4,
            "avg_depth_m": 11.2,
            "raw_sha256": "sha-7",
            "imported_at": "2026-03-24T11:00:00+00:00",
        },
        {"visibility": "good"},
        [{"time_seconds": 0, "depth_m": 0.0}],
    )

    assert archived["dive_uid"] == "uid-7"
    assert archived["duration_ms"] == 1800000
    assert archived["fields"] == {"visibility": "good"}
    assert archived["samples"][0]["depth_m"] == 0.0
    assert archived["raw_sha256"] == "sha-7"


def test_resolve_duration_helpers_prefer_milliseconds_and_derive_seconds():
    payload = {"duration_ms": 90500, "duration_seconds": 91}

    assert postgres_store.resolve_duration_milliseconds(payload) == 90500
    assert postgres_store.resolve_duration_seconds(payload) == 90


def test_normalize_dive_fields_sets_explicit_sample_time_unit_from_existing_value():
    fields = postgres_store.normalize_dive_fields(
        {"sample_time_unit": "ms"},
        samples=[{"time_seconds": 12000}],
        duration_seconds=1200,
    )

    assert fields["sample_time_unit"] == "milliseconds"


def test_normalize_dive_fields_infers_sample_time_unit_for_millisecond_profiles():
    fields = postgres_store.normalize_dive_fields(
        {},
        samples=[{"time_seconds": 0}, {"time_seconds": 600000}],
        duration_seconds=1800,
    )

    assert fields["sample_time_unit"] == "milliseconds"


def test_normalize_dive_fields_infers_sample_time_unit_for_second_profiles():
    fields = postgres_store.normalize_dive_fields(
        {},
        samples=[{"time_seconds": 0}, {"time_seconds": 1200}],
        duration_seconds=1800,
    )

    assert fields["sample_time_unit"] == "seconds"


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


def test_sanitize_logbook_payload_stays_imported_without_commit_or_required_fields(monkeypatch):
    monkeypatch.setattr(postgres_store, "now_iso", lambda: "2026-03-24T12:00:00+00:00")

    payload = postgres_store.sanitize_logbook_payload({"site": "Blue Hole", "buddy": "", "guide": "Kai"})

    assert payload["status"] == "imported"
    assert "completed_at" not in payload


def test_sanitize_logbook_payload_preserves_complete_state_for_metadata_edits(monkeypatch):
    monkeypatch.setattr(postgres_store, "now_iso", lambda: "2026-03-24T12:00:00+00:00")

    payload = postgres_store.sanitize_logbook_payload(
        {"site": "Blue Hole", "buddy": "Sam", "guide": "Kai", "notes": "Updated notes"},
        {"status": "complete", "completed_at": "2026-03-20T08:00:00+00:00"},
    )

    assert payload["status"] == "complete"
    assert payload["completed_at"] == "2026-03-20T08:00:00+00:00"


def test_delete_dive_removes_matching_record():
    class FakeCursor:
        def __init__(self):
            self.deleted = True

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def execute(self, query, params):
            self.query = query
            self.params = params

        def fetchone(self):
            return {"id": 7} if self.deleted else None

    class FakeConnection:
        def __init__(self):
            self.cursor_instance = FakeCursor()
            self.committed = False

        def cursor(self):
            return self.cursor_instance

        def commit(self):
            self.committed = True

    conn = FakeConnection()

    deleted = postgres_store.delete_dive(conn, "user-1", 7)

    assert deleted is True
    assert "DELETE FROM dives" in conn.cursor_instance.query
    assert conn.cursor_instance.params == ("user-1", 7)
    assert conn.committed is True


def test_decode_base64_payload_accepts_valid_payload():
    payload = {"raw_data_b64": base64.b64encode(b"abc123").decode("ascii")}

    assert postgres_store.decode_base64_payload(payload) == b"abc123"


def test_decode_base64_payload_rejects_invalid_payload():
    with pytest.raises(ValueError, match="raw_data_b64 must be valid base64"):
        postgres_store.decode_base64_payload({"raw_data_b64": "not base64"})


def test_summarize_dives_calculates_average_fields():
    dives = [
        {
            "duration_seconds": 1800,
            "max_depth_m": 18.0,
            "fields": {"tanks": [{"beginpressure_bar": 200, "endpressure_bar": 130}]},
            "samples": [],
        },
        {
            "duration_seconds": 2400,
            "max_depth_m": 24.0,
            "fields": {},
            "samples": [{"tank_pressure_bar": {"0": 190}}, {"tank_pressure_bar": {"0": 120}}],
        },
    ]

    summary = postgres_store.summarize_dives(dives)

    assert summary["totalDives"] == 2
    assert summary["totalSeconds"] == 4200
    assert summary["averageDurationSeconds"] == 2100.0
    assert summary["averageMaxDepth"] == 21.0
    assert summary["totalBarConsumed"] == 140
