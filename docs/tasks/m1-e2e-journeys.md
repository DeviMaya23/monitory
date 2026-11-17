# Task: milestone 1 end-to-end journeys

One end-to-end agent builds this on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

Milestone 1 is proven through a real browser against the real binary. After this task `e2e/` holds a Playwright suite that builds and starts the app with a temporary SQLite file and a stub target server, and runs the journeys of milestone 1: the admin signs in and out, adds an HTTP service and sees it become healthy, sees it go unhealthy and recover, deletes it, and finds everything in place after a restart. It is the first automated proof that the wired app checks services (FR-67, FR-10, FR-111), which no earlier test can show because `main.go` has no test. No product code changes.

Requirements covered:

- FR-1: wrong credentials are rejected with one message that does not say which part was wrong (journey 1).
- FR-3, FR-4: signing out ends the session, and the admin page and the API then require signing in (journey 1).
- FR-6, FR-9, FR-59: a service is added and listed; a name already used (ignoring case) is refused on the field and nothing is added (journey 2). FR-12, in part: the taken name, and the screen's own check of an empty name.
- FR-10, FR-67: a service is checked straight after it is saved and then at its interval, and shows healthy (journeys 2 and 4). FR-112, in part: only `Healthy` and `Unhealthy` are asserted, never `Not checked yet`.
- FR-54, FR-55, FR-61 (the HTTP status reason only), FR-62 (name, type chip, status, last check, failure reason): the dashboard shows unhealthy with the reason, and healthy again after one good check (journey 3). FR-54 is shown only as far as a failure after one retry; a retry that succeeds is the usecase tests'.
- FR-8, FR-71, FR-72: the admin confirms, the service goes and its checks stop (journey 5). FR-70, in part: the service and its alert list are gone from the API; the removal of the target rows is the repository tests'.
- FR-95, in part: the dashboard's refresh button loads the latest status (used by every journey; the 5-minute timer is not tested).
- FR-101, FR-102, FR-103: the credentials come from the configuration; a missing one stops the app and is named; changed ones apply after a restart (journeys 6 and 7).
- FR-111, FR-114: after a restart the services and their saved state are kept, checks resume at once, and the admin signs in again (journey 6). FR-5, in part: the end of a session at a restart only, not the 30 days.

Out of scope:

- Alerts, alert lists as a screen, Mailpit, the webhook receiver and every journey of milestone 2 (a later task). The suite does not read Mailpit. `make test-e2e-smoke` still starts it, because the `Makefile` says so and this task may not change the `Makefile`.
- Sign-in lockout and "Sign-in requires HTTPS" (FR-2, FR-97 to FR-99), trusted proxies, the restart-and-upgrade journey with the Docker image (NFR-1), keyboard journeys (NFR-4), 360 px layouts and the supported-browser check (NFR-2, NFR-3). Milestone 5, backlog.
- Edit, pause, resume, TCP, the test panel, JSON rules and everything else of milestone 3, the public dashboard and the health endpoint's journey (milestone 4).
- The 5-minute self-refresh of the dashboard (FR-95): the interval is a frontend constant and the journeys use the Refresh button.
- Running the suite in Firefox and WebKit. The configuration defines all three projects; the user runs the full suite (`make test-e2e`, `TESTING.md`).
- Any change to product code, to the contract or to `Makefile`, CI or docs.

## Prerequisite

All of these are merged on the default branch; the builder checks first and stops to ask if any is missing (it never creates them):

- `scheduler` (`worker.Scheduler`, `ServiceService.StartChecks`, wired in `backend/cmd/server/main.go`).
- `add-service-screen` (`/services/new`: Name, Method and URL, `Save service`).
- `delete-service-dialog` (a `Delete <name>` button on each row, `DeleteServiceDialog`).
- `targets-api` (`createTarget` and `listTargets` are real; the journeys use them over HTTP to give a service an alert list).
- `make build` builds the frontend into `backend/internal/web/dist`.
- `CHECK_INTERVAL_*`, `TIMEOUT_*`, `RETRY_*`, `REQUIRE_HTTPS`, `LISTEN_ADDR`, `DATABASE_PATH`, `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env.example` and read by `platform/config`. No configuration key is added.

## Role and ownership

Role: End-to-end (`ROLES.md`).

