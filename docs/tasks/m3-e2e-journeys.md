# Task: milestone 3 end-to-end journeys

One end-to-end agent builds this on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

Milestone 3 is proven through a real browser against the real binary. After this task the suite in `e2e/` produces every failure reason of FR-61 on purpose and shows it on the test panel and on the dashboard, runs TCP checks, sends the saved request (method, query parameters, headers, body, redirects) to a stub, exercises the certificate options against an HTTPS stub with generated certificates, shows retries and the "not checked yet" state, tests a check before saving, edits a service without losing its state, pauses and resumes it, and refuses every invalid or over-limit service on the form with nothing saved. It is the end-to-end proof of milestone 3 (`docs/requirements.md` section 8, milestone 3: "each failure reason (FR-61) produced on purpose, and the limits and validation cases (FR-38, FR-56, FR-74)"). No product code changes.

Requirements covered, each by the journey named:

- FR-61, FR-62: every failure reason, and the rule that a matching JSON rule beats a non-2xx status: `timed_out`, `could_not_connect`, `non_2xx_status` (with the code), `json_rule_matched` (with the rule's field), `invalid_or_missing_json`, `too_many_redirects`, `certificate_problem`, each shown on the test panel and on the dashboard row (journeys 1, 2, 4).
- FR-41, FR-73: the timeout covers reading the body when JSON rules exist, and a body over the size limit is not valid JSON (journey 1).
- FR-44, FR-45, FR-46, FR-47, FR-48: JSON rules: text, `true`, `false`, a number compared as text, a dotted path, any or all, and the not-valid-JSON cases (journey 1).
- FR-49, FR-52, FR-33: a TCP port check is healthy while a connection is accepted and fails with `could_not_connect` when it is not, and is healthy again after one good check (FR-55) (journey 2).
- FR-35, FR-36, FR-37, FR-39, FR-58: the saved request arrives as saved (method, query parameters, headers, each body type), the saved headers arrive with each redirected request, three redirects are followed and a fourth fails, and the edit screen shows the saved header values in full (journey 3).
- FR-34, FR-50, FR-64: a self-signed, an expired and a wrong-host certificate fail unless "Ignore certificate errors" is on; with it on the expiry check still applies, and an expired certificate counts as 0 days left (journey 4). FR-74's certificate part, in part: the screen switches both options off when the URL is not `https`; the server's refusal is the backend tests' (journey 4).
- FR-51, FR-53, FR-54, FR-112: a failed check is retried the saved number of times at the saved interval, the service stays "Not checked yet" until the last retry has finished, a retry that succeeds leaves it healthy (journey 5).
- FR-104, FR-105, FR-106: the test panel shows healthy or failed with the reason, the duration, and for HTTP the status code and the body as plain text, makes one attempt, changes nothing saved, and does not run for invalid settings (journey 6).
- FR-66, FR-12, FR-59: editing keeps the status and the last status change, runs no check at the moment of saving, applies the new settings at the next check, and an edit that is invalid is refused with nothing changed (journey 7).
- FR-75, FR-76, FR-77 (dashboard part), FR-78, FR-79, FR-111 (paused part): pause stops checks and alerts and shows the service as paused, a paused service keeps its state, resume checks at once, a restart keeps it paused (journey 8).
- FR-38, FR-56, FR-57, FR-59, FR-60, FR-65, FR-69, FR-74, FR-106: every limit at the limit and one past it, with non-default configured values; the worst-case check time; the 51st-service rule; the one-megabyte request rule; every validation rule of FR-74 (journey 9).

Test titles of this task start with `M3 journey <n>` so that they cannot be confused with the journeys of milestones 1 and 2 (`--grep` and the reports).

Out of scope:

- **A TCP check that times out**, and **a healthy HTTPS service without "Ignore certificate errors"**: a TCP attempt can be made to time out only against an address that drops packets, which a local test cannot do soundly, and the app trusts only the system's certificate roots, so a generated certificate is never trusted. The probe tests cover both (`tcp-probe`, `http-certificate-options`).
- **The exact timing of a retry (a gap of a given length), the cancelling of a check in progress by a pause (FR-76), the days left to the exact day (FR-50's boundary) and the exact byte at which a body read stops (FR-73; journey 1 shows only 2,001 against 1,999 bytes under a configured limit)**: unit and probe tests with fake clocks and stubs. The journeys show only the number of attempts, the order, and a margin of days far from the boundary.
- **The webhook header rules of a target** (CR/LF, duplicate names, library-controlled names): the user dropped them; no journey expects a `422` for them.
- **The failure causes of an email** (logged only) and **authentication over `starttls`**: not visible, and a manual check (`docs/manual-checks.md`).
- **The public dashboard, the public view toggle and `getPublicDashboard`** (milestone 4), **sign-in lockout and the other milestone 5 items.** FR-77's "not shown on the public view" is milestone 4's journey.
- **Firefox and WebKit runs**: the configuration defines them; the user runs `make test-e2e`.
- **Any change to product code, the contract, `Makefile`, CI, `docker-compose.yml` or docs.**

## Prerequisite

All of these are merged on the default branch; the builder checks first and stops to ask if any is missing (it never creates them):

- The M1 and M2 suites (`m1-e2e-journeys`, `m2-e2e-journeys`): `e2e/` with `playwright.config.ts`, `support/app.ts`, `fixtures.ts` (`app`, `stub`, `receiver`, `appOverrides`), `helpers.ts`, `mailpit.ts`, `stubTarget.ts`, `stubReceiver.ts`, `globalSetup.ts`.
- The checks: `http-probe`, `http-request-send`, `http-json-rules`, `http-certificate-options`, `tcp-probe`, `check-sequence-and-state`, `scheduler`.
- The operations: `create-service-api`, `update-service-api`, `pause-resume-api`, `test-service-check-api`.
- The screens: `add-service-screen`, `service-form-timing`, `service-form-request-rows`, `service-form-json-and-cert-rows`, `service-form-type-tcp`, `service-form-alerts`, `edit-service-screen`, `service-test-panel`, `dashboard-pause-resume`, `service-name-link`, `leave-prompt-data-router`.
- `make mailpit-up` (journey 8 reads Mailpit, as in M2). The configuration keys used below are in `.env.example` and read by `platform/config`: `SERVICE_NAME_MAX_LENGTH`, `MAX_SERVICES`, `MAX_REDIRECTS`, `MAX_JSON_RULES`, `RESPONSE_BODY_MAX_BYTES`, `REQUEST_URL_MAX_LENGTH`, `REQUEST_MAX_QUERY_PARAMS`, `REQUEST_MAX_HEADERS`, `HEADER_NAME_MAX_LENGTH`, `HEADER_VALUE_MAX_LENGTH`, `REQUEST_BODY_MAX_BYTES`, `API_REQUEST_MAX_BYTES`, `CHECK_INTERVAL_MAX_SECONDS`, `TIMEOUT_MAX_SECONDS`, `RETRY_COUNT_MAX`, `RETRY_INTERVAL_MAX_SECONDS`. No configuration key is added.

`dashboard-public-switch`, `service-public-toggle` and `share-form-parts` (milestone 4 front end) may merge before or after this task; none changes `e2e/`. They change the markup around the dashboard row and the form, but not the labels this task uses. Whichever of this task and those merges second re-runs the whole Chromium project.

## Role and ownership

Role: End-to-end (`ROLES.md`).

You may change only `e2e/**`: `package.json` and `package-lock.json` (for the one dependency below), `playwright.config.ts` (only if a new setting is needed), the support code and the journeys, including the M1 and M2 support files named under "Structure". You may not change `backend/**`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/m3-e2e-journeys.plan.md`), the root `.gitignore`, `.env.example`, `Makefile`, `.github/**`, `scripts/**` or `docker-compose.yml`.

Shared files this task touches, all owned by this task while it runs: `e2e/support/helpers.ts`, `fixtures.ts`, `package.json`, `package-lock.json`. No other task changes `e2e/` and the three open milestone 4 tasks do not touch it, so any task may run at the same time.

## Operations used

None is added or changed. The journeys use the real app through the browser, and a few direct HTTP reads from Playwright's request context (the page's own cookies, as in M2), where a screen cannot show the value:

- `listServices` (`GET /api/services`): a service's id, and its `state` (`status`, `last_checked_at`, `last_status_change_at`, `last_failure_reason`) and `paused`, so that "nothing changed" is read from the server and not from a relative time on the dashboard.
- `listTargets` (`GET /api/services/{id}/targets`), as in M2.

Nothing writes over HTTP: every write goes through the form or the dashboard, so no CSRF token is needed.

## Behavior

### The harness

Everything of the M1 and M2 harness stays: one app (own port, own temporary database) and one stub per test, `globalSetup` builds the binary once, elements are found by role, label and visible text, `waitForStatus` polls, the app's environment is explicit, no test clears Mailpit, and the only fixed wait is `settle` (10 seconds, used only to show that something does not happen). This task adds:

**A dependency.** `selfsigned` 5.5.0, as a dev dependency of `e2e/` (see "Dependencies"). It is used only by `support/certs.ts`.

**`e2e/support/certs.ts` (new).** `makeCert(options)` returns `{ key, cert }` (PEM strings) from the named export `generate` of `selfsigned` (`import { generate } from 'selfsigned'`; the library returns the key as `private`, which `makeCert` maps to `key`), with an EC P-256 key and `algorithm: 'sha256'` (Go rejects a SHA-1 signature in some paths, and an EC key is quick to make). Options: `dnsNames` (default none), `ipAddresses` (default `['127.0.0.1']`), `notBefore` (default now minus 1 day), `notAfter`. Three presets used by the journeys: `validCert(daysLeft)` (the subject alternative name `127.0.0.1`, `notAfter` = now plus `daysLeft` days plus 12 hours, so that the whole days left are `daysLeft` and the margin to the truncation is half a day), `expiredCert()` (`notBefore` 30 days ago, `notAfter` 1 day ago, name `127.0.0.1`), and `wrongHostCert()` (valid for 30 days, only the DNS name `other.test`, no IP).

**`e2e/support/stubSite.ts` (new): `StubSite`.** A scriptable stub of a checked HTTP(S) service, started by the test; the M1 `StubTarget` stays as it is and keeps serving the journeys that need only a status. `new StubSite({ tls?: { key, cert } })` listens on a free port on `127.0.0.1` (HTTPS when `tls` is given); `url(path = '/')`; `close()` (it closes every open connection). Every path answers as `route(path, script)` set it, and `404` with an empty body for a path with no route. A script is `{ status?, body?, headers?, delayMs?, bodyDelayMs?, redirectTo?, failFirst? }`:

- `status` (default 200) and `body` (a string, default empty) and `headers` (extra response headers, for example `Content-Type: application/json`).
- `delayMs`: wait before sending the response head.
- `bodyDelayMs`: send the response head and the first byte of the body at once, then wait before the rest (a response whose body stalls).
- `redirectTo` (a path or an absolute URL): answer with `302` and that `Location` and no body; `status` then sets a different redirect status (for example `307`).
- `failFirst: n`: answer the first `n` requests to this path with `503` and every later one as the rest of the script says.

It records every request as `{ method, url (path and query as sent), headers, body (raw text), at }`; `requests()`, `requestsTo(path)`, `count()`.

**`e2e/support/stubTcp.ts` (new): `StubTcp`.** A `net` server on `127.0.0.1`: `listen(port?)` (a free port when none is given), `port`, `accepted()` (the number of connections accepted), `close()` (it destroys open sockets and stops listening, so the port refuses connections) and `listen(port)` again on the same port (for the journey that stops it and starts it again). `closedPort()` returns a free port nothing listens on (`freePort()` from `app.ts`).

**Fixtures** (`fixtures.ts`): `site` (a `StubSite` over HTTP, test-scoped, closed at the end, like `stub`); `tlsSite(cert)` is a function fixture that starts a `StubSite` with the given certificate and closes every one it started at the end; `tcp` (a `StubTcp`, not yet listening; closed at the end).

**Helpers** (`helpers.ts`, extended; the M1 and M2 ones stay and their behaviour does not change):

- `fillServiceForm(page, spec)`: on the open Add or Edit form, fills what `spec` gives and nothing else, without pressing Save. `spec` has: `name`, `type` (`'http'` or `'tcp'`, the radio `HTTP(S)` or `TCP port` of the group `Type`), `method`, `url`, `host`, `port`, `queryParams` and `headers` (arrays of `{ name, value }`, each added with `Add parameter` or `Add header` and filled through `Query parameter n name`, `Query parameter n value`, `Header n name`, `Header n value`), `bodyType` and `body`, `jsonRules` (an array of `{ field, kind: 'text' | 'true' | 'false', text? }`, each added with `Add rule`, filled through `Rule n field path`, `Rule n failing value type` and `Rule n failing text`), `jsonRuleMode` (`'any'` or `'all'`, the radio group `Mark unhealthy when`), `certCheck` (`{ days }`: switch `Check certificate expiry` on and fill `Minimum days left`), `ignoreCert` (the switch `Ignore certificate errors`), `timing` (`{ interval, timeout, retries, retryInterval }`, the four inputs `Check interval`, `Timeout`, `Retries`, `Retry interval`), `alerts`, `unhealthyMessage`, `recoveryMessage` (as in M2's `addService`). The exact accessible names of the selects and radios (`Method`, `Body type` and their options) are those in `frontend/src/features/service-form/components/ServiceForm.tsx` and `RequestRowsGroup.tsx`; the builder reads them there and does not invent any.
- `defaultTiming`: `{ interval: 6, timeout: 1, retries: 1, retryInterval: 1 }`, the values M2's `addService` fills. `fillServiceForm` fills the `timing` of the spec, or `defaultTiming` when the spec gives none, so that every service of this task has a 6-second interval unless the journey says otherwise.
- `saveService(page)`: press `Save service`, then wait for the dashboard heading `Services`.
- `runTest(page)`: press `Run test` and return the result area (the element with the role `status` or `alert` inside the landmark titled `Test check`, an `aside`, role `complementary`) once it shows `Healthy` or `Failed`.
- `testResult(page)`: reads the open result area into `{ outcome: 'Healthy' | 'Failed', reason, tookMs, httpStatus, body }` (`reason` the failure text; `tookMs` the number after `Took` (the panel writes `1,003 ms` with a thousands comma: strip it); `httpStatus` the number after `HTTP` or `null`; `body` the text under `Response body` or `null`).
- `waitForReason(page, serviceName, text)`: presses `Refresh` and re-reads (every 500 ms, 30 seconds) until the dashboard row of the service shows exactly `text` as its failure reason (the paragraph beside the status badge).
- `waitForPaused(page, serviceName, paused)`: presses `Refresh` and re-reads until the row has the button `Resume <name>` (paused) or `Pause <name>` (not paused). A paused row also shows the word `Paused` twice (badge and flag), so `waitForStatus` is not used for it.
- `serviceState(page, name)`: reads the service from `GET /api/services` and returns `{ id, paused, state }`.
- `nowIso()`-style comparison helpers are the builder's choice.

**Limits through the environment.** Where a journey must show a limit at the limit and one past it with a value that is not the default (so a hardcoded limit fails), it starts the app with `test.use({ appOverrides: { … } })` for its `describe` block, as M2 does for `SMTP_HOST`. The values are in each journey. The harness's own base environment (`appEnv`) is not changed.

**Timing.** The service interval is 6 seconds and a service shows unhealthy up to about 7 seconds after the stub starts failing (the rest of an interval plus one retry of 1 second; up to about 9 seconds when the failure is a 1-second timeout). Journeys that need a long window say so. Where a journey must show that something does not happen it uses `settle(page)`. Journeys that wait set `test.setTimeout(120_000)`; the configuration's 60 seconds stays for the others. No other `waitForTimeout` is used.

**Which journeys are `@smoke`:** the JSON-rule test of journey 1 (the richest form path through to the dashboard) and the TCP test of journey 2. The rest run in the full suite.

### Journey 1: the failure reasons of an HTTP check

One test per row. Each test starts a fresh app, a `StubSite` as the checked service, signs in, opens `Add service`, fills the form with `fillServiceForm` (the name from `serviceName()`, the URL of the site), and then does steps A, B and C. **A** (the test panel, FR-104): `runTest` and read `testResult`. **B** (save): `saveService`. **C** (the dashboard): `waitForStatus(…, 'Unhealthy')` and `waitForReason(page, name, <dashboard text>)`. A row marked "panel only" does A and stops (no save), because the reason is the same code and one saved service per code is enough to show the scheduler and the state.

The texts come from `frontend/src/lib/failureReason.ts` and the panel from `service-form/lib/testResult.ts`; they are written out here so that a changed word fails the test.

| Test | Site and form | Panel (A) | Dashboard (C) |
|---|---|---|---|
| `non_2xx_status` (FR-42, FR-61) | route `/` answers 503 | `Failed`, `Returned HTTP 503 (expected 2xx)`, `HTTP` 503 | `Returned HTTP 503 (expected 2xx)` |
| `timed_out`, a slow response (FR-41) | route `/` waits 3,000 ms (`delayMs`), then 200; timeout 1 | `Failed`, `Timed out`, no status and `No response was received, so there is no status code or body.`, `Took` at least 900 ms | `Timed out` |
| `timed_out`, a stalled body with a JSON rule (FR-41) | route `/` sends 200 and then stalls its body 3,000 ms (`bodyDelayMs`), `Content-Type: application/json`, body `{"status":"ok"}`; one rule `status` = `down`; timeout 1 | `Failed`, `Timed out` | panel only |
| `could_not_connect` (FR-61) | the URL is `http://127.0.0.1:<closedPort()>/` | `Failed`, `Could not connect`, `No response was received…` | `Could not connect` |
| `json_rule_matched`, text (FR-44, FR-46, FR-61) **`@smoke`** | route `/` answers 200 `{"checks":{"db":{"status":"down"}}}`; one rule, path `checks.db.status`, text `down` | `Failed`, `JSON rule matched: checks.db.status`, `HTTP` 200, the body shown | `JSON rule matched: checks.db.status` |
| `json_rule_matched`, beats a non-2xx status (FR-61) | route `/` answers 500 `{"status":"down"}`; one rule `status` = `down` | `Failed`, `JSON rule matched: status` (not the HTTP 500 text), `HTTP` 500 | panel only |
| `json_rule_matched`, true and false (FR-44) | route answers 200 `{"ok":false,"maintenance":true}`. Run 1: one rule `ok` kind `false`. Run 2 (clear the rule, add): one rule `maintenance` kind `true`. Run 3: one rule `ok` kind `true` | Run 1 and 2: `Failed`, `JSON rule matched: ok` / `JSON rule matched: maintenance`. Run 3: `Healthy` | panel only |
| a number is compared as text; text is case-sensitive (FR-45) | route answers 200 `{"code":503,"state":"Down"}`. Run 1: rule `code` text `503`. Run 2: rule `state` text `down`. Run 3: rule `state` text `Down` | Run 1: `Failed`, `JSON rule matched: code`. Run 2: `Healthy`. Run 3: `Failed`, `JSON rule matched: state` | panel only |
| any or all (FR-47) | route answers 200 `{"a":"bad","b":"fine"}`; rules `a` = `bad` and `b` = `bad`. Run 1 with `Any rule matches`: failed (`JSON rule matched: a`). Run 2 with `All rules match`: `Healthy`. Run 3 with `All rules match` and rule 2 changed to `b` = `fine`: `Failed`, `JSON rule matched: a` | as listed | panel only |
| `invalid_or_missing_json`: not JSON, empty, missing field (FR-48, FR-61) | one rule `status` = `down`. Run 1: body `not json`. Run 2: body empty. Run 3: body `{"other":1}`. | each: `Failed`, `Response is not valid JSON, or the JSON is missing`, `HTTP` 200 | Run 1 saved: `Response is not valid JSON, or the JSON is missing` |
| a body over the read limit is not valid JSON (FR-73) | the app is started with `RESPONSE_BODY_MAX_BYTES=2000` (`appOverrides`); two services saved (no panel run: the panel also caps its shown body at this limit and would print its fixed `64 KB` notice): one on a route that answers 200 a valid JSON object of 2,001 bytes (`{"status":"ok","pad":"xxxx…"}`), one on a route with a 1,999-byte object, both with one rule `status` = `down` | not run | the long one: `Unhealthy` with `Response is not valid JSON, or the JSON is missing`; the short one: `Healthy` |
| `too_many_redirects` and the limit of three (FR-58, FR-61) | `MAX_REDIRECTS` is left at its default 3. Routes: `/r1`→`/r2`→`/r3`→`/ok` (200) is three redirects; `/s1`→`/s2`→`/s3`→`/s4`→`/ok` is four. Run 1 with the URL `/r1`: `Healthy`. Run 2 with the URL `/s1`: `Failed`, `Too many redirects`. | as listed | Run 2 saved: `Too many redirects` |

Rules of every test: the stub receives exactly one request for one press of `Run test` (the panel makes one attempt with no retry, FR-104; for a redirect test the site's whole chain is one attempt). A saved service is added with `alerts: false` so that no mail is involved, except where the row says otherwise. Between runs on the same form the test changes the rules or the body (`site.route(...)`) and presses `Run test` again; a second press replaces the first result.

### Journey 2: a TCP port check

Two tests.

- **Accepted, refused, and again (`@smoke`, FR-33, FR-49, FR-52, FR-55, FR-61).** `tcp.listen()`. On `Add service` choose the type `TCP port`, fill `Host` `127.0.0.1` and `Port` with `tcp.port`, run the test: `Healthy`, `Took` shown, and `TCP checks have no status code or body.`; the HTTP fields are gone (no `URL` field). Save: the row shows the chip `TCP` and `Healthy` (`waitForStatus`). `tcp.close()`: `waitForStatus(…, 'Unhealthy')` and `waitForReason(…, 'Could not connect')`. `tcp.listen(<the same port>)`: `waitForStatus(…, 'Healthy')`, and the row's reason is gone. The test panel on the Edit screen of the same service shows `Healthy` while it listens.
- **Refused from the start (FR-61).** A port nothing listens on (`closedPort()`): the test panel shows `Failed`, `Could not connect`, `TCP checks have no status code or body.`; saved, the row is `Unhealthy` with `Could not connect`.

### Journey 3: the saved request, redirects and the edit screen

- **The request arrives as saved (FR-35, FR-36, FR-37).** A service on the site's `/probe` with the method `POST`, the query parameters `a`=`1` and `b`=`two words`, the headers `X-E2E-Token`=`abc123` and `x-api-key`=`k-1`, the body type JSON and the body `{"ping":true}`. After saving and the first check, the site's request log has a request with: method `POST`; `url` `/probe?a=1&b=two+words` or `/probe?a=1&b=two%20words` (the test accepts exactly these two encodings of the space, in the order a then b); header `X-E2E-Token: abc123`; header `X-Api-Key: k-1` (the stub reads headers lower-cased, so it compares `x-api-key`); `content-type: application/json`; the raw body `{"ping":true}`; `user-agent: Monitory`. Then edit the service to the method `GET`, the body type `None`: the next check has method `GET`, no body, no `content-type`. A second service with body type `Plain text` arrives as `text/plain` and one with `Form (URL-encoded)` as `application/x-www-form-urlencoded`, each with its body byte for byte.
- **The edit screen shows the saved header values in full (FR-39).** Open `Edit <name>` for the first service: `Header 1 value` holds `abc123` and `Header 2 value` holds `k-1`, the method is `POST`, and both query parameters and the body are filled as saved; the hint `Values are shown in full.` is visible.
- **Redirects carry the saved headers (FR-58).** The site's `/start` redirects to `/mid`, which redirects to `/end` (200). A service on `/start` with the header `X-E2E-Token`=`abc123` is healthy, and the site's log shows three requests (`/start`, `/mid`, `/end`) and `x-e2e-token: abc123` on all three.

### Journey 4: certificates

Every test starts an HTTPS `StubSite` through `tlsSite(cert)` that answers `/` with 200, and uses an `https://127.0.0.1:<port>/` URL. All the services use the default 6-second timing of `fillServiceForm`. The panel and the saved service are checked as in journey 1.

| Test | Certificate and form | Result |
|---|---|---|
| self-signed fails, and is accepted when ignored (FR-64) | `validCert(30)`. Run 1: both switches off. Run 2: `Ignore certificate errors` on | Run 1: `Failed`, `Certificate problem`. Run 2: `Healthy` (`HTTP` 200). Saved with the switch on: the row is `Healthy` |
| expired (FR-64) | `expiredCert()`. Run 1: switches off. Run 2: `Ignore certificate errors` on, certificate check off | Run 1: `Failed`, `Certificate problem`. Run 2: `Healthy` |
| a name that does not match (FR-64) | `wrongHostCert()` (the URL uses `127.0.0.1`). Run 1: switches off. Run 2: ignore on | Run 1: `Failed`, `Certificate problem`. Run 2: `Healthy` |
| the expiry check applies when errors are ignored (FR-50, FR-64) | `validCert(10)`, `Ignore certificate errors` on. Run 1: `Check certificate expiry` on with `Minimum days left` 30. Run 2: the same with 5. Run 3: the check on, `Minimum days left` 10 | Run 1: `Failed`, `Certificate problem`. Run 2: `Healthy`. Run 3: `Healthy` (exactly the minimum is fine; the half-day margin keeps this stable). Run 1 saved: the row is `Unhealthy` with `Certificate problem` |
| an expired certificate has 0 days left (FR-64) | `expiredCert()`, ignore on, `Check certificate expiry` on, `Minimum days left` 1 | `Failed`, `Certificate problem` |
| the screen switches the options off for a URL that is not https (FR-74) | Type an `https://…` URL, switch `Check certificate expiry` and `Ignore certificate errors` on, then change the URL to `http://127.0.0.1:1/` (the stub's own `http` URL may be used instead) | the note `Available only when the URL starts with https://.` shows, both switches are off and disabled, and `Save service` saves the service (the toast `Service “<name>” added.`) with no summary. The server's `422` for the two fields (`Needs a URL that starts with https://.`) cannot be reached through the form and stays with the backend validation tests |

### Journey 5: retries and the not-yet-checked state

Two tests, each with its own service and a site.

- **All attempts fail (FR-51, FR-53, FR-54, FR-112).** The site's `/` answers 503. Add the service with `timing` `{ interval: 15, timeout: 1, retries: 2, retryInterval: 3 }` (the worst case is 1 × 3 + 3 × 2 = 9 s, within 15). Right after saving, the row shows `Not checked yet` (`waitForStatus`; the first check, with its retries, takes about 6 seconds, so the page has time to read it). `waitForStatus(…, 'Unhealthy')`. The site has received exactly 3 requests when the row first shows `Unhealthy` (the next check is 15 seconds after the first, so no fourth request has arrived), the gaps between the three are each at least 2,500 ms and at most 6,000 ms (a retry interval of 3 seconds with room for a loaded runner), and `GET /api/services` has `last_failure_reason.code` `non_2xx_status`.
- **A retry that succeeds (FR-54).** The site's `/` has `failFirst: 1` (the first request answers 503, every later one 200). Same timing with `retries: 2`. After the first check cycle the row is `Healthy`; the site has received exactly 2 requests; while the cycle runs (until the site has 2 requests) the test reads the row every 500 ms and it never shows `Unhealthy`; after the cycle `GET /api/services` has `status` `healthy` and no failure reason.

### Journey 6: the test panel

Each test has its own app and site.

- **A healthy result shows what came back (FR-104, NFR-7).** The site answers `/` with 200 and the body `<b>hello</b> <script>window.pwned = 1</script>`, delayed 300 ms. `Run test` on the Add form: `Healthy`, `Took` a value of at least 250 ms with the format `<n> ms`, `HTTP` 200, the label `plain text`, and the body shown as the literal characters (the text contains `<b>hello</b>`; no `b` or `script` element exists in the result area; `window.pwned` is undefined on the page). The site has one request.
- **A failed result shows the body too (FR-104).** The site answers 404 with the body `gone`: `Failed`, `Returned HTTP 404 (expected 2xx)`, `HTTP` 404, the label `plain text, not rendered`, the body `gone`.
- **A long body is cut off (FR-104).** The site answers 200 with a body of 70,000 `x` characters: `Healthy`, the notice `Cut off: the body is longer than 64 KB. Only the first 64 KB is shown.`, and the shown body has exactly 65,536 characters. An empty body shows `No response body.`.
- **Nothing is saved and no state changes (FR-105).** A service is saved and healthy (the site answers 200). On its Edit screen change the URL to a `/broken` route that answers 503 and run the test: `Failed`. The dashboard (after `Cancel` and `Discard changes`) shows the service as `Healthy`, and `serviceState` has the same `last_checked_at`, `last_status_change_at` and no failure reason as before the test, read right before and right after (the scheduler may run a check meanwhile, so the test compares the status, the status change time and the reason for equality, and `last_checked_at` only to be not earlier). The site's log shows exactly one request to `/broken` and the service's real URL is unchanged on the Edit screen after a reload.
- **Invalid settings run nothing (FR-106, FR-74).** With the URL `ftp://x.test`: `Run test` shows `Test not run. Fix the highlighted fields first.`, the `URL` field is marked invalid with `Enter a URL that starts with http:// or https://.`, and the site's count is unchanged. With the type TCP and the port `0`: `Port` shows `Must be between 1 and 65535.`. With a JSON rule that has an empty field path: the entry `Rule 1 field path: Required.`.
- **A request over the size limit (FR-38).** The app is started with `API_REQUEST_MAX_BYTES=8192`. A body of 9,000 `x` characters (type `Plain text`) and `Run test`: the alert `The test is too large to send. Shorten the body or the header values.` shows, and the site's count is unchanged.

### Journey 7: editing a service

- **Editing keeps the state and applies at the next check (FR-66, FR-67).** Service A on `site` route `/` (200) with an interval of 20 s (`timing` `{ interval: 20, timeout: 1, retries: 1, retryInterval: 1 }`) is `Healthy`. Read `serviceState` (the status change time is set). Edit it: change the URL to a route `/other` that answers 503, save (the toast `Service “<name>” saved.`). Immediately after saving the site has no request to `/other` (no check runs at the moment of saving), the row is still `Healthy`, and `serviceState` has the same `last_status_change_at` as before. Then the next scheduled check uses the new URL: `waitForStatus(…, 'Unhealthy')` (within about 30 seconds; the test sets its own timeout), the site has requests to `/other`, and the reason is `Returned HTTP 503 (expected 2xx)`.
- **A type change keeps the state (FR-66).** A TCP service on `tcp` (listening) is healthy. Edit it to type HTTP(S) with the URL of the site (200) and save: the row's chip becomes `HTTP`, `last_status_change_at` is unchanged, and the next check is healthy; a second edit back to TCP (host and port as before) and save keeps the same status change time.
- **An invalid edit is refused and nothing changes (FR-12, FR-74).** Edit a healthy service: clear the port of a TCP service (`Enter a whole number.` on the screen) and, on an HTTP service, change the URL to `ftp://x.test` and save: the summary titled `1 field needs fixing before this can be saved.` with `URL: Enter a URL that starts with http:// or https://.`; after `Cancel` and `Discard changes` the service is unchanged (`serviceState` and a reload of the Edit screen show the old URL).
- **A name taken by another service (FR-59, update).** With two services `A` and `B`, editing `B` to `A` in a different letter case shows `Another service already uses this name (names ignore case).` on `Name` and changes nothing; saving `B` with its own name in a different case succeeds (the toast `Service “<new case>” saved.`).

### Journey 8: pause and resume

Three tests. They start the app with the default environment; the first needs Mailpit (an email target, as in M2).

- **Pause stops checks and alerts, resume checks at once (FR-75, FR-76 (shown), FR-78, FR-79).** A service on `site` (200) with the interval 60 s (`timing` `{ interval: 60, timeout: 1, retries: 1, retryInterval: 1 }`) and an email target (`uniqueAddress()`) is `Healthy`. Press `Pause <name>`: the toast `“<name>” paused. Checks and alerts stopped.`, `waitForPaused(page, name, true)`; the row shows `Paused` and the button `Resume <name>`. `serviceState` has `paused` true and the status `healthy`. `site.route('/', { status: 503 })`; `settle(page)`: the site has received no new request since the pause (the count before the pause equals the count after the wait), and the address has no mail. Press `Resume <name>`: the toast `“<name>” resumed. Checking now.`; within 5 seconds the site's count has gone up (a check ran straight away, FR-79; the interval is 60 s so no scheduled check could have run); `waitForStatus(…, 'Unhealthy')` and `waitForMessages(address, 1)`: the unhealthy alert arrives (a service that is resumed alerts as usual). `waitForPaused(page, name, false)`.
- **A paused service keeps its state (FR-78).** A service that is `Unhealthy` (the site answers 503, alerts off) is paused: `serviceState` keeps `status` `unhealthy`, the failure reason and `last_status_change_at` unchanged after the pause and after `settle(page)`; the dashboard row shows `Paused` and no failure-reason line (the dashboard shows paused instead of the failure, FR-62). `site` back to 200 while it is paused: `settle(page)`, the state is still `unhealthy` (no check ran). Resume: `waitForStatus(…, 'Healthy')`.
- **A restart keeps it paused (FR-111).** A paused service (the site's count noted), `app.restart()`, sign in again: the row is still paused (`waitForPaused(page, name, true)`), and after `settle(page)` the site's count is unchanged (a restart does not check a paused service). A second, unpaused service added before the restart, on the `stub` fixture (the first uses `site`), is checked again after it (the stub's count rises), which shows the paused one was skipped on purpose.

### Journey 9: validation and limits

All tests start a fresh app with the overrides below (`test.use({ appOverrides })` per `describe`), sign in, open `Add service`, fill the form, press `Save service` and read the messages. Unless said, every case also shows **nothing saved**: after the refusal the test presses `Cancel` and `Discard changes`, and the dashboard has no row of that name (the empty state), and `GET /api/services` is empty. Every field message below is the server's `FieldError.message` as the screen shows it, in the summary (`<label>: <message>`) and under the field; the summary title is `1 field needs fixing before this can be saved.` for one error and `<n> fields need fixing before this can be saved.` for more. A case "at the limit" saves successfully (the toast `Service “<name>” added.`).

**Describe A: the request and name limits** (FR-38, FR-59, FR-65, FR-69). Overrides: `SERVICE_NAME_MAX_LENGTH=12`, `REQUEST_URL_MAX_LENGTH=60`, `REQUEST_MAX_QUERY_PARAMS=2`, `REQUEST_MAX_HEADERS=2`, `HEADER_NAME_MAX_LENGTH=8`, `HEADER_VALUE_MAX_LENGTH=16`, `REQUEST_BODY_MAX_BYTES=32`, `MAX_JSON_RULES=2`. Each row is one test: first the case one past the limit (refused, nothing saved, then `Cancel` and `Discard changes`), then a new `Add service` with a different name for the case at the limit (saves). `serviceName()` is 12 characters (`e2e-` and 8), which is the name row's limit; the URL row builds its URL and parameters to the exact length from the stub's actual URL (the port's digit count counts). The service points at the stub target.

| Field | At the limit | One past | Message and where |
|---|---|---|---|
| name | 12 characters | 13 characters | `Name: Use 12 characters or fewer.` |
| URL with its query parameters (the length counts `?`/`&`, names, `=` and values, unencoded) | a URL plus parameters of exactly 60 characters | 61 | `URL: Use 60 characters or fewer, query parameters included.` |
| query parameters | 2 | 3 | `Query parameters: Too many rows. Use 2 or fewer.` |
| headers | 2 | 3 | `Headers: Too many rows. Use 2 or fewer.` |
| header name | 8 characters | 9 | `Header 1 name: Use 8 characters or fewer.` |
| header value | 16 characters | 17 | `Header 1 value: Use 16 characters or fewer.` |
| body | 32 bytes (type `Plain text`) | 33 | `Body: Use 32 bytes or fewer.` |
| JSON rules | 2 | 3 | `Health rules: Too many rows. Use 2 or fewer.` |
| unhealthy and recovery messages (500 is fixed, not configured) | 500 characters each (default environment) | 501 each | `Unhealthy message: Use 500 characters or fewer.` and `Recovery message: Use 500 characters or fewer.` (two errors, title `2 fields need fixing…`) |

**Describe B: timing limits and the worst case** (FR-56, FR-57). Overrides: `CHECK_INTERVAL_MAX_SECONDS=30`, `TIMEOUT_MAX_SECONDS=5`, `RETRY_COUNT_MAX=2`, `RETRY_INTERVAL_MAX_SECONDS=5` (the minimums stay 1, 1, 0, 1 from the harness and the code's defaults).

- **At the limits (FR-57).** Interval 30, timeout 5, retries 2, retry interval 5 saves (the worst case is 5 × 3 + 5 × 2 = 25 ≤ 30); the Timing group shows `5 × (1 + 2) + 5 × 2 = 25 s fits in the 30 s interval.`
- **One past, each (FR-57).** Interval 31: `Check interval: The check interval is 1 to 30 seconds.`; interval 0: the same message; timeout 6: `Timeout: The timeout is 1 to 5 seconds.`; timeout 0: the same; retries 3: `Retries: The retry count is 0 to 2.`; retry interval 6 and 0: `Retry interval: The retry interval is 1 to 5 seconds.`. Retries 0 is accepted. (When any of the four is out of range the worst-case rule is not checked: the summary has only the range errors.)
- **The worst case (FR-56).** Timeout 5, retries 2, retry interval 5 with interval 24: the Timing group shows `5 × (1 + 2) + 5 × 2 = 25 s exceeds the 24 s interval.` and the save is refused with `Timing: The longest attempt takes 25 seconds, longer than the check interval of 24 seconds. Raise the interval, or lower the timeout, retries or retry interval.` shown on the group; the same values with interval 25 save. The test panel is not blocked by it (FR-56 concerns saving; the test uses only the timeout).

**Describe C: the number of services** (FR-60). Override: `MAX_SERVICES=2`. Add two services; the third (a new name) is refused with the banner titled `Service limit reached.` and the text `This install can’t hold more services. Delete one to add this one.` with the link `Back to services`; nothing is added (the list has two rows); after deleting one on the dashboard (`Cancel` and `Discard changes`, then `Delete <name>` and confirm), a new `Add service` form filled with the same values saves and the list has two rows. The banner is screen text, not a field error: there is no summary.

**Describe D: the one-megabyte rule** (FR-38). Override: `API_REQUEST_MAX_BYTES=8192`. A service with a body of 9,000 `x` characters (type `Plain text`, `REQUEST_BODY_MAX_BYTES` left at its default): Save shows the banner titled `The service is too large to save.` with `Together its fields are over 1 MB. Shorten the body or the header values.`, no summary, nothing saved. With a body of 1,000 characters the same form saves.

**Describe E: the rules of FR-74 and the required fields** (default environment). One test with several refusals in one form where they do not hide each other, and singles where they do. After each refusal the test fixes it and shows the next; the last save works.

- An HTTP URL `ftp://x.test`: `URL: Enter a URL that starts with http:// or https://.`; an empty URL: the screen's own `Enter a URL.` and no request is sent (count `POST /api/services` requests, as M1 does).
- A TCP service with an empty host: `Host: Enter a host.`; with the port `0`: `Port: Must be between 1 and 65535.`; `65536`: the same; `65535` saves. A port with letters: the screen's own `Enter a whole number.`, no request sent.
- A JSON rule with an empty field path: `Rule 1 field path: Required.`. A rule with a path and the kind `Text` with the text left empty is **not** refused: the form sends an empty string, and the server refuses only a missing `failing_value` (`service_validation.go`), so the service saves (the test asserts the save).
- `Check certificate expiry` on with `Minimum days left` `0` on an https URL: `Minimum days left: Must be 1 or more.`; with `1` it saves (the service is checked against the stub; the panel is not needed).

### Known gaps

- **TCP timeout and a trusted certificate** are not shown (out of scope above); the probe tests do.
- **Journey 4 shows each certificate fault only as "fails unless ignored".** Every generated certificate is self-signed, so the app rejects it as an unknown authority whatever else is wrong; removing the expiry or host-name check alone fails no journey (the expiry check with ignore on is shown). FR-64's "including on redirects" is not shown either. The probe tests cover both.
- **The retry gaps, the half-day certificate margin and the stalled-body timing are bounded loosely** on purpose; exact values are the unit tests'.
- **Timing:** journeys 5, 7 and 8 depend on seconds-long intervals and can flake on a loaded runner; the bounds are wide, and a flake is reported, not retried away (`retries: 0`).
- **Mailpit is shared**, as in M2: unique recipient addresses; no test clears the mailbox.
- **The number of tests is large** (about 55 tests, most of them short). The whole Chromium project is expected to take several minutes; the builder reports the time.
- **Firefox and WebKit** are not run by the builder.

## Structure

By `TESTING.md` ("End-to-end"). Names marked "new" are fixed by this file; the rest is the builder's choice.

- `e2e/support/certs.ts` (new), `e2e/support/stubSite.ts` (new), `e2e/support/stubTcp.ts` (new); `e2e/support/fixtures.ts` and `helpers.ts` extended as above (`app.ts`, `stubTarget.ts`, `stubReceiver.ts`, `mailpit.ts` are not changed).
- `e2e/journeys/check-failures.spec.ts` (journey 1), `check-tcp.spec.ts` (journey 2), `check-request.spec.ts` (journey 3), `check-certificates.spec.ts` (journey 4), `check-retries.spec.ts` (journey 5), `test-panel.spec.ts` (journey 6), `edit-service.spec.ts` (journey 7), `pause-resume.spec.ts` (journey 8), `service-validation.spec.ts` (journey 9) (new). One file per journey; titles name the journey and the requirement IDs, and `@smoke` is in the title.
- No new script or config file. The one new dependency is below.

## Dependencies

One, not named in `STACK.md`, approved by approving this task: **`selfsigned` 5.5.0** (MIT, published 2026-01-12, depends on `@peculiar/x509` and `pkijs`, Node 18 or newer; async API `selfsigned.generate`). Resolved with `npm view selfsigned versions` and `npm view selfsigned time`. The builder adds it with `cd e2e && npm install --save-dev --save-exact selfsigned@5.5.0` and commits `e2e/package.json` and `e2e/package-lock.json`. It is used only by `support/certs.ts`, so no product code and no other workspace sees it. If its types are missing or `generate` has another signature than the one used above, the builder stops and reports. After the task merges the user adds `selfsigned` 5.5.0 to `STACK.md` (the verifier's report lists it).

`@playwright/test` 1.64.1, `typescript` 6.0.3 and `@types/node` 24.19.2 are installed by the M1 task and do not change.

## Acceptance criteria

The journeys are the tests; "fails if the behavior is removed" is shown by the mutation checks below. The builder runs the Chromium project and reports it; it does not change a journey to make it pass (`CLAUDE.md`).

**Harness**

- `cd e2e && npm ci && npm run typecheck` passes.
- `npx playwright test --project=chromium --list` lists every journey; `--grep @smoke` lists the M1 and M2 smoke tests and exactly the JSON-rule test of journey 1 and the first test of journey 2.
- Tests run in parallel get their own app, site, TCP stub and certificates; one test's requests or mail never show in another's, whatever the order and `--workers`.
- `makeCert` produces a certificate whose whole days left match the preset (a unit-style check in the plan: print the `notAfter` of `validCert(10)` and show it is 10 days and 12 hours from now).
- The M1 and M2 journeys still pass unchanged.
- No test clears Mailpit's mailbox.

**Journeys**

- Journey 1: FR-41, FR-42, FR-44, FR-45, FR-46, FR-47, FR-48, FR-58, FR-61, FR-62, FR-73, FR-104. Journey 2: FR-33, FR-49, FR-52, FR-55, FR-61. Journey 3: FR-35, FR-36, FR-37, FR-39, FR-58. Journey 4: FR-34, FR-50, FR-61, FR-64, FR-74 (in part). Journey 5: FR-51, FR-53, FR-54, FR-112. Journey 6: FR-38, FR-74, FR-104, FR-105, FR-106, NFR-7. Journey 7: FR-12, FR-59, FR-66, FR-74. Journey 8: FR-62, FR-75, FR-76, FR-78, FR-79, FR-111. Journey 9: FR-38, FR-56, FR-57, FR-59, FR-60, FR-65, FR-69, FR-74, FR-106.
- Each failure reason code of FR-61 is produced by at least one test and its dashboard text is asserted: `timed_out`, `could_not_connect`, `non_2xx_status`, `json_rule_matched`, `invalid_or_missing_json`, `too_many_redirects`, `certificate_problem`.
- Every limit of journey 9 has a test at the limit that saves and a test one past it that is refused with nothing saved.

**Repo-wide**

- `make check` passes (it does not run `e2e/`).
- `make test-e2e-smoke` passes in Chromium when Docker is available; otherwise the direct command (`cd e2e && npx playwright test --project=chromium`, with Mailpit started by `make mailpit-up` or by hand) passes and the report says why `make` was not run.
- The whole Chromium project passes at least twice in a row, and the report gives the time and the slowest tests.
- Nothing outside `e2e/**` and the plan file changed (`git diff --stat origin/main`).

## Verifier checks

- **Diff rules:** only `e2e/**` and the plan file; the only manifest change is `selfsigned` 5.5.0 (exact version, no range) in `e2e/package.json` and the lockfile; no `waitForTimeout` except in `settle`; no CSS-class selectors (`.locator('.…')`); no test clears Mailpit; no `retries` in the configuration; no test writes over HTTP; no test reads a relative time on the dashboard to decide "unchanged" (it reads `GET /api/services`).
- **Texts:** every quoted message in this file is compared with the source it comes from (`frontend/src/lib/failureReason.ts`, `service-form/lib/testResult.ts`, `service-form/lib/fieldLabels.ts`, `FormBanners.tsx`, `usePauseService.ts`, `backend/internal/usecase/service_validation.go`) and a difference is a finding against the file or the test.
- **Mutation checks** (scratch worktree, never committed; each must fail at least one named journey): the probe reports `could_not_connect` for a timeout; the JSON precedence swapped (status beats rule); a number compared as a case-insensitive text; `any` and `all` swapped; the body limit not applied; the redirect limit +1; saved headers not set again on a redirect (compare `http-request-send`); `ignore_certificate_errors` ignored; the expiry check skipped when errors are ignored; an expired certificate given 1 day left instead of 0; a failed check not retried; the retry count off by one; a service shown `Unhealthy` before its last retry; the test panel saving or changing state; the test panel sending two attempts; an edit that runs a check at the moment of saving; an edit that resets the state; a pause that does not stop the scheduler; a resume that waits for the interval; a restart that resumes a paused service; one limit of journey 9 hardcoded at its default (change `REQUEST_MAX_HEADERS` to be ignored: the 3-header case at the limit of 2 must fail the test); the 51st-service rule off by one; the one-megabyte rule removed.
- **Reading the tests:** for each journey confirm the "nothing happens" assertions (no request, no mail, nothing saved) are made against a baseline that shows the same setup does produce the event when the condition is reversed (resume sends the alert; the unpaused service is checked).
- **Inputs to try:** run with `--workers=1` and `--workers=4`; run the journey-9 files with the shell's `MAX_SERVICES`, `SERVICE_NAME_MAX_LENGTH` and `API_REQUEST_MAX_BYTES` set to other values (the environment must stay explicit and win); run the certificate tests with the system clock set a day later if the machine allows (the half-day margin must keep them stable).

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other, or a quoted message differs from the screen or the server.
- A journey cannot be made to pass without changing product code (a missing accessible name, a state the screen does not show): report which, and what you did not do. Never change the journey's meaning to fit.
- `selfsigned` cannot make a certificate in the shape asked for (an expired one, a name-only one), or the app does not treat it as described.
- You think you need a dependency beyond `selfsigned`, a change outside `e2e/**`, or a configuration key.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check` and the Chromium suite as above, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the journey that shows each), which commands ran and which did not (and Mailpit's version if it ran), the dependency version, the time of the whole Chromium run, and anything you were unsure about. Also list every judgment call this file did not settle.
