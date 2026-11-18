# Task: milestone 2 end-to-end journeys

One end-to-end agent builds this on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

Milestone 2 is proven through a real browser against the real binary, a real SMTP server (Mailpit) and a stub webhook receiver. After this task the suite in `e2e/` runs the alerting journeys: the admin builds an alert list, a service goes down and an alert arrives by email and by webhook, a recovery arrives, a failed delivery is retried and shows the "last delivery failed" notice until a later delivery succeeds, a test alert is sent before saving, and a restart sends no duplicate. It is the first automated proof of the check-to-alert chain (`docs/requirements.md` section 8, failure 1), which no earlier test can show because `main.go` has no test. No product code changes.

Requirements covered, each by the journey named:

- FR-14, FR-15, FR-16, FR-17, FR-19, FR-80, FR-81, FR-88, FR-100: the alert list screen and the target dialog: add an email and a webhook target, edit, remove with the inline confirmation, the order added, the sixth target refused, a duplicate refused, an optional name, the `http://` warning that does not stop saving (journey 7).
- FR-20: a service with alerts off sends nothing (journey 3); alerts are on by default (journeys 1 and 2).
- FR-21, FR-22, FR-25: a change to unhealthy, and the recovery, each send one alert to the target; a service that stays unhealthy sends no more (journey 1).
- FR-23, FR-65, FR-93, NFR-7: an alert carries the service name, the status, the time in UTC, and the message (the default, or the admin's, shown as plain text) and nothing else; the email is plain text (journeys 1, 2 and 3).
- FR-83: an alert goes to the email and the webhook target of one list, each on its own, and a failing webhook does not hold up the email beside it (journeys 2 and 4).
- FR-85, FR-86, FR-115, FR-84: a failed delivery is retried the configured number of times, a redirect is not followed, the target then shows "last delivery failed" on the alert list and on the dashboard until a later delivery succeeds, and the service's status is not changed by it (journeys 4 and 5).
- FR-90, FR-92: the webhook is an HTTP `POST` with a JSON body and the admin's custom headers (journey 2).
- FR-107, FR-108: a test alert goes only to the target in the form, once, shows delivered or failed with the reason, and saves nothing and sends nothing to the other targets (journey 6).
- FR-111: a restart keeps the unhealthy service unhealthy without a new alert, and a change found afterwards alerts (journey 8).

Test titles of this task start with `M2 journey <n>` so that they cannot be confused with the milestone 1 journeys of the same numbers (`--grep` and the reports).

Out of scope:

- **FR-24** (a first check that finds the service unhealthy alerts): a service's first check runs straight after saving, before the admin can give it a target through the screens, so the journeys cannot reach it. The usecase tests prove it.
- **Retries that a newer alert ends** (the rule of FR-85 v0.45), the exact attempt timing (NFR-5) and the 10-second webhook timeout (FR-91): proven by the dispatcher's unit tests with a fake clock; the journeys show only that the number of attempts and the notice are right.
- **Delivery to a real SMTP provider** and the `starttls` and `tls` modes: the manual check of milestone 2 (`docs/manual-checks.md`).
- **Edit, pause and resume of a service, TCP, JSON rules and everything else of milestone 3**, the public dashboard (milestone 4), sign-in lockout and the other milestone 5 items.
- **Firefox and WebKit runs**: the configuration defines them; the user runs `make test-e2e`.
- **Any change to product code, the contract, `Makefile`, CI, `docker-compose.yml` or docs.**

## Prerequisite

All of these are merged on the default branch; the builder checks first and stops to ask if any is missing (it never creates them):

- The milestone 1 suite (`m1-e2e-journeys`): `e2e/` with `playwright.config.ts`, `support/app.ts`, `fixtures.ts`, `helpers.ts`, `stubTarget.ts`, `globalSetup.ts` and the journeys.
- The alert chain: `alert-dispatch` (email), `webhook-sender`, `delivery-retry`, `delivery-outcome`, `test-target`.
- The screens: `alert-list-screen` and `target-form-dialog` (the dashboard's `Alerts <name>` link, the alert list at `/services/<id>/alerts`, the dialog), `target-delivery-notice` (the notice on a target row), `service-form-alerts` (the `Send alerts` switch and the two messages on the add form) and `target-test-row` (the `Send test alert` row of the dialog).
- `make mailpit-up` starts Mailpit (SMTP on `127.0.0.1:1025`, web UI and API on `127.0.0.1:8025`); `make test-e2e-smoke` and `make test-e2e` run it first. The SMTP keys `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS`, `SMTP_FROM`, `ALERT_DELIVERY_RETRIES`, `ALERT_DELIVERY_RETRY_INTERVAL_SECONDS`, `WEBHOOK_TIMEOUT_SECONDS` and `MAX_TARGETS_PER_SERVICE` are in `.env.example` and read by `platform/config`. No configuration key is added.

`service-form-timing` may or may not be merged when this task runs; the helper below must work in both cases (see "The harness").

## Role and ownership

Role: End-to-end (`ROLES.md`).

You may change only `e2e/**`: `package.json` and `package-lock.json` only if a dependency is needed (none is expected), `playwright.config.ts`, the support code and the journeys, including the existing M1 support files named below. You may not change `backend/**`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/m2-e2e-journeys.plan.md`), the root `.gitignore`, `.env.example`, `Makefile`, `.github/**`, `scripts/**` or `docker-compose.yml`.

Shared files this task touches, all owned by this task while it runs: `e2e/support/app.ts`, `fixtures.ts`, `helpers.ts` (the M1 files it extends) and `playwright.config.ts` (only if a new setting is needed). Tasks that may run at the same time: any task outside `e2e/` (no other task changes `e2e/`).

## Operations used

None are added or changed. The journeys use the real app through the browser and a few direct HTTP calls from Playwright's request context (the browser's own cookies, as in M1), only where a screen cannot do it:

- `listServices` (`GET /api/services`), to read a service's id; `listTargets` (`GET /api/services/{id}/targets`), to read a target's `last_delivery_failed`. Both are reads, so no CSRF token is needed; the page is signed in already.

Mailpit's HTTP API (below) is read by the tests. The milestone 1 journeys also call the API (`delete-service.spec.ts` creates targets over HTTP); nothing else in this task does.

## Behavior

### The harness

Everything of the M1 harness stays: one app (own port, own temporary database) and one stub per test; `globalSetup` builds the binary once; elements are found by role, label and visible text; `waitForStatus` polls; no fixed waits except the ones named. This task extends it:

**The app's environment.** `appEnv` gains these keys, so every app can send mail and retry fast (they change nothing for the M1 journeys: the only M1 journey with targets, `delete-service.spec.ts`, adds them after the service is healthy and never changes its status):

| Key | Value | Why |
|---|---|---|
| `SMTP_HOST` | `127.0.0.1` | Mailpit |
| `SMTP_PORT` | `1025` | Mailpit |
| `SMTP_TLS` | `none` | Mailpit has no TLS |
| `SMTP_FROM` | `monitory@e2e.test` | |
| `ALERT_DELIVERY_RETRIES` | `2` | three attempts in all |
| `ALERT_DELIVERY_RETRY_INTERVAL_SECONDS` | `2` | |
| `WEBHOOK_TIMEOUT_SECONDS` | `2` | |

`app.init(overrides?)` takes environment overrides for the first start (threaded through its port-retry loop), as `start(overrides)` does for a later one, and `restart()` starts again with the overrides of the previous start. The `app` fixture reads them from a new Playwright option fixture `appOverrides` (`{ option: true }`, default `{}`), so a file or a `describe` block starts every app of its tests with `SMTP_HOST` empty by `test.use({ appOverrides: { SMTP_HOST: '' } })` (journeys 5 and 6). The environment stays explicit: nothing comes from the developer's shell but `PATH`.

**Mailpit.** A support module `e2e/support/mailpit.ts` (new) with the constants `MAILPIT_API` (`http://127.0.0.1:8025`) and a function `uniqueAddress()` that returns an address no other test uses (`e2e-<random>@example.test`, from a random value, not a counter). The Mailpit is shared by every parallel test, so **no test clears the mailbox**: each test uses its own recipient addresses and reads only mail to them. It exposes `messagesTo(address)` (the messages Mailpit holds for that recipient, oldest first, each with subject, from, to, the plain-text body and the HTML body; the plain text has its line endings turned into `\n` before it is compared; a message's text needs a second call to Mailpit per message, because a search lists only summaries), and `waitForMessages(address, n)` (polls every 500 ms for up to 30 seconds until at least `n` messages exist, failing with what was found). The builder reads Mailpit's API documentation for the version that `docker-compose.yml` starts and uses its search and message endpoints; this file names none, so none is guessed, and the report names the version (the image tag is `latest`, so it is read from Mailpit's own info endpoint). Mailpit keeps only a limited number of messages and drops the oldest; the tests use few. If Mailpit is not reachable, a test fails with a message that says `make mailpit-up`.

**The stub receiver.** A support class `StubReceiver` in `e2e/support/stubReceiver.ts` (new) and a test-scoped fixture `receiver` (in `fixtures.ts`): a small Node HTTP server on a free port that answers `POST /hook` with the status the test sets (`setStatus`, default 200), after the delay the test sets (`setDelay(ms)`, default 0), or with a `302` and `Location: /elsewhere` while `setRedirect(true)` is on; answers `/elsewhere` with 200; answers every other path with 404; and records every request as `{ method, path, headers, body (the raw text and the parsed JSON when it parses), at }`; `requests()`, `count()` (all requests) and `hookCount()` (those to `/hook`), `hookRequests()`. The stub target of M1 (`StubTarget`) is unchanged and is the checked service.

**Helpers** (`helpers.ts`, extended; the M1 ones stay):

- `addService(page, name, url, options?)` gains options: `alerts` (`true` by default; `false` clicks the switch `getByRole('switch', { name: 'Send alerts' })` once to turn it off), `unhealthyMessage` and `recoveryMessage` (typed into the two text areas when given). The helper also sets the Timing group when the add form has one: if `getByLabel('Check interval')` exists, it fills `Check interval` with `6`, `Timeout` with `1`, `Retries` with `1` and `Retry interval` with `1` (the values the M1 harness gets from the environment, which the form then sends explicitly; without this a service gets a 60-second interval and the M1 journeys 3, 4 and 6 fail). If the group does not exist the helper behaves as before.
- `openAlertList(page, serviceName)` (press the link `Alerts <serviceName>` on the dashboard and wait for the heading `Alert list: <serviceName>`), `addTarget(page, { type: 'email' | 'webhook', address?, url?, name?, headers? })` (press `Add target`, fill the dialog, press the primary button, wait for the toast `Target added.`; for a webhook choose `Webhook`, and press `Add header` for each header and fill `Header n name` and `Header n value`), and `targetRow(page, label)` (the list item of the list named `Notification targets` whose text holds the label).
- `waitForCount(read, n)` where `read` is a function returning a number or a promise of one (for example `() => receiver.hookCount()`): polls it (every 250 ms, 30 seconds) until it is at least `n`, failing with the last value; the journeys use it for the receiver's request counts.
- `waitForDeliveryNotice(page, serviceName, shown)`: until the dashboard row of the service shows (or no longer shows) the link `Alert delivery failed – view alert list`, press `Refresh` and re-read, polling every 500 ms for up to 30 seconds (the outcome is written a moment after the last attempt, so a single reload can race it); `waitForTargetNotice(page, label, shown)` does the same on the alert list (reload and read the row's `Last delivery failed. Shown until a later delivery succeeds.`).
- `settle(page)`: the one fixed wait of this task, 10 seconds, used only to show that something does **not** happen. It is long enough for a full check cycle to run after the moment it follows (the interval is 6 seconds, the longest attempt 3, and the alert goes out at once) and for any mail to reach Mailpit. A counter of the stub's requests cannot measure this, because a failing check is two requests and a healthy one is one, and an alert is dispatched only after the check's result is saved.

**Timing.** The service interval is 6 seconds, a check retries once after 1 second, and a delivery retries twice after 2 seconds; a service shows unhealthy up to about 7 seconds after the stub starts failing (the rest of an interval and the retry), and the alert goes out at once. Where a journey must show that something does not happen, it uses `settle(page)` and then asserts. Because of the waits, these journeys set their own test timeout (`test.setTimeout(120_000)`) where they need it; the configuration's 60 seconds stays for the others. No other `waitForTimeout` is used.

**Which journeys are `@smoke`:** journeys 1 and 2 (the email chain and the webhook chain); each runs up to about a minute in Chromium, in parallel. The others run in the full suite.

### Journey 1: the email chain (`@smoke`)

1. Sign in, add a service for the stub (stub answers 200) with the helper, and wait for `Healthy`. Open its alert list: `No notification targets`. Add an email target with `uniqueAddress()` and no name through the dialog; the row appears with the address, the toast `Target added.` shows (FR-14, FR-81).
2. `stub.setStatus(503)`. `waitForStatus(…, 'Unhealthy')`. `waitForMessages(address, 1)`: exactly one message, from `monitory@e2e.test`, to the address, with the subject `<name> is unhealthy`, a plain-text body of exactly four lines: `Service: <name>`, `Status: Unhealthy`, `Time: YYYY-MM-DD HH:MM UTC` (the time within 3 minutes of now in UTC), `The service failed its check.`, and no HTML part (FR-21, FR-23, FR-93, NFR-7).
3. `settle(page)`, then the address still has exactly one message (FR-25: the service stayed unhealthy through at least one full check).
4. `stub.setStatus(200)`. `waitForStatus(…, 'Healthy')`. `waitForMessages(address, 2)`: the second has the subject `<name> is healthy again`, the lines `Status: Healthy` and `The service is healthy again.` (FR-22).
5. `settle(page)`, then the address still has exactly two messages.

### Journey 2: the webhook chain and a mixed list (`@smoke`)

1. Add a service named with markup (`<b>E2E</b> hook <random>`) for the stub, wait for `Healthy`. In its alert list add a webhook target for `receiver`'s `/hook` with the header `X-E2E-Token` = `abc123` (FR-92) and an email target with `uniqueAddress()`.
2. `stub.setStatus(503)`, `waitForStatus(…, 'Unhealthy')`. `waitForCount(receiver.hookRequests, 1)`: exactly one `POST /hook` with `Content-Type: application/json`, the header `X-E2E-Token: abc123`, and a JSON body with exactly the keys `service_name`, `status`, `changed_at`, `message`: `service_name` equal to the service's name as typed (the markup is text), `status` `unhealthy`, `changed_at` an RFC 3339 time ending in `Z` within 3 minutes of now, `message` `The service failed its check.`; no other key (FR-90, FR-92, FR-23, FR-93, NFR-7). The email target of the same list has its mail too (FR-83). The dashboard row and the alert list's heading `Alert list: <name>` show the name as the literal text with the angle brackets, and no `b` element exists in them (NFR-7).
3. `stub.setStatus(200)`: a second `POST /hook` with `status` `healthy` and `message` `The service is healthy again.`, and the second mail (FR-22).

### Journey 3: messages and alerts off

Two tests.

- **Custom messages.** Add a service with `unhealthyMessage` `Disk <b>full</b>` and `recoveryMessage` `Disk ok again`, an email target and a webhook target. Unhealthy: the mail's fourth line is exactly `Disk <b>full</b>` and the webhook's `message` is that text; recovery: the same with `Disk ok again`. The mail is plain text with no HTML part, and the markup arrives as the characters typed (FR-65, FR-23, NFR-7).
- **Alerts off** (FR-20). Add a service with `alerts: false` and an email target. `stub.setStatus(503)`, `waitForStatus(…, 'Unhealthy')`, `settle(page)`: the address has no message. Its alert list shows the banner `Alerts are off for this service.`. Switching the stub back to 200 and `Healthy` again, `settle(page)`: still no message.

### Journey 4: a failed webhook, its retries and the notice

1. Add a service for the stub and wait for `Healthy`; add a webhook target for the receiver's `/hook` and an email target with `uniqueAddress()` (the same list). `receiver.setStatus(500)`. `stub.setStatus(503)`, `waitForStatus(…, 'Unhealthy')`. The email arrives (`waitForMessages(address, 1)`) while the webhook is still failing: one failing target does not hold up the other (FR-83).
2. The receiver gets exactly three `POST /hook` in all (the first and two retries), in order, each the same `unhealthy` alert, the gaps between them at least 1,500 ms and at most 6,000 ms (the retry interval is 2 seconds; the bounds leave room for a loaded runner) (FR-85).
3. `waitForDeliveryNotice(page, name, true)`: the service's row shows `Alert delivery failed – view alert list` and the status is still `Unhealthy` (FR-86, FR-84). Open its alert list: `waitForTargetNotice` shows `Last delivery failed. Shown until a later delivery succeeds.` on the webhook's row and not on the email's; `GET /api/services/<id>/targets` has `last_delivery_failed` true for the webhook and false for the email. `settle(page)`: no fourth request has reached the receiver and the notice is still there (FR-86: it stays; FR-85: no more retries).
4. `receiver.setStatus(200)`, `stub.setStatus(200)`: the service recovers, a `healthy` alert reaches the receiver and is answered 200. `waitForDeliveryNotice(page, name, false)` and `waitForTargetNotice(…, false)` succeed, and `last_delivery_failed` is false (FR-86).
5. A separate test: `receiver.setRedirect(true)` (the receiver answers `POST /hook` with a `302` to `/elsewhere`): after the three attempts (`waitForCount(() => receiver.hookCount(), 3)`, then `waitForTargetNotice(…, true)`) the receiver has exactly three requests to `/hook` and none to `/elsewhere`, and the notice shows (FR-115).

### Journey 5: no SMTP account, and a failed email

The app is started with `SMTP_HOST` empty (`test.use({ appOverrides: { SMTP_HOST: '' } })` for the describe block). Add a service for the stub, wait for `Healthy`, add an email target with `uniqueAddress()`, `stub.setStatus(503)`, `waitForStatus(…, 'Unhealthy')`: `waitForDeliveryNotice(page, name, true)` succeeds and `waitForTargetNotice` shows the notice for the email target (FR-85: a missing SMTP account is a failed delivery, retried and then final; FR-86); the address has no message in Mailpit; the status is still `Unhealthy` (FR-84).

### Journey 6: the test alert

Five tests, each with its own service (alerts on) and the dialog opened with the page's `Add target` button (the dialog's own primary button has the same name: scope to the dialog by `getByRole('dialog')`) unless said.

- **Email, delivered.** Type a `uniqueAddress()`, press `Send test alert`: the row shows `Delivered.` (the sending text is too brief to assert for a local server); `waitForMessages(address, 1)`: the subject is `Test alert for <service name>`, the lines are `Service: <name>`, `Status: Test`, `Time: … UTC`, `This is a test alert from Monitory. No service has changed status.` (FR-107, FR-93). Nothing was saved: after `Cancel` (which asks `Discard unsaved changes?`; `Discard changes`) the alert list still says `No notification targets`, no toast showed, and `last_delivery_failed` was never set (FR-108).
- **Webhook, delivered and failed.** A webhook with the receiver's `/hook` (with `receiver.setDelay(500)` so that the row shows `Sending one test alert…` first) and the header: `Delivered.`, and the receiver has one request with `status` `test`, the four keys and the header (FR-107). With `receiver.setStatus(500)` and a second press: `Failed: the webhook answered with status 500` (the reason as plain text) (FR-107, FR-85); then `settle(page)`: the receiver has exactly two requests to `/hook` in all, one per press, no retries (FR-107). Nothing is saved and the service's status is not changed (FR-108).
- **Only the target in the form.** The list already has two email targets `A` and `B` (unique addresses). Open `Edit` for `A` and press `Send test alert` without changing anything: `Delivered.`; `A` has one test mail and `B` none (`settle(page)`); no notice appears on either row, and `Cancel` closes the dialog at once (the form is unchanged) (FR-107, FR-108).
- **No SMTP account** (the app started with `SMTP_HOST` empty): `Failed: no SMTP account configured`.
- **Invalid settings send nothing.** With an empty address: `Enter an email address.` under the field and focus on it; with the webhook type and an empty URL the same with `Enter a URL that starts with http:// or https://.` and the receiver count unchanged; with a URL `ftp://x.test` the server refuses it: the summary titled `1 field needs fixing before this can be saved.` shows, the `Webhook URL` field is marked invalid, and the receiver count is unchanged (FR-108, FR-89).

### Journey 7: the alert list screen

1. Add a service. Every contact below is distinct (unique addresses and URLs; a webhook URL is compared exactly, an address ignoring case). In its alert list add an email target with a name `Ops inbox`, an email target with no name, and a webhook target (the receiver's `/hook`, with an `http://` URL: the warning `This URL uses http://, so the URL and headers are sent unencrypted. You can still save it.` shows and saving works) (FR-100, FR-80, FR-81). The list shows them in the order added (FR-17); the unnamed email's row reads `Unnamed email`; the sub line counts three.
2. Adding the same address again (different letter case) shows `This address is already in this service’s alert list.` on the field, the dialog stays; adding the same webhook URL shows `This URL is already in this service’s alert list.` (FR-88).
3. Edit `Ops inbox` (`Edit Ops inbox`): change the name; the toast `Target saved.` shows and the row shows the new name, in the same place (FR-15).
4. Add two more targets (five in all), then a sixth: the dialog shows the banner `This alert list is full.` with `Remove a target before adding another.` and what was typed stays (FR-19).
5. Remove one: `Remove <label>` opens `Remove this target?`; `Cancel` keeps it; `Remove` removes it, the toast `Target removed.` shows, and the list has four (FR-16). A reload shows the same list, and after the removal the sixth target can be added.

### Journey 8: a restart (FR-111)

1. Add a service for the stub with an email target (`uniqueAddress()`); `stub.setStatus(503)`, `waitForStatus(…, 'Unhealthy')`, `waitForMessages(address, 1)`.
2. `app.restart()` (same database and port). Sign in again; the service is still `Unhealthy`. Wait for the stub to receive at least two more requests: the address still has exactly one message (no new alert for a service that was unhealthy before the stop and still is) (FR-111).
3. `stub.setStatus(200)`: `waitForStatus(…, 'Healthy')`, and `waitForMessages(address, 2)`: the second is the recovery (a change found after the restart alerts as usual).

### Known gaps

- **FR-24, the newer-alert rule, NFR-5, the 10-second webhook timeout and FR-91** are not shown (out of scope above); the dispatcher's and usecase tests do.
- **The "nothing more happens" assertions use a 10-second wait,** which is long but cannot be shortened soundly (see `settle`); they cost time, not reliability.
- **A no-op `Sending…` state is asserted only for a delayed webhook.**
- **Mailpit is shared:** unique recipient addresses keep tests apart, but two worktrees running the suite at the same time share one Mailpit and its host ports and can make `make mailpit-up` fail, and a `make test-integration` run at the same time clears the whole mailbox, which would delete e2e mail (the backlog's `alert-dispatch` finding about the Mailpit test). No e2e test clears the mailbox.
- **SMTP in `none` mode only:** authentication and TLS are not exercised (manual check).
- **Timing:** journeys 1, 4 and 8 depend on seconds-long intervals and can flake on a loaded runner; the bounds are wide on purpose, and a flake is reported, not retried away (`retries: 0`).
- **`Not checked yet` and the very first alert (FR-24) are not reachable** through the screens (journey list above).
- **The retry gaps are bounded loosely** (1.5 to 6 s for a 2 s interval); exact timing is the unit tests'.

## Structure

By `TESTING.md` ("End-to-end"). Names marked "new" are fixed by this file; the rest is the builder's choice.

- `e2e/support/mailpit.ts` (new), `e2e/support/stubReceiver.ts` (new); `e2e/support/app.ts`, `fixtures.ts`, `helpers.ts` extended as above (`stubTarget.ts` is not changed).
- `e2e/journeys/alert-email.spec.ts` (journey 1, and 8), `alert-webhook.spec.ts` (journey 2 and 3), `alert-failure.spec.ts` (journeys 4 and 5), `test-alert.spec.ts` (journey 6), `alert-list.spec.ts` (journey 7) (new). One file per group; the test titles name the journey and the requirement IDs, and the `@smoke` tag is in the title.
- No new script, config file or dependency.

## Dependencies

None. `@playwright/test` 1.64.1, `typescript` 6.0.3 and `@types/node` 24.19.2 are installed by the M1 task; `e2e/package.json` and `package-lock.json` do not change. The stub receiver uses Node's `http`, and Mailpit's API is read with Node's `fetch`.

## Acceptance criteria

The journeys are the tests; "fails if the behavior is removed" is shown by the mutation checks below. The builder runs the Chromium project and reports it; it does not change a journey to make it pass (`CLAUDE.md`).

**Harness**

- `cd e2e && npm ci && npm run typecheck` passes.
- `npx playwright test --project=chromium --list` lists every journey; `--grep @smoke` lists the M1 smoke tests and exactly the tests of journeys 1 and 2 of this file.
- Two tests run in parallel get two apps, two stubs, two receivers and different recipient addresses; one test's mail or request never shows in another's, whatever the order and `--workers`.
- The app environment is explicit: the same result with `SMTP_HOST`, `ADMIN_PASSWORD` and `ALERT_DELIVERY_RETRIES` set to other values in the developer's shell.
- The M1 journeys still pass unchanged (the helper's timing fill makes them pass whether or not the form has the Timing group).
- No test clears Mailpit's mailbox.

**Journeys**

- Journey 1: FR-14, FR-21, FR-22, FR-23, FR-25, FR-81, FR-93, NFR-7. Journey 2: FR-23, FR-83, FR-90, FR-92, FR-93, NFR-7. Journey 3: FR-20, FR-23, FR-65. Journey 4: FR-83, FR-84, FR-85, FR-86, FR-115. Journey 5: FR-84, FR-85, FR-86. Journey 6: FR-89, FR-93, FR-107, FR-108. Journey 7: FR-14, FR-15, FR-16, FR-17, FR-19, FR-80, FR-81, FR-88, FR-100. Journey 8: FR-111.

**Repo-wide**

- `make check` passes (it does not run `e2e/`).
- `make test-e2e-smoke` passes in Chromium when Docker is available; otherwise the direct command (`cd e2e && npx playwright test --project=chromium`, with Mailpit started by `make mailpit-up` or by hand) passes and the report says why `make` was not run. If Mailpit cannot run at all, the journeys that need it cannot run and the report says so.
- The whole Chromium project passes at least twice in a row.
- Nothing outside `e2e/**` and the plan file changed (`git diff --stat origin/main`).

## Verifier checks

- **No product change:** the diff touches only `e2e/**` and `docs/tasks/m2-e2e-journeys.plan.md`; `package-lock.json` is unchanged.
- **No other fixed waits:** the only `waitForTimeout` or `setTimeout` wait is inside `settle` (10 seconds) and the waits M1 already has; everything else polls a counter or a status with a timeout. Grep for `waitForTimeout`.
- **No CSS-class selectors:** locators use role, label or text. Grep for `.locator('.` and `[class`.
- **No shared-mailbox assumption:** grep for any call that deletes Mailpit messages; every Mailpit read filters by a recipient the test made.
- **Isolation:** run `--workers=1` and `--workers=3`; both pass.
- **Mutation checks to run, against the product code in a scratch worktree, not committed:**
  - make `CheckResultService` not dispatch (skip step 7 of the decision): journeys 1, 2, 3 (custom messages) and 8 must fail;
  - dispatch on `unhealthy` to `unhealthy` too: journey 1, step 3 must fail;
  - ignore `AlertsEnabled`: journey 3 (alerts off) must fail;
  - make the retry count 0 (or the dispatcher not retry): journey 4, step 2 must fail;
  - follow redirects in the webhook sender: journey 4, step 5 must fail;
  - never write `last_delivery_failed`, or never clear it on success: journey 4, steps 3 and 4 must fail;
  - make `testTarget` save the target, retry, or send through the dispatcher (to every target of the list): journey 6 (nothing saved, one request, only `A`) must fail;
  - make a failed delivery change the service's status: journey 4, step 3 must fail;
  - make the app lose the saved status at a restart, or alert on `unhealthy` to `unhealthy` after it: journey 8, step 2 must fail;
  - make the alert list accept a sixth target or a duplicate: journey 7, steps 2 and 4 must fail.
  Each must fail at least one named journey; the verifier lists which.
- **Flakiness:** run the whole Chromium project three times; any failure not caused by a mutation is reported with its trace.
- **What the verifier cannot prove:** Firefox and WebKit, a real SMTP provider (the manual check), and the 360 px layouts; say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other, or a journey needs a status, field or message the contract and the screens do not have.
- A journey cannot pass without a change to product code (a missing accessible name, a label that differs from this file). Report the exact text found, which this file's wording differs from; do not edit the frontend and do not change the journey to match silently, since a label that differs from the design is a finding. This includes the texts of the alert list, the dialog, the test row, the banners, the toasts and the Timing group named above.
- A prerequisite is missing (in particular `target-test-row`), or Mailpit's API does not give a message's recipient, subject and plain-text body.
- You think you need a change outside `e2e/**`, a dependency, a configuration key, a change to the `Makefile`, CI or `docker-compose.yml`, or an edit to a spec file.
- A convention in `CONVENTIONS.md` or `TESTING.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, the e2e commands above, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the journey that shows each), which commands ran and which did not (and why: Docker, Mailpit, browsers), the Mailpit version used, how long the Chromium run took and whether any test was flaky, and anything you were unsure about. Also list every judgment call this file did not settle, and every text on screen that differed from this file.
