from __future__ import annotations

import json
from pathlib import Path

from divevault.handlers.manifest import API_ROUTE_MANIFEST


CONTRACT_PATH = Path(__file__).resolve().parents[2] / "contracts" / "api-routes.json"


def _normalize_manifest_path(route: dict) -> str:
    return route.get("label") or route["path"]


def test_backend_routes_match_shared_api_contract():
    expected = {
        (entry["method"], entry["path"])
        for entry in json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    }
    actual = {
        (route["method"], _normalize_manifest_path(route))
        for route in API_ROUTE_MANIFEST
        if route["path"].startswith("/api/") or route["sample_path"].startswith("/api/")
    }

    assert actual == expected
