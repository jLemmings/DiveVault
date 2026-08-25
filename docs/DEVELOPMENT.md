# DiveVault Development Guide

This document is for contributors and maintainers. The main README is intentionally focused on regular users and quick instance setup.

## Repository Layout

- Backend: Go HTTP service in `backend-go/cmd/divevault`.
- API/runtime: serves `/api/*`, `/health`, `/config.js`, and built frontend assets from `FRONTEND_DIR`.
- Database: PostgreSQL schema and migrations live in `backend-go/internal/migrations`.
- Frontend: Nuxt-powered Vue 3 app under `frontend/`, with Nuxt UI registered as the component library.
- Frontend entrypoint: `frontend/app/app.vue`, which wraps the app in Nuxt UI's app provider and mounts the DiveVault shell.
- Frontend shell: `frontend/app/components/DiveVaultApp.vue`; the current route/state controller is `frontend/app/features/app/AppRouteController.vue`.
- Frontend route records and path-to-state mapping live together in `frontend/app/routing/routes.js`.
- Feature views live under `frontend/app/features/`; reusable cross-feature code lives under `frontend/app/shared/{components,composables,utils}`.
- Frontend env: loaded from the repository root by Nuxt configuration in `frontend/nuxt.config.js`.
- Dev API proxy: `VITE_API_PROXY_TARGET`, defaulting to `http://127.0.0.1:8000`.
- Import aliases use Nuxt app-root paths by default: `~/features/...`, `~/shared/...`, `~/routing/...`, and `~/i18n/...`. `nuxt.config.js` also defines `#features`, `#shared`, `#routing`, and `#i18n` for explicit infrastructure imports.
- AI-assisted Nuxt UI work should read `frontend/llms.txt` first for the project-local Nuxt UI LLM context and official documentation links.

When adding database migrations, update `CurrentSchemaVersion` in `backend-go/internal/migrations`.

## Local Backend

Copy the sample environment and start the backend:

```powershell
Copy-Item .env.example .env
Set-Location backend-go
go run ./cmd/divevault --database-url postgresql://dive:dive@localhost:5432/dive
```

The backend expects PostgreSQL to be available unless tests are using fakes or mocks. The Docker Compose setup in `examples/docker/docker-compose.yml` is the easiest way to get a local database.

## Local Frontend

Install dependencies and start the Nuxt development server:

```powershell
Set-Location frontend
npm ci
npm run dev
```

The frontend runs on Nuxt’s default development port unless `--port` is provided, and proxies API requests to `VITE_API_PROXY_TARGET`.

## Migrations

For local single-instance development, startup migrations are enabled by default.

For external migration workflows, set `DATABASE_URL` and run:

```powershell
Set-Location backend-go
go run ./cmd/divevault migrate --database-url $env:DATABASE_URL
```

For multi-instance deployments, run migrations as a separate job and set:

```text
STARTUP_MIGRATIONS=disabled
```

## Testing

Run backend tests from the repository root:

```powershell
Set-Location backend-go
go test ./...
```

Focused backend example:

```powershell
Set-Location backend-go
go test ./internal/auth -run Test
```

Run frontend tests from `frontend/`:

```powershell
npm test
```

Check structural and API contract guardrails from `frontend/`:

```powershell
npm run check:structure
npm run check:contracts
```

`npm run build` runs Playwright first and then `nuxt generate`. Use `npm run build:app` only when you intentionally want to generate the Nuxt app without running the Playwright test suite.

Frontend linting and formatting are available with:

```powershell
npm run lint
npm run format:check
```

There is no configured frontend typecheck script.

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

The backend Docker image is built from `backend/Dockerfile`. It builds frontend assets with Node, compiles the Go backend binary, and runs without Python in the final image.

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