You may change only `e2e/**` (all new): `package.json`, `package-lock.json`, `tsconfig.json`, `playwright.config.ts`, `.gitignore`, the support code and the journeys. You may not change `backend/**`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/m1-e2e-journeys.plan.md`), the root `.gitignore`, `.env.example`, `Makefile`, `.github/**`, `scripts/**` or `docker-compose.yml`.

`e2e/` is a new top-level directory. `STACK.md`, `TESTING.md`, the `Makefile` (`test-e2e-smoke`, `test-e2e`), the CI job `e2e-smoke` (it waits for `e2e/package.json`) and the root `.gitignore` already name it, so it is not a question for the user.

Shared files: none. No other task runs at the same time, and this task is the only one that changes a manifest.

## Operations used

None are added or changed. The journeys use the real app through the browser, and a few direct HTTP calls (Playwright's request context, same cookie jar as the page) to the operations below, only where the screen cannot do it yet:

- `signIn` (`POST /api/session`), to get the CSRF token for later calls; `getSession` when the page needs it.
- `createTarget` (`POST /api/services/{serviceId}/targets`, header `X-CSRF-Token`) and `listTargets`, to give a service an alert list before it is deleted (no alert list screen exists yet).
- `listServices` (`GET /api/services`), to read a service's id and to prove a 401.

Nothing else in the suite calls the API directly: what the admin does, the journeys do with the browser.

## Behavior

### The harness

Journeys never share state: **every test gets its own app (own port, own temporary database) and its own stub target**, so a service, a stub status or a changed password from one test cannot reach another, in any file order and with any number of workers. The cost is one binary start per test (about a second); the binary is built once by `globalSetup`.

**The binary.** A Playwright `globalSetup` builds it once: `go build -o <e2e>/.bin/monitory ./cmd/server`, run in `backend/`. It does not build the frontend: `make test-e2e` and `make test-e2e-smoke` run `make build` first, so `backend/internal/web/dist` already holds the built frontend that `go build` embeds. If `dist` holds only `.gitkeep`, `globalSetup` stops with the message `build the frontend first: make build` (a binary built without it serves a placeholder page). `e2e/.gitignore` ignores `.bin/`.

**Starting the app.** A test-scoped fixture `app` starts the binary with a temporary directory (`os.mkdtemp`) holding the SQLite file, on a free port (listen on port 0, read the port, close it; if the first start fails with `address already in use`, pick another port and try again, up to 3 times), and exposes `baseURL`, `stop()`, `start(overrides?)` (same database and the same port as the first start; `overrides` replaces environment values for that run only, for example the password) and `restart()`. The fixture overrides Playwright's `baseURL` fixture with it, so `page.goto('/')` and every request go to this test's app; `playwright.config.ts` sets no `baseURL`. The environment is built from nothing but `PATH` and these keys, so a developer's shell cannot change a journey:

| Key | Value | Why |
|---|---|---|
| `LISTEN_ADDR` | `127.0.0.1:<port>` | |
| `DATABASE_PATH` | `<tmp>/monitory.db` | |
| `ADMIN_USERNAME` | `e2e-admin` | |
| `ADMIN_PASSWORD` | `e2e-password-1` | |
| `REQUIRE_HTTPS` | `false` | the suite uses plain HTTP |
| `CHECK_INTERVAL_MIN_SECONDS` | `1` | |
| `CHECK_INTERVAL_DEFAULT_SECONDS` | `6` | the add form sends no settings, so a saved service gets this |
| `TIMEOUT_DEFAULT_SECONDS` | `1` | |
| `TIMEOUT_MIN_SECONDS` | `1` | |
| `RETRY_COUNT_DEFAULT` | `1` | |
| `RETRY_INTERVAL_DEFAULT_SECONDS` | `1` | |

The longest attempt is then 1 × (1 + 1) + 1 × 1 = 3 seconds, within the 6-second interval (FR-56), so saving works. `start` waits until `GET /health` answers 200 (poll every 100 ms, give up after 15 seconds with the app's output in the error). `stop` sends SIGTERM and waits for the exit; it kills the process after 15 seconds. The app's output (stdout and stderr) is kept per test and attached to the test report on failure. The fixture stops the app after its test and removes the temporary directory.

**The stub target.** A test-scoped fixture `stub` is a small Node HTTP server on a free port, written in `e2e/support/` (the Go stub in `backend/internal/testutil` is test code of another layer and is not reachable from here). It answers `GET /` with a status the test sets (`stub.setStatus(200 | 503 | ...)`, default 200, empty body), and records every request it receives as `{ method, path, at }` (`at` in epoch milliseconds), readable with `stub.requests()` and `stub.count()`. Tests give the app `http://127.0.0.1:<stub port>/`. The stub lives for the test, so it keeps answering while the app is stopped. A service is added with the stub's address, so only that test's services reach it.

**The browser.** `playwright.config.ts` defines three projects, `chromium`, `firefox` and `webkit` (the `Makefile` calls `--project=chromium`, so that name is fixed), journeys in `e2e/journeys/`, a test timeout of 60 seconds, an expect timeout of 5 seconds, `fullyParallel: true` (tests are independent), `retries: 0` everywhere (a flake is reported, not hidden), traces kept on failure, and a list reporter plus an HTML report (`e2e/playwright-report/`, already ignored by the root `.gitignore`). Each test gets a fresh browser context from the app's `baseURL`.

**Helpers.** `signIn(page)` (open `/sign-in`, fill `Username` and `Password`, press `Sign in`, wait for the level-1 heading named exactly `Services`), `addService(page, name, url)` (see journey 2), and `waitForStatus(page, name, status)`: until the status badge in the row of that service reads exactly the status word (`Healthy`, `Unhealthy` or `Not checked yet`, compared as a whole, case-sensitive, never as a substring: `Healthy` is inside `Unhealthy`), click `Refresh`, wait for the button to be enabled again, and re-read, polling every 500 ms for up to 30 seconds, failing with the last status seen. Nothing else polls and no test uses a fixed `waitForTimeout`, apart from the one wait named in journey 5.

**How elements are found:** by role, label and visible text, as the user sees them, never by CSS class, and with exact matching wherever a name is a substring of another: the heading `Services` (`getByRole('heading', { level: 1, name: 'Services', exact: true })`: the empty state's `No services yet` and the add page's back link also contain it), the button `Delete service` in the dialog (scope it to the alert dialog; a row button is named `Delete <name>`), and `Add service` (with no service the dashboard shows this link twice, in the toolbar and in the empty state: take the first, or scope to the toolbar). A row is the list item of the list named `Services` whose text holds the service name. Service names are unique per test: `e2e-` plus 8 random characters (letters and digits), so never over `SERVICE_NAME_MAX_LENGTH` (100) and never containing a status word.

### Journey 1: sign in and out (`@smoke`)

1. Open `/`: the browser ends on `/sign-in` (FR-4).
2. Sign in with the right username and a wrong password: the page stays on `/sign-in` and shows `Username or password is incorrect.`; with a wrong username and the right password, the same text (FR-1).
3. Sign in with the right credentials: the page shows the heading `Services` and, on a fresh database, `No services yet`.
4. Reload: still signed in.
5. Press `Sign out`: the page ends on `/sign-in`. Open `/` again: `/sign-in`. A `GET /api/services` sent with the same browser context's cookies answers 401, code `unauthenticated` (FR-3, FR-4).
6. Without any session (a context with no cookies), `GET /api/services` answers 401 (FR-4). `GET /health` is used only to wait for the app to be ready; the health endpoint's own journey is milestone 4.

### Journey 2: add a service and see it checked (`@smoke`)

1. Sign in, open `Add service` (the link on the dashboard), fill `Name`, fill `URL` with the stub's address, leave the method at its default, press `Save service`.
2. The page returns to the dashboard and the toast `Service “<name>” added.` shows (the text with the curly quotes the screen uses).
3. The dashboard has a row with the name and the chip `HTTP`. `waitForStatus(…, 'Healthy')` succeeds within 30 seconds; the row's `Last check` is no longer `Never`; the stub has received at least one `GET /` (FR-6, FR-9, FR-10, FR-67, FR-112).
4. The first status is not asserted: the first check can finish before the dashboard first loads, so `Not checked yet` cannot be caught reliably.
5. Adding the same name again, in another letter case, shows the field error `Another service already uses this name (names ignore case).` under `Name`, the form stays open, and after `Cancel`, which opens `Discard unsaved changes?`, and `Discard changes`, the dashboard still has one row (FR-12, FR-59). This step is its own test and is not `@smoke`.
6. Submitting with an empty `Name` shows `Enter a name.` and sends no request to the API (the test counts `POST /api/services` requests with `page.on('request')`; zero). Same test as step 5. This step proves the screen's own check only; the server's validation is covered by the handler and usecase tests.

### Journey 3: unhealthy, then healthy again

1. Add a service for the stub (as in journey 2) and wait for `Healthy`.
2. `stub.setStatus(503)`. `waitForStatus(…, 'Unhealthy')` succeeds within 30 seconds, and the row shows the text `Returned HTTP 503 (expected 2xx)` (FR-54, FR-61, FR-62).
3. `stub.setStatus(200)`. `waitForStatus(…, 'Healthy')` succeeds, and the reason text is gone (FR-55).

The failure comes after retries (1 retry, 1 second apart), so the service is never `Unhealthy` from a single failed attempt; the journey does not test that rule, which the usecase tests do.

### Journey 4: checks repeat at the interval

1. Add a service for the stub and wait until the stub has received 3 requests (up to 30 seconds).
2. The gap between each two consecutive requests is at least 4,500 ms and at most 9,000 ms (the interval is 6 seconds, measured start to start; the bounds leave room for a loaded runner) (FR-10).
3. After all of this the service is still `Healthy`.

### Journey 5: delete a service (`@smoke`)

1. Add a service and wait for `Healthy`. Through the page's own request context (`page.request`, which shares the browser's cookies; not the `request` fixture), sign in again (to get `csrf_token`; this replaces the `session` cookie, which is why the page is reloaded in step 2), read the service's id from `listServices`, and `createTarget` twice (an email target `ops@example.com` and a webhook target `https://hooks.example.com/e2e`), each expecting 201.
2. Reload the dashboard and press `Delete <name>`. The dialog titled `Delete “<name>”?` opens, with the text `Its alert list goes with it: 2 notification targets.` and `Checks stop and its current state is removed. This can’t be undone.` (FR-72).
3. Press `Cancel`: the dialog closes, the row is still there, and `listServices` still returns the service.
4. Press `Delete <name>`, then `Delete service`: the toast `Service deleted.` shows, the row is gone and the page shows `No services yet` (FR-8). After a reload it is still gone.
5. `GET /api/services/<id>/targets` answers 404 (the service and its alert list are gone from the API). That the targets rows themselves are removed by the cascade is shown by the repository tests, not here (FR-70, in part).
6. The checks have stopped: wait until 4 seconds after the toast (longer than the longest attempt, 3 seconds, so an attempt already running at the delete has finished), note `stub.count()`, wait 8 seconds more (longer than the 6-second interval), and the count is unchanged (FR-71). These are the only fixed waits in the suite, and they wait for something not to happen.
7. A second service with no targets: its dialog says `It has no notification targets.`

### Journey 6: restart (not `@smoke`)

1. Sign in, add a service for the stub, wait for `Healthy`. Through `page.request`, read the service's `state.last_status_change_at` from `listServices` (a time, not null).
2. `app.stop()`. Note `stub.count()`. `app.start()` (same database and port; a bind failure at this restart is reported, not retried). Poll `stub.count()` at once (step 5's check), before the browser steps.
3. The existing page, reloaded, ends on `/sign-in`: sessions end at a restart (FR-114, FR-5, in part: the 30 days are not tested).
4. Sign in again: the row is there with the same name and `Healthy`, and `listServices` returns the same `last_status_change_at` as before the restart. That time moves only when the status changes, and the first check after the restart finds `healthy` again, so an equal time shows that the saved state was kept and not rebuilt from `not_yet_checked` (FR-111). If the app moves it on an unchanged status, stop and report.
5. Checks resumed at once (polled right after `start()` returns, as step 2 says): within 4 seconds after `start()` returns, `stub.count()` is higher than the noted count. The interval is 6 seconds, and no timer survives a restart, so a request this soon is the first check of the new run (FR-111).
6. Credentials come from the configuration: `app.stop()`, `app.start({ ADMIN_PASSWORD: 'e2e-password-2' })`; signing in with `e2e-password-1` shows `Username or password is incorrect.`, and with `e2e-password-2` succeeds (FR-101, FR-103).

### Journey 7: first start (not `@smoke`, no browser)

Chromium project only (`test.skip` for the other projects, since no browser is involved). Each case starts the binary directly, with the environment of the harness minus the keys named, and waits for it to exit.

- Without `ADMIN_PASSWORD`: the process exits with a non-zero code within 10 seconds, its output contains `ADMIN_PASSWORD is not set` and does not contain `ADMIN_USERNAME is not set`, and nothing listens on the port the app would have used (a free port picked as in the harness) (FR-102).
- Without `ADMIN_USERNAME`: the same, naming `ADMIN_USERNAME`.
- Without both: the output names both.
- An empty value counts as missing: `ADMIN_PASSWORD=` behaves as unset.

### Which journeys are `@smoke`

Journeys 1, 2 (steps 1 to 4, one test) and 5. The tag is in the test title (`@smoke`), as `make test-e2e-smoke` greps for it. Together they run in about a minute in Chromium.

### Known gaps

- Firefox and WebKit are configured but not run by the builder or the verifier (no browsers may be installed beyond Chromium in an agent's sandbox). The user runs `make test-e2e` at the milestone (`docs/manual-checks.md`).
- The suite needs Docker only because `make test-e2e` and `make test-e2e-smoke` start Mailpit. The builder may run the suite directly (`cd e2e && npx playwright test --project=chromium`) when Docker is unavailable, and says so in the report.
- This branch's own pull request is the first run of the CI job `e2e-smoke`, which starts once `e2e/package.json` exists: a failure there is a finding of this task, not of CI.
- Timing: journeys 3, 4 and 6 depend on seconds-long intervals and can flake on a loaded runner. The bounds are wide on purpose; a flake is reported, not retried away.
- `Not checked yet` is not asserted (see journey 2, step 4); FR-112's first state stays covered by the dashboard's tests.
- The 5-minute self-refresh is not tested (journey list above).
- The suite proves the wiring for one service type (HTTP, GET). TCP checks do not run yet (backlog).

## Structure

By `TESTING.md` ("End-to-end"). Names marked "new" are fixed by this file; the rest is the builder's choice.

- `e2e/package.json`, `package-lock.json`, `tsconfig.json` (strict, `noEmit`, Node types), `.gitignore` (`.bin/`, `node_modules/`), `playwright.config.ts` (new).
- `e2e/support/app.ts` (the binary: build, start, stop, restart), `e2e/support/stubTarget.ts` (the stub), `e2e/support/fixtures.ts` (the `app` and `stub` test fixtures and `test` and `expect` re-exported for the journeys), `e2e/support/helpers.ts` (`signIn`, `addService`, `waitForStatus`), `e2e/support/globalSetup.ts` (the build) (all new).
- `e2e/journeys/sign-in.spec.ts`, `add-service.spec.ts`, `service-status.spec.ts` (journeys 3 and 4), `delete-service.spec.ts`, `restart.spec.ts`, `first-start.spec.ts` (new). One file per journey group; the test titles name the journey and the requirement IDs.
- A script `typecheck` (`tsc --noEmit`) in `package.json`. The `Makefile` and CI do not call it.

## Dependencies

All three libraries are in `STACK.md` (Playwright) or already pinned by the frontend (TypeScript, Node types). Versions resolved on 2026-11-17 from the npm registry:

- `@playwright/test` **1.64.1** (published 2026-10-14). The newest are 1.65.1 (2026-11-13) and 1.65.0 (2026-11-05), both under two weeks old, so 1.64.1 is the newest that is old enough.
- `typescript` **6.0.3** and `@types/node` **24.19.2**, the versions `frontend/package.json` pins (`STACK.md`: TypeScript stays on the newest line typescript-eslint supports).

Commands, run in `e2e/`: `npm init -y`, then `npm install --save-dev --save-exact @playwright/test@1.64.1 typescript@6.0.3 @types/node@24.19.2`, then `npx playwright install chromium` (the user installs `firefox` and `webkit`). `package-lock.json` is committed: CI runs `npm ci` there and caches by that file. Node is the version in `frontend/.nvmrc` (22). No other dependency; the stub uses Node's `http`.

## Acceptance criteria

The journeys are the tests; "fails if the behavior is removed" is shown by the mutation checks below. The builder runs the Chromium project and reports it; it does not change a journey to make it pass (`CLAUDE.md`: fix the cause or stop and report).

**Harness**

- `cd e2e && npm ci && npm run typecheck` passes.
- `npx playwright test --project=chromium --list` lists every journey, and `--grep @smoke` lists exactly the tests of journeys 1, 2 (the add-and-healthy test) and 5.
- Two tests run in parallel get two different apps and stubs (different ports and databases); one test's data never shows in another's, whatever the order and `--workers` value.
- `globalSetup` stops with `build the frontend first: make build` when `dist` holds only `.gitkeep`, and builds the binary otherwise.
- The app is started from a clean environment: the same run gives the same result with `ADMIN_PASSWORD`, `CHECK_INTERVAL_DEFAULT_SECONDS` and `REQUIRE_HTTPS` set to other values in the developer's shell.

**Journeys** (one test or more each, as above)

- Journey 1: FR-1, FR-3, FR-4.
- Journey 2: FR-6, FR-9, FR-10, FR-12 (in part), FR-59, FR-67, FR-112 (in part), FR-95 (refresh button).
- Journey 3: FR-54 (as far as the journey reaches), FR-55, FR-61, FR-62.
- Journey 4: FR-10.
- Journey 5: FR-8, FR-71, FR-72, FR-70 (in part).
- Journey 6: FR-5 (in part), FR-101, FR-103, FR-111, FR-114.
- Journey 7: FR-102.

**Repo-wide**

- `make check` passes (it does not run `e2e/`).
- `make test-e2e-smoke` passes in Chromium when Docker is available; otherwise the direct command above passes and the report says why `make` was not run.
- `cd e2e && npx playwright test --project=chromium` passes (all journeys), run at least twice in a row.
- Nothing outside `e2e/**` and the plan file changed (`git diff --stat origin/main`).

## Verifier checks

- **The harness's own rules:** run `globalSetup` once with `backend/internal/web/dist` holding only `.gitkeep` (move the built files away in the scratch worktree) and see `build the frontend first: make build`; run two tests in parallel and see two ports in the attached app output.
- **No product change:** the diff touches only `e2e/**` and `docs/tasks/m1-e2e-journeys.plan.md`; `package-lock.json` pins `@playwright/test` 1.64.1.
- **No fixed waits:** the only `waitForTimeout` or `setTimeout` waits in a journey are the two waits for nothing to happen in journey 5, step 6 (4 and 8 seconds); everything else polls a condition with a timeout. Grep for `waitForTimeout`.
- **No CSS-class selectors:** locators use role, label or text. Grep for `.locator('.` and `[class`.
- **Clean environment:** the app and the first-start cases get an explicit environment, not `process.env`; run one journey with `ADMIN_PASSWORD=wrong REQUIRE_HTTPS=true` exported and see it pass.
- **Isolation:** run `npx playwright test --project=chromium --workers=2` and again `--workers=1`; both pass.
- **Mutation checks to run, against the product code in a scratch worktree, not committed:**
  - make `CreateService` not call `Start`: journeys 2, 3 and 4 must fail;
  - make `StartChecks` in `main.go` not run (comment out the call): journey 6, step 5 must fail;
  - make `DeleteService` not call `Stop`, or `Stop` a no-op: journey 5, step 6 must fail;
  - drop the session check on `GET /api/services`: journey 1, steps 5 and 6 must fail;
  - make the sign-in error differ for a wrong username: journey 1, step 2 must fail;
  - make the `Refresh` button do nothing: `waitForStatus` times out in journeys 3 and 6 (journey 2 may still pass when its first load already shows `Healthy`);
  - make the app move `last_status_change_at` when the status is unchanged, or start from `not_yet_checked` after a restart: journey 6, step 4 must fail.
  Each must fail at least one named journey; the verifier lists which.
- **Flakiness:** run the whole Chromium project three times; any failure that is not caused by a mutation is reported with its trace.
- **The user can run it:** the README-style comment at the top of `playwright.config.ts` states the two commands (`make test-e2e-smoke`, `make test-e2e`) and that `make build` must come first; no other documentation is added.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other, or a journey needs a status, field or message the contract and the screens do not have.
- A journey cannot pass without a change to product code (a missing accessible name, a label that differs from this file). Report the exact text found, which this file's wording differs from; do not edit the frontend and do not change the journey to match silently, since a label that differs from the design is a finding.
- You think you need a change outside `e2e/**`, a dependency beyond the three above, a configuration key, a change to the `Makefile` or CI, or an edit to a spec file.
- A prerequisite is missing.
- A convention in `CONVENTIONS.md` or `TESTING.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, the e2e commands above, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the journey that shows each), which commands ran and which did not (and why: Docker, browsers), the versions installed, how long the Chromium run took and whether any test was flaky, and anything you were unsure about. Also list every judgment call this file did not settle, and every text on screen that differed from this file.
