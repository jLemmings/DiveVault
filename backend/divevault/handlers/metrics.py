from __future__ import annotations

import re
import threading
import time


class PrometheusMetrics:
    ROUTE_LABEL_PATTERNS = (
        (re.compile(r"/api/dives/\d+"), "/api/dives/{id}"),
        (re.compile(r"/api/dives/\d+/logbook"), "/api/dives/{id}/logbook"),
        (re.compile(r"/api/equipment/[A-Za-z0-9_-]+/service"), "/api/equipment/{id}/service"),
        (re.compile(r"/api/profile/licenses/[A-Za-z0-9_-]+/pdf"), "/api/profile/licenses/{id}/pdf"),
        (re.compile(r"/api/public/divers/[a-z0-9-]+"), "/api/public/divers/{slug}"),
        (re.compile(r"/api/users/user_[A-Za-z0-9]+"), "/api/users/{id}"),
    )

    def __init__(self, *, started_at: float | None = None) -> None:
        self.started_at = float(started_at if started_at is not None else time.time())
        self._lock = threading.Lock()
        self._requests: dict[tuple[str, str, str], int] = {}
        self._duration_count: dict[tuple[str, str], int] = {}
        self._duration_sum: dict[tuple[str, str], float] = {}

    @staticmethod
    def route_label(path: str) -> str:
        if path in {
            "/health",
            "/api/health",
            "/metrics",
            "/config.js",
            "/api/dives",
            "/api/equipment",
            "/api/profile",
            "/api/users",
            "/api/device-state",
            "/api/backup/export",
            "/api/backup/import",
            "/api/cli-auth/approve",
            "/api/cli-auth/request",
            "/api/auth/invitations",
            "/api/auth/login",
            "/api/auth/me",
            "/api/auth/password",
            "/api/auth/register",
            "/api/auth/settings",
            "/api/auth/status",
            "/api/exports/dives.csv",
            "/api/exports/dives.pdf",
            "/api/imports/csv",
            "/api/imports/subsurface",
            "/api/geocode/search",
        }:
            return path
        for pattern, label in PrometheusMetrics.ROUTE_LABEL_PATTERNS:
            if pattern.fullmatch(path):
                return label
        if path.startswith("/api/"):
            return "/api/*"
        return "frontend"

    def observe_request(self, *, method: str, path: str, status: int, duration_seconds: float) -> None:
        route = self.route_label(path)
        status_class = f"{int(status) // 100}xx"
        with self._lock:
            self._requests[(method, route, status_class)] = self._requests.get((method, route, status_class), 0) + 1
            self._duration_count[(method, route)] = self._duration_count.get((method, route), 0) + 1
            self._duration_sum[(method, route)] = self._duration_sum.get((method, route), 0.0) + max(duration_seconds, 0.0)

    @staticmethod
    def _labels(labels: dict[str, str]) -> str:
        def escape(value: str) -> str:
            return value.replace("\\", "\\\\").replace('"', '\\"')

        return ",".join(f'{key}="{escape(value)}"' for key, value in labels.items())

    def render(self, *, database_ready: bool, schema_version: object) -> bytes:
        with self._lock:
            requests = dict(self._requests)
            duration_count = dict(self._duration_count)
            duration_sum = dict(self._duration_sum)
        lines = [
            "# HELP divevault_up Whether the DiveVault backend process is running.",
            "# TYPE divevault_up gauge",
            "divevault_up 1",
            "# HELP divevault_database_ready Whether startup database checks and migrations completed.",
            "# TYPE divevault_database_ready gauge",
            f"divevault_database_ready {1 if database_ready else 0}",
            "# HELP divevault_schema_version Current application schema version observed at startup.",
            "# TYPE divevault_schema_version gauge",
            f"divevault_schema_version {int(schema_version or 0)}",
            "# HELP divevault_process_start_time_seconds Unix timestamp when the backend process started.",
            "# TYPE divevault_process_start_time_seconds gauge",
            f"divevault_process_start_time_seconds {self.started_at:.3f}",
            "# HELP divevault_http_requests_total HTTP requests by method, route, and status class.",
            "# TYPE divevault_http_requests_total counter",
        ]
        for (method, route, status_class), value in sorted(requests.items()):
            labels = self._labels({"method": method, "route": route, "status_class": status_class})
            lines.append(f"divevault_http_requests_total{{{labels}}} {value}")
        lines.extend(
            [
                "# HELP divevault_http_request_duration_seconds_count HTTP request duration count by method and route.",
                "# TYPE divevault_http_request_duration_seconds_count counter",
            ]
        )
        for (method, route), value in sorted(duration_count.items()):
            labels = self._labels({"method": method, "route": route})
            lines.append(f"divevault_http_request_duration_seconds_count{{{labels}}} {value}")
        lines.extend(
            [
                "# HELP divevault_http_request_duration_seconds_sum HTTP request duration sum by method and route.",
                "# TYPE divevault_http_request_duration_seconds_sum counter",
            ]
        )
        for (method, route), value in sorted(duration_sum.items()):
            labels = self._labels({"method": method, "route": route})
            lines.append(f"divevault_http_request_duration_seconds_sum{{{labels}}} {value:.6f}")
        return ("\n".join(lines) + "\n").encode("utf-8")


def handle_get(handler, path: str) -> bool:
    if path != "/metrics":
        return False
    if not bool(getattr(handler.server, "metrics_enabled", False)):
        handler._send_json(404, {"error": "Not found"})
        return True
    metrics = getattr(handler.server, "metrics", None)
    if metrics is None:
        handler._send_json(503, {"error": "Metrics collector is not configured"})
        return True
    handler._send_bytes(
        200,
        metrics.render(
            database_ready=bool(getattr(handler.server, "database_ready", False)),
            schema_version=getattr(handler.server, "database_schema_version", 0),
        ),
        "text/plain; version=0.0.4; charset=utf-8",
        extra_headers={"Cache-Control": "no-store"},
    )
    return True
