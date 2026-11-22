# DiveVault Development Guide

This document is for contributors and maintainers. The main README is intentionally focused on regular users and quick instance setup.

## Repository Layout

- Backend: Go HTTP service in `backend/cmd/divevault`.
- API/runtime: serves `/api/*`, `/health`, `/config.js`, and built frontend assets from `FRONTEND_DIR`.
- Database: PostgreSQL schema and migrations live in `backend/internal/migrations`.
- Frontend: Nuxt-powered Vue 3 app under `frontend/`, with Nuxt UI registered as the component library.
- Frontend entrypoint: `frontend/app/app.vue`, which wraps the app in Nuxt UI's app provider and mounts the DiveVault shell.
- Frontend shell: `frontend/app/components/DiveVaultApp.vue`; the current route/state controller is `frontend/app/features/app/AppRouteController.vue`.
- Large Options API components keep cohesive method groups in factory modules that are spread into `methods` (for example `features/app/methods/*.js`).
- The "Sounding" design lives in `frontend/app/assets/styles.css` (colour tokens, type, bands, controls) and `frontend/app/shared/components/chart/` (waterline, profiles, site chart). Colour carries meaning: navy is topside, the blues are depth bands, blue is action or selection, red is trouble only (`--warn`, never `--act`). Anything inside a topside element picks up the topside colours by itself, so use the plain tokens there too. Water features such as site names are italic.
- Every string on screen goes through `$tx("English sentence")` or `$tn(count, "one", "many")`. The English sentence is the key in all three files under `frontend/i18n/locales/`.
- The address is the only record of the open page: read it from `router.currentRoute`, not `useRoute()`, as the app has no `<NuxtPage>`.
- Frontend route records and path-to-state mapping live together in `frontend/app/routing/routes.js`.
- Feature views live under `frontend/app/features/`; reusable cross-feature code lives under `frontend/app/shared/{components,composables,utils}`.
- Frontend env: loaded from the repository root by Nuxt configuration in `frontend/nuxt.config.js`.
- Dev API proxy: `VITE_API_PROXY_TARGET`, defaulting to `http://127.0.0.1:8000`.
- Import aliases use Nuxt app-root paths by default: `~/features/...`, `~/shared/...`, `~/routing/...`, and `~/i18n/...`. `nuxt.config.js` also defines `#features`, `#shared`, `#routing`, and `#i18n` for explicit infrastructure imports.
- AI-assisted Nuxt UI work should read `frontend/llms.txt` first for the project-local Nuxt UI LLM context and official documentation links.

When adding database migrations, update `CurrentSchemaVersion` in `backend/internal/migrations`.

## Dev Container

Install Docker and the VS Code Dev Containers extension, then open the repository
and run **Dev Containers: Reopen in Container**. The container includes Node 24
and Go 1.27.1; initial setup runs `npm ci` and downloads the Go modules.

Run **Tasks: Run Task → dev: start all** to start the frontend and backend in
separate terminals within the same development container. Open
<http://localhost:3000> for the app; the API is forwarded on port 8000.
Nuxt proxies API requests to the backend inside the container.
Stop either server with Ctrl+C in its terminal, or use **Tasks: Terminate Task**.
Restart the backend task after changing Go code; Nuxt reloads frontend changes.
When the repository is mounted from Windows, file-change events don't reach the
container, so `frontend/nuxt.config.js` switches the watchers to polling and changes
can take a second or two to show. Edits to `nuxt.config.js` or `.env` are not
picked up there: restart the frontend task after changing them.

PostgreSQL runs in a companion container with a persistent named volume. The
development container supplies `DATABASE_URL` and enables startup migrations;
no `.env` file is required. Existing `.env` files can supply other settings, but
the container's environment takes precedence. Dependencies in `node_modules`
use a separate Linux volume so they do not conflict with host installations.
Closing the devcontainer stops both containers and retains database data.

The usual checks below can run in the container terminal. Before running
Playwright tests for the first time, run `cd frontend && npx playwright install --with-deps`.

## Local Backend

Copy the sample environment and start the backend:

