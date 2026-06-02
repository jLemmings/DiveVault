from __future__ import annotations

from pathlib import Path


def resolve_repo_path(repo_root: Path, path_value: str | Path) -> Path:
    path = Path(path_value)
    if not path.is_absolute():
        path = repo_root / path
    return path.resolve()


def resolve_frontend_dir(repo_root: Path, frontend_dir: str | Path) -> Path:
    resolved = resolve_repo_path(repo_root, frontend_dir)
    if resolved.exists():
        return resolved

    legacy_dir = resolved.parent if resolved.name == "dist" else None
    if legacy_dir and (legacy_dir / "index.html").is_file():
        return legacy_dir
    return resolved


def frontend_asset_path(frontend_dir: Path, request_path: str) -> Path:
    relative = request_path.lstrip("/") or "index.html"
    candidate = (frontend_dir / relative).resolve()
    frontend_root = frontend_dir.resolve()
    if frontend_root not in candidate.parents and candidate != frontend_root:
        return frontend_root / "index.html"
    if candidate.is_file():
        return candidate
    return frontend_root / "index.html"
