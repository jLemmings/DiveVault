# Backend Go Rewrite Plan

This file is the working tracker for replacing the Python backend with Go and removing Python from the backend runtime, tests, CI, Docker image, and deployment examples.

Status legend:

- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
- `[!]` Blocked or needs decision

Current baseline:

- Python backend entrypoint: `backend/divevault/app.py`
- Route manifest: `backend/divevault/handlers/manifest.py`
- Shared API contract: `contracts/api-routes.json`
- PostgreSQL schema and migrations: `backend/divevault/postgres_store.py`
- Current database schema version: `14`
- Current migration command: `python -m migrations.migrate_postgres_schema`
- Current backend image runtime: `python:3.14-slim`

## Phase 1: Freeze Compatibility Contract

- [ ] Treat `contracts/api-routes.json` as the API route source of truth.
- [ ] Add a Go route contract test that compares registered routes to `contracts/api-routes.json`.
- [ ] Capture representative request and response fixtures from current Python tests.
- [ ] Document status-code compatibility expectations for auth, validation, not found, method not allowed, unsupported media type, oversized body, and rate limits.
- [ ] Document auth compatibility requirements for bearer tokens, session cookies, CLI sync tokens, owner/admin checks, and bootstrap registration.
- [ ] Document database compatibility requirements for existing schema version `14` rows and JSONB payload shapes.

## Phase 2: Add Go Backend Skeleton

- [ ] Add a Go module for the backend.
- [ ] Add `cmd/divevault/main.go`.
- [ ] Add internal packages for config, HTTP routing, handlers, auth, store, migrations, domain, importers, exports, geocode, metrics, and static assets.
- [ ] Load env and flags matching the current Python backend names.
- [ ] Implement graceful startup and shutdown.
- [ ] Implement structured request logging.
- [ ] Implement CORS headers matching current behavior.
- [ ] Implement security headers matching current behavior.
- [ ] Implement request body size enforcement.
- [ ] Implement `GET /health`.
- [ ] Implement `GET /api/health`.
- [ ] Implement `GET /config.js`.
- [ ] Implement static frontend serving with SPA fallback.

## Phase 3: Port PostgreSQL Layer And Migrations

- [ ] Use `pgx/v5` and `pgxpool`.
- [ ] Recreate the existing schema without redesigning tables.
- [ ] Recreate `app_schema_version` behavior.
- [ ] Recreate all migrations through schema version `14`.
- [ ] Add `divevault migrate` or equivalent migration command.
- [ ] Preserve `STARTUP_MIGRATIONS=enabled` startup migration behavior.
- [ ] Preserve `STARTUP_MIGRATIONS=disabled` exact schema version check behavior.
- [ ] Preserve startup DB wait and retry behavior.
- [ ] Add migration tests against real PostgreSQL.
- [ ] Verify a database already at schema version `14` starts under Go without data changes.

## Phase 4: Port Auth

- [ ] Implement JWT issue and verify with current issuer, audience, secret, and TTL settings.
- [ ] Preserve Authorization header and session cookie token extraction behavior.
- [ ] Preserve current `scrypt$...` password hash verification.
- [ ] Implement password hashing for newly created or changed passwords.
- [ ] Implement `GET /api/auth/status`.
- [ ] Implement `GET /api/auth/me`.
- [ ] Implement `GET /api/auth/settings`.
- [ ] Implement `PUT /api/auth/settings`.
- [ ] Implement `PUT /api/auth/password`.
- [ ] Implement `POST /api/auth/register`.
- [ ] Implement `POST /api/auth/login`.
- [ ] Implement `POST /api/auth/invitations`.
- [ ] Implement `GET /api/users`.
- [ ] Implement `POST /api/users`.
- [ ] Implement `PUT /api/users/{id}`.
- [ ] Implement `DELETE /api/users/{id}`.
- [ ] Implement `GET /api/cli-auth/request`.
- [ ] Implement `POST /api/cli-auth/request`.
- [ ] Implement `POST /api/cli-auth/approve`.
- [ ] Add auth unit and endpoint tests equivalent to current Python coverage.

## Phase 5: Port Core Domain APIs

