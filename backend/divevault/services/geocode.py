from __future__ import annotations

import json
import threading
import time
from urllib import error as urlerror
from urllib import request as urlrequest
from urllib.parse import urlencode


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

