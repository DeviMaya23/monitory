# Task: milestone 5 security journeys

One end-to-end agent builds this on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The sign-in lockout, the HTTPS setting and the proxy-trust setting are proven through the real binary. After this task the suite in `e2e/` shows that five wrong sign-ins lock the account even for the right password, that the lock is visible on the screen and in the API, that it never touches a session that already exists, that a restart clears it; that sign-in over plain HTTP is refused while "require HTTPS" is on and the cookie flags follow the setting; and that the scheme and the client address come from the proxy's headers only when the installer has switched trust on.

Requirements covered, each by the journey named:

- FR-2: five failed sign-ins in a row lock the account, the right password is refused while it is locked, a correct sign-in resets the count (journeys 1 and 2). The screen's half of FR-2 (the banner and the disabled button) is seen in journey 1.
- FR-1, in part: the locked answer is the same for right and wrong credentials (journey 1).
- FR-114, in part: a restart clears the failed-sign-in count and the lock (journey 3). That a restart ends sessions is covered by `restart.spec.ts` (M1).
- FR-97: while "require HTTPS" is on, sign-in over plain HTTP is refused with the error that says how to turn the setting off, before the fields or the credentials are looked at (the router's own size, content-type and body checks come first), and the public page and health endpoint are not affected (journey 4).
- FR-98: the session cookie is `Secure` exactly when "require HTTPS" is on, whatever the request's scheme (journey 5).
- FR-99: with trust off the forwarding headers are ignored for the scheme and for the address the rate limit counts; with trust on the scheme comes from `X-Forwarded-Proto` and the address from the header `CLIENT_IP_HEADER` names (last entry for a list) (journeys 4 to 8).
- FR-32, in part: the rate limit counts the address the policy router resolves (journeys 6 to 8). The limit itself was proven by M4.

Test titles of this task start with `M5 journey <n>` so that they cannot be confused with the journeys of earlier milestones.

Out of scope:

- **The lock ending after 15 minutes.** The server's clock cannot be moved from a journey, and the real 15 minutes are not waited for. The boundary (one step before the end locked, exactly at the end open) is proven by the unit tests of `memstore.Lockout` and `usecase.AuthService` with a fake clock.
- **The Secure cookie in a browser.** Browsers differ in whether they keep a `Secure` cookie from `http://127.0.0.1`. The cookie's flags are read from the `Set-Cookie` header of the response; whether a browser sends it over HTTPS is the manual production check (`docs/manual-checks.md`, "Production").
- **A real proxy and real TLS.** The headers a proxy would add are sent by the test. The journeys prove what the app does with them, not that a particular proxy sends them. `Fly-Client-IP` on Fly.io is the user's production check (`backlog.md`).
- **The keyboard journeys (NFR-4) and the restart-and-upgrade journey (NFR-1)** and the end-to-end proof of the toast's place and of a save that finishes after the admin left: they are for `m5-e2e-journeys` (the last task of the milestone, not drafted when this file was written), which runs after this one.
- **The sign-in screen's other states and the locked screen's details** (countdown format at each value, focus, the button during a submit): the frontend tests. Journey 1 shows the state exists and works with the real server.
- **Any change to product code, the contract, the `Makefile`, CI, `docker-compose.yml` or docs.**

## Prerequisite

**A change by the user first.** `ROLES.md` (the End-to-end row) and `TESTING.md` (the test table and the sentence "Feature tasks write no end-to-end tests") allow the End-to-end role only for "a milestone's last task". Milestone 5's end-to-end work is two tasks, this one and `m5-e2e-journeys` (the user chose the split). Before this task runs, the user rewords both so that a milestone's closing end-to-end work may be more than one task, run after its feature tasks. If the rule still says "last task", the builder stops and asks (see "Stop and ask when").

All of these are merged on the default branch; the builder checks first and stops to ask if any is missing (it never creates them):

- `sign-in-lockout-api` and `sign-in-locked-screen`. Check by building the binary: five wrong sign-ins over `POST /api/session` must end in `429`, not `401`.
- `sign-in-api` (`REQUIRE_HTTPS`, the cookie), the policy router with `TRUST_PROXY` and `CLIENT_IP_HEADER` (`handler/middleware/request_info.go`), `public-dashboard-api` (the limiter and `PUBLIC_RATE_LIMIT_PER_MINUTE`).
- The M1 to M4 suites: `e2e/` with `support/app.ts` (`App` with `init`, `start`, `stop`, `restart`; `appEnv`, which sets `REQUIRE_HTTPS=false`), `fixtures.ts` (`app`, `visitor`, `appOverrides`), `helpers.ts` (`signIn`, `servicesHeading`, `publicApi`), and `journeys/restart.spec.ts`, `journeys/public-rate-limit.spec.ts`.
- The configuration keys `REQUIRE_HTTPS`, `TRUST_PROXY`, `CLIENT_IP_HEADER` and `PUBLIC_RATE_LIMIT_PER_MINUTE` are in `.env.example` and read by `platform/config`. No key is added.

## Role and ownership

Role: End-to-end (`ROLES.md`).

You may change only `e2e/**`: the support code (`helpers.ts`; `fixtures.ts` only if needed) and the journeys. No dependency is added, so `package.json` and `package-lock.json` do not change; `playwright.config.ts` does not change. You may not change `backend/**`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/m5-security-journeys.plan.md`), the root `.gitignore`, `.env.example`, `Makefile`, `.github/**`, `scripts/**` or `docker-compose.yml`.

Shared files this task touches, owned by this task while it runs: `e2e/support/helpers.ts` (and `e2e/support/fixtures.ts` if it is touched). `m5-e2e-journeys` changes the same files and runs after this task merges.

Tasks that may run at the same time: `frontend-hardening` and `backend-hardening`, neither of which changes `e2e/`. Journeys 6 to 8 depend on the limiter's behavior, which `backend-hardening` keeps unchanged; whichever merges first, the other is checked against the merged result.

## Operations used

None is added or changed. The journeys use the real app, through the browser where a screen shows the result and through HTTP where it cannot:

- `signIn` (`POST /api/session`): sent over `request` contexts with no cookies (the visitor's, or a context made with `playwright.request.newContext({ baseURL })`), to count attempts quickly and to read the raw status, headers and body. Responses read: 200 with `Set-Cookie`, 400, 401, 403, 415, 422, 429 with `Retry-After`.
- `getSession` (`GET /api/session`) and `listServices` (`GET /api/services`): to show that a session works or that none exists.
- `getPublicDashboard` (`GET /api/public/dashboard`): to use up the rate limit and read `429` and `Retry-After`. The public view is left off, so it answers `404 public_view_unavailable` until the limit is reached; the limiter runs before that check.
- `getHealth` (`GET /health`).

Every write over HTTP here is the unauthenticated `signIn`, which needs no CSRF token. Everything else the admin does goes through the form.

## Behavior

### The harness

Everything of the M1 to M4 harness stays: one app (own port, own temporary database) per test, `globalSetup` builds the binary once, elements are found by role, label and visible text, the app's environment is explicit, and the only fixed wait is `settle`, which these journeys do not need. No journey uses Mailpit, a stub site or a service. Each test has its own app, so a lock in one test never reaches another, and tests may run in parallel. This task adds, in `helpers.ts` (names marked new are fixed here; the rest is the builder's choice):

- `signInApi(request, username, password, headers?)` (new): sends `POST /api/session` with a JSON body of the two values and the extra headers, and returns `{ status, headers, text, json }` as `publicApi` does (`json` is `null` when the body is not JSON).
- `signInRaw(request, body, contentType, headers?)` (new): the same, with the body string and the `content-type` header given as they are, for the `{}`, malformed JSON and `text/plain` cases of journeys 2 and 4.
- `attemptSignIn(page, username, password)` (new): opens `/sign-in`, fills both fields, presses `Sign in`, and does not wait for any outcome. (`sign-in.spec.ts` has a private copy; this task does not edit that file.)
- `publicApi(request, headers?)` (extended): an optional second argument of extra request headers. Existing callers do not change.
- `setCookieOf(headers)` (new): parses the single `session` cookie from the `set-cookie` header into `{ value, path, maxAge, httpOnly, secure, sameSite, other }` so a test asserts attributes by name, not by string position. `other` lists any attribute not in the first six, so a test can assert it is empty (no `Domain`, no `Expires`).
- Named constants for the exact texts used below: the locked banner's title, the `https_required` detail and `ADMIN_*` come from `app.ts` or are written once at the top of the spec that uses them.

A wrong password is a value that is not the admin's password (for example `not-the-password`); a wrong username is a value that is not the admin's username (for example `not-the-admin`). A wrong attempt changes one of the two; the other is the admin's.

### Journey 1: five wrong attempts lock the account (`sign-in-lockout.spec.ts`)

The app has its default environment. Steps:

1. The admin's `page` signs in with the right credentials (`signIn`) and sees the dashboard. This is the baseline: the same credentials are accepted before the lock, and this session must survive it.
2. With the visitor's request context, four wrong attempts, each `401` with code `invalid_credentials`: the admin's username with a wrong password (twice), then a wrong username (`not-the-admin`) with the admin's right password (twice).
3. On a page of the visitor's context, the fifth wrong attempt through the form (`attemptSignIn`, right username, wrong password): the banner `Username or password is incorrect.` shows and no `Too many failed attempts.` text. It is still `401`, not locked: five failures lock the next attempt, not the fifth.
4. On the same page, the right username and the right password through the form: the error banner shows the title `Too many failed attempts.` and a line, found by its text (`getByText(/^Try again in /)`; the time sits in a classed span, which is not used as a selector), that matches `Try again in (14 min [0-9]{1,2}|15 min 0) s.`; the URL is still `/sign-in`; the button `Sign in` is disabled; `Username` and `Password` are enabled and hold what was typed (the right values); focus is in `Password`. The dashboard is not shown.
5. The countdown falls: read the minutes and seconds twice (poll every 500 ms for at most 10 s) until the total seconds are below the first reading.
6. Through the API, with the visitor's request context:
   - the right credentials: `429`; the header `content-type` starts with `application/problem+json`; `retry-after` matches `^[0-9]+$` and is between 600 and 900; the body is exactly `{ "title": "Sign-in locked", "status": 429, "code": "sign_in_locked" }`; there is no `set-cookie` header;
   - wrong credentials (a wrong password, then a wrong username): also `429` with the same body, so the answer does not say which part was right (FR-1);
   - a refused attempt does not extend the lock: poll the right credentials every 500 ms for at most 10 s until `retry-after` is below the first value read in this step. (Every poll is itself a refused attempt; if refusals extended the lock, the header would stay at 900 and the poll would time out.)
7. The admin's session is untouched: `page.reload()` shows the dashboard heading, and `page.request.get('/api/session')` is `200`.
8. No session was created by the locked attempts: `visitor.request.get('/api/services')` is `401` with code `unauthenticated`.

### Journey 2: what counts and what resets (`sign-in-lockout.spec.ts`)

API only, with one request context. The expected status of each step is part of the journey. W is a wrong attempt (its username or password is wrong; mix both), OK is the right credentials:

1. W, W, W, W: `401` each.
2. OK: `200` (the count is reset). A `set-cookie` header is present.
3. W, W, W, W: `401` each. (Without the reset, the second W would already be refused.)
4. Requests that are not failed attempts: `{}` as the body: `422` with code `validation_failed`; `{"username":` as the body with content type JSON: `400` with code `malformed_request`; the body `x` with content type `text/plain`: `415` with code `unsupported_media_type`.
5. W: `401` (the fifth failed attempt since the last reset; the three requests of step 4 did not count).
6. OK: `429` with code `sign_in_locked` (the sixth attempt is refused even with the right credentials).
7. While locked, `{}` as the body: `422` (an empty field is rejected before the lock is looked at; it does not extend or change the lock), and a following OK is still `429`.

### Journey 3: a restart clears the count and the lock (`sign-in-lockout.spec.ts`)

Two tests.

- **The lock.** Five wrong attempts through the API; the right credentials through the API are `429`. On a page of the visitor's context, the right credentials through the form show `Too many failed attempts.`. `app.restart()`. The same page is reloaded: no banner, an enabled button. The right credentials through the form sign in and the dashboard heading shows. (`app.restart()` stops and starts the binary on the same database and port; the lock is in memory, so it must be gone.)
- **The count.** Four wrong attempts; `app.restart()`; four wrong attempts, each `401`; one more wrong attempt, `401` (the fifth since the restart); the right credentials, `429`. Had the count survived the restart, the second batch would have been refused.

### Journey 4: "require HTTPS" refuses plain HTTP (`sign-in-https.spec.ts`)

The app is started with `REQUIRE_HTTPS=true` and no trust, through `test.use({ appOverrides: { REQUIRE_HTTPS: 'true' } })` inside this journey's own `test.describe` (so the other journeys of the file keep the default environment). Every request in the suite is plain HTTP.

1. On a page of the visitor's context, the right credentials through the form: a warning banner with the title `Sign-in requires HTTPS` and, under it, exactly this text: `Sign-in is only allowed over HTTPS. If the app is behind an HTTPS proxy, set TRUST_PROXY=true. To allow sign-in over plain HTTP, set REQUIRE_HTTPS=false. Restart the app after changing either setting.` The URL is still `/sign-in` and the dashboard is not shown. No `Too many failed attempts.` text shows.
2. Through the API: the right credentials: `403`; the content type starts with `application/problem+json`; the body is exactly `{ "title": "HTTPS required", "status": 403, "code": "https_required", "detail": "<the text above>" }`; no `set-cookie`.
3. The scheme is checked first: wrong credentials: `403`; `{}`: `403` (not `401` or `422`).
4. The header `X-Forwarded-Proto: https` is ignored while trust is off: the right credentials with it: still `403`.
5. The setting does not apply to the rest of the app: `GET /health` is `200`; `GET /api/public/dashboard` is `404` with code `public_view_unavailable` (the view is off; it is reachable, not refused with 403); the page `/status` shows the title `This status page isn’t available` and the text `It has been turned off.` (the heading `Service status` is shown in every state, so it is not the proof).

### Journey 5: the cookie follows the setting (`sign-in-https.spec.ts`)

Three tests, each in its own `test.describe` with `test.use({ appOverrides })` (a `test.use` outside a `describe` applies to the whole file). Each reads the `set-cookie` header with `setCookieOf`.

- **Require on, trust on** (`REQUIRE_HTTPS=true`, `TRUST_PROXY=true`): the right credentials with `X-Forwarded-Proto: https` are `200`. The body has a `csrf_token` and an `expires_at`. The cookie is named `session`, its value is 43 characters of `[A-Za-z0-9_-]`, `path` is `/`, `maxAge` is `2592000`, it is `HttpOnly`, `Secure`, `SameSite=Strict`, and `other` is empty. A `GET /api/session` that carries that cookie in a `cookie: session=<value>` header is `200`. The same credentials with `X-Forwarded-Proto: HTTPS` are `200`. With `X-Forwarded-Proto: http` and with no header they are `403` with code `https_required`.
- **Require off, trust on** (`REQUIRE_HTTPS=false`, `TRUST_PROXY=true`): the right credentials with `X-Forwarded-Proto: https` are `200` and the cookie has `HttpOnly`, `SameSite=Strict`, `Path=/` and `Max-Age` but is not `Secure`: the flag follows the setting, not the request's scheme. (Sign-in over plain HTTP, with no header, is `200` in every other journey.)
- **Require off, trust off** (the default environment): the right credentials with `X-Forwarded-Proto: https` are `200` and the cookie is not `Secure`.

### Journeys 6 to 8: whose address the rate limit counts (`proxy-trust.spec.ts`)

Every test sets `PUBLIC_RATE_LIMIT_PER_MINUTE=3` (in its own `test.describe`, with the trust settings it needs) and uses `publicApi` with extra headers. The public view is off, so each request that passes the limit is `404` with code `public_view_unavailable`, and the one over the limit is `429` with code `rate_limited`, a `Retry-After` header that matches `^[0-9]+$` and is between 1 and 60, and the content type `application/problem+json`. The tests are quick: all requests of one test are within the same window.

- **Journey 6: trust off ignores the forwarding headers** (default environment). Three requests, each with a different `X-Forwarded-For` (`203.0.113.1`, `203.0.113.2`, `203.0.113.3`) and an `X-Real-IP`: `404` each. A fourth with a fourth `X-Forwarded-For` (`203.0.113.4`): `429`. The connecting address is the one counted, and it is the same for all four.
- **Journey 7: trust on, the default header** (`TRUST_PROXY=true`, `CLIENT_IP_HEADER` unset, so `X-Forwarded-For`). Three requests with `X-Forwarded-For: 203.0.113.7`: `404` each. A fourth with the same value: `429`. A request with `X-Forwarded-For: 203.0.113.8`: `404` (its own counter). A request whose header is `1.1.1.1, 203.0.113.7` (a first entry the client chose, then the one the proxy added): `429`, because the last entry is counted and a client cannot choose another address by adding entries before it. A request with no `X-Forwarded-For`: `404` (with no usable header the connecting address is counted, and it has its own counter, still at zero).
- **Journey 8: trust on, another header** (`TRUST_PROXY=true`, `CLIENT_IP_HEADER=X-Real-IP`). Three requests with `X-Real-IP: 198.51.100.1` and no `X-Forwarded-For`: `404` each. A fourth with `X-Real-IP: 198.51.100.1` and `X-Forwarded-For: 203.0.113.99`: `429` (the other header does not separate it from the first three). A fifth with `X-Real-IP: 198.51.100.2` and the same `X-Forwarded-For: 203.0.113.99`: `404` (the named header decides the address).

### Known gaps

- **The lock's end is not run.** See "Out of scope"; the unit tests have it.
- **The rate-limit window is real time.** The tests stay inside one window and do not wait for it to end (M4's journey 5 does).
- **All requests come from `127.0.0.1`.** A different address is only simulated by a header, and only with trust on.
- **The lockout is one counter for the one account.** Each test has its own app, so the counter is never shared between tests; a journey that signs in wrongly and then needs the admin must restart the app or use another app.
- **The lock's 15 minutes make the `Retry-After` range wide** (600 to 900 in journey 1): the journeys assert ranges, not exact values.
- **A browser's treatment of a `Secure` cookie on `http://127.0.0.1` is not tested** (see "Out of scope").

## Structure

By `TESTING.md` ("End-to-end"). Names marked "new" are fixed by this file; the rest is the builder's choice.

- `e2e/support/helpers.ts` extended as above (`app.ts`, `stubSite.ts`, `stubTarget.ts`, `mailpit.ts`, `certs.ts` are not changed; `fixtures.ts` only if a fixture is needed).
- `e2e/journeys/sign-in-lockout.spec.ts` (journeys 1 to 3), `sign-in-https.spec.ts` (journeys 4 and 5), `proxy-trust.spec.ts` (journeys 6 to 8) (new). Titles start with `M5 journey <n>` and name the requirement IDs. No journey is tagged `@smoke`: the smoke subset keeps the milestone 1 to 4 selection.
- No new script or config file, and no new dependency.

## Dependencies

None. Playwright and the harness are already in `e2e/package.json`; the manifest and the lockfile do not change.

## Acceptance criteria

Every criterion is a journey (a test) that fails if the behavior is removed. The journeys run in Chromium by default and in all three browsers in the full suite.

**Journey 1**

- Steps 2 to 8 as written, with their exact statuses, texts and headers; steps 3 and 4 show that the fifth wrong attempt is `401` and the sixth attempt, with the right credentials, is refused.
- The right credentials are accepted at the start (step 1), so "refused" in step 4 is the lock and not a changed password.

**Journey 2**

- Every status in steps 1 to 7, in order.

**Journey 3**

- Both tests, with the statuses and the reload as written. The lock test shows the banner before the restart (so "no banner" afterwards is not just a page that never had one).

**Journey 4**

- Steps 1 to 5. The detail text is compared exactly.

**Journey 5**

- The three tests, with every attribute named. The `Secure` assertion is `true` in the first test and `false` in the other two.

**Journeys 6 to 8**

- Every status in the sequences, and for each `429` the code, the header range and the content type. In journey 7, the `1.1.1.1, 203.0.113.7` request is refused; in journey 8, the fourth request (same `X-Real-IP`, an `X-Forwarded-For` added) is refused and the fifth (another `X-Real-IP`) is not.

**Repo-wide**

- `make test-e2e-smoke` passes (the smoke subset is unchanged) and the new specs pass in Chromium (`npx playwright test sign-in-lockout sign-in-https proxy-trust --project=chromium` from `e2e/`, after `make build`). Report firefox and webkit as run or not run, with the reason.
- `make check` passes for anything outside `e2e/` it covers; nothing outside `e2e/` changed.

## Verifier checks

- **Diff rules:** only `e2e/**` and the plan file; no manifest or config change; no `waitForTimeout` (polls use `expect.poll`); no CSS-class selectors; no `retries` setting; every wrong credential differs from the admin's; `PUBLIC_RATE_LIMIT_PER_MINUTE` is set only by journeys 6 to 8; `REQUIRE_HTTPS` and `TRUST_PROXY` are set only through `appOverrides`, and the app's environment is otherwise explicit.
- **Texts:** every quoted message is compared with its source (`backend/internal/handler/problem.go`, `backend/internal/handler/session.go`, `frontend/src/features/sign-in/components/SignInForm.tsx`) and a difference is a finding against the file or the test.
- **Mutation checks** (scratch worktree of `backend/`, never committed; each must fail at least the named journey): the lock engages after 4 or after 6 failures (1, 2); only wrong passwords count (2: a wrong username in a batch); a correct sign-in does not reset the count (2); an empty field or a malformed body counts as a failure (2, step 5); the lock is not applied to the right credentials (1); a refused attempt extends the lock (1, step 6); the locked answer differs by which part was wrong (1, step 6); `Set-Cookie` is sent on the 429 (1); the lockout survives a restart (3, a persisted count is not possible, so the mutation is a package-level variable that is not reset; skip if it cannot be made); the HTTPS check comes after validation or after the credentials (4, step 3); `X-Forwarded-Proto` is read while trust is off (4 step 4, 5 third test, and journey 6); the cookie is always `Secure` or never `Secure` (5); `Secure` follows the request's scheme and not the setting (5, second test); the first entry of `X-Forwarded-For` is counted instead of the last (7); the address comes from `X-Forwarded-For` when `CLIENT_IP_HEADER` names another header (8); trust is applied while off (6).
- **Reading the tests:** for each journey confirm the baselines named above; confirm journey 1's `Retry-After` and countdown assertions are ranges; confirm journey 2's step 5 is a `401` (the discriminating assertion) and step 3's four `401`s follow the reset.
- **Inputs to try:** run with `--workers=1` and `--workers=4`; confirm `appEnv()` passes only explicit values; run the new specs twice in a row, and the whole suite once.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other, or the real responses differ from what this file quotes.
- `ROLES.md` or `TESTING.md` still says the End-to-end role builds only "a milestone's last task" (see "Prerequisite").
- You think you need a change outside `e2e/`, a dependency, or a change to a product text.
- `sign-in-lockout-api` or `sign-in-locked-screen` is not merged, or five wrong sign-ins do not end in `429`.
- A journey would need the server's clock or a real TLS connection.
- A convention in `CONVENTIONS.md` or `TESTING.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check` and the commands under "Repo-wide", commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the journey that shows each), which end-to-end commands ran and in which browsers, that no dependency changed, and anything you were unsure about. Also list every judgment call this file did not settle.
