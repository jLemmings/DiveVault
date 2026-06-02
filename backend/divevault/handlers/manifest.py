from __future__ import annotations

from divevault.handlers import auth_users as auth_user_handlers
from divevault.handlers import backup as backup_handlers
from divevault.handlers import device_state as device_state_handlers
from divevault.handlers import dives as dive_handlers
from divevault.handlers import equipment as equipment_handlers
from divevault.handlers import exports as export_handlers
from divevault.handlers import geocode as geocode_handlers
from divevault.handlers import imports as import_handlers
from divevault.handlers import metrics as metrics_handlers
from divevault.handlers import profile as profile_handlers
from divevault.handlers.routes import (
    AUTH_ANY,
    AUTH_BROWSER_SESSION,
    AUTH_OWNER,
    AUTH_PRINCIPAL,
    Route,
    RoutePolicy,
    literal_route,
    regex_route,
    route_manifest,
)


def _handle_health(handler, _match, _parsed, _query, *, deps) -> None:
    database_ready = bool(getattr(handler.server, "database_ready", False))
    database_ready_error = getattr(handler.server, "database_ready_error", "")
    if not database_ready:
        payload = {
            "status": "starting",
            "database": "migrating",
        }
        if database_ready_error:
            payload["error"] = database_ready_error
        handler._send_json(503, payload)
        return
    handler._send_json(200, {"status": "ok"})


def _handle_config(handler, _match, _parsed, _query, *, deps) -> None:
    handler._send_config_js()


def _route_metrics(handler, _match, parsed, _query, *, deps) -> None:
    metrics_handlers.handle_get(handler, parsed.path)


def _route_profile_get(handler, _match, parsed, query, *, deps) -> None:
    profile_handlers.handle_get(handler, parsed.path, query, deps=deps)


def _route_profile_put(handler, _match, parsed, _query, *, deps) -> None:
    profile_handlers.handle_put(handler, parsed.path, deps=deps)


def _route_backup_get(handler, _match, parsed, _query, *, deps) -> None:
    backup_handlers.handle_get(handler, parsed.path, deps=deps)


def _route_backup_post(handler, _match, parsed, _query, *, deps) -> None:
    backup_handlers.handle_post(handler, parsed.path, deps=deps)


def _route_geocode_get(handler, _match, parsed, query, *, deps) -> None:
    geocode_handlers.handle_get(handler, parsed.path, query)


def _route_import_post(handler, _match, parsed, _query, *, deps) -> None:
    import_handlers.handle_post(handler, parsed.path, parsed, deps=deps)


def _route_auth_get(handler, _match, parsed, query, *, deps) -> None:
    auth_user_handlers.handle_get(handler, parsed.path, query, deps=deps)


def _route_auth_post(handler, _match, parsed, _query, *, deps) -> None:
    auth_user_handlers.handle_post(handler, parsed.path, deps=deps)


def _route_auth_put(handler, _match, parsed, _query, *, deps) -> None:
    auth_user_handlers.handle_put(handler, parsed.path, deps=deps)


def _route_auth_delete(handler, _match, parsed, _query, *, deps) -> None:
    auth_user_handlers.handle_delete(handler, parsed.path, deps=deps)


JSON_TYPES = frozenset({"application/json"})
BACKUP_IMPORT_TYPES = frozenset(backup_handlers.BACKUP_IMPORT_CONTENT_TYPES)
CSV_IMPORT_TYPES = frozenset(import_handlers.CSV_CONTENT_TYPES)
SUBSURFACE_IMPORT_TYPES = frozenset(import_handlers.SUBSURFACE_CONTENT_TYPES)
JSON_PRINCIPAL_BODY = RoutePolicy(
    auth=AUTH_PRINCIPAL,
    content_types=JSON_TYPES,
    max_body_attr="max_json_body_bytes",
    max_body_default=1024 * 1024,
)


