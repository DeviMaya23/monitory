# Task: milestone 4 end-to-end journeys

One end-to-end agent builds this on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

Milestone 4 is proven through a real browser against the real binary. After this task the suite in `e2e/` shows an anonymous visitor the public status page: only the services the admin chose, only name, status and last check, ordered by name ignoring case; never a paused service or one not yet checked; "unavailable" while the admin has the public view off; a Refresh and a five-minute update that pick up changes; and the rate limit with its countdown. It also proves the health endpoint answers without sign-in and returns no service data. It is the end-to-end proof of milestone 4 (`docs/requirements.md` section 8, milestone 4: "the public view as an anonymous visitor, including the rate limit and everything it must not show (FR-40, FR-63)"). No product code changes.

Requirements covered, each by the journey named:

- FR-28, FR-63, FR-112: the chosen services are listed with name, the status word `Healthy` or `Unhealthy` and the time of the last check (journey 1). The icon beside the word is not asserted (it is `aria-hidden`; the frontend tests cover it).
- FR-40, FR-63: the page and the raw API response carry no URL, header, query parameter, body, failure reason, id or any other field (journeys 1 and 2).
- The public list's order (`docs/openapi.yaml`: "Ordered by name, ignoring case, ascending"; FR-59 for the ignoring-case rule) and NFR-7: names ordered ignoring case; a name with markup is shown as text (journey 1).
- FR-27, FR-68: a new service is hidden from the public view until the admin turns its switch on (journey 2).
- FR-77 (public half), FR-78, FR-113: a paused service and a service not yet checked are not shown, whatever its switch says; a resumed service returns with its state kept (journey 2).
- FR-26, FR-29, NFR-1 (the setting, in part): the public view is off until the admin turns it on, an anonymous visitor then gets the "unavailable" page and `404 public_view_unavailable`, and the admin's switch changes it both ways; the `Open` link leads to the page (journey 3).
- FR-30, FR-31: Refresh loads the latest status; the page updates itself after five minutes (journey 4).
- FR-32, FR-99 (proxy trust off, the connecting address is counted): more than the configured number of requests from one address in a window are `429 rate_limited` with `Retry-After`; the page shows the countdown and shows the list again by itself at zero; the admin's API and the health endpoint are not limited (journey 5).
- The rate-limit counters are not stored (`CONVENTIONS.md` rule 12 and `STACK.md`: in memory; FR-114 names sessions and lockouts and the requirements do not list these counters): a restart gives a fresh window (journey 6).
- FR-96, FR-4: the health endpoint answers without sign-in, says only that the app is running and returns no service data; other API calls without sign-in are refused (journey 7).

Test titles of this task start with `M4 journey <n>` so that they cannot be confused with the journeys of milestones 1 to 3 (`--grep` and the reports).

Out of scope:

- **Times in the viewer's local time (FR-94)**: the format depends on the browser's locale; it stays on the manual check (`docs/manual-checks.md`, "Times on the dashboards are in this computer's local time"). The journeys check only that a time is shown and is a recent moment.
- **Which address is counted when the proxy is trusted (FR-99, `TRUST_PROXY`, `CLIENT_IP_HEADER`)**: a second client address cannot be made from a local test without proxy trust; the journey with trust on is milestone 5 (`backlog.md`). The unit and handler tests of `public-dashboard-api` cover the address resolution.
- **The rate limit at its default of 60, its boundary to the request and to the nanosecond, and the exact `Retry-After` arithmetic**: unit tests with a fake clock (`memstore`, `usecase`). The journeys use a configured limit of 3 and show the behavior, the header's range and that it does not grow.
- **The page's other failure states** (could not load, refresh failed, the 429 banner over a list): frontend tests with mocks. Journey 5 shows the 429 banner over nothing, because that is what a real refusal of the first load produces.
- **The sign-in lockout, `TRUST_PROXY` journeys, restart with an upgrade and the keyboard journeys** (milestone 5).
- **Narrow screens and the other browsers' runs**: manual checks and the user's `make test-e2e`.
- **Any change to product code, the contract, `Makefile`, CI, `docker-compose.yml` or docs.**

