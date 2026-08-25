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

- [x] Treat `contracts/api-routes.json` as the API route source of truth.
- [x] Add a Go route contract test that compares registered routes to `contracts/api-routes.json`.
- [x] Capture representative request and response fixtures from current Python tests.
- [x] Document status-code compatibility expectations for auth, validation, not found, method not allowed, unsupported media type, oversized body, and rate limits.
- [x] Document auth compatibility requirements for bearer tokens, session cookies, CLI sync tokens, owner/admin checks, and bootstrap registration.
- [x] Document database compatibility requirements for existing schema version `14` rows and JSONB payload shapes.

## Phase 2: Add Go Backend Skeleton

- [x] Add a Go module for the backend.
- [x] Add `cmd/divevault/main.go`.
- [x] Add internal packages for config, HTTP routing, handlers, auth, store, migrations, domain, importers, exports, geocode, metrics, and static assets.
- [x] Load env and flags matching the current Python backend names.
- [x] Implement graceful startup and shutdown.
- [x] Implement structured request logging.
- [x] Implement CORS headers matching current behavior.
- [x] Implement security headers matching current behavior.
- [x] Implement request body size enforcement.
- [x] Implement `GET /health`.
- [x] Implement `GET /api/health`.
- [x] Implement `GET /config.js`.
- [x] Implement static frontend serving with SPA fallback.

## Phase 3: Port PostgreSQL Layer And Migrations

- [x] Use `pgx/v5` and `pgxpool`.
- [x] Recreate the existing schema without redesigning tables.
- [x] Recreate `app_schema_version` behavior.
- [~] Recreate all migrations through schema version `14`.
- [x] Add `divevault migrate` or equivalent migration command.
- [x] Preserve `STARTUP_MIGRATIONS=enabled` startup migration behavior.
- [x] Preserve `STARTUP_MIGRATIONS=disabled` exact schema version check behavior.
- [x] Preserve startup DB wait and retry behavior.
- [ ] Add migration tests against real PostgreSQL.
- [ ] Verify a database already at schema version `14` starts under Go without data changes.

## Phase 4: Port Auth

- [x] Implement JWT issue and verify with current issuer, audience, secret, and TTL settings.
- [x] Preserve Authorization header and session cookie token extraction behavior.
- [x] Preserve current `scrypt$...` password hash verification.
- [x] Implement password hashing for newly created or changed passwords.
- [x] Implement `GET /api/auth/status`.
- [x] Implement `GET /api/auth/me`.
- [x] Implement `GET /api/auth/settings`.
- [x] Implement `PUT /api/auth/settings`.
- [x] Implement `PUT /api/auth/password`.
- [x] Implement `POST /api/auth/register`.
- [x] Implement `POST /api/auth/login`.
- [x] Implement `POST /api/auth/invitations`.
- [x] Implement `GET /api/users`.
- [x] Implement `POST /api/users`.
- [x] Implement `PUT /api/users/{id}`.
- [x] Implement `DELETE /api/users/{id}`.
- [x] Implement `GET /api/cli-auth/request`.
- [x] Implement `POST /api/cli-auth/request`.
- [x] Implement `POST /api/cli-auth/approve`.
- [~] Add auth unit and endpoint tests equivalent to current Python coverage.

## Phase 5: Port Core Domain APIs

- [x] Implement `GET /api/device-state`.
- [x] Implement `PUT /api/device-state`.
- [x] Implement `GET /api/profile`.
- [x] Implement `PUT /api/profile`.
- [x] Implement `GET /api/profile/licenses/{id}/pdf`.
- [x] Implement `PUT /api/profile/licenses/{id}/pdf`.
- [x] Implement `GET /api/public/divers/{slug}`.
- [x] Implement `GET /api/equipment`.
- [x] Implement `PUT /api/equipment`.
- [x] Implement `POST /api/equipment/{id}/service`.
- [x] Implement `GET /api/dives`.
- [x] Implement `POST /api/dives`.
- [x] Implement `GET /api/dives/{id}`.
- [x] Implement `PUT /api/dives/{id}/logbook`.
- [x] Implement `DELETE /api/dives/{id}`.
- [~] Preserve JSONB field normalization for dives, profiles, equipment, logbook, samples, and import payloads.
- [~] Preserve pagination, sorting, duplicate-dive handling, and sample inclusion behavior.

## Phase 6: Port Importers, Exports, And Backup

- [x] Implement `POST /api/imports/csv`.
- [~] Preserve CSV dry-run, validation summary, duplicate marking, and payload normalization.
- [ ] Implement `POST /api/imports/subsurface`.
- [ ] Preserve XML, gzip, zip, size-limit, sample, pressure, location, duration, and depth parsing behavior.
- [x] Implement `GET /api/exports/dives.csv`.
- [~] Implement `GET /api/exports/dives.pdf`.
- [~] Implement `GET /api/backup/export`.
- [~] Implement `POST /api/backup/import`.
- [ ] Verify Python backup exports import correctly into Go.
- [ ] Verify Go backup exports import correctly into Go.
- [ ] Verify backup archive path safety behavior.

