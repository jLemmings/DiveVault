# DiveVault UI redesign brief and backend capability contract

Source baseline: repository commit `415274a`, inspected 2026-10-25. This is an implementation handoff, not a claim that the existing UI passes all requirements. Backend behavior below comes from the Go routes, handlers, stores, importers, and exporters; frontend requirements come from the existing views, controller, utilities, and tests. No application behavior was changed or browser-tested for this brief.

## 1. Assignment for the UI model

Improve the existing Nuxt application into a coherent, accessible, responsive diving logbook while preserving its functional scope. Prioritize logging dives, reviewing imports, understanding recorded dive data, managing equipment, and controlling personal data. Implement against the real API contract below. Distinguish working features, frontend-derived behavior, and backend prerequisites. Never simulate persistence or present unavailable data as zero.

Use the existing Nuxt 4, Vue, Nuxt UI, Tailwind, Leaflet, and PDF.js stack. Keep the shell thin. Feature views belong in `frontend/app/features/`; shared UI, composables, and utilities belong in `frontend/app/shared/`; API calls belong in `frontend/app/shared/api/`; route definitions belong in `frontend/app/routing/routes.js`. Do not rebuild this as a separate site or replace it with a static mockup.

Deliver a visual system, every screen and state listed here, working API integrations, responsive layouts, and regression evidence. Any backend changes needed to fulfill a promise must be separately identified and tested.

## 2. Access model and session behavior

- Anonymous visitors can check health and registration availability, register when permitted, sign in, read enabled public profiles, and create/poll desktop authentication requests.
- Authenticated principals access only their own dives, profile, certificates, equipment, device checkpoints, imports, exports, and backups. Requests use bearer tokens.
- The instance owner is identified by `is_owner` / `owner_user_id`. The `admin` role alone does **not** grant owner-only user-management or registration-setting permissions.
- Only a browser `session_token` can approve desktop authentication. A desktop sync token cannot approve another sync request.
- The first registration initializes the owner account. Subsequent self-registration depends on the instance setting. Invitations allow registration with the invitation's identity and role.
- Registration does not return a session token; login returns `{token}`. Preserve the subsequent login step.
- Logout is client-side session removal; there is no logout, refresh-token, session-list, or revoke-token endpoint.
- Preserve first-run setup, login, open/closed registration, invitation acceptance, expired/invalid invitation, inactive-account, expired-session, and denied-access states. Keep the requested destination through login, especially CLI approval links.

## 3. Complete HTTP feature inventory

All paths below are literal API patterns. JSON writes require `application/json` unless stated otherwise. Access: **Public** = unauthenticated; **User** = authenticated stable principal; **Auth** = authenticated identity; **Owner** = instance owner; **Browser** = browser session.

