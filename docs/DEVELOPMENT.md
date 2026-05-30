# DiveVault Development Guide

This document is for contributors and maintainers. The main README is intentionally focused on regular users and quick instance setup.

## Repository Layout

- Backend: stdlib `http.server` application in `backend/divevault/app.py`.
- API/runtime: serves `/api/*`, `/health`, `/config.js`, and built frontend assets from `FRONTEND_DIR`.
- Database: PostgreSQL schema and migrations live in `backend/divevault/postgres_store.py`.
- Frontend: Vue 3 and Vite app under `frontend/`.
- Frontend entrypoint: `frontend/src/main.js`.
- Root component and router state: `frontend/src/app.js`.
- Views: plain JavaScript Vue component objects in `frontend/src/components/`.
- Frontend env: loaded from the repository root by `vite.config.js`.
- Dev API proxy: `VITE_API_PROXY_TARGET`, defaulting to `http://127.0.0.1:8000`.

When adding database migrations, update `CURRENT_SCHEMA_VERSION` in `backend/divevault/postgres_store.py`.

## Local Backend

Create a virtual environment, install development dependencies, copy the sample environment, and start the backend:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements-dev.txt
Copy-Item .env.example .env
$env:PYTHONPATH = "backend"
python -m divevault.app --database-url postgresql://dive:dive@localhost:5432/dive
```

The backend expects PostgreSQL to be available unless tests are using fakes or mocks. The Docker Compose setup in `examples/docker/docker-compose.yml` is the easiest way to get a local database.

## Local Frontend

Install dependencies and start the Vite development server:

```powershell
Set-Location frontend
npm ci
npm run dev
```

The frontend runs on `http://localhost:5173` by default and proxies API requests to `VITE_API_PROXY_TARGET`.

## Migrations

For local single-instance development, startup migrations are enabled by default.

For external migration workflows, set `DATABASE_URL` and run:

```powershell
$env:PYTHONPATH = "backend"
python -m migrations.migrate_postgres_schema
```

For multi-instance deployments, run migrations as a separate job and set:

```text
STARTUP_MIGRATIONS=disabled
```

## Testing

Run backend tests from the repository root:

```powershell
$env:PYTHONPATH = "backend"
python -m pytest -vv -ra backend/tests
```

Focused backend example:

```powershell
$env:PYTHONPATH = "backend"
python -m pytest -vv -ra backend/tests/test_dive_backend_units.py -k normalize_bearer_token
```

Run frontend tests from `frontend/`:

```powershell
npm test
```

`npm run build` runs Playwright first and then `vite build`. Use `npm run build:app` only when you intentionally want to build the app without running the Playwright test suite.

There are no configured lint, formatter, or typecheck scripts in the current manifests.

## Readme Screenshots

Readme screenshots are stored in `docs/readme/`. To refresh them:

```powershell
Set-Location frontend
npm run screenshots:readme
```

## Runtime Configuration

The backend loads `.env` from the repository root on import/startup. Important settings are documented in `.env.example`.

Common runtime settings include:

- `DATABASE_URL`
- `AUTH_JWT_SECRET`
- `AUTH_JWT_ISSUER`
- `AUTH_JWT_AUDIENCE`
- `STARTUP_MIGRATIONS`
- `FRONTEND_DIR`
- `VITE_API_PROXY_TARGET`

Prometheus metrics are exposed at `/metrics` when metrics are enabled.

## Docker And Releases

The backend Docker image is built from `backend/Dockerfile`. It first builds frontend assets with Node `24.15.0`, then runs the backend on Python `3.14-slim`.

CI publishes image and release version tags from `frontend/package.json`, not from a backend manifest.

## Architecture Notes

Backend responsibilities:

- Store imported dive telemetry and committed logbook entries.
- Keep imported drafts separate from completed dives.
- Track device sync state.
- Serve backend API endpoints and static frontend assets.
- Provide health, config, and metrics endpoints.

Frontend responsibilities:

- Import review queue.
- Dive logbook, detail, creation, and editing flows.
- Dashboard, maps, saved locations, equipment, settings, and public profile views.
- Browser approval flow for desktop sync requests.

## Related Upstream Projects

DiveVault imports dive computer data through libdivecomputer-compatible workflows:

- `https://github.com/libdivecomputer/libdivecomputer`
- `https://www.libdivecomputer.org/`
