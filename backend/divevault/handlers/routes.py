from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field


AUTH_NONE = "none"
AUTH_ANY = "auth"
AUTH_PRINCIPAL = "principal"
AUTH_OWNER = "owner"
AUTH_BROWSER_SESSION = "browser_session"


@dataclass(frozen=True)
class RoutePolicy:
    auth: str = AUTH_NONE
    content_types: frozenset[str] = field(default_factory=frozenset)
    max_body_attr: str | None = None
    max_body_default: int | None = None
    rate_limit_scope: str | None = None


@dataclass(frozen=True)
class Route:
    method: str
    path: str
    handler: Callable
    label: str | None = None
    pattern: re.Pattern | None = None
    sample_path: str | None = None
    policy: RoutePolicy = field(default_factory=RoutePolicy)

    @property
    def route_label(self) -> str:
        return self.label or self.path

    @property
    def manifest_path(self) -> str:
        return f"regex:{self.pattern.pattern}" if self.pattern is not None else self.path

    def match(self, path: str):
        if self.pattern is not None:
            return self.pattern.fullmatch(path)
        return True if path == self.path else None


def literal_route(method: str, path: str, handler: Callable, *, policy: RoutePolicy | None = None, label: str | None = None) -> Route:
    return Route(method=method, path=path, handler=handler, policy=policy or RoutePolicy(), label=label)


def regex_route(
    method: str,
    pattern: str,
    handler: Callable,
    *,
    sample_path: str,
    label: str,
    policy: RoutePolicy | None = None,
) -> Route:
    return Route(
        method=method,
        path=pattern,
        pattern=re.compile(pattern),
        sample_path=sample_path,
        label=label,
        handler=handler,
        policy=policy or RoutePolicy(),
    )


def match_route(routes: list[Route], method: str, path: str) -> tuple[Route | None, object | None]:
    for route in routes:
        if route.method != method:
            continue
        match = route.match(path)
        if match:
            return route, match if match is not True else None
    return None, None


def allowed_methods_for_path(routes: list[Route], path: str) -> list[str]:
    methods: set[str] = set()
    for route in routes:
        if route.match(path):
            methods.add(route.method)
    return sorted(methods)


def route_manifest(routes: list[Route]) -> list[dict]:
    return [
        {
            "method": route.method,
            "path": route.manifest_path,
            "sample_path": route.sample_path or route.path,
            "auth": route.policy.auth,
            "content_types": sorted(route.policy.content_types),
            "rate_limit_scope": route.policy.rate_limit_scope,
            "max_body_attr": route.policy.max_body_attr,
        }
        for route in routes
    ]