```powershell
Copy-Item .env.example .env
go run ./backend/cmd/divevault --database-url postgresql://dive:dive@localhost:5432/dive
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
go run ./backend/cmd/divevault migrate --database-url $env:DATABASE_URL
```

For multi-instance deployments, run migrations as a separate job and set:

```text
STARTUP_MIGRATIONS=disabled
```

## Testing

Run backend tests from the repository root:

```powershell
go test ./backend/...
```

Focused backend example:

```powershell
go test ./backend/internal/auth -run Test
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
- `AUTH_JWT_SECRET` — required to be a unique random value of at least 32 characters whenever `HOST` is not a loopback address; the backend refuses to start otherwise. Generate one with `openssl rand -base64 48`.
- `AUTH_JWT_ISSUER`
- `AUTH_JWT_AUDIENCE`
- `STARTUP_MIGRATIONS`
- `FRONTEND_DIR`
- `VITE_API_PROXY_TARGET`
- `TRUST_FORWARDED_HEADERS` / `TRUSTED_PROXY_HOPS` — only enable behind a reverse proxy. The client address is taken from the `X-Forwarded-For` entry appended by the outermost trusted proxy, so client-supplied entries cannot bypass rate limits.
- `RATE_LIMIT_LOGIN_PER_WINDOW`, `RATE_LIMIT_REGISTER_PER_WINDOW`, `RATE_LIMIT_PUBLIC_PER_WINDOW` (per client IP) and `RATE_LIMIT_GEOCODE_PER_WINDOW` (per user). Limits are kept in memory per backend instance.
- `NOMINATIM_MIN_INTERVAL_MS` — minimum spacing between upstream geocoding requests (default 1000 ms, matching the public Nominatim usage policy).
- `CLI_AUTH_REQUIRE_POLL_TOKEN` — see Desktop Sync Login below.
- `LOG_FORMAT` — `text` (default) or `json`. Static asset and health requests are logged at debug level.

Prometheus metrics are exposed at `/metrics` when metrics are enabled. Route labels are bounded: unmatched paths are reported as `unmatched`.

## Security Model

- Browser sessions are HS256 JWTs sent in the `Authorization` header only; cookies are not accepted for authentication.
- Every authenticated request re-checks the user in the database: deleted or deactivated users are rejected immediately, and role/email come from the database rather than token claims.
- `auth_users.token_version` is embedded in session tokens. Changing a password, email, role or activation state bumps it, which revokes all existing sessions and desktop sync tokens for that user. A password change returns a fresh token for the current browser.
- Desktop sync tokens and invite tokens are stored as SHA-256 digests.
- Internal errors are logged server-side; clients receive a generic `Service temporarily unavailable` message.
- API responses carry `Content-Security-Policy: default-src 'none'`. Generated HTML pages get a strict policy that allows the hashes of Nuxt's inline bootstrap scripts, self-hosted fonts and the map tile origin. HSTS is sent when the request arrived over TLS (directly or via a trusted proxy).
- The public profile endpoint only returns the diver name, sharing settings and published dives without user ids, raw import data or device fingerprints.

## Resetting A Password

There is no self-service password reset. An operator with database access can set a new password with the backend binary:

```bash
# Generate a random password and print it once
go run ./backend/cmd/divevault reset-password --email you@example.com

