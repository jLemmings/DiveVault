from __future__ import annotations

import threading
import time


class FixedWindowRateLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._windows: dict[str, dict[str, int]] = {}

    def allow(self, key: str, *, limit: int, window_seconds: int, now: int | None = None) -> tuple[bool, int]:
        if limit <= 0:
            return True, 0
        now_ts = int(now if now is not None else time.time())
        window = max(int(window_seconds), 1)
        current_window_start = now_ts - (now_ts % window)
        expires_at = current_window_start + window
        with self._lock:
            stale_keys = [
                existing_key
                for existing_key, existing_entry in self._windows.items()
                if int(existing_entry.get("expires_at", 0)) <= now_ts
            ]
            for stale_key in stale_keys:
                self._windows.pop(stale_key, None)

            entry = self._windows.get(key)
            if entry is None or entry["window_start"] != current_window_start:
                entry = {"window_start": current_window_start, "expires_at": expires_at, "count": 0}
                self._windows[key] = entry
            if entry["count"] >= limit:
                return False, max(expires_at - now_ts, 1)
            entry["count"] += 1
            entry["expires_at"] = expires_at
            return True, max(expires_at - now_ts, 1)
