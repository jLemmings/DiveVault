# Backend Go Compatibility Notes

These notes define the compatibility contract for the Go backend rewrite. The Go backend should be a drop-in replacement for the existing Python backend before the Python implementation is removed.

## API Contract

- Registered Go API routes must match `contracts/api-routes.json` exactly by method and path.
- Existing frontend callers should not need URL, method, field-name, or header changes.
- Route labels with path parameters, such as `/api/dives/{id}`, remain the public contract even when the internal router uses regular expressions.

## Status Codes And Errors

- Unknown API route: `404` with an `error` JSON field.
- Known route with unsupported method: `405` and an `Allow` header.
- Unsupported request content type: `415`.
- Oversized body: `413`.
- Rate limit rejection: `429` with `Retry-After`.
- Missing or invalid auth: preserve the current Python status and error-body behavior for each route policy.
- Unhandled server failures: `500` with an `error` JSON field and no stack trace in the response.

## Auth

- Preserve bearer token extraction from `Authorization`.
- Preserve browser session cookie token extraction.
- Preserve JWT issuer, audience, signing secret, TTL, and claim semantics.
- Preserve owner/admin authorization checks.
- Preserve bootstrap registration behavior when no users exist.
- Preserve CLI sync request, approval, polling, token expiry, and token verification behavior.
- Existing `scrypt$...` password hashes must continue to verify after the rewrite.

## Database

- Existing databases at schema version `14` must start under the Go backend without destructive changes.
- `app_schema_version` remains the schema version source of truth.
- JSONB shapes for dives, profile collections, equipment, logbook data, samples, and import payloads must remain compatible.
- Migrations must keep supporting both startup mode and external migration job mode.

## Runtime

- Existing env var and flag names remain supported.
- `/health`, `/api/health`, `/config.js`, static frontend serving, CORS headers, security headers, request logging, graceful shutdown, body limits, and metrics remain part of the runtime contract.