# Or choose the password (read from stdin, so it stays out of shell history)
go run ./backend/cmd/divevault reset-password --email you@example.com --password-stdin
```

In the container image use `/app/divevault reset-password ...`, for example `docker compose -f examples/docker/docker-compose.yml exec backend /app/divevault reset-password --email you@example.com`. `DATABASE_URL` comes from the environment or `.env` (override with `--database-url`). The reset revokes all existing sessions and desktop sync tokens; add `--activate` to also reactivate a deactivated account.

## Desktop Sync Login

1. The desktop client calls `POST /api/cli-auth/request`. The response contains `code` (shown to the user and used in the browser approval URL `/settings/cli-auth/:code`) and `poll_token` (a secret that must stay inside the desktop client).
2. The user approves the request in the browser.
3. The desktop client polls `GET /api/cli-auth/request?code=...` and sends the poll token in the `X-Poll-Token` header. The sync token is returned exactly once; later polls report the status without the token.

Callers without the poll token only see the request status, never the token or the approver's email. Older desktop clients that do not send a poll token can be supported temporarily with `CLI_AUTH_REQUIRE_POLL_TOKEN=false`; they still receive the token only once.

## Docker And Releases

The Docker image is built from the repository-root `Dockerfile`. It builds frontend assets with Node, compiles a static Go binary (multi-arch via `TARGETARCH`), and runs it on a distroless image as a non-root user. `/app/divevault healthcheck` is used as the container health check.

CI additionally runs `govulncheck`, `npm audit --omit=dev --audit-level=high`, and a Trivy scan of the built image.

### Release process

Releases are driven by [release-please](https://github.com/googleapis/release-please) and Conventional Commits:

1. PRs are squash-merged, and the PR title becomes the commit message. The `PR Title` workflow enforces Conventional Commit titles (`feat: …`, `fix: …`, `deps: …`, `chore: …`). Use `feat!:` or a `BREAKING CHANGE:` footer for breaking changes.
2. On every push to `master`, the `Release` workflow keeps a release PR open (`chore(master): release X.Y.Z`). That PR bumps `version.txt`, `frontend/package.json`, `frontend/package-lock.json` and the image tags in `examples/`, and updates `CHANGELOG.md`. Only `feat`, `fix`, `perf`, `revert` and `deps` commits produce a release; the other types are hidden from the changelog.
3. Merging the release PR creates the `vX.Y.Z` tag and a draft GitHub release, then calls the `Backend Image` workflow for that tag.
4. `Backend Image` builds `linux/amd64` and `linux/arm64` once and pushes the result untagged by digest. It Trivy-scans that digest, runs the full application test against it (amd64) plus an arm64 smoke test, and then tags the tested digest. It signs the image with cosign, adds image, signature and migration notes to the release, and publishes the release.

To force a specific version, put a `Release-As: 1.2.3` footer in a commit message on `master`. To rebuild an existing release image, run `Backend Image` manually with `release_tag: vX.Y.Z`; `latest`, `X.Y` and `X` only move if that tag is the highest release.

The process depends on two rules:

- The `Release` workflow needs a way to open PRs. Either set the `RELEASE_PLEASE_TOKEN` Actions secret to a fine-grained PAT for this repository (read and write on Contents, Issues and Pull requests; renew it before it expires), or enable **Settings > Actions > General > Allow GitHub Actions to create and approve pull requests**. Only with the token do checks run on the release PR.
- Never create `v*` tags or GitHub releases by hand. They do not build an image or update the version files, and they block release-please from using that version. (`v0.6.0` was created this way and has no image.)

Image tags on `ghcr.io/jlemmings/divevault`:

| Tag | Updated by | Moves? |
| --- | --- | --- |
| `X.Y.Z`, `vX.Y.Z` | release | never |
| `X.Y`, `X` (from 1.0) | release | to the newest patch/minor |
| `latest` | non-prerelease release | to the newest release |
| `edge`, `sha-<short>` | every push to `master` | `edge` moves; `sha-*` never |

Pin `X.Y.Z` or a digest in deployments. Releases until `v0.4.0` were published as `vX.Y.Z` only, and `v0.4.0` itself was overwritten by later `master` builds until the move to this process.

Verify an image signature:

```bash
cosign verify ghcr.io/jlemmings/divevault:<version> \
  --certificate-identity-regexp '^https://github.com/jLemmings/DiveVault/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

PR checks (Go tests, govulncheck, npm audit, lint, Playwright, full application test) run in `full-application-test.yml`, and the image workflow does not repeat them. Make them required status checks in branch protection for `master`.

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
- Logbook, sites chart, gear, account and application settings, and public profile views.
- Browser approval flow for desktop sync requests.

## Related Upstream Projects

DiveVault imports dive computer data through libdivecomputer-compatible workflows:

- `https://github.com/libdivecomputer/libdivecomputer`
- `https://www.libdivecomputer.org/`