| Method and path | Access | Backend capability / required frontend support |
|---|---|---|
| GET `/api/health` | Public | Returns `{status:"ok"}`. Availability indicator only; not proof that database operations succeed. |
| GET `/api/auth/status` | Public | Optional `invite_token`; returns initialization, user count, bootstrap/public registration flags, and invitation or null. Select the correct entry flow. |
| POST `/api/auth/register` | Public | `email`, `password`, `first_name`, `last_name`, optional `invite_token`. Password minimum eight characters. Returns created identity/role/owner indicator, not token. Handle duplicate email, closed registration, invalid invite and email mismatch. |
| POST `/api/auth/login` | Public | `email`, `password`; returns `{token}`. Handle invalid credentials and inactive account. |
| GET `/api/auth/me` | Auth | Token/session/user identifiers, email, names, role, active state and `is_owner`. Drive account UI and permission gates. |
| PUT `/api/auth/password` | Auth | `current_password`, `new_password`; new password minimum eight characters; returns `{updated:true}`. Provide confirmation and errors without losing unrelated edits. |
| GET `/api/auth/settings` | Owner | Instance registration/owner state. |
| PUT `/api/auth/settings` | Owner | Required boolean `public_registration_enabled`. Show save state and resulting availability. |
| POST `/api/auth/invitations` | Owner | Email, first/last names, role `user` or `admin`, `expires_in_days` (default 7, capped at 30). Returns `invite` and `invite_url`; provide a copyable link and expiry. No email delivery endpoint. |
| GET `/api/users` | Owner | `{users:[...]}` with identity, role, active state, created/updated/last-login timestamps. |
| POST `/api/users` | Owner | Create directly using email/password, names and role. Unlike registration, this handler only requires a nonempty password; use sensible consistent client validation without misdescribing backend enforcement. |
| PUT `/api/users/{id}` | Owner | Edit email, names, role, active state. Owner cannot be deactivated or demoted. Returns `{user}`. Store also accepts `password_hash`; this is not a plaintext password-reset API and must not become a UI field. |
| DELETE `/api/users/{id}` | Owner | Delete a non-owner account, returns `{deleted,user_id}`. Owner cannot be deleted. Do not promise deletion of all associated personal data without a separately verified cascade. |
| POST `/api/cli-auth/request` | Public | Create temporary desktop authorization request. Desktop integration initiates this. |
| GET `/api/cli-auth/request?code=...` | Public | Poll request state, expiry, and token after approval. Missing code is 400; missing/expired request is 404. Treat code/token as credentials. |
| POST `/api/cli-auth/approve` | Browser | `{code}`; returns status, email, token expiry. Provide explicit approval and success/expired/error states at the existing deep link. |
| GET `/api/profile` | User | Read profile, sharing settings, logbook rules and saved collections. |
| PUT `/api/profile` | User | Save scalar settings and supplied collections; see replacement rules below. |
| GET `/api/profile/licenses/{id}/pdf` | User | Authenticated inline PDF bytes, no-store. Preview/download through an authenticated request. 404 if absent. |
| PUT `/api/profile/licenses/{id}/pdf` | User | `{filename,content_type:"application/pdf",data_b64}` for an existing certificate. PDF signature and decoded size validated; returns profile. |
| GET `/api/public/divers/{slug}` | Public | `{diver,dives,stats}` for enabled sharing; otherwise 404. Slug route allows lowercase letters, digits and hyphens. Read privacy caveat below. |
| GET `/api/dives` | User | `limit`, `offset`, `include_samples`, `include_raw_data`; returns `{dives,stats,imported_count,limit,offset,total}`. Default limit 100, configured cap default 200. |
| GET `/api/dives/{id}` | User | Full dive including samples; optional `include_raw_data`. Support deep-linked detail independent of the loaded list. |
| POST `/api/dives` | User | Create/upload raw or manual dive envelope. Required nonempty vendor, product, dive_uid, raw_sha256, raw_data_b64. Returns `{inserted,id}`; 201 new, 200 duplicate. |
| PUT `/api/dives/{id}/logbook` | User | Replace logbook metadata using `{logbook:{...}}` or a flat metadata object. Returns updated dive. Does not update recorded metrics or tank fields. |
| DELETE `/api/dives/{id}` | User | Permanent deletion; returns `{deleted:true,id}`. Confirm identity of dive; handle stale 404. |
| GET `/api/equipment` | User | `{equipment:[...]}`. |
| PUT `/api/equipment` | User | `{equipment:[...]}` replaces the entire inventory. Creation, editing and deletion all use this route. |
| POST `/api/equipment/{id}/service` | User | Sets `last_serviced_at` to now and `last_service_dive_count` to zero; returns `{equipment:item}`. Does not create a service-history entry. |
| GET `/api/device-state?vendor=...&product=...` | User | Read a sync checkpoint; both query values required. Missing record returns empty timestamp/null fingerprint. |
| PUT `/api/device-state` | User | `{vendor,product,fingerprint_hex}`; save per-device checkpoint and return it. Primarily desktop plumbing, not browser hardware connectivity. |
| POST `/api/imports/csv` | User | Raw `text/csv` or JSON `{csv:"..."}`; `dry_run=1` previews. See import workflow. |
| POST `/api/imports/subsurface` | User | Raw XML, gzip or ZIP with the declared supported MIME type; `dry_run=1` previews. ZIP reads first `.xml`/`.ssrf` member. |
| GET `/api/geocode/search?q=...` | User | Nominatim-backed single-result lookup: `{found,result}`. Empty query 400; no result is successful `{found:false,result:null}`; upstream failures 503. |
| GET `/api/exports/dives.csv` | User | Download all user's dives, one row per sample (one row for a dive without samples). Not filtered by current UI selection. |
| GET `/api/exports/dives.pdf` | User | Download minimal one-page summary, currently at most 33 dive lines. Not a complete printable logbook. |
| GET `/api/backup/export` | User | Download version-1 ZIP containing `backup.json` and certificate documents, including profile, raw dives/samples, checkpoints and equipment. |
| POST `/api/backup/import` | User | `application/zip` or `application/json`, version 1. Restore to current user; returns counts under `summary`. No preview endpoint. |

