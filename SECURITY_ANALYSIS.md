# DiveVault Security Analysis (April 9, 2026)

This review focuses on realistic vulnerabilities in the current stack (backend, frontend, and deployment defaults) and how an attacker could exploit them.

## Executive summary

Top risks to address first:

1. **High: Unbounded request body reads in the backend** can enable memory-exhaustion denial of service.
2. **High: Insecure-by-default deployment settings in `docker-compose.yml`** (`CORS_ORIGIN="*"`, weak default DB credentials, exposed DB port).
3. **Medium: Missing hardening headers and transport assumptions** (no strict HTTP response hardening in backend static/API responses).
4. **Medium: No rate limiting / abuse controls** on auth and data-heavy endpoints.
5. **Medium: Potential PII leakage through verbose request logging**.

## Threat surface by component

### 1) Backend HTTP server

The backend uses Python `ThreadingHTTPServer` and custom request handling.

- Every JSON endpoint uses `_read_json_body()`, which reads the entire request body based on `Content-Length` with no max limit.
  - **Attack path:** an attacker sends very large payloads to `/api/dives`, `/api/backup/import`, or profile endpoints to consume RAM and degrade availability.
  - **Why this matters:** request-body size is one of the most common DoS vectors against custom HTTP servers.

- API list endpoints accept user-controlled pagination values and only enforce lower bounds (`>= 0`) with no upper cap.
  - **Attack path:** authenticated abuse with huge `limit` values can cause expensive DB fetches and large JSON serialization.

- No explicit read/write/request timeouts or connection limits are configured at application level.
  - **Attack path:** slowloris-style clients can hold worker threads and reduce service capacity.

### 2) Authentication and authorization

First-party JWT token verification is implemented and, importantly, appears **fail-closed** when not configured (returns 503 for protected endpoints), which is good.

Residual risks:

- Desktop sync approval and polling flow lacks explicit brute-force/rate-limit controls.
  - The code values are high entropy, so guessing is impractical, but high request volumes could still cause resource pressure.

- Sensitive bearer/session token handling exists in multiple pathways (Authorization header and `__session` cookie extraction), which increases testing burden and misconfiguration risk.

### 3) CORS and browser boundary

`docker-compose.yml` sets `CORS_ORIGIN: "*"` by default.

- **Risk:** broad CORS allows any origin to read API responses in browser contexts where auth headers are present.
- While this server does **not** send `Access-Control-Allow-Credentials: true`, wildcard CORS is still risky as a long-term default and can interact poorly with future changes.

### 4) Data handling and privacy

- Backup export endpoint includes complete profile/dive data and references sensitive material (e.g., raw dive payloads and license docs metadata).
- Logging statements include user IDs, query values, filenames, and operational status details.
  - **Risk:** centralized logs can become a secondary data exfiltration target.

### 5) Deployment and infrastructure defaults

The compose setup uses development defaults that are unsafe if reused in staging/production:

- PostgreSQL exposed publicly on host port 5432.
- Weak static credentials (`dive:dive`).
- Backend bound to `0.0.0.0` with permissive CORS.
- No TLS termination shown in-stack.

## Prioritized remediation plan

### Priority 0 (immediate)

1. **Enforce request size limits** in `_read_json_body()` and reject oversized payloads with HTTP 413.
2. **Cap pagination limits** (for example max 200) and reject/clip higher values.
3. **Harden compose defaults**:
   - Remove DB host port mapping unless required.
   - Require non-default secrets via environment.
   - Replace wildcard CORS with explicit origin(s).

### Priority 1 (short term)

4. Add **rate limiting** per IP/user/token on:
   - `/api/cli-auth/request`
   - `/api/cli-auth/approve`
   - `/api/backup/import`
   - `/api/dives` upload endpoints
5. Add **security headers** on all responses:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY` (or CSP equivalent)
   - `Content-Security-Policy` for frontend assets
   - `Referrer-Policy`
6. Add **structured log redaction policy** for potentially sensitive fields.

### Priority 2 (medium term)

7. Put backend behind a reverse proxy with:
   - TLS/HSTS
   - request size limits
   - connection/request timeouts
   - optional WAF/bot protections
8. Add automated security checks in CI:
   - `pip-audit` for Python dependencies
   - `npm audit` (or better, OSV/Snyk/GitHub advisories) for Node dependencies
   - lightweight SAST and secret scanning

## Practical attacker scenarios

1. **Memory DoS via oversized JSON upload:** attacker repeatedly posts very large bodies to JSON endpoints and forces backend memory pressure.
2. **Credential spraying / abuse noise:** attacker floods CLI auth endpoints (even without successful guessing) to create operational instability.
3. **Data exposure via permissive deployment:** operator deploys compose defaults to internet-exposed host; attacker reaches DB directly with known defaults.
4. **Secondary leakage via logs:** internal log access compromise yields user IDs, dive activity metadata, and operational traces.

## Notes on current strengths

- SQL access appears parameterized via psycopg placeholders (reducing SQL injection risk).
- Public profile route limits slug format and only exposes explicitly public data paths.
- Auth checks are centralized and generally required for non-public data endpoints.
