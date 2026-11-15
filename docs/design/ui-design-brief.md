# UI design brief: Monitory

Hand-off for a design chat. The product requirements and API are already decided; this file tells you what the UI must do and what data it has. Please design within these constraints rather than around them.

Attach `docs/requirements.md` and `docs/openapi.yaml` too (requirement numbers like FR-16 below refer to `requirements.md`).

## What you are designing

A self-hosted uptime and status monitor. One admin adds services (web endpoints or TCP ports); the app checks them in the background and sends an email or webhook alert when one goes down or recovers. An optional public page shows the status of chosen services to anyone.

- **Users:** one admin, signed in. Anonymous viewers of the public page. At most 50 services, each with at most 5 notification targets. No other accounts.
- **Devices:** desktop and mobile, down to 360 px wide with no sideways scrolling (NFR-3). Latest two versions of Chrome, Firefox, Safari and Edge (NFR-2).
- **Content:** text only. Service settings, current status, times, failure reasons. No images, files, charts, history or uptime percentages: only the current state of each service exists.
- **Front-end stack:** React with Base UI (unstyled, accessible primitives: dialog, switch, select, tabs, tooltip, menu, toast), plain CSS with design tokens (custom properties), Lucide icons. The design must be implementable with these: use their ordinary patterns and one icon set.
- **Style:** none chosen: please propose one. The admin is a technical user who wants dense, quick, keyboard-friendly screens.
- **Times:** shown in the viewer's local time (FR-94).
- **Plain text only:** names, messages and response bodies are shown as plain text, never rendered as HTML (NFR-7).

## Screens

### 1. Sign-in (FR-1, FR-2, FR-97)

Username, password, submit. No sign-up, no "forgot password", no password change: do not design them.