Additional server capabilities: GET `/health` is a health alias; GET `/config.js` supplies runtime demo configuration; GET `/metrics` exposes Prometheus metrics only when enabled (otherwise 404); built frontend assets and SPA routes are served by the backend. These are operational features, not new navigation destinations. Database migrations/startup controls, CORS, request limits, security headers, logging, and metrics are deployment concerns, not browser-editable settings.

## 4. Persisted entities and editing semantics

### Dive

The returned envelope contains `id`, `user_id`, `vendor`, `product`, nullable `fingerprint_hex`, `dive_uid`, nullable `started_at`, `duration_seconds`, optional `duration_ms`, nullable `max_depth_m` / `avg_depth_m`, `import_payload`, `fields`, `raw_sha256`, optional `raw_data_b64`, optional `samples`, `sample_count`, and `imported_at`. Duration seconds falls back to milliseconds divided by 1000. Missing values are not zero measurements.

`fields` and samples are flexible JSON rather than a fully validated typed domain schema. Preserve unfamiliar fields. Reuse existing normalization helpers for sample times, depths, pressures, temperatures, gases, tanks and derived values; do not assume uniform device formats.

The current user-facing metadata vocabulary under `fields.logbook` is:

| Key | UI meaning |
|---|---|
| `site`, `buddy`, `guide` | Dive site, buddy and guide names, with saved-collection autocomplete. |
| `weather_description`, `visibility` | Conditions. |
| `wetsuit_description`, `weight_description` | Exposure protection and weights. |
| `notes` | Freeform dive notes. |
| `equipment_ids` | Selected equipment identifiers. |
| `equipment_snapshot` | Historical equipment details when supplied; backend does not create snapshots automatically. |
| `status` | Existing frontend treats exactly `complete` as logged; everything else as pending/imported. |
| `completed_at`, `updated_at` | Completion metadata when supplied; backend sets updated_at on logbook save. |

Logbook PUT replaces the whole logbook object, adds updated_at, and defaults missing status to complete. Merge existing metadata before saving to avoid deleting snapshots, completion timestamps, or unknown keys. There is no general dive PATCH/PUT: date, duration, depth, source data and samples are not editable through this endpoint.

Duplicate detection is `(user_id,dive_uid)`, not a visual comparison of date/depth. A repeated upload is skipped, not merged. List order is started_at descending, null dates last, then ID descending. There is no server search, field filter, custom sort, aggregate-statistics endpoint, batch delete, or import-job entity.

### Profile and saved collections

Profile scalars: `name`, `email`, `public_dives_enabled`, `public_slug`, `logbook_display_fields`, `required_logbook_fields`, `equipment_selection_enabled`. Defaults are sharing off, blank slug/name/email, empty display-field list, required site, equipment selection on. Profile identity/email is separate from authentication identity/email.

Collections:

- `licenses`: `id` / `license_id`, `company`, `certification_name`, `student_number`, `certification_date`, `instructor_number`.
- `dive_sites`: `id` / `site_id`, `name`, `location`, `country`, numeric/null `latitude`, `longitude`.
- `buddies`: `id` / `buddy_id`, `name`.
- `guides`: `id` / `guide_id`, `name`.

An omitted collection is retained. A supplied collection replaces all its rows, including an empty array deleting all rows. Keep stable IDs and serialize saves to avoid overwriting unrelated changes. Blank name/email/public_slug currently retain previous scalar values rather than clearing them. No optimistic concurrency/version check is provided.

Certificate documents are stored separately. Upload requires an existing license ID. There is no document-delete endpoint, and removing a license does not explicitly delete its stored PDF. Current profile reads do not enrich license rows with the `pdf` metadata expected by the frontend; account for that integration gap.

### Equipment

Persisted fields: `id` / `equipment_id`, `name`, `category`, `icon`, `type`, `year_bought`, `vendor`, `brand`, `model`, `serial`, `warranty`, `next_service_due`, `service_interval_months`, `last_service_date`, `max_dives_before_service`, `track_service`, `service_tag`, `is_default`, `is_standard`, `last_serviced_at`, `last_service_dive_count`, `updated_at` and user ownership.