ROUTES: list[Route] = [
    literal_route("GET", "/metrics", _route_metrics),
    literal_route("GET", "/health", _handle_health),
    literal_route("GET", "/api/health", _handle_health),
    literal_route("GET", "/config.js", _handle_config),
    regex_route("GET", r"/api/public/divers/([a-z0-9-]+)", _route_profile_get, sample_path="/api/public/divers/elias-thorne", label="/api/public/divers/{slug}"),
    literal_route("GET", "/api/profile", _route_profile_get, policy=RoutePolicy(auth=AUTH_PRINCIPAL)),
    literal_route("PUT", "/api/profile", _route_profile_put, policy=JSON_PRINCIPAL_BODY),
    regex_route("GET", r"/api/profile/licenses/([A-Za-z0-9_-]+)/pdf", _route_profile_get, sample_path="/api/profile/licenses/license-1/pdf", label="/api/profile/licenses/{id}/pdf", policy=RoutePolicy(auth=AUTH_PRINCIPAL)),
    regex_route("PUT", r"/api/profile/licenses/([A-Za-z0-9_-]+)/pdf", _route_profile_put, sample_path="/api/profile/licenses/license-1/pdf", label="/api/profile/licenses/{id}/pdf", policy=JSON_PRINCIPAL_BODY),
    literal_route("GET", "/api/backup/export", _route_backup_get, policy=RoutePolicy(auth=AUTH_PRINCIPAL)),
    literal_route("POST", "/api/backup/import", _route_backup_post, policy=RoutePolicy(auth=AUTH_PRINCIPAL, content_types=BACKUP_IMPORT_TYPES, max_body_attr="max_backup_import_bytes", max_body_default=25 * 1024 * 1024, rate_limit_scope="backup_import")),
    literal_route("GET", "/api/geocode/search", _route_geocode_get, policy=RoutePolicy(auth=AUTH_PRINCIPAL)),
    literal_route("POST", "/api/imports/csv", _route_import_post, policy=RoutePolicy(auth=AUTH_PRINCIPAL, content_types=CSV_IMPORT_TYPES, max_body_attr="max_csv_import_bytes", max_body_default=5 * 1024 * 1024, rate_limit_scope="dive_upload")),
    literal_route("POST", "/api/imports/subsurface", _route_import_post, policy=RoutePolicy(auth=AUTH_PRINCIPAL, content_types=SUBSURFACE_IMPORT_TYPES, max_body_attr="max_subsurface_import_bytes", max_body_default=15 * 1024 * 1024, rate_limit_scope="dive_upload")),
    literal_route("GET", "/api/auth/status", _route_auth_get),
    literal_route("GET", "/api/auth/me", _route_auth_get, policy=RoutePolicy(auth=AUTH_ANY)),
    literal_route("GET", "/api/auth/settings", _route_auth_get, policy=RoutePolicy(auth=AUTH_OWNER)),
    literal_route("PUT", "/api/auth/settings", _route_auth_put, policy=RoutePolicy(auth=AUTH_OWNER, content_types=JSON_TYPES, max_body_attr="max_json_body_bytes", max_body_default=1024 * 1024)),
    literal_route("PUT", "/api/auth/password", _route_auth_put, policy=RoutePolicy(auth=AUTH_ANY, content_types=JSON_TYPES, max_body_attr="max_json_body_bytes", max_body_default=1024 * 1024)),
    literal_route("POST", "/api/auth/register", _route_auth_post, policy=RoutePolicy(content_types=JSON_TYPES, max_body_attr="max_json_body_bytes", max_body_default=1024 * 1024)),
    literal_route("POST", "/api/auth/login", _route_auth_post, policy=RoutePolicy(content_types=JSON_TYPES, max_body_attr="max_json_body_bytes", max_body_default=1024 * 1024)),
    literal_route("POST", "/api/auth/invitations", _route_auth_post, policy=RoutePolicy(auth=AUTH_OWNER, content_types=JSON_TYPES, max_body_attr="max_json_body_bytes", max_body_default=1024 * 1024)),
    literal_route("GET", "/api/users", _route_auth_get, policy=RoutePolicy(auth=AUTH_OWNER)),
    literal_route("POST", "/api/users", _route_auth_post, policy=RoutePolicy(auth=AUTH_OWNER, content_types=JSON_TYPES, max_body_attr="max_json_body_bytes", max_body_default=1024 * 1024)),
    regex_route("PUT", r"/api/users/(user_[A-Za-z0-9]+)", _route_auth_put, sample_path="/api/users/user_abc123", label="/api/users/{id}", policy=RoutePolicy(auth=AUTH_OWNER, content_types=JSON_TYPES, max_body_attr="max_json_body_bytes", max_body_default=1024 * 1024)),
    regex_route("DELETE", r"/api/users/(user_[A-Za-z0-9]+)", _route_auth_delete, sample_path="/api/users/user_abc123", label="/api/users/{id}", policy=RoutePolicy(auth=AUTH_OWNER)),
    literal_route("GET", "/api/cli-auth/request", _route_auth_get, policy=RoutePolicy(rate_limit_scope="cli_auth_request_status")),
    literal_route("POST", "/api/cli-auth/request", _route_auth_post, policy=RoutePolicy(rate_limit_scope="cli_auth_request_create")),
    literal_route("POST", "/api/cli-auth/approve", _route_auth_post, policy=RoutePolicy(auth=AUTH_BROWSER_SESSION, content_types=JSON_TYPES, max_body_attr="max_json_body_bytes", max_body_default=1024 * 1024, rate_limit_scope="cli_auth_approve")),
    literal_route("GET", "/api/device-state", device_state_handlers.handle_get, policy=RoutePolicy(auth=AUTH_PRINCIPAL)),
    literal_route("PUT", "/api/device-state", device_state_handlers.handle_put, policy=JSON_PRINCIPAL_BODY),
    literal_route("GET", "/api/equipment", equipment_handlers.handle_get, policy=RoutePolicy(auth=AUTH_PRINCIPAL)),
    literal_route("PUT", "/api/equipment", equipment_handlers.handle_put, policy=JSON_PRINCIPAL_BODY),
    regex_route("POST", r"/api/equipment/([A-Za-z0-9_-]+)/service", equipment_handlers.handle_mark_serviced, sample_path="/api/equipment/equipment-1/service", label="/api/equipment/{id}/service", policy=RoutePolicy(auth=AUTH_PRINCIPAL)),
    literal_route("GET", "/api/exports/dives.csv", export_handlers.handle_dives_csv, policy=RoutePolicy(auth=AUTH_PRINCIPAL)),
    literal_route("GET", "/api/exports/dives.pdf", export_handlers.handle_dives_pdf, policy=RoutePolicy(auth=AUTH_PRINCIPAL)),
    literal_route("GET", "/api/dives", dive_handlers.handle_list, policy=RoutePolicy(auth=AUTH_PRINCIPAL)),
    literal_route("POST", "/api/dives", dive_handlers.handle_create, policy=RoutePolicy(auth=AUTH_PRINCIPAL, content_types=JSON_TYPES, max_body_attr="max_json_body_bytes", max_body_default=1024 * 1024, rate_limit_scope="dive_upload")),
    regex_route("GET", r"/api/dives/(\d+)", dive_handlers.handle_get_one, sample_path="/api/dives/1", label="/api/dives/{id}", policy=RoutePolicy(auth=AUTH_PRINCIPAL)),
    regex_route("PUT", r"/api/dives/(\d+)/logbook", dive_handlers.handle_update_logbook, sample_path="/api/dives/1/logbook", label="/api/dives/{id}/logbook", policy=JSON_PRINCIPAL_BODY),
    regex_route("DELETE", r"/api/dives/(\d+)", dive_handlers.handle_delete, sample_path="/api/dives/1", label="/api/dives/{id}", policy=RoutePolicy(auth=AUTH_PRINCIPAL)),
]

API_ROUTE_MANIFEST = route_manifest(ROUTES)