## Prerequisite

All of these are merged on the default branch; the builder checks first and stops to ask if any is missing (it never creates them):

- `public-dashboard-api`: `GET /api/public/dashboard` is real. Check by building the binary and reading the response of the path with the view on: it must not be `501`.
- The M1, M2 and M3 suites: `e2e/` with `playwright.config.ts`, `support/app.ts`, `fixtures.ts` (`app`, `stub`, `receiver`, `site`, `tlsSite`, `tcp`, `appOverrides`), `helpers.ts` (`signIn`, `serviceName`, `serviceRow`, `fillServiceForm`, `openAddService`, `openEditService`, `saveService`, `waitForStatus`, `waitForPaused`, `serviceState`, `serviceId`, `defaultTiming`), `stubSite.ts` (`StubSite`, with `route`, `url`, `count`, `requests`), `globalSetup.ts`.
- The screens: `public-dashboard-screen` (`/status`), `dashboard-public-switch` (the `Public page` switch and the `Open` link on the dashboard), `service-public-toggle` (the `Show on public page` switch on the Add and Edit forms), `dashboard-pause-resume`, `edit-service-screen`.
- The configuration key `PUBLIC_RATE_LIMIT_PER_MINUTE` is in `.env.example` and read by `platform/config`. No configuration key is added.

## Role and ownership

Role: End-to-end (`ROLES.md`).