The frontend must support inventory CRUD, default/standard selections for new dives, dive-equipment association, service date/interval and dive-count settings, due/overdue/unknown presentation, and marking serviced. Service calculations are frontend-derived. The backend does not automatically increment usage counts, advance next-service dates, synchronize last_service_date, retain service history, or send reminders. Do not label historical equipment state as verified unless a snapshot supports it.

## 5. Required workflows and screens

Preserve the following URLs and their deep-link/back/forward behavior. Login is currently an application state, not a separate route in the route catalog. Preserve supported legacy hash migration.

| Route / area | Required content and interactions |
|---|---|
| `/` dashboard | Useful onboarding with no dives; overview of actual recorded data; recent dives; pending-import callout; map preview; clear Add dive and Import actions. Distinguish total records from completed logbook entries. |
| `/logs` | Completed dive list; desktop table/mobile cards; search; site/buddy/guide filters; existing sorts (date, sequence, depth, duration, pressure used, temperature, site, buddy, guide, device/computer); configurable metadata; pagination; detail navigation; empty/no-results/loading/error states. |
| `/logs/:diveId` | Date/time, site, source/device, duration, max/average depth, temperatures, gas/tank/pressure data, depth/pressure profiles where recorded, notes, buddy/guide, conditions, selected equipment/service context, edit/delete actions. Existing derived SAC, oxygen/decompression/checkpoint details only when supported by available data. |
| `/logs/create` | Manual dive form: date, time, duration minutes, max depth metres, optional temperature °C, tank litres, entry/exit bar, all metadata and equipment. Use existing envelope creation including generated UID, SHA-256 and base64 source; do not ask users to enter these technical fields. |
| `/logs/:diveId/edit` | Edit supported metadata and equipment, show required fields, save/cancel/error/dirty state. Recorded device data remains clearly presented. Tank-edit persistence requires backend work, detailed below. |
| `/imports` | Pending records already stored in dives; missing-field and completion indicators; review/edit, discard, supported batch operations with honest per-item results. This is not a durable backend upload-job list. |
| `/imports/:importId` | Review a pending dive (ID represents a dive), inspect recorded profile, enrich metadata, save incomplete draft, or complete and move into logbook. |
| `/map` | Geographic dive exploration, markers/grouping, dive links, unmapped records and missing-coordinate state, map loading/tile failure fallback. Keep a usable list alternative. There is no map-data API; derive from dives and saved sites. |
| `/equipment` | Searchable/browsable inventory, item form, default kit selection, service summary, service action, delete confirmation, empty state. |
| `/settings/diver-details` | Diver profile identity; public-sharing toggle/slug/link; certifications and authenticated PDF preview/upload; password change wherever currently exposed. |
| `/settings/application-settings` | English/German/French; light/dark/system; logbook display fields; required metadata fields; equipment-selection toggle. Theme and locale are browser-local, not profile API settings. |
| `/settings/dive-sites` | Saved sites CRUD; location/country/coordinates; location lookup; map preview; no-result and failed-lookup states; manual coordinate fallback. |
| `/settings/buddies` | Saved buddy-name CRUD and reusable autocomplete entries. |
| `/settings/dive-guide` | Saved guide/instructor-name CRUD and reusable autocomplete entries. |
| `/settings/data-management` | CSV/Subsurface preview/import, CSV/PDF downloads, desktop sync instructions/approval entry. Keep flows discoverable from main Import action as well. |
| `/settings/manage-users` | Owner-only registration toggle, invitation link generation, user listing/direct creation/edit/activate/deactivate/delete. Preserve owner restrictions and handle non-owner deep links. Existing UI coverage is not evidence that every backend action is already wired. |
| `/settings/backup` | ZIP backup download; ZIP/JSON restore selection, explanation, confirmation, progress/busy state, result counts and partial-failure handling. |
| `/settings/cli-auth/:code` | Explicit desktop authorization tied to signed-in identity, expiry/error/success. Never auto-approve on route entry. |
| `/settings` | Defaults to diver details and gives clear access to all applicable sections. |
| `/public/:slug` | Anonymous read-only diver overview, dive list/map, truthful summaries, shareable URL, unavailable/disabled/error states. No owner controls or private PDF requests. |

### Manual entry and completion validation

Preserve existing client checks: duration > 0, max depth >= 0, optional finite temperature, tank volume > 0, pressures 0–400 bar, exit pressure <= entry pressure. Validate date/time. Label units consistently (current product uses metric values). Configurable required metadata keys are site, buddy, guide, weather_description, visibility, wetsuit_description, weight_description, notes. Existing normalization falls back to site when no supported required fields remain.

