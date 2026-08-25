# Agent Notes

## Repo Shape
- Backend is a Go HTTP service in `backend-go/cmd/divevault`; it serves `/api/*`, `/health`, `/config.js`, and built frontend assets from `FRONTEND_DIR`.
- PostgreSQL schema and migrations live in `backend-go/internal/migrations`; bump `CurrentSchemaVersion` when adding schema migrations.
- Frontend is a Nuxt 4 app under `frontend/`; entrypoint is `frontend/app/app.vue`, the thin app shell is `frontend/app/components/DiveVaultApp.vue`, and the current route/state controller is `frontend/app/features/app/AppRouteController.vue`.
- Frontend feature views live under `frontend/app/features/`; reusable cross-feature code lives under `frontend/app/shared/{components,composables,utils}`.
- Frontend route records and route-to-state mapping live together in `frontend/app/routing/routes.js`.
- Frontend env is loaded from the repo root via `nuxt.config.js` (`vite.envDir: repoRoot`); `VITE_API_PROXY_TARGET` controls the dev proxy target and defaults to `http://127.0.0.1:8000`.

## Setup And Commands
- Backend deps: Go toolchain matching `backend-go/go.mod`.
- Run backend locally from the repo root with `.env` copied from `.env.example`: `go run ./backend-go/cmd/divevault --database-url postgresql://dive:dive@localhost:5432/dive`.
- Run external schema migration from the repo root: `go run ./backend-go/cmd/divevault migrate` with `DATABASE_URL` set.
- Frontend deps use npm and `frontend/package-lock.json`: `cd frontend && npm ci`.
- Frontend dev server: `cd frontend && npm run dev`; backend API requests are proxied to `VITE_API_PROXY_TARGET`.
- Frontend checks: `cd frontend && npm run check:structure`, `npm run check:contracts`, `npm run lint`, and `npm run format:check`.
- Full local Docker stack is documented as `docker compose -f examples/docker/docker-compose.yml up --build`.

## Verification
- CI backend test command: `cd backend-go && go test ./...`; from the repo root use `go test ./backend-go/...`.
- Focused backend test from the repo root: `go test ./backend-go/internal/auth -run Test`.
- CI frontend test command: `cd frontend && npm test`; Playwright starts the Nuxt static preview on `127.0.0.1:4173` automatically.
- Focused frontend test: `cd frontend && npx playwright test tests/app.spec.js -g "public profile" --project=chromium`.
- `cd frontend && npm run build` runs Playwright first, then `nuxt generate`; use `npm run build:app` only when you intentionally want build without tests, as CI does for release assets.
- Frontend lint/format scripts are configured in `frontend/package.json`; there is no configured frontend typecheck script.

## MCP Usage
- Use the Context7 MCP when framework, library, or API behavior is uncertain, especially for Vue, Vite, Playwright, Go, PostgreSQL, Docker, or Kubernetes docs that may have changed.
- Use the Playwright MCP when inspecting, debugging, or validating frontend behavior in a real browser, including layout issues, interaction flows, screenshots, console errors, and network requests.
- Prefer existing repository tests and commands for final verification; MCP tools are for gathering current docs/context or investigating browser state when applicable.

## Testing Gotchas
- Backend tests are mostly unit/fake-server tests; they monkeypatch DB access and do not require a live PostgreSQL server unless you run the app or migration entrypoints.
- Frontend Playwright tests mock app API responses in `frontend/tests/helpers/app-fixtures.js`; do not start the backend for normal frontend test runs.
- If Playwright browsers are missing locally, install them from `frontend/` with `npx playwright install`.

## Runtime And Deploy Notes
- The backend loads `.env` from the repo root on import/startup; important keys are shown in `.env.example`.
- `STARTUP_MIGRATIONS=enabled` is the default for single-instance/local backend startup. Set `STARTUP_MIGRATIONS=disabled` when migrations run externally, such as the Kubernetes Job in `examples/kubernetes/divevault.yaml`.
- The backend Docker image is built from `backend/Dockerfile`; it builds frontend assets with Node, compiles the Go backend, and runs without Python in the final image.
- CI publishes image/release version tags from `frontend/package.json` `version`, not from a backend manifest.
