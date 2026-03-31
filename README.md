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

- Entry point: `python -m divevault.app`
- HTTP server: Python `http.server` with threaded request handling
- Storage: PostgreSQL via `psycopg`
- Auth: Clerk session tokens, Clerk API keys, and short-lived desktop sync tokens

Frontend:

- Vue 3 app in [`frontend`](./frontend)
- Built with Vite
- Served from `frontend/dist` by the backend in production

Persistence:

- `dives` table stores telemetry, archived import payloads, samples, raw bytes, and logbook fields
- `device_state` table stores per-user device fingerprint checkpoints
- Schema initialization and migrations are handled by `divevault.postgres_store.init_db()`

## Repository Layout

- [`divevault/app.py`](./divevault/app.py): backend server and auth flow
- [`divevault/postgres_store.py`](./divevault/postgres_store.py): schema management and PostgreSQL access
- [`frontend`](./frontend): Vue frontend
- [`migrations/migrate_postgres_schema.py`](./migrations/migrate_postgres_schema.py): migration entry point
- [`docker-compose.yml`](./docker-compose.yml): local multi-container setup

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
pip install -r requirements.txt
```

Set environment variables:

```powershell
Copy-Item .env.example .env
```

Run the backend:

```powershell
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
docker compose up --build
```

This starts:

- PostgreSQL on `localhost:5432`
- DiveVault backend on `localhost:8000`

The container entrypoint runs the PostgreSQL migration script before starting the backend.

## Environment Variables

Common variables from [`.env.example`](./.env.example):

- `DATABASE_URL`: PostgreSQL connection string
- `VITE_CLERK_PUBLISHABLE_KEY`: Clerk frontend key
- `CLERK_SECRET_KEY`: Clerk backend secret for API key verification
- `CLERK_FRONTEND_API_URL`: used to derive the Clerk issuer and JWKS URL
- `CLERK_JWT_KEY` or `CLERK_JWKS_URL`: required for Clerk session token verification
- `CLERK_AUTHORIZED_PARTIES`: allowed `azp` values
- `CLI_AUTH_REQUEST_TTL` and `CLI_AUTH_TOKEN_TTL`: desktop sync token timing

## Testing

Backend tests cover:

- HTTP routes and auth behavior
- PostgreSQL storage helpers and payload normalization
- Desktop sync token lifecycle

Run tests with:

```powershell
.\.venv\Scripts\python.exe -m pytest -q tests
```

## Image Versioning

Container publishing and GitHub release packaging are driven by [`frontend/package.json`](./frontend/package.json).

- Pushes to `master` create a Git tag and GitHub release in `v<version>` format, for example `v0.1.0`, based on the current package version.
- The workflow publishes container images tagged with the clean version, `stable`, and `latest`.
- The workflow also attaches a `divevault-<version>.tar.gz` release bundle built from the repository plus the compiled frontend assets.
- If the tag or release for that package version already exists, the workflow fails so a duplicate version cannot be published.

This keeps `frontend/package.json` as the single release version source and makes each `master` merge an explicit versioned release.

## libdivecomputer

The companion importer side of this system is a natural place to use `libdivecomputer`, the open source cross-platform library for communicating with many dive computers.

Relevant upstream links:

- Project site: <https://libdivecomputer.org/>
- Source repository: <https://github.com/libdivecomputer/libdivecomputer>

According to the official project pages, libdivecomputer is an open source cross-platform library for communication with dive computers from multiple manufacturers. DiveVault itself does not embed libdivecomputer directly in this repository, but it is the most relevant upstream project to reference when building or documenting the desktop importer.