Saving an incomplete import uses status imported; completing uses status complete after required-field validation. Required-field enforcement is presently frontend behavior, not backend validation. Importers mark dives complete whenever site is nonempty, even if additional configured requirements are missing; reconcile this mismatch before promising universal completion rules.

### Import preview and submission

1. Select CSV or Subsurface XML/SSRF/gzip/ZIP; show format instructions and filename.
2. Send the actual file body with correct Content-Type (not multipart FormData). CSV also accepts JSON with a csv string.
3. Preview using dry_run. Render summary rows/valid_rows/invalid_rows/ready_rows/duplicates and per-dive row_number, source_id, UID, date, site, duration, depth, sample count, errors, valid/duplicate/status.
4. Prevent submission with invalid rows: current importer rejects the entire parsed file if any row is invalid. There is no endpoint to select individual preview rows or submit a corrected preview object. Offer file correction and re-preview.
5. Submit the same file without dry_run. Report actual rows, inserted, duplicates, IDs and summary. Duplicate-only import is a successful no-op.
6. Refresh records and show where completed versus pending entries went. A failed write can follow earlier successful inserts: imports are not one transaction. Re-fetch before retry, do not promise rollback or undo.

CSV requires started_at (or date plus time), duration_seconds or duration_minutes, and max_depth_m. It accepts device/UID/raw metadata, avg_depth_m, samples_json and supported logbook/temperature/gas/tank columns; exact parsing lives in `internal/importers/csv.go`. No arbitrary column-mapping API exists. Subsurface parsing preserves the implemented site/location, notes, buddy/guide, conditions, dive metadata and sample values; do not promise every Subsurface extension survives.

### Backup and exports

Backup exports all the current user's profile, dives including raw bytes/samples, equipment, device checkpoints and license documents. It is not an instance backup: users, passwords, invitation/session records and browser-local settings are not included.

Restore overwrites supplied profile collections and equipment, upserts device checkpoints, inserts dives while skipping existing UIDs, then restores documents. It does not replace the entire dive log or update existing duplicate dives. Operations are sequential, not globally transactional. Explain these specific effects before restore and recommend downloading the current backup first. After failure, refresh state because some writes may have succeeded. No backend dry-run, rollback, scheduler or cloud backup exists.

CSV is an analytical sample export, not a guaranteed lossless reimport format. PDF is currently a short summary; a full paginated printable logbook requires exporter changes. Downloads need bearer-authenticated fetches and blob handling, meaningful names, busy/error feedback and object-URL cleanup.

## 6. Integration gaps to resolve before claiming feature completeness

These are source-level findings, not browser-reproduced bug reports.

| Priority | Finding | Required action / UI implication |
|---|---|---|
| P0 | Frontend requests limit=250 once, backend defaults to cap 200; controller does not fetch remaining pages. | Paginate to total (respect returned limit) or design explicit server pagination. Global client filters, numbering, maps and totals cannot use only the first page silently. Fetch deep-linked dives independently. |
| P0 | Backend stats contains only totalDives for the returned slice; imported_count is hardcoded 0. Controller merges this into initially zero metrics; public page expects totalHours/maxDepth too. | Compute documented aggregates over a complete intended dataset or add aggregate API. Existing higher-level totals are not reliably populated. Show unavailable instead of fabricated zero. |
| P0 | Public profile removes only email and licenses, returns all dives and much remaining profile data. Dive import_payload can retain nested samples/fields even when top-level samples are omitted. No complete-status filter or field allowlist. | Do not promise selected-dive sharing or private notes/buddies/device metadata. Define and implement a backend public response allowlist and intended completion filter before expanding sharing. Hiding fields in the UI does not make them private. |
| P0 | Logbook updater ignores sibling commit/tank_volume_l/begin_pressure_bar/end_pressure_bar when logbook is supplied. Current frontend sends these. | Fix backend tank-edit semantics with persistence tests, or remove/disable those edit controls with accurate explanation. Manual initial creation stores tanks separately and works through another path. |
| P0 | Logbook replacement can discard metadata not resubmitted. | Merge and preserve completion dates, equipment snapshots and unknown fields; ensure status is explicit. |
| P1 | PDF validator allows 10 MiB decoded, but endpoint uses generic default 1 MiB JSON body limit (base64 expands bytes). | Align server limits or show the actual effective constraint. Do not promise a working 10 MiB upload until aligned. |
| P1 | Profile license rows lack pdf metadata expected by UI; no standalone delete route. | Add metadata/existence contract or handle authenticated PDF lookup including 404. Do not fake an attached-file indicator or promise PDF deletion. |
| P1 | Equipment serviced action only stamps last_serviced_at and resets one counter; UI may prefer old last_service_date. | Define consistent date/count semantics, refresh returned state and verify due-state changes; do not claim a service ledger. |
| P1 | Importer completion depends on site, not saved required-field settings. | Align rules or clearly revalidate/review imported records in frontend. |
| P1 | Blank scalar profile strings cannot clear existing values; slug validation/uniqueness is not enforced by the handler. | Validate URL-compatible slugs; surface save failures. Backend work needed for reliable clearing/uniqueness rather than optimistic success. |
| P1 | PDF summary truncates after 33 dives; CSV is per sample and not lossless round-trip. | Label downloads accurately, or improve backend exports before advertising full-logbook output. |
| P1 | Whole-list collection saves, sequential imports/restores, and no version checks. | Serialize mutations, preserve other items, prevent double submission, retain drafts and refresh after partial failure. Avoid unsupported undo/concurrent-edit guarantees. |

