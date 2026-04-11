<p align="center">
  <img src="./frontend/public/logo.png" alt="DiveVault" width="128" height="128">
</p>

<h1 align="center">DiveVault</h1>

<p align="center">
  Self-hosted dive logbook, import queue, and review UI for dive computer telemetry.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12%2B-3776AB?logo=python&logoColor=white" alt="Python 3.12+">
  <img src="https://img.shields.io/badge/Vue-3.5-42B883?logo=vue.js&logoColor=white" alt="Vue 3">
  <img src="https://img.shields.io/badge/PostgreSQL-Database-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Docker-supported-2496ED?logo=docker&logoColor=white" alt="Docker supported">
  <img src="https://img.shields.io/badge/Playwright-tested-2EAD33?logo=playwright&logoColor=white" alt="Playwright tested">
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#docker">Docker</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#what-divevault-does">What It Does</a> ·
  <a href="#features">Features</a> ·
  <a href="#testing">Testing</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

DiveVault is a dive log backend and web UI built around a staged workflow:

1. A companion desktop importer reads telemetry from a dive computer and uploads dives into DiveVault.
2. Imported dives land in a review queue.
3. The diver completes required metadata such as site, buddy, guide, and notes.
4. Completed dives move into the permanent logbook and analytics views.

The result is a system that keeps raw telemetry, review state, and curated logbook records in one place.

## Quick Start

## Docker

Run the full local stack with:

```powershell
docker compose -f examples/docker/docker-compose.yml up --build
```

This starts:

- PostgreSQL on `localhost:5432`
- A one-shot migration service
- DiveVault backend on `localhost:8000`

For multi-pod deployments, run migrations as a separate job and set `STARTUP_MIGRATIONS=disabled` on backend pods.

## Kubernetes

There are two starting points for Kubernetes deployments:

- Raw manifests in [`examples/kubernetes/divevault.yaml`](./examples/kubernetes/divevault.yaml)
- Helm chart in the external [`jLemmings/helm-charts` repository](https://github.com/jLemmings/helm-charts/tree/master/charts/divevault)

### Raw manifests from this repo

The manifest in [`examples/kubernetes/divevault.yaml`](./examples/kubernetes/divevault.yaml) includes:

- A `ConfigMap` and `Secret`
- A one-shot `Job` to run `migrations.migrate_postgres_schema`
- A `Deployment` with `STARTUP_MIGRATIONS=disabled`
- A `Service` and `PodDisruptionBudget`

Update the image reference and secret values first, then apply it:

```bash
kubectl apply -f examples/kubernetes/divevault.yaml
kubectl wait --for=condition=complete job/divevault-db-migrate --timeout=180s
kubectl rollout status deployment/divevault-backend
```

If you want local access after rollout:

```bash
kubectl port-forward service/divevault-backend 8000:8000
```

The example assumes PostgreSQL is already reachable at the hostname used in `DATABASE_URL`.

### Helm chart

The Helm chart currently lives in GitHub as a chart directory, not a published Helm repository, so install it from a local checkout:

```bash
git clone https://github.com/jLemmings/helm-charts.git
helm upgrade --install divevault ./helm-charts/charts/divevault -f your-values.yaml
```

At minimum, review and override:

- `image.repository` and `image.tag`
- `database.url` or `database.existingSecret`
- ingress settings if you want external access

Before using that chart, compare its values with this repo's current environment contract in [`.env.example`](./.env.example) and the Kubernetes manifest above. In particular, this repo's current backend expects values such as `AUTH_JWT_SECRET`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`, and `STARTUP_MIGRATIONS`, so keep migrations external for multi-replica deployments and run the schema job before rolling out backend pods.

## Screenshots

### Dashboard

![DiveVault dashboard](./docs/readme/dashboard.png)

### Imports And Settings

<table>
  <tr>
    <td width="50%">
      <img src="./docs/readme/imports.png" alt="DiveVault import queue">
    </td>
    <td width="50%">
      <img src="./docs/readme/settings.png" alt="DiveVault settings">
    </td>
  </tr>
</table>

Screenshots above were generated from the local mocked development environment so the README stays reproducible.

## What DiveVault Does

- Stores imported dive telemetry and diver-completed logbook metadata in PostgreSQL
- Separates imported drafts from committed dives so incomplete records do not pollute the main logbook
- Tracks device sync state for importer workflows
- Supports browser approval for desktop sync requests
- Serves a Vue frontend for dashboarding, imports, log review, settings, and public profile views
- Supports Docker-first local and deployment workflows

## Features

- Import queue for incomplete dives waiting on metadata
- Dive logbook with detail views and editing flows
- Manual dive entry for dives without computer uploads
- Dive map and dashboard stats
- Saved dive sites, buddies, guides, and certification records
- Public profile / public dive log sharing
- Backup and restore flows
- Backend schema migration entrypoint for multi-container or Kubernetes deployments
- UI localization support with English, German, and French bundles

## Workflow Overview

### Import Workflow

- Desktop importer reads the dive computer and uploads payloads
- DiveVault stores the raw and parsed dive data
- Imported dives appear in the queue until required logbook fields are completed
- Once completed, the dive is marked as committed and appears throughout the rest of the app

### Backend Responsibilities

- Authenticated dive ingestion
- PostgreSQL persistence
- Device sync checkpoint storage
- Schema initialization and migrations
- Public profile and backup APIs

### Frontend Responsibilities

- Dashboard and map visualization
- Import queue and logbook editing
- Manual dive entry
- Profile, data management, and backup settings

## Contribution

### Backend

```powershell
.\.venv\Scripts\python.exe -m pytest -q backend/tests
```

### Frontend

```powershell
Set-Location frontend
npm test
```
## Contributing

If you want to work on DiveVault itself:

- Start with the run-it-yourself steps above so you can use the app end to end before changing code.
- Run backend and frontend tests before opening changes.
- Regenerate README screenshots with `frontend/scripts/capture-readme-screenshots.mjs` when UI changes affect the screenshots.

### Requirements

- Python 3.12+
- Node.js 24+
- PostgreSQL

### Backend

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements-dev.txt
Copy-Item .env.example .env
Set-Location backend
python -m divevault.app
```

### Frontend

```powershell
Set-Location frontend
npm ci
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`

## Related Upstream

The companion importer side of this system is a natural place to use `libdivecomputer`.

- Project site: <https://libdivecomputer.org/>
- Source repository: <https://github.com/libdivecomputer/libdivecomputer>