## Phase 7: Port Runtime Integrations

- [x] Implement `GET /api/geocode/search`.
- [x] Preserve Nominatim base URL, user-agent, optional email, timeout, and error behavior.
- [x] Implement `/metrics`.
- [~] Preserve Prometheus metric names and labels expected by existing tests.
- [x] Implement fixed-window rate limiting with current scopes and env-controlled limits.
- [x] Preserve demo mode admin bootstrap behavior.

## Phase 8: Replace Docker, CI, And Deployment Commands

- [x] Rewrite `backend/Dockerfile` to build a Go backend binary.
- [x] Keep the frontend build stage and copy built assets into the runtime image.
- [x] Remove Python from the final runtime image.
- [x] Replace Docker Compose migration command with the Go migration command.
- [x] Replace Kubernetes migration Job command with the Go migration command.
- [x] Update GitHub Actions backend setup from Python/pytest to Go tests.
- [x] Update full-application tests to start the Go backend.
- [x] Preserve image version tagging from `frontend/package.json`.
- [x] Update `README.md`.
- [x] Update `docs/DEVELOPMENT.md`.
- [x] Update `examples/kubernetes/README.md`.
- [x] Update `AGENTS.md`.

## Phase 9: Verification Gate Before Python Deletion

- [x] Go unit tests pass.
- [x] Go endpoint tests pass.
- [x] Go route contract test passes against `contracts/api-routes.json`.
- [ ] Go migration tests pass against PostgreSQL.
- [ ] Frontend Playwright tests pass against mocked API fixtures.
- [ ] Full application tests pass against the Go backend.
- [!] Docker image smoke test passes.
- [ ] Published-image smoke test passes.
- [x] Kubernetes example references only Go backend commands.
- [~] Repo search confirms no backend runtime dependency on Python remains.

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

- [x] Decide whether the Go module starts as `backend-go/` for parallel development or replaces `backend/` immediately.
- [x] Decide whether migrations live inside the backend binary as `divevault migrate` or as a separate migration binary.
- [~] Decide which PDF library to use if the current PDF export cannot be recreated with simple generated PDF output.
- [ ] Decide whether to keep the current route manifest JSON manually maintained or generate it from Go route registration.

## Progress Notes

- 2026-08-25: Initial rewrite tracker created from the current Python backend inventory and API contract.
- 2026-08-25: Started Phase 1 and Phase 2 with a dependency-free Go backend skeleton in `backend-go/`, a shared API route contract test, representative Python response fixtures in `backend-go/testdata/python-response-fixtures.json`, compatibility notes in `docs/BACKEND_GO_COMPATIBILITY.md`, health/config/static serving, basic route matching, CORS/security headers, request logging, graceful shutdown, and body limit enforcement. Go is not installed in the current environment, so Go tests were written but not executed.
- 2026-08-25: Started Phase 3 and Phase 4. Added `pgx/v5` store wiring, DB startup wait, `divevault migrate`, schema version checks, latest schema creation, migration runner through version 14, and database-backed auth/users/invites/CLI sync endpoints. Added JWT/scrypt auth helpers and initial auth/migration tests. Remaining Phase 3 risk: real PostgreSQL migration tests are still needed, and legacy data backfills for old profile collection migrations should be checked against real pre-v14 data.
- 2026-08-25: Chose parallel development in `backend-go/` and an in-binary migration subcommand, `divevault migrate`.
- 2026-08-25: Added GitHub Actions `actions/setup-go@v7` plus `go test ./...` coverage for `backend-go` in feature branch, backend image, and full application workflows. Installed Go locally as a workspace-local archive under ignored `.tools/` after system installers were blocked, generated `backend-go/go.sum`, and verified `go test ./...` passes locally with Go `1.25.14`.
- 2026-08-25: Started Phase 5 and Phase 6. Added Go store and handlers for device state, dives, profile, public profile, profile license PDFs, equipment, CSV import, CSV export, placeholder PDF export, and JSON/ZIP backup export/import basics. `go test ./...` passes with workspace-local Go. Remaining parity gaps: Subsurface import is still not implemented, PDF export is a minimal placeholder, profile collection persistence is basic, backup import/export does not yet fully match the Python archive contract, and endpoint tests against PostgreSQL are still needed.
- 2026-08-25: Started Phase 7 and Phase 8. Added geocode, metrics, fixed-window rate limiting, demo admin bootstrap, a Go runtime Dockerfile, Go migration commands in Compose and Kubernetes, Go backend CI checks, and Go full-application startup. Phase 10 Python deletion has not started.
- 2026-08-25: Ran `gofmt -w .`, `go test ./...`, and `go build ./cmd/divevault` successfully from `backend-go/` using the workspace-local Go toolchain. Docker smoke testing is blocked locally because the Docker daemon is not running in this environment.