## 7. Visual and interaction improvement plan

### Phase 1 — Establish truth and baseline

Audit each route and workflow against sections 3–6. Capture current desktop/mobile screens and identify navigation, density, spacing, contrast and interaction problems using a real browser. Resolve P0 integration issues or explicitly constrain affected UI. Keep the backend contract as the source of truth; existing mock fixtures are not proof of real-server behavior.

### Phase 2 — Shared visual system and navigation

Use a restrained ocean-inspired palette with one primary action color, readable neutral surfaces, deliberate typography, consistent spacing and status treatments that include text/icons. Define tokens for light/dark/system modes. Standardize page titles, toolbars, cards, tables, fields, buttons, dialogs, empty states, errors, toasts and loading skeletons. Prefer data clarity over decorative gradients or oversized statistics.

Give primary navigation clear destinations: Overview, Logbook, Imports (pending count), Map, Equipment, Settings. Preserve route paths even if labels change. Make Add dive and Import discoverable. On mobile, keep all destinations reachable with an overflow menu if needed. Settings should have a navigable section list, not one giant form; owner-only controls appear only for the owner.

### Phase 3 — Main dive journeys

Implement overview, responsive log list, detail, manual create, edit, import queue and import review together. Use progressive disclosure: essential log fields first, conditions/gas/equipment as organized secondary groups. Keep save/complete actions visible on long forms. Separate a saved draft from a completed entry. Retain filters/list position on return from a detail view.

Use genuine recorded depth/pressure series with units, axes and text summaries; render missing-data states instead of synthetic recordings. Source/technical metadata can be collapsed. Prioritize meaningful notes and site context alongside measurements.

### Phase 4 — Supporting features

Complete map/list interactions, equipment and service flows, every settings section, certificate preview, backup/restore, owner management, desktop approval and anonymous public pages. Reuse shared collection editors and form patterns without losing entity-specific fields or permissions.

### Phase 5 — States, accessibility and release verification

For each data view provide initial loading, empty, populated, refresh, failed load/retry and unavailable/forbidden states. For each mutation provide validation, dirty state, saving, success, failure with retained input, and duplicate-submit prevention. Confirm destructive actions with the actual item identity. Avoid optimistic success for replacement writes and irreversible operations.

Support keyboard navigation, visible focus, properly associated field labels/errors, named icon buttons, dialog focus/return focus, semantic tables/headings, screen-reader announcements, adequate contrast, reduced motion and comfortable touch targets. Never rely on color alone. Test at 360–390px mobile, tablet and wide desktop, including long names/translations and large lists. Preserve all three locales and all theme modes. Maps/charts need usable text/list alternatives.

Handle API 400 validation, 401 session/credential errors, 403 access denial, 404 missing data, 409 conflicts, 413 size limits, 415 content types, 429 rate limiting (respect Retry-After), and 5xx/unreachable/timeout states. Do not equate a live health endpoint with successful application data loading.

Configured default upload limits are JSON 1 MiB, CSV 5 MiB, Subsurface 15 MiB, backup 25 MiB; Subsurface decompression is also limited. Limits can change per deployment and are not currently advertised by a capabilities endpoint. Do not hardcode them as universal guarantees. Rate limits cover uploads/imports, backups and CLI flows.

