# DiveVault

This project is heavily developed with AI. Use at your own risk!

DiveVault is a dive log backend and web UI for storing, reviewing, and completing dive computer imports.

This repository contains:

- A Python backend that accepts authenticated dive uploads and serves dive data from PostgreSQL
- A Vue frontend for reviewing imported dives, completing logbook metadata, and browsing committed dives
- Docker packaging for running PostgreSQL, the backend, and the built frontend together

The project is structured around a two-stage workflow:

1. A companion desktop importer reads raw telemetry from a dive computer and uploads it here.
2. DiveVault keeps the imported record in a staging queue until the diver fills in logbook fields such as site, buddy, and guide.

## What This Project Does

DiveVault stores both the original imported telemetry and the diver-completed logbook record.

Key capabilities:

- Authenticated dive ingestion with per-user isolation
- PostgreSQL-backed storage for dives and device sync state
- Imported-vs-committed workflow for logbook completion
- Desktop sync approval flow using short-lived backend-issued tokens
- Static frontend served directly by the Python backend in production
- Docker-based local deployment

## Companion Importer Project

This repo is the server-side and browser-side half of a larger setup. The matching importer project is the desktop sync client that talks to dive computers and sends payloads into DiveVault.

The companion importer is expected to:

- Read dive data from a supported dive computer
- Keep track of device fingerprint state so it only imports new dives
- Request a one-time browser approval from DiveVault
- Upload parsed dive records, raw binary payloads, and sample data to the backend

The integration points in this repository are:

- `POST /api/cli-auth/request` to create a desktop login request
- `POST /api/cli-auth/approve` for the signed-in browser user to approve that request
- `GET /api/device-state` and `PUT /api/device-state` for per-device sync checkpoints
- `POST /api/dives` for dive uploads

Once imported, dives appear in the frontend as `imported` records. They remain in the import queue until required metadata is completed, at which point they are marked `complete` and move into the main logbook flow.

## Architecture

Backend:

- Entry point: `cd backend && python -m divevault.app`
- HTTP server: Python `http.server` with threaded request handling
- Storage: PostgreSQL via `psycopg`
- Auth: DiveVault first-party JWT sessions and short-lived desktop sync tokens

Frontend:

- Vue 3 app in [`frontend`](./frontend)
- Built with Vite
- Served from `frontend/dist` by the backend in production

Persistence:

- `dives` table stores telemetry, archived import payloads, samples, raw bytes, and logbook fields
- `device_state` table stores per-user device fingerprint checkpoints
- Schema initialization and migrations are handled by `divevault.postgres_store.init_db()`

## Repository Layout

- [`backend/divevault/app.py`](./backend/divevault/app.py): backend server and auth flow
- [`backend/divevault/postgres_store.py`](./backend/divevault/postgres_store.py): schema management and PostgreSQL access
- [`backend/tests`](./backend/tests): backend-only test suite
- [`frontend`](./frontend): Vue frontend
- [`backend/migrations/migrate_postgres_schema.py`](./backend/migrations/migrate_postgres_schema.py): migration entry point
- [`examples/docker/docker-compose.yml`](./examples/docker/docker-compose.yml): local multi-container setup

## Local Development

### Prerequisites

- Python 3.12+
- Node.js 24+
- PostgreSQL

### Backend

Install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements-dev.txt
```

Set environment variables:

```powershell
Copy-Item .env.example .env
```

Run the backend:

```powershell
Set-Location backend
python -m divevault.app
```

### Frontend

```powershell
Set-Location frontend
npm ci
npm run dev
```

By default the frontend runs on `http://localhost:5173` and the backend on `http://localhost:8000`.

## Docker

Build and start the full stack:

```powershell
docker compose -f examples/docker/docker-compose.yml up --build
```

This starts:

- PostgreSQL on `localhost:5432`
- DiveVault backend on `localhost:8000`

`docker compose` also runs a one-shot `migrate` service that applies PostgreSQL schema migrations before the backend starts. The backend container no longer runs migrations on each startup.

For multi-pod Kubernetes workloads, run migrations as a separate Job (or Helm hook) and set `STARTUP_MIGRATIONS=disabled` on backend pods so each pod skips startup migrations.
See [`examples/kubernetes`](./examples/kubernetes) for a ready-to-use migration Job + 3-replica backend deployment example.

## Environment Variables

Common variables from [`.env.example`](./.env.example):