- [ ] Implement `GET /api/device-state`.
- [ ] Implement `PUT /api/device-state`.
- [ ] Implement `GET /api/profile`.
- [ ] Implement `PUT /api/profile`.
- [ ] Implement `GET /api/profile/licenses/{id}/pdf`.
- [ ] Implement `PUT /api/profile/licenses/{id}/pdf`.
- [ ] Implement `GET /api/public/divers/{slug}`.
- [ ] Implement `GET /api/equipment`.
- [ ] Implement `PUT /api/equipment`.
- [ ] Implement `POST /api/equipment/{id}/service`.
- [ ] Implement `GET /api/dives`.
- [ ] Implement `POST /api/dives`.
- [ ] Implement `GET /api/dives/{id}`.
- [ ] Implement `PUT /api/dives/{id}/logbook`.
- [ ] Implement `DELETE /api/dives/{id}`.
- [ ] Preserve JSONB field normalization for dives, profiles, equipment, logbook, samples, and import payloads.
- [ ] Preserve pagination, sorting, duplicate-dive handling, and sample inclusion behavior.

## Phase 6: Port Importers, Exports, And Backup

- [ ] Implement `POST /api/imports/csv`.
- [ ] Preserve CSV dry-run, validation summary, duplicate marking, and payload normalization.
- [ ] Implement `POST /api/imports/subsurface`.
- [ ] Preserve XML, gzip, zip, size-limit, sample, pressure, location, duration, and depth parsing behavior.
- [ ] Implement `GET /api/exports/dives.csv`.
- [ ] Implement `GET /api/exports/dives.pdf`.
- [ ] Implement `GET /api/backup/export`.
- [ ] Implement `POST /api/backup/import`.
- [ ] Verify Python backup exports import correctly into Go.
- [ ] Verify Go backup exports import correctly into Go.
- [ ] Verify backup archive path safety behavior.

## Phase 7: Port Runtime Integrations

- [ ] Implement `GET /api/geocode/search`.
- [ ] Preserve Nominatim base URL, user-agent, optional email, timeout, and error behavior.
- [ ] Implement `/metrics`.
- [ ] Preserve Prometheus metric names and labels expected by existing tests.
- [ ] Implement fixed-window rate limiting with current scopes and env-controlled limits.
- [ ] Preserve demo mode admin bootstrap behavior.

## Phase 8: Replace Docker, CI, And Deployment Commands

- [ ] Rewrite `backend/Dockerfile` to build a Go backend binary.
- [ ] Keep the frontend build stage and copy built assets into the runtime image.
- [ ] Remove Python from the final runtime image.
- [ ] Replace Docker Compose migration command with the Go migration command.
- [ ] Replace Kubernetes migration Job command with the Go migration command.
- [ ] Update GitHub Actions backend setup from Python/pytest to Go tests.
- [ ] Update full-application tests to start the Go backend.
- [ ] Preserve image version tagging from `frontend/package.json`.
- [ ] Update `README.md`.
- [ ] Update `docs/DEVELOPMENT.md`.
- [ ] Update `examples/kubernetes/README.md`.
- [ ] Update `AGENTS.md`.

## Phase 9: Verification Gate Before Python Deletion

- [ ] Go unit tests pass.
- [ ] Go endpoint tests pass.
- [ ] Go route contract test passes against `contracts/api-routes.json`.
- [ ] Go migration tests pass against PostgreSQL.
- [ ] Frontend Playwright tests pass against mocked API fixtures.
- [ ] Full application tests pass against the Go backend.
- [ ] Docker image smoke test passes.
- [ ] Published-image smoke test passes.
- [ ] Kubernetes example references only Go backend commands.
- [ ] Repo search confirms no backend runtime dependency on Python remains.

## Phase 10: Remove Python Backend

- [ ] Delete `backend/divevault/**/*.py`.
- [ ] Delete `backend/migrations/*.py`.
- [ ] Delete `backend/tests/*.py`.
- [ ] Delete `backend/requirements.txt`.
- [ ] Delete `backend/requirements-dev.txt`.
- [ ] Remove Python setup from CI.
- [ ] Remove Python backend setup from docs.
- [ ] Rename or reorganize the Go module so `backend/` is the canonical backend location.
- [ ] Run final repo-wide search for `python`, `pytest`, `pip`, `requirements`, and `migrations.migrate_postgres_schema`.
- [ ] Confirm remaining Python references, if any, are unrelated to backend runtime.

## Open Decisions

- [ ] Decide whether the Go module starts as `backend-go/` for parallel development or replaces `backend/` immediately.
- [ ] Decide whether migrations live inside the backend binary as `divevault migrate` or as a separate migration binary.
- [ ] Decide which PDF library to use if the current PDF export cannot be recreated with simple generated PDF output.
- [ ] Decide whether to keep the current route manifest JSON manually maintained or generate it from Go route registration.

## Progress Notes

- 2026-08-25: Initial rewrite tracker created from the current Python backend inventory and API contract.