## 8. Acceptance checklist and verification

- Every method/path in section 3 is accounted for by a visible workflow, supporting integration, or explicit operational-only classification.
- A new instance can create its owner; an invited user can join; a closed instance does not offer public registration; regular/admin non-owner accounts cannot use owner controls.
- A diver can create a manual dive, reopen it after reload, review imported records, save an incomplete draft, complete valid metadata, edit and delete a dive.
- Large logbooks beyond the default API cap remain accessible; filters/totals clearly describe their dataset and deep links work outside the first page.
- Missing measurements render as unknown; no invented chart samples or misleading aggregate zeros appear.
- CSV/Subsurface preview handles invalid and duplicate rows and actual import outcomes; failures do not silently lose user input or conceal partial writes.
- All profile collections preserve unrelated records; equipment selections and service settings persist after reload; certificates upload/preview with the actual limit and absent-document behavior.
- Export and restore wording matches actual completeness/replacement behavior. Backup counts and resulting state are verified.
- Public-profile behavior is tested anonymously against the actual response, including disabled/missing slugs and field exposure. No client-side hiding is treated as privacy enforcement.
- CLI links survive login, require deliberate approval and handle expiry. No unsupported revoke/device-management flow is invented.
- Navigation works with direct URLs, refresh, back/forward, and existing legacy links. Every section fits narrow mobile screens, long translated text, keyboard navigation and light/dark themes.

Use existing commands from frontend/: `npm run check:structure`, `npm run check:contracts`, `npm run lint`, `npm run format:check`, `npm test`. `npm test` generates the app then runs mocked Playwright coverage. Use real-browser inspection via Playwright MCP where available. Add focused interaction/persistence coverage for changed behavior, especially the P0 gaps; do not rely only on fixture happy paths. If backend changes are made, run `go test ./backend/...` from repo root and appropriate integration/full-app tests. `npm run build` already runs tests before generation; avoid needless duplicate full runs. This planning-only change did not run application tests.

## 9. Source map for implementation

- API catalog/auth policies: [routes.go](../backend/internal/httpapi/routes.go), [server.go](../backend/internal/httpapi/server.go).
- Handler requests/responses: [domain_handlers.go](../backend/internal/httpapi/domain_handlers.go), [auth_handlers.go](../backend/internal/httpapi/auth_handlers.go), [requests.go](../backend/internal/httpapi/requests.go).
- Persistence/replacement behavior: [store/domain.go](../backend/internal/store/domain.go), [store/auth.go](../backend/internal/store/auth.go).
- File processing: [csv.go](../backend/internal/importers/csv.go), [subsurface.go](../backend/internal/importers/subsurface.go), [exports.go](../backend/internal/exports/exports.go), [backup_archive.go](../backend/internal/httpapi/backup_archive.go).
- Limits/runtime: [config.go](../backend/internal/config/config.go), [migrations.go](../backend/internal/migrations/migrations.go).
- Route/state wiring: [routes.js](../frontend/app/routing/routes.js), [AppRouteController.vue](../frontend/app/features/app/AppRouteController.vue).
- Feature views: [features](../frontend/app/features); API adapters: [shared/api](../frontend/app/shared/api).
- Dive normalization and completion rules: [core.js](../frontend/app/shared/utils/core.js); collection schemas: [settings-profile.js](../frontend/app/shared/utils/settings-profile.js); service helpers: [equipment-dive.js](../frontend/app/shared/utils/equipment-dive.js).
- Existing regression coverage: [app.spec.js](../frontend/tests/app.spec.js), [full-app tests](../frontend/full-app-tests/app.spec.js), [backend handler tests](../backend/internal/httpapi/domain_handlers_test.go).

## 10. Copyable kickoff prompt

> Improve DiveVault's UI in the existing repository using docs/UI_REDESIGN_BRIEF.md as the feature and API contract. First inspect current routes and browser behavior, then implement the visual system and workflows in the phases given. Preserve every supported feature and route, all locales/themes, authentication/owner permissions and real persistence. Resolve or explicitly constrain documented API gaps before exposing controls or privacy claims that depend on them. Keep new work in the existing feature/shared/API architecture. Deliver responsive accessible screens with all loading, empty, error, dirty, saving and success states. Verify the changed journeys with existing checks, focused tests and browser inspection. Report completed features, evidence, and remaining backend prerequisites; do not silently replace unavailable functionality with mock data.