You may change only `e2e/**`: the support code (`helpers.ts`, `fixtures.ts`) and the journeys. No dependency is added, so `package.json` and `package-lock.json` do not change; `playwright.config.ts` changes only if a new setting is needed (none is expected). You may not change `backend/**`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/m4-e2e-journeys.plan.md`), the root `.gitignore`, `.env.example`, `Makefile`, `.github/**`, `scripts/**` or `docker-compose.yml`.

Shared files this task touches, all owned by this task while it runs: `e2e/support/helpers.ts`, `e2e/support/fixtures.ts`. No other task changes `e2e/` or the product now.

## Operations used

None is added or changed. The journeys use the real app through the browser, and a few direct HTTP reads where a screen cannot show the value:

- `getPublicDashboard` (`GET /api/public/dashboard`): read with the visitor's own request context (no cookies), to see the raw body, the status, `Retry-After` and the content type. Journey 5 uses it to use up the limit.
- `getHealth` (`GET /health`): read with no cookies.
- `listServices` (`GET /api/services`): with the admin page's session, for a service's `paused` and `state`; and once without a session, to show `401 unauthenticated` (journey 7).

Nothing writes over HTTP: every write goes through the form or the dashboard, so no CSRF token is needed.

## Behavior

### The harness

Everything of the M1 to M3 harness stays: one app (own port, own temporary database) and one stub per test, `globalSetup` builds the binary once, elements are found by role, label and visible text, `waitForStatus` polls, the app's environment is explicit, and the only fixed wait is `settle` (used only to show that something does not happen; this task does not need it). No journey uses Mailpit: every service is added with `alerts: false`. This task adds:

**A visitor.** A fixture `visitor` (test-scoped): a fresh browser context with no cookies and no storage, created with the app's base URL (`browser.newContext({ baseURL })`; a context made this way does not inherit the fixture's base URL), closed at the end. A test makes a page with `visitor.newPage()` and reads the API with `visitor.request`. The `page` fixture stays the admin's.

**Helpers** (`helpers.ts`, extended; the M1 to M3 ones stay and their behavior does not change). Names marked new are fixed here; the rest is the builder's choice.

- `ServiceSpec` (new field `shownOnPublic?: boolean`): `fillServiceForm` turns the `Show on public page` switch on or off (as it does for `Send alerts`) when the field is given, and leaves it alone when not.
- `openStatusPage(page)` (new): `page.goto('/status')`, waits for the heading `Service status`, and then for the first answer to have been shown: the loading state (the text `Loading service status…`) is gone. The heading is shown in every state, so waiting for it alone is not enough. A caller that expects the unavailable page or the 429 banner then waits for that text.
- `visitorRefresh(page)` (new): presses `Refresh` and waits for the response (`page.waitForResponse` on `/api/public/dashboard`, registered before the click) and for the button to be enabled again. Every "the visitor presses Refresh" step uses it, so that an assertion never runs before the request has answered.
- `setPublicView(page, on)` (new): on the dashboard, waits until the `Public page` switch (role `switch`, name `Public page`, exact) has loaded (it is disabled until the setting arrives, then shows `On` or `Off`: wait with `toBeEnabled`, never read or click it before), sets it to `on` if it is not already, and waits for the toast `Public page turned on.` or `Public page turned off.` and for the switch's `aria-checked`.
- `publicNames(page)` (new): the names of the rows of the public list in page order. A row is an item of the list named `Services` (the same list name as the admin's; on the public page a row has the name, the status badge, `Last checked` and a `time` element). It reads the name from the row without its badge and time text, by structure (for example the row's first text element), not by a CSS class. Called after `openStatusPage` or `visitorRefresh`, so an empty result means an empty page, not one still loading.
- `publicApi(request)` (new): `GET /api/public/dashboard` with the given request context; returns `{ status, headers, text, json }`.

Everything the visitor sees and reads is counted against the limit of that app (the default 60 a minute). Journeys 1 to 4 and 6 stay far below it (a few requests each); journey 5 sets it to 3.

Services of every journey are added with `alerts: false`, with a Timing group that keeps the harness's 6-second check interval unless the journey says otherwise (`defaultTiming`), and with `site` as the checked service (a path routed with `site.route(path, {})` is healthy, `{ status: 503 }` unhealthy; every service's URL names a path that the test has routed, as an unrouted path answers 404). Names come from `serviceName()` unless the journey builds them from it.

Every journey sets its own timeout where the default of 60 seconds is not enough: `test.setTimeout(120_000)` for journeys 2 and 4, `90_000` for journey 3, `180_000` for journey 5, and the default for the others.

### Journey 1: an anonymous visitor sees the chosen services, and nothing else (`public-dashboard.spec.ts`; `@smoke`)

FR-28, FR-63, FR-112, FR-40, FR-113 (a service not chosen), the list's order, NFR-7.

1. As the admin, sign in and turn the public view on (`setPublicView`). Let `s = serviceName()`. Add three chosen services, each at its own path of the one `site` (`site.route('/b', {})`, `site.route('/a', {})`, `site.route('/x', { status: 503 })`; the service's URL is `site.url('/b')` and so on; the fixtures give one `site` per test and `StubSite` is not changed) with `shownOnPublic: true`: `B-<s>` healthy, `a-<s>` healthy, and `<b>x</b>-<s>` (a name with markup) unhealthy (503). Add a fourth, `d-<s>`, healthy (`site.route('/d', {})`), with `shownOnPublic: false` (the form's default). Wait until each of the four has its final status on the dashboard (`Healthy`, `Healthy`, `Unhealthy`, `Healthy`).
2. As the visitor, open `/status`. The heading `Service status` is shown. The rows are, in this order, `<b>x</b>-<s>`, `a-<s>`, `B-<s>` (code-unit order of the lower-cased names: `<` comes before `a`, `a` before `b`; a case-sensitive order would put `B-<s>` first) and the fourth service is not among them. The name with markup is shown literally as `<b>x</b>-<s>` text: the page has no `b` element inside the row (NFR-7).
3. Each row shows the status word as the admin sees it (`Unhealthy`, `Healthy`, `Healthy`) and, in the row, the label `Last checked` and a `time` element whose `datetime` is an ISO time within the last 60 seconds of the test's clock. The summary line reads `1 of 3 services unhealthy`.
4. The rows show nothing else: the text of the whole list holds none of the services' URLs, the stub's port or `Returned an HTTP error` (the admin's failure reason); the page has no `Edit …` or `Alerts …` link, no `Pause …` button, no `Sign out` button and no link to the admin's pages (found by role and name).
5. The raw API: `publicApi(visitor.request)` is `200` with content type `application/json` (a `charset` suffix is accepted: match the start of the header) and a body of the shape `{ "services": [ … ] }` holding exactly the same three names in the same order. Every item has exactly the keys `name`, `status` and `last_checked_at` (no `id`, no `url`, no other key; the check is on the key set, not on the absence of a few words), `status` is `healthy` or `unhealthy`, and the body's text holds none of the stub's port.

### Journey 2: what the public view must not show (`public-dashboard.spec.ts`)

FR-27, FR-68, FR-77 (public half), FR-78, FR-112, FR-113.

1. Sign in, turn the public view on. Add `new-<s>` through the form with the `Show on public page` switch untouched, saving a healthy service (`site.route('/n', {})`). Before saving, the switch is off (`aria-checked` `false`): a new service starts hidden (FR-68). Wait for `Healthy`. The visitor's page (`openStatusPage`) does not list it: it shows the empty state `No services to show` (there is no other chosen service yet), and no summary line.
2. Edit it (`openEditService`), turn `Show on public page` on, save. The visitor's Refresh (or a reload) shows the row, `Healthy` (FR-27).
3. **Not yet checked.** Add `pending-<s>` on a failing path of the `site` (`site.route('/p', { status: 503 })`) with `shownOnPublic: true` and the timing `{ interval: 60, timeout: 1, retries: 3, retryInterval: 10 }` (within the configured maximums, 5 and 300): the failing site answers at once, so the first sequence takes about 30 seconds (3 retries, 10 seconds apart) and the row stays `Not checked yet` until its last retry. While the admin dashboard shows `Not checked yet` for it (read before and after the visitor's read, so that the window is known to have been open), the visitor's page does not list it. After it becomes `Unhealthy` on the admin's dashboard, the visitor's Refresh lists it as `Unhealthy` (FR-113).
4. **Paused.** Pause `new-<s>` from the dashboard (`Pause new-<s>`). `serviceState` shows `paused` true and a state of `healthy` (FR-78: the state is kept). The visitor's Refresh no longer lists it, though its switch is still on and its stored status is `healthy` (FR-77, FR-113). The API response agrees (it holds no such name).
5. **Resumed.** Resume it. After its check (the admin dashboard shows `Healthy`), the visitor's Refresh lists it again.
6. Every step's "not listed" is read against a baseline in the same journey that shows the same service listed when the condition is reversed (step 2 before step 4; step 5 after it; step 3 after the retries).

### Journey 3: the admin's switch and the unavailable page (`public-view-switch.spec.ts`; the first test `@smoke`)

FR-26, FR-29.

1. **Off by default.** A fresh app has the public view off. The visitor opens `/status` and sees the title `This status page isn’t available` and the text `It has been turned off.`; no refresh control (no `Refresh` button), no list, no summary. The raw API: `404`, content type `application/problem+json`, body `{ "title": "Public view unavailable", "status": 404, "code": "public_view_unavailable" }` (these keys; no `errors`).
2. **On.** The admin signs in; the dashboard's `Public page` switch shows `Off`; turning it on shows `Public page turned on.` and `On`. The admin adds one chosen healthy service (`site.route('/c', {})`, `shownOnPublic: true`). A reload of the visitor's page lists it (the baseline for steps 1 and 3).
3. **Off again.** The admin turns it off (`Public page turned off.`). The visitor's reload shows the unavailable page again, and the API is `404`. A service was added and chosen by now, and neither the body nor the page holds its name. Then the admin turns the view on, the app restarts (`app.restart()`), the admin signs in again and the switch reads `On` and the visitor's page lists the service: the setting is stored (NFR-1 in part; reading `Off` after a restart would prove nothing, as Off is the default).
4. **The `Open` link.** On the dashboard with the view on, the link named `Open public page (new tab)` has `href` `/status`, `target` `_blank`. Clicking it opens a new page (`context.waitForEvent('page')`) at `/status` that shows the heading `Service status` and the chosen service, as the admin is signed in: it is the same public page, with no `Sign out` button and no top bar.

### Journey 4: Refresh and the five-minute update (`public-refresh.spec.ts`)

FR-29, FR-30, FR-31, FR-112.

1. **Refresh.** The public view on, two chosen services at two paths of the one `site` (`a-<s>` at `/a`, `b-<s>` at `/b`), both healthy. The visitor's page shows the summary `All services healthy` and the meta text `Updated …`. `/a` is made to fail (`site.route('/a', { status: 503 })`); when the admin's dashboard shows `Unhealthy` for it, the visitor presses `Refresh` (`visitorRefresh`): the row now shows `Unhealthy` and the summary `1 of 2 services unhealthy` (FR-30, FR-112).
2. **The five-minute update.** On a page of a second, fresh visitor context (`browser.newContext({ baseURL })`; Playwright's clock belongs to the whole context, so the first page's context is not used): `page.clock.install()` before any navigation, then `openStatusPage`. The clock is left running; it is never paused (a paused clock stops the page from rendering an answer, because the data library delivers updates through a timer). The page lists both services; `/a` is `Unhealthy`. `/a` is then made healthy again and the admin's dashboard shows `Healthy`; this must take less than a minute after the page's load, and the test checks it (it fails with a clear message otherwise). The test counts the page's requests to `/api/public/dashboard` (a `page.on('request')` counter started after the first load). It advances the clock with `page.clock.fastForward('04:00')` and waits for the page to settle (a moment, no request expected): no request was made (count unchanged, the row still `Unhealthy`). It advances `fastForward('01:30')`, which is five and a half minutes plus the real seconds since the load, well short of ten: the count has risen by exactly one, and the row shows `Healthy` and the summary `All services healthy`, with no button pressed (FR-31). The margins (a minute either side of five) make the step independent of how long the page took to load.
3. **Unavailable replaces the list.** On the same page: the admin turns the view off; the visitor presses `Refresh` (`visitorRefresh`): the content is replaced by `This status page isn’t available` and the `Refresh` button is gone (FR-29). The page does not come back by itself: a further `fastForward('10:00')` makes no request (count unchanged). The admin turns the view on; only a reload of the page (`page.goto('/status')` again on the same page, with the clock still running) shows the list again.

### Journey 5: the rate limit (`public-rate-limit.spec.ts`)

FR-32, FR-99 (the connecting address, proxy trust off), FR-96, FR-4. The app is started with `PUBLIC_RATE_LIMIT_PER_MINUTE` set to `3` (`test.use({ appOverrides: { PUBLIC_RATE_LIMIT_PER_MINUTE: '3' } })`); the environment stays explicit and its value wins. The test takes up to a minute and a half: `test.setTimeout(180_000)`.

1. The admin turns the public view on and adds one chosen healthy service `r-<s>`; the visitor has made no request yet. (The admin's own reads and sign-in are not public requests and do not count.)
2. Using `visitor.request`, three requests to the public API are `200`. The fourth is `429`: content type `application/problem+json`, body `{ "title": "Too many requests", "status": 429, "code": "rate_limited" }`, and a `Retry-After` header that is a whole number of at least 1 and, because the window is one minute (`public-dashboard-api`), at most 60 (an integer string; no fraction, no date). The fifth is `429` too, with a `Retry-After` not greater than the fourth's (a refused request does not extend the window).
3. The visitor opens `/status`: this request is refused as well. The page shows the banner title `Too many requests.` and the line `Try again in <n> seconds.` (`Try again in 1 second.` when `n` is 1) with `n` a whole number from 1 to the fifth request's `Retry-After`, no list, no summary, and the `Refresh` button disabled. The visible countdown goes down (a later read of `n` is lower than an earlier one; the test reads twice about 2 seconds apart, and does not assert exact values).
4. While the limit is on, the health endpoint answers `200` and the admin's `GET /api/services` (the admin page's session) answers `200` with the service: the limit is only on the public view (FR-96, FR-4).
5. When the window ends, the page, with nothing pressed, shows the list with `r-<s>` (the page refreshes itself once when the countdown reaches zero; the test waits up to 75 seconds after step 3). The banner is gone and `Refresh` is enabled.
6. A new window has begun, and the page's own refresh was its first request. Two requests of `visitor.request` made right after are therefore `200` and `200` (the second and third of the window), and a third is `429` again.

### Journey 6: the counters are not stored (`public-rate-limit.spec.ts`)

FR-32 and `CONVENTIONS.md` rule 12 (counters are never stored). Same configuration as journey 5 (limit 3). The public view on, one chosen service. Three public requests are `200` and the fourth is `429`. `app.restart()` (the same database and port, the same overrides). The first request after the restart is `200` (a fresh window), and three more after it go `200`, `200`, `429`: the limit is the configured one again and the count began again from zero. The setting itself is stored, so the view is still on after the restart (the first request is `200`, not `404`).

### Journey 7: the health endpoint (`health.spec.ts`)

FR-96, FR-4.

1. With no cookies, `GET /health` is `200`, content type `application/json`, and the body is exactly `{ "status": "ok" }` (one key), with no `Set-Cookie` header.
2. With three services added (any state) and the public view off, the body is the same: it holds no service name, no count and no other field. With the view on and the limit not reached, the same.
3. After `app.restart()` it is `200` again.
4. For contrast, without a session `GET /api/services` is `401` with content type `application/problem+json` and code `unauthenticated`; the public API and the health endpoint are the only API paths that answer without one (the test reads those two and `GET /api/services`, `GET /api/settings/public-view`, which is `401` too).

### Known gaps

- **FR-31 uses a simulated clock.** The browser's timers are moved with Playwright's clock; the real five minutes are not waited for. The interval's value (`REFRESH_INTERVAL_MS`) is the frontend's constant, covered by its tests.
- **The rate-limit window is real time.** Journey 5 waits for the window to end, up to a minute; there is no way to move the server's clock.
- **Every request of one browser and one API context comes from `127.0.0.1`, and shares one budget.** Journeys never run two visitors at once in one app.
- **A time of the last check is shown in the browser's local time and is not asserted by format** (see "Out of scope").
- **The 429 banner's text changes every second;** the journey asserts ranges, not values.

## Structure

By `TESTING.md` ("End-to-end"). Names marked "new" are fixed by this file; the rest is the builder's choice.

- `e2e/support/fixtures.ts` extended with `visitor`; `e2e/support/helpers.ts` extended as above (`app.ts`, `stubSite.ts`, `stubTarget.ts`, `mailpit.ts`, `certs.ts` are not changed).
- `e2e/journeys/public-dashboard.spec.ts` (journeys 1 and 2), `public-view-switch.spec.ts` (journey 3), `public-refresh.spec.ts` (journey 4), `public-rate-limit.spec.ts` (journeys 5 and 6), `health.spec.ts` (journey 7) (new). Titles name the journey and the requirement IDs; `@smoke` is in the title of journey 1 and the first test of journey 3.
- No new script or config file, and no new dependency.

## Dependencies

None. `@playwright/test` 1.64.1, `typescript` 6.0.3, `@types/node` 24.19.2 and `selfsigned` 5.5.0 are already installed; `package.json` and the lockfile do not change. The clock (`page.clock`) is part of `@playwright/test` 1.64.1.

## Acceptance criteria

The journeys are the tests; "fails if the behavior is removed" is shown by the mutation checks below. The builder runs the Chromium project and reports it; it does not change a journey to make it pass (`CLAUDE.md`).

**Harness**

- `cd e2e && npm ci && npm run typecheck` passes.
- `npx playwright test --project=chromium --list` lists every journey; `--grep @smoke` lists the M1 to M3 smoke tests and exactly journey 1 and the first test of journey 3.
- Tests run in parallel get their own app, stubs and visitor; one test's requests never count against another's limit, whatever the order and `--workers`.
- The M1, M2 and M3 journeys still pass unchanged.
- No journey uses Mailpit or clears its mailbox; every service is added with `alerts: false`.

**Journeys**

- Journey 1: FR-28, FR-40, FR-63, FR-112, FR-113 (not chosen), NFR-7, the list's order. Journey 2: FR-27, FR-68, FR-77, FR-78, FR-112, FR-113. Journey 3: FR-26, FR-29, NFR-1 (the setting). Journey 4: FR-29, FR-30, FR-31, FR-112. Journey 5: FR-4, FR-32, FR-96, FR-99 (trust off). Journey 6: FR-32 and the in-memory rule (`CONVENTIONS.md` rule 12). Journey 7: FR-4, FR-96.
- Every "not listed" and "nothing happens" assertion has a baseline in the same test that shows the same setup does produce the event when the condition is reversed.
- The `429` of journey 5 is produced by the real server with the configured limit of 3 (not by a stub), and the page shows its countdown and recovers by itself.

**Repo-wide**

- `make check` passes (it does not run `e2e/`).
- `make test-e2e-smoke` passes in Chromium when Docker is available; otherwise the direct command (`cd e2e && npx playwright test --project=chromium`) passes and the report says why `make` was not run. Mailpit is not needed by these journeys, but the M2 and M3 journeys in the same run need it (`make mailpit-up`).
- The whole Chromium project passes at least twice in a row, and the report gives the time and the slowest tests (journey 5 is expected to be the slowest, up to about 90 seconds).
- Nothing outside `e2e/**` and the plan file changed (`git diff --stat origin/main`).

## Verifier checks

- **Diff rules:** only `e2e/**` and the plan file; no manifest change; no `waitForTimeout` except in `settle`; no CSS-class selectors (`.locator('.…')`); no `retries` in the configuration; no test writes over HTTP; the visitor context has no cookies (a test never uses the admin's `page.request` for a public read); `PUBLIC_RATE_LIMIT_PER_MINUTE` is set only by journeys 5 and 6.
- **Texts:** every quoted message in this file is compared with its source (`frontend/src/features/public-dashboard/**`, `frontend/src/features/service-list/hooks/usePublicView.ts` and its toasts, `frontend/src/lib/failureReason.ts`, `backend/internal/handler/problem.go`, `backend/internal/handler/public_view.go`), and a difference is a finding against the file or the test.
- **Mutation checks** (scratch worktree, never committed; each must fail at least one named journey): the repository ignores `shown_on_public_view` (journey 1 and 2); drops the `paused` condition (journey 2); lists a not-yet-checked service (journey 2); orders by name without ignoring case (journey 1); adds the URL or `id` to a public item (journey 1); the handler answers `200` while the view is off (journey 3); the limiter is not applied (journey 5); a refused request extends the window (journey 5, the fifth `Retry-After`); `Retry-After` is missing or 0 (journey 5); the limiter never ends a window (journey 5 step 5 and journey 6); `/health` requires a session or returns service data (journey 7); the page renders names as HTML (journey 1); the page does not refresh itself at zero (journey 5); the page's automatic update is removed (journey 4).
- **Reading the tests:** for each journey confirm the baselines named above; confirm journey 5's assertions on `Retry-After` and on the countdown are ranges, not exact values; confirm journey 2 step 3 reads the admin's status before and after the visitor's read.
- **Inputs to try:** run with `--workers=1` and `--workers=4`; confirm that `appEnv()` passes only explicit values (the shell cannot change the limit); run the suite twice in a row.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other, or a quoted message differs from the screen or the server.
- A journey cannot be made to pass without changing product code (a missing accessible name, a state the screen does not show, a request the page makes more than once): report which, and what you did not do. Never change the journey's meaning to fit.
- `page.clock` cannot move the page's refresh timers (journey 4, step 2): report what happened; do not replace the step with a real five-minute wait.
- You think you need a dependency, a change outside `e2e/**`, or a configuration key.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check` and the Chromium suite as above, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the journey that shows each), which commands ran and which did not, the time of the whole Chromium run, and anything you were unsure about. Also list every judgment call this file did not settle.