- `DATABASE_URL`: PostgreSQL connection string
- `AUTH_JWT_SECRET`: shared secret used to sign and verify DiveVault session tokens
- `AUTH_JWT_ISSUER`: expected token issuer (defaults to `divevault.local`)
- `AUTH_JWT_AUDIENCE`: expected token audience (defaults to `divevault.app`)
- `AUTH_TOKEN_TTL_SECONDS`: session token lifetime in seconds (defaults to `43200`)
- `CLI_AUTH_REQUEST_TTL` and `CLI_AUTH_TOKEN_TTL`: desktop sync token timing
- `MAX_JSON_BODY_BYTES`: maximum accepted JSON request payload size (defaults to `1048576`)
- `MAX_BACKUP_IMPORT_BYTES`: maximum accepted JSON payload size for `/api/backup/import` (defaults to `26214400`)
- `MAX_LIST_LIMIT`: upper bound for paginated list endpoints (defaults to `200`)
- `RATE_LIMIT_WINDOW_SECONDS`: shared fixed-window size for backend request rate limits (defaults to `60`)
- `RATE_LIMIT_CLI_REQUEST_PER_WINDOW`: max `/api/cli-auth/request` calls per IP per window (defaults to `30`)
- `RATE_LIMIT_CLI_APPROVE_PER_WINDOW`: max `/api/cli-auth/approve` calls per IP per window (defaults to `15`)
- `RATE_LIMIT_BACKUP_IMPORT_PER_WINDOW`: max `/api/backup/import` calls per IP per window (defaults to `10`)
- `RATE_LIMIT_DIVE_UPLOAD_PER_WINDOW`: max `/api/dives` upload calls per IP per window (defaults to `120`)
- `STARTUP_MIGRATIONS`: set to `enabled` (default) or `disabled`; disable when migrations run externally (for example, a Kubernetes migration Job)

## Testing

Backend tests cover:

- HTTP routes and auth behavior
- PostgreSQL storage helpers and payload normalization
- Desktop sync token lifecycle

Run tests with:

```powershell
.\.venv\Scripts\python.exe -m pytest -q backend/tests
```

## Manual Clerk User Migration

If you previously used Clerk, there are two migration paths.

Option 1 keeps each original Clerk `user_...` id and imports those same ids into `auth_users`. That is the safer path because existing dives, profiles, and device state continue to point at the same user ids.

```powershell
python backend/migrations/migrate_clerk_users_to_auth.py `
  --database-url "$env:DATABASE_URL" `
  --input ".\clerk-users.json" `
  --default-password "ChangeMe123!"
```

Option 2 is for cases where you already created replacement internal users with different ids and now need to move all existing app-owned data from the old ids to those new ids.

1. Create a JSON remap file, for example `user-id-remap.json`:

```json
[
  {
    "old_user_id": "user_old_clerk_id",
    "new_user_id": "user_new_internal_id",
    "email": "diver@example.com"
  }
]
```

2. Run a dry-run first. This validates that each target `new_user_id` already exists in `auth_users` and that it does not already own rows in the main per-user tables:

```powershell
python backend/migrations/remap_legacy_user_ids.py `
  --database-url "$env:DATABASE_URL" `
  --input ".\user-id-remap.json" `
  --dry-run
```

3. Run the real remap once the preflight report is clean:

```powershell
python backend/migrations/remap_legacy_user_ids.py `
  --database-url "$env:DATABASE_URL" `
  --input ".\user-id-remap.json"
```

4. If you also want to remove any stale legacy auth rows after the data remap, rerun with:

```powershell
python backend/migrations/remap_legacy_user_ids.py `
  --database-url "$env:DATABASE_URL" `
  --input ".\user-id-remap.json" `
  --delete-old-auth-users
```

The remap script updates user ownership in these tables:

- `dives`
- `device_state`
- `user_profile`
- `user_profile_license_documents`
- `user_profile_licenses`
- `user_profile_dive_sites`
- `user_profile_buddies`
- `user_profile_guides`
- `cli_sync_auth_requests.user_id`
- `auth_instance_settings.owner_user_id`
- `auth_user_invites.invited_by_user_id`

Do not use option 2 if the replacement `new_user_id` already has real dive/profile/device rows. The script intentionally aborts in that case to avoid merging two users into one by accident.

## Image Versioning

Container publishing is driven by [`frontend/package.json`](./frontend/package.json).

- On pushes to `master`, workflows publish image tags: `v<version>`, `stable`, and `latest`.
- On pushes to `master`, workflows also create or update a GitHub release named `v<version>` and attach a packaged source tarball. GitHub's standard source archives remain available on the release page as well.
- On non-`master` branches (or non-release contexts), workflows publish snapshot image tags in the format `v<version>-<short-sha>`, for example `v0.1.0-a1b2c3d`.

This keeps `frontend/package.json` as the single image version source while publishing both container images and the matching GitHub release from the same version value.

## libdivecomputer

The companion importer side of this system is a natural place to use `libdivecomputer`, the open source cross-platform library for communicating with many dive computers.

Relevant upstream links:

- Project site: <https://libdivecomputer.org/>
- Source repository: <https://github.com/libdivecomputer/libdivecomputer>

According to the official project pages, libdivecomputer is an open source cross-platform library for communication with dive computers from multiple manufacturers. DiveVault itself does not embed libdivecomputer directly in this repository, but it is the most relevant upstream project to reference when building or documenting the desktop importer.