States: idle; submitting; wrong credentials (one message that does not say which field was wrong); locked after 5 failures (says how long to wait); HTTPS required (shows the server's explanation of how to turn the setting off); server unreachable.

Keyboard: Tab through fields in order, Enter submits, focus always visible (NFR-4).

### 2. Admin dashboard (FR-9, FR-62, FR-95, FR-26)

The home screen after sign-in. A flat list of all services, ordered by name. No grouping, tags, search or pagination.

Each service shows: name (up to 100 characters; design the overflow), type (HTTP or TCP), status, time of the last check, time of the last status change, the failure reason when unhealthy, whether alerts are on, whether it is shown on the public view, and a notice when any of its notification targets has "last delivery failed" (FR-86).

Status of a service, each needing a distinct look that does not rely on colour alone: healthy; unhealthy (with reason); not yet checked; paused (replaces the status while paused).

Failure reasons to word: timed out; could not connect; non-2xx status (with the code); JSON rule matched (with the field); invalid or missing JSON; too many redirects; certificate problem (FR-61).

Screen-level elements: add service; refresh button, plus automatic refresh every 5 minutes (show when it was last updated); the public view on/off switch (off by default) with a link to the public page; sign out.

Per-service actions: edit; pause or resume; open its alert list; delete (confirmation, see below).

States: loading; empty (no services yet, with a prompt to add one); list; refresh failed (keep the old data, say so); service limit reached (the 51st add is refused); session expired (return to sign-in).

Small screens: the list must work at 360 px; a table that needs sideways scrolling is not acceptable.

### 3. Add or edit a service (FR-6, FR-7, FR-33 to FR-74, FR-104 to FR-106)

One form for both. Editing shows every saved value, including header values in full (FR-39).

Fields:

- Name: required, up to 100 characters, unique ignoring case.
- Type: HTTP(S) or TCP port. Changing it swaps the type-specific fields.
- HTTP(S): method (GET, HEAD, POST, PUT, DELETE, CONNECT, OPTIONS, TRACE, PATCH); URL (must start with http or https, up to 2,048 characters including query parameters); query parameters (name and value rows, up to 20); headers (name up to 128, value up to 4,096 characters, up to 20 rows); body type (none, JSON, plain text, URL-encoded form) and body text (up to 64 KB). Separate fields only: no raw-text editing, no paste-a-curl.
- HTTP(S) health rules: JSON rules (up to 10 rows; each a dotted field path such as `checks.db.status` and a failing value that is text or true/false); a setting for "fail when any rule matches" or "only when all match".
- HTTPS only: certificate expiry check on/off with minimum days left (1 or more); ignore certificate errors on/off. Both are unavailable when the URL is not https.
- TCP: host (required) and port (1 to 65535).
- Timing: check interval (default 60 s, 30 to 86,400), timeout (default 10 s, 1 to 60), retry count (default 2, 0 to 5), retry interval (default 10 s, 1 to 300). The limits can differ per install, so show the server's error rather than relying on fixed hints. One cross-field rule: timeout × (1 + retries) + retry interval × retries must not exceed the check interval; its error belongs to the timing group as a whole.
- Alerts on/off (on for a new service); unhealthy message and recovery message (each up to 500 characters, optional, a default is used when empty).
- Show on public view on/off (off for a new service).

Test before saving (FR-104): a button runs one attempt with the form's current values and saves nothing. Result: healthy or failed, the failure reason, how long it took, and for HTTP the status code and the response body (plain text, up to 64 KB, with a "cut off" notice when longer). Design the result area for a long body and for no body.

States: idle; saving; saved (returns to the dashboard; a new service appears as not yet checked); field errors from the server, shown on the named fields, including fields inside rows (for example the third header's value); name already used; service limit reached; request too large; test running; test result healthy; test result failed; test refused because fields are invalid; service not found (deleted meanwhile); session expired.

Keyboard: the whole form without a mouse, including adding and removing rows (NFR-4).

### 4. A service's alert list (FR-14 to FR-19, FR-80 to FR-92, FR-100, FR-107)

Belongs to one service; reached from the dashboard. Lists up to 5 notification targets in the order added. Each shows: name (optional, up to 50 characters), type (email or webhook), the address or URL, and a "last delivery failed" notice that stays until a later delivery succeeds.

Add or edit a target: name; type; for email, the address (valid format, up to 254 characters); for webhook, the URL (http or https, up to 2,048 characters) and custom headers (same limits as service headers). When the webhook URL starts with http, a warning says the URL and headers are sent unencrypted; saving is still allowed (FR-100).

Send test alert (FR-107): one attempt to this target only with the form's values; shows delivered, or failed with the reason (for example "no SMTP account configured").

States: loading; empty (no targets: no alerts will be sent); list; list full (a sixth add is refused); saving; field errors; duplicate contact in this list; test sending; test delivered; test failed; target or service not found; session expired. Also show when the service's alerts are off, since targets then receive nothing.

### 5. Public dashboard (FR-26 to FR-32, FR-40, FR-63, FR-113)

No sign-in. For each chosen service: name, status (healthy or unhealthy only) and time of the last check. Nothing else: no URL, type, failure reason or link to the admin. Refresh button, plus automatic refresh every 5 minutes.

States: loading; list; empty (the view is on but no service is shown); unavailable (the admin has turned the public view off); too many requests (says how many seconds to wait); refresh failed (keep the old data, say so).

## Destructive actions and confirmations

| Action | Reversible | Affects | Confirmation |
|---|---|---|---|
| Delete a service (FR-70 to FR-72) | No | The service, its alert list (up to 5 targets) and its state; checks stop | Required. Names the service and says how many notification targets go with it. Usable by keyboard (NFR-4) |
| Remove a notification target (FR-16) | No | That target only | Not required by the requirements; propose one or an undo-free plain action |
| Pause a service (FR-75 to FR-78) | Yes (resume) | Checks and alerts stop; hidden from the public view; state kept | None |
| Turn the public view off (FR-26, FR-29) | Yes | Anonymous viewers see "unavailable" | None |
| Sign out (FR-3) | Yes | Ends the session | None |
| Leave a form with unsaved changes | No | The typed values | Propose one |

## Data not available

Do not design for these; the API does not have them: check history, uptime percentages, response times of real checks, graphs; who received which alert or a delivery log; a failure reason on the public page; service groups, tags, search or sorting options; other users, roles or profile settings; SMTP settings or any limit as an editable screen (they are deployment configuration); the configured limits as readable values (the page learns a limit only from a server error).

## Error and state table

Every error the API can return to a screen. Reconciled against the design when it comes back: a state in the design with no row here is a question for the user, not something to build.

| State shown in the design | Source in `openapi.yaml` | Notes |
|---|---|---|
| Wrong credentials | `signIn` 401 `invalid_credentials` | Never says which field |
| Sign-in locked, wait N | `signIn` 429 `sign_in_locked`, `Retry-After` | Seconds |
| HTTPS required | `signIn` 403 `https_required`, `detail` | Show `detail` |
| Session expired or signed out | any gated operation 401 `unauthenticated` | Go to sign-in |
| Request not accepted | gated writes 403 `csrf_failed` | Reload and retry |
| Field errors | 422 `validation_failed`, `errors[].field`, `errors[].code`, `errors[].message` (shown as it is) | Codes: `required`, `too_long`, `out_of_range`, `too_many`, `invalid_format`, `invalid_value`, `requires_https_url`, `check_budget_exceeded` (field `settings`) |
| Name already used | `createService`, `updateService` 409 `service_name_taken` | On the name field |
| Service limit reached | `createService` 409 `service_limit_reached` | |
| Alert list full | `createTarget` 409 `alert_list_full` | |
| Contact already in the list | `createTarget`, `updateTarget` 409 `target_duplicate` | |
| Service or target not found | 404 `not_found` | Deleted meanwhile |
| Request too large | 413 `payload_too_large` | Over 1 MB in total |
| Malformed or wrong type of request | 400 `malformed_request`, 415 `unsupported_media_type` | Not reachable from the forms; one generic error |
| Check test: healthy or failed | `testServiceCheck` 200, `healthy`, `failure_reason`, `duration_ms`, `http_status`, `response_body`, `response_body_truncated` | A failed test is not an HTTP error |
| Target test: delivered or failed | `testTarget` 200, `delivered`, `failure_reason` | A failed test is not an HTTP error |
| Service status and failure reason | `Service.state.status`, `Service.paused`, `state.last_failure_reason` | Paused replaces status |
| Last delivery failed on a target | `Target.last_delivery_failed` from `listTargets` | Alert list screen |
| Alert delivery failed on a service row; target count in the delete dialog | `Service.alert_delivery_failed`, `Service.target_count` from `listServices` | Added to the contract at reconciliation (0.2.0) |
| Public view unavailable | `getPublicDashboard` 404 `public_view_unavailable` | |
| Too many requests, wait N | `getPublicDashboard` 429 `rate_limited`, `Retry-After` | Seconds |
| Server unreachable or unexpected error | no contract source (network failure, 5xx) | One generic message with retry |

## Handing the design back

Return the design as files the repo can hold under `docs/design/` (HTML and CSS are fine): every screen above at desktop width and at 360 px, with each listed state, plus the tokens (colours, type, spacing, radii) as CSS custom properties. They are a reference for agents: styles may be copied into the project's tokens, component code may not.
