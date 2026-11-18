# Task: public dashboard screen

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

An anonymous visitor opens `/status` and sees the chosen services of the public view: name, status (Healthy or Unhealthy) and the time of the last check, under the heading "Service status". A Refresh button and an update every five minutes keep it current. When the admin has turned the public view off the page says it is unavailable; when the server refuses too many requests the page says how many seconds to wait. The page has no sign-in, no session check and no admin top bar; a signed-in admin who opens the address sees the same page.

Requirements covered:

- FR-28: the chosen services are listed (name, status, last check) while the view is on.
- FR-29: a `404 public_view_unavailable` shows the "unavailable" message.
- FR-30: a Refresh button loads the latest status.
- FR-31: the page updates itself every `REFRESH_INTERVAL_MS`, the named constant in `lib/config.ts`.
- FR-32, in part: a `429 rate_limited` shows the wait, counts it down, and refreshes once at zero. (The limit itself is the server's.)
- FR-40, FR-63: the page shows a service's name, status and last check time and nothing else; it reads no other field.
- FR-94: times in the viewer's local time.
- FR-113, in part: the page shows exactly the rows the server sends; it neither adds nor hides any (the server drops paused and not-yet-checked services).
- NFR-7: names are plain text.

Out of scope:

- The server side of `getPublicDashboard`: the usecase, the fixed window and the `404` when the view is off. A separate backend task builds it. This task runs against mocks and does not wait for it; until that merges, the real server answers 501 and the page shows the "could not load" state below.
- The public-view switch on the admin dashboard, the per-service toggle and the "Open public page" link (backlog, milestone 4, `FR-26, FR-27, FR-68`). They need `updateService`.
- The milestone 4 end-to-end journeys (the last task of the milestone writes them).
- Any link from the admin screens to `/status`, and any link from `/status` back to the admin. The board draws none.
- The rate limit's value (60 a minute) and anything about the client address (FR-99): server and deployment.
- Sorting or filtering: the server orders the rows (by name, ignoring case) and the page keeps that order.

## Role and ownership

Role: Frontend.

You may change `frontend/src/**`. You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `backend/**`, `e2e/**`, `docs/**` (except your own plan file, `docs/tasks/public-dashboard-screen.plan.md`), or anything else outside `frontend/src/`. You may not change `frontend/src/features/alert-list/**` or `frontend/src/features/service-form/**`.

Shared files this task touches:

- `frontend/src/App.tsx` and `frontend/src/App.test.tsx`: the `/status` route. Another frontend task (the edit screen) adds a route to `App.tsx` later; change only the `/status` line and its import.
- `frontend/src/test/fixtures.ts`: add the two builders named under "Structure", nothing else.
- `frontend/src/features/service-list/**`: only the import line of `formatTime` in `ServiceList.tsx`, `ServiceRow.tsx` and `ServiceList.test.tsx` (see "Times"). No other frontend task runs on `service-list`.

Tasks that may run at the same time: `select-test-flake` (only `components/ui/Select.test.tsx`) and the backend delivery lane (`delivery-retry`, `delivery-outcome`, `test-target`), which change `backend/**` only. `target-test-row`, drafted later, changes `features/alert-list/components/TargetDialog.tsx` and does not conflict.

## Operations used

From `docs/openapi.yaml`. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this screen handles |
|---|---|---|
| `getPublicDashboard` | `GET /api/public/dashboard`, no parameters, no sign-in (`security: []`) | 200 `PublicDashboard`: `{ services: PublicService[] }`, each with `name` (string, at most 100), `status` (`healthy` or `unhealthy`) and `last_checked_at` (date-time), all required; 404 `application/problem+json` with code `public_view_unavailable`; 429 `application/problem+json` with code `rate_limited` and the header `Retry-After` (integer, at least 1, seconds); 500 `internal_error`; anything else, a network failure and today's 501 from the stub server, as a failed load |

The contract lists no 401, 304 or other status for this operation, and no query parameter or request header. `PublicService` has no id, so a row's key is its position in the response (names are unique, ignoring case, per FR-59, but the page must not rely on it).

`getHealth`, `getSession` and every admin operation are not used by this page.

## Behavior

### What exists

- `lib/api/request.ts` `apiRequest` throws `ApiError` for a non-2xx response with `status`, `code` (the problem's code, or null) and `retryAfter` (whole seconds from a `Retry-After` header of a 429; null if the header is absent or not a whole number). A network failure rejects with the fetch error itself. On a `401 unauthenticated` it calls the handler a session provider registered; on this page no session provider is mounted, so no handler is set, and the contract lists no 401 anyway.
- `lib/config.ts` has `REFRESH_INTERVAL_MS` (5 minutes), documented as used by the admin dashboard and the public view.
- `App.tsx` renders `<NotBuilt page="public status" />` at `/status`, as a sibling of the admin route group and outside `SessionProvider`, so the page does not call `getSession` and has no top bar. This task replaces that one placeholder and keeps the route outside the group. `ToastProvider` wraps all routes; this page shows no toast.
- `styles/components.css` has `.btn`, `.status`, `.status--ok`, `.status--bad`, `.banner`, `.banner--warn`, `.skeleton`, `.spinner`, `.sr-only`, `.muted`, `.empty__icon`, `.empty__title`. It does not have the public page's rules (`.pub*`) or `.refresh-meta`. `#root` carries `.app`, so the board's container rule at 640 px applies.
- The admin dashboard has its own meta text, banner and skeleton rows (`features/service-list/`). They are not shared; this page builds its own (the user's decision: features keep their own copies, nothing is promoted except `formatTime`, below).

### The data and the refresh

One TanStack query, key `['public-dashboard']`, in `usePublicDashboard`. Its function calls `getPublicDashboard`.

- `retry: false`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `refetchIntervalInBackground: true`. `refetchInterval` is `REFRESH_INTERVAL_MS`, never a literal, except that it is `false` in the unavailable state (no automatic refresh) and while a 429 countdown is above 0 (the update would fall inside the server's wait; once the countdown ends and its single refresh is made, the interval resumes, the next automatic call being a full interval after zero).
- Rows are shown in the order the server sent them. The page does not sort and does not copy the data into component state; everything shown is derived from the query.
- A refresh, manual or automatic, never empties the list: the old rows stay while it runs and after it fails, except in the unavailable state.

The hook returns a view, not the query: the screen state (below), `services` (empty unless the state is `list`), `refreshFailed`, `lastSuccessAt` (ms since the epoch of the last 200, null before the first), `fetching` (any request in flight), `rateLimit` (null, or an object with `secondsLeft`, a whole number of seconds or null when the header was unusable), and `refresh()`.

States, derived from the query in this order (`isFetched` is false until the first request has answered; TanStack resets a data-less query to pending while it refetches, so `status` cannot tell a first load from a retry; the dashboard's `useServiceList` does the same):

| Condition | State | What is shown |
|---|---|---|
| the last error is `404` with code `public_view_unavailable` | `unavailable` | **Unavailable**, whatever data was loaded before (it is not shown) |
| no data and `isFetched` is false | `loading` | **Loading** |
| no data and `isFetched` is true | `could-not-load` | **Could not load**, or the **Too many requests** banner over nothing if the error is a 429 (below) |
| data with no services | `empty` | **Empty** |
| data with one or more services | `list` | **List** |

**The hook remembers the special answers itself.** TanStack Query clears a data-less query's error as soon as it refetches, so the hook keeps the last `404 public_view_unavailable` and the last 429 (with its `Retry-After` and the time it arrived) in its own state (set in the same render pass as the query result, so `state` and the interval never lag it: for example from the `queryFn`'s catch, which records the answer and rethrows; a `useEffect` on `error` is not enough), set when such an answer arrives and cleared when a request succeeds or answers anything else. "The last error" below means that remembered answer. This way the 429 banner stays (reading `Try again in 0 seconds.`) while the refetch at zero or a manual Retry is in flight, with or without rows. A `404` with any other code, or without a problem body, is a failure like any other (not `unavailable`). Any `429` takes the 429 path, whatever its code or body (a proxy in front of the app may send a bare 429); `Retry-After` is used if usable. In `empty` and `list`, a failed refresh (any error except the two special cases) adds the **refresh-failed** banner; a 429 adds the **Too many requests** banner instead; the banner is removed when a request succeeds. An unavailable answer on a refresh replaces the whole page content with the Unavailable state, which stays until the page is reloaded.

### Too many requests (FR-32)

When the last error is a `429` (any code, see above):

- If `retryAfter` is a whole number of at least 1 (the contract's range), the page counts down from it: `secondsLeft` is `retryAfter` minus the whole seconds elapsed since the answer arrived (the remembered arrival time, not TanStack's `errorUpdatedAt`), never below 0, updated once a second. While `secondsLeft` is above 0, Refresh and the banner's content show the count and Refresh is disabled. When it reaches 0 the page calls `refresh()` once on its own. If that request is refused again with a new `Retry-After`, a new countdown starts; if it succeeds, the banner goes away. The automatic five-minute update is held back while `secondsLeft` is above 0 (a manual call cannot happen, Refresh being disabled); a request that succeeds in any way clears the banner and the countdown.
- If `Retry-After` is absent, not a whole number or below 1, the banner shows no number, Refresh stays enabled and nothing refreshes on its own except the normal five-minute update (not held back, there being no countdown).
- With rows already on screen they stay under the banner. With no rows (the first load was refused) the page shows the banner with no list, no summary line and no empty message.
- The timer is cleared when the page unmounts and when the state changes.

### The page

The page is `<main class="pub">`: a heading block, then the state's content, then (in some states) a foot line.

**Heading block**: `h1` `Service status` (fixed, every state), and, in the **List** state only, a summary line under it, derived from the rows: `All services healthy` with the Lucide `CircleCheck` icon (class `pub-summary--ok`) when every row is healthy, otherwise `{n} of {m} services unhealthy` with `CircleX` (class `pub-summary--bad`), where `n` is the number of unhealthy rows and `m` the number of rows; with a single row (`m` = 1) the text is `1 of 1 service unhealthy`. No summary in any other state.

Beside the heading, except in **Unavailable** (which has no refresh control), the refresh block:

- A meta text. After a first success: `Updated <time>` followed by ` · every {N} min`, where the time is that of the last successful response in the "Times" format (inside a `time` element whose `datetime` is that moment as an ISO string) and `N` is `REFRESH_INTERVAL_MS` divided by 60,000, rounded to the nearest whole number. With no success yet (Loading, Could not load, the 429 banner over nothing): `Refreshes every {N} min`.
- `Refresh`: a button with the Lucide `RefreshCw` icon and the text `Refresh`. While any request is in flight it is disabled, has `aria-busy="true"` and shows a spinning `LoaderCircle` (class `spinner`) in place of the icon, with the text `Refreshing…`. While a 429 countdown is above 0 it is disabled, without the busy state. In every other case it is enabled.

**Loading**: four skeleton rows (hidden from assistive technology, `aria-hidden="true"`), and a visually hidden `role="status"` text `Loading service status…`. Refresh is disabled and busy (a request is in flight). The foot line is shown.

**List**: a `ul` with `aria-label="Services"`, one `li` per service, with these parts as the board draws them (`docs/design/public.html`, "List"):

- the name, as plain text (not a link, not a heading), wrapping in full at every width;
- the status badge: `.status--ok` with the Lucide `CircleCheck` and the text `Healthy`, or `.status--bad` with `CircleX` and `Unhealthy`; icon, word and shape, never colour alone (FR-62, FR-112);
- the last check: the label `Last checked` (class `pub-row__time-label`) and a `time` element with the formatted time and `datetime` equal to the received `last_checked_at` string.

Nothing else is shown for a service: no type, URL, failure reason, last change, alert or admin control (FR-40, FR-63). The foot line is shown.

**Empty**: the block with the Lucide `ListPlus` icon, title `No services to show` and text `This status page is on, but no services have been added to it yet.` The refresh block is shown, as is the foot line.

**Unavailable**: the block with the Lucide `EyeOff` icon, title `This status page isn’t available` and text `It has been turned off.` Nothing else: no refresh block, no summary, no foot line, no banner.

**Could not load** (no data and a failed first load): the warning banner (`banner--warn`, `role="status"`, Lucide `TriangleAlert`) with title `Couldn’t load service status.`, no second line and a `Retry` button (`RefreshCw`) that calls `refresh()`, disabled while a request is in flight. No list, no summary, no empty message, no foot line. The refresh block is shown with the meta `Refreshes every {N} min`.

**Refresh-failed banner** (data on screen, a non-429 failure): `banner--warn`, `role="status"`, `TriangleAlert`, title `Couldn’t refresh.`, second line `Showing status from {time}.` (the last success, "Times" format), and a `Retry` button as above. The rows and the summary stay; the foot line stays.

**Too many requests banner**: `banner--warn`, `role="status"`, the Lucide `Clock` icon, title `Too many requests.` and second line `Try again in {n} seconds.` where `n` is `secondsLeft` in a `span` with class `tabular` (`Try again in 1 second.` when `n` is 1; at 0, while the refresh is being made, the line is `Try again in 0 seconds.`). With no usable header the second line is `Try again in a moment.` The banner has no button. When it shows with rows, the rows, the summary and the foot line stay; with no rows only the banner does, and no foot line.

The banners sit in a region `aria-live="polite"` that is in the page in every state except Unavailable (empty when there is no banner), as the board has it; the Unavailable state has no such region, as the board draws it.

The refresh-failed and Too many requests banners also show over the **Empty** state (data with no services): the Empty block stays under the banner, with the refresh block and the foot line.

**Foot line**: `Times are shown in your local time.` Shown in Loading, List and Empty, and under List with either banner; absent in Unavailable, Could not load and the 429 banner over nothing.

**Order in the page**, top to bottom: the heading block and refresh block, the live region with any banner, then the list or the state block, then the foot line.

All text from the server (names) is rendered as text, never as HTML (NFR-7).

### Times

The page uses the dashboard's formatter, `formatTime(iso, now, locale?, timeZone?)` (FR-94): the time alone today, day and time earlier in the same year, day, year and time in another year. This task promotes it to `frontend/src/lib/formatTime.ts` (and its test to `lib/formatTime.test.ts`) with no change to its behavior or its tests' content, and changes the three imports in `features/service-list/` (`ServiceList.tsx`, `ServiceRow.tsx`, `ServiceList.test.tsx`). The user approved this promotion; it is the only thing moved to a shared place. The caller passes the current time at render and puts the original ISO string in `datetime`.

### Known gaps

- **The countdown is announced every second.** The banner is a `role="status"` region, as the board draws it, so a screen reader may re-announce its changing text each second. Matters when: an assistive-technology user reports it; the fix is a once-only announcement, outside this task.
- **No automatic retry after a plain failure** except the normal five-minute update and the buttons.
- **"Today" is fixed at render time**, as on the dashboard: a page left open past midnight shows yesterday's times in the "today" format until the next update re-renders it.
- **The unavailable state is final until a reload.** No automatic refresh and no button, so a page left open does not notice the view being turned on again. The board says "No refresh button, no automatic refresh".
- **The page has no document title of its own.** The board draws none and the title is the app's.
- **The page is not tested against the real server.** `getPublicDashboard` answers 501 until its backend task merges; the page then shows "Couldn’t load service status."; that is expected.
- **The status badge and the skeleton rows are this feature's own copies**, not shared with the dashboard (the user's decision, see "What exists").

## Structure

By `ARCHITECTURE.md`. Names marked "new" do not exist yet and are fixed by this file; other names are the builder's choice.

- `frontend/src/lib/api/publicDashboard.ts` (new): a thin wrapper `getPublicDashboard()` over `apiRequest`, with the exported types `PublicDashboard` and `PublicService` from `schema.d.ts`, and a colocated test (it requests `GET /api/public/dashboard` with no body and returns the parsed response; a 404 and a 429 with `Retry-After: 23` arrive as an `ApiError` with that `status`, `code` and `retryAfter`). Look at `lib/api/services.ts` and its test for the shape.
- `frontend/src/lib/formatTime.ts` and `lib/formatTime.test.ts` (moved from `features/service-list/lib/`).
- `frontend/src/features/public-dashboard/` (new feature, route `/status`):
  - `hooks/usePublicDashboard.ts` (new) with a colocated test: the query, the derived state, the 429 countdown and its single automatic refresh, `refresh()`, and the view described above. It does not return the query object.
  - `components/PublicDashboard.tsx` (new): the heading block, refresh block, live region, state content and foot line, taking the hook's view as a prop; it imports nothing from `app-shell/` or another feature. Small components for the status badge, the row, the skeleton rows, the state blocks and the banners as the builder sees fit.
  - `public-dashboard.css` (new), imported by the feature's top component: the `.pub*` rules copied from `docs/design/public.css` (values and rules only, including the 640 px container block), and the board's `.refresh-meta` rules from `docs/design/dashboard.css` (font size, colour, tabular numbers, the `strong` colour is not needed), written under a selector that cannot collide with the dashboard's global `.refresh-meta` (for example `.pub-refresh .refresh-meta`) with the same values. The dashboard's stylesheet (`features/service-list/service-list.css`) also has a global `.refresh-meta` rule inside its 640 px block (`width: 100%; order: 5`) that the bundle applies to this page too; the scoped rule must set `width: auto` and `order: 0` at that width so the public meta stays beside the button as the board draws it. No literal colour or pixel value where a token exists (the skeleton rows' inline sizes on the board become classes; the pill radius is `--radius-pill`).
- `frontend/src/pages/PublicDashboardPage.tsx` (new): the thin route entry that connects `usePublicDashboard` to `PublicDashboard`.
- `frontend/src/App.tsx`: `/status` renders `PublicDashboardPage` instead of the placeholder, still outside the `SessionProvider` group. Nothing else changes.
- `frontend/src/test/fixtures.ts`: add `makePublicService` (healthy by default, overrides allowed) and `makePublicDashboard`, typed with the generated types, so a mock that drifts from the contract fails the type check.

## Design reference

Reference only, read-only: `docs/design/public.html` (states Loading, List, Refresh failed, Empty, Unavailable, Too many requests, All healthy in the dark theme) and `docs/design/public.css`; `docs/design/README.md`. Copy values and rules from the styles into the project's CSS; never copy board markup or component code. Use the shared classes already in `styles/components.css`; icons from Lucide only. There is nothing for Base UI here (no dialog, switch, select, menu or toast). Where the board and the contract disagree the contract wins; they do not disagree here.

States and texts this file adds beyond the board, decided by the user (the README's "Additions that are built" does not list them yet; the user adds them): the first load failing with nothing to keep (the banner `Couldn’t load service status.` with Retry, mirroring the admin dashboard's `Couldn’t load services.`); the 429 banner over nothing, and with no usable `Retry-After` (`Try again in a moment.`, Refresh enabled); `Try again in 1 second.` for one second; the meta `Refreshes every {N} min` after a failed first load; the summary text for one row (`1 of 1 service unhealthy`); `Try again in 0 seconds.` while the refetch at zero runs; the automatic update held back during a countdown.

## Dependencies

None. `@tanstack/react-query`, `react-router` and `lucide-react` are installed; `package.json` and the lockfile do not change. Check that every Lucide icon named above exists in the installed version under that name (`CircleCheck`, `CircleX`, `RefreshCw`, `LoaderCircle`, `TriangleAlert`, `Clock`, `ListPlus`, `EyeOff`); if one does not, use the closest and say so in the plan.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. Mock `getPublicDashboard` at the wrapper boundary with value-return spies, typed through the fixtures. Time-driven tests use fake timers; with fake timers fire events with `fireEvent` (`user-event` hangs), other tests use `user-event`. Set the system time and pass a fixed locale and time zone where a time is shown. Build errors with the `problem` helper of `test/fixtures.ts` (a 429 needs its `retryAfter`: check the helper and, if it cannot set one, build the `ApiError` directly in the test).

**API wrapper (`lib/api/publicDashboard.test.ts`)**

- `getPublicDashboard` sends `GET /api/public/dashboard` and returns the body; a `404 public_view_unavailable` and a `429 rate_limited` with `Retry-After: 23` reject with an `ApiError` whose `status`, `code` and `retryAfter` are 404 / `public_view_unavailable` / null and 429 / `rate_limited` / 23 (FR-29, FR-32).

**Times (`lib/formatTime.test.ts`)**

- The existing tests of `formatTime`, unchanged, run from the new path. `features/service-list/lib/formatTime*` no longer exist, and the dashboard's tests still pass.

**`usePublicDashboard` (`hooks/usePublicDashboard.test.tsx`)**

- Before the first answer the state is `loading` and `fetching` is true; a 200 with services is `list`, with `[]` is `empty` (FR-28).
- A first load that fails (network error, 500, a `404` with code `not_found` or no problem body) is `could-not-load` with `rateLimit` null; `refresh()` calls `getPublicDashboard` again and shows the data when it succeeds; while it is in flight the state stays `could-not-load`, not `loading`.
- A refresh that fails after data keeps the data and sets `refreshFailed`; the next success clears it; `lastSuccessAt` is the time of the last 200 (FR-30).
- Outside a 429 countdown and the unavailable state (see the next criteria), the query is refetched after exactly `REFRESH_INTERVAL_MS` and not one millisecond before, again after another interval, also after a failure; with the constant mocked to 2 minutes the refetch moves with it (FR-31).
- Rows come back in the order the server sent them, given an unsorted list (the page does not sort).
- A `404 public_view_unavailable` on the first load is `unavailable`; on a refresh after data it is `unavailable` and `services` is empty; in both cases no further automatic refetch happens after another full interval (FR-29).
- A 429 with `Retry-After: 23` sets `rateLimit.secondsLeft` to 23; after 1 s it is 22; the hook does not call `getPublicDashboard` at 22 s and calls it exactly once at 23 s; if that call succeeds `rateLimit` is null; if it is refused again with `Retry-After: 5` a new countdown from 5 starts (FR-32).
- A 429 over existing data keeps the data (`state` `list`, `refreshFailed` false, `rateLimit` set); a 429 on the first load is `could-not-load` with `rateLimit` set.
- A 429 with no usable header (`retryAfter` null, and a `Retry-After` of 0, built as an `ApiError` directly) sets `rateLimit` to `{ secondsLeft: null }`, and no automatic call happens before the normal interval.
- A success in any way (a manual call after a no-usable-header 429, or the refetch at zero) clears `rateLimit`, and no later call from the old countdown happens. Unmounting the hook during a countdown makes no call afterwards.
- The automatic update is held back by a countdown: with `Retry-After: 3600`, no call is made at `REFRESH_INTERVAL_MS`; with `Retry-After: 23` a call is made once at 23 s and the interval then resumes (a further call one full interval after that, FR-31).
- The 429 is remembered by the hook: on a first load refused with 429 (no rows), when the countdown reaches 0 and the refetch is in flight, `rateLimit` is still set (`secondsLeft` 0) and the state is not `loading`; a manual Retry after a 429 with no usable header behaves the same; a 429 with no problem body, and one with a code other than `rate_limited`, take the same path as a `rate_limited` one.

**The screen (`components/PublicDashboard.test.tsx` and `App.test.tsx`)**

- Every state has the `h1` `Service status`.
- Loading: four skeleton rows hidden from assistive technology, the status `Loading service status…` (`role="status"`), `Refresh` disabled with `aria-busy="true"`, the spinner and the text `Refreshing…`, the meta `Refreshes every 5 min`, the foot line, no summary.
- List: one row per service, in the order given, each with the name, `Healthy` or `Unhealthy`, the label `Last checked` and a `time` whose `datetime` is the received string and whose text is the formatted time; the `ul` is named `Services`; the summary reads `2 of 5 services unhealthy` for two unhealthy of five rows, `1 of 1 service unhealthy` for one unhealthy row, `All services healthy` when all are healthy; the meta reads `Updated` with the last success time and `· every 5 min`; the foot line is shown (FR-28, FR-63, FR-94).
- With the constant mocked to 2 minutes the meta reads `every 2 min`; mocked to 90,000 ms it reads `every 2 min`, to 80,000 ms `every 1 min`; the same count is in `Refreshes every {N} min` (FR-31).
- Nothing but name, status and last check is rendered: given a service object carrying extra fields at runtime (`url`, `check`, `last_failure_reason`, `type`), none of their values appears in the page, and a row contains no link, no button and no heading (FR-40, FR-63).
- A name containing `<b>x</b>` renders as text, and a 100-character name without spaces is in the page in full (NFR-7).
- Empty: title `No services to show`, text `This status page is on, but no services have been added to it yet.`, the refresh block and the foot line, no summary and no `ul` of rows (FR-28).
- Unavailable: title `This status page isn’t available`, text `It has been turned off.`, no `Refresh` button, no meta, no summary, no foot line, no banner, no `aria-live` region, and the `h1` is there; after another full interval `getPublicDashboard` is not called again (FR-29).
- Unavailable replaces data: after a list is on screen, a refresh answered `404 public_view_unavailable` removes every row and the summary and shows the Unavailable state (FR-29).
- Refresh: clicking `Refresh` calls `getPublicDashboard` once, disables it with the spinner and `Refreshing…` while in flight, keeps the rows, and enables it again with the text `Refresh` (FR-30).
- A failed refresh shows the banner `Couldn’t refresh.` with `Showing status from <last success time>.` and a `Retry` button, inside the `aria-live="polite"` region, keeps every row and the summary; `Retry` refetches and is disabled while a request is in flight; the next success removes the banner.
- Could not load (first load 500): the banner `Couldn’t load service status.` with `Retry`, no second line, no rows, no summary, no empty block, no foot line, the meta `Refreshes every 5 min`; Retry refetches and the list then shows.
- Too many requests over rows: with `Retry-After: 23` the banner reads `Too many requests.` and `Try again in 23 seconds.` (the number in a `span` with class `tabular`); `Refresh` is disabled without `aria-busy`; the rows, summary and foot line stay; after 1 s the text reads 22; at 23 s the page requests once and, when that succeeds, the banner is gone and `Refresh` is enabled (FR-32).
- Too many requests, one second: `Retry-After: 1` reads `Try again in 1 second.`
- Too many requests over nothing (the first load refused): the banner alone, no list, no summary, no empty message, no foot line, the meta `Refreshes every 5 min`, `Refresh` disabled during the countdown. At 23 s, while the refetch is in flight, the banner is still there and reads `Try again in 0 seconds.`; it goes away when the request succeeds.
- Too many requests without a usable header: `Try again in a moment.`, `Refresh` enabled, no request made by the page at 23 s or 60 s, and a click on `Refresh` requests once.
- There is no admin chrome: no `Sign out` button, no `Monitory` brand link, no top bar, and no `Add service` link on any state.
- Route: `/status` renders the page without signing in and never calls `getSession`; with `getSession` mocked as signed in, `/status` still renders the page, with no top bar and no `Sign out`; with `getSession` mocked as signed out it renders the page and not the sign-in form. A `401` is not specially handled: a 401 answer on this page shows the could-not-load state and does not navigate (the contract lists no 401).
- The admin routes keep their behavior: `/`, `/services/new` and the other routes in `App.test.tsx` are unchanged.

Tests this task changes on purpose:

- `App.test.tsx`: "`/status` shows its placeholder and never calls getSession" is replaced by the route tests above (the page, no `getSession`, signed in, signed out). The test file also mocks `./lib/api/publicDashboard` (and gives `getPublicDashboard` a default answer, because an automocked function returns `undefined`, which the query treats as a failure).
- `features/service-list/lib/formatTime.test.ts` moves to `lib/formatTime.test.ts` with the same cases; `ServiceList.test.tsx` changes only its import of `formatTime`.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged; `features/alert-list/**` and `features/service-form/**` are untouched.

## Verifier checks

- **By reading `usePublicDashboard.ts`:** the interval is `REFRESH_INTERVAL_MS`, not a literal; no server data is copied into component state; the state is derived with `isFetched`, not `status` or `error` alone; the interval is off only in the unavailable state and while a 429 countdown is above 0; the countdown timer is cleared on unmount and on a state change; the single automatic refresh at zero cannot fire twice for one answer.
- **By reading the components and CSS:** no `dangerouslySetInnerHTML`; every name is a React text child; the row reads only `name`, `status` and `last_checked_at`; status is shown by icon, word and badge shape; no hand-written dialog, switch, toast or select; icons are Lucide only; no literal colour or pixel value where a token exists, other than the values copied from `docs/design/public.css`; the 640 px block moves the status and time under the name and nothing scrolls sideways; the public meta text is not pushed onto its own line by the dashboard's `.refresh-meta` rule at 640 px; the name wraps with `overflow-wrap: anywhere`; the dashboard's `.refresh-meta` selector is not redefined globally.
- **No admin chrome:** `App.tsx` keeps `/status` outside the `SessionProvider` and `AdminLayout` group; the page imports nothing from `app-shell/` or from another feature; `formatTime` is imported from `lib/`.
- **Promotion:** `formatTime.ts` and its test moved without a content change (`git diff -M` shows a pure rename); the only edits in `features/service-list/` are the three import lines.
- **Keyboard, by reading the DOM order:** Tab order is Refresh, then the banner's Retry; disabled buttons use `disabled`, so they are skipped; every control has the shared focus outline.
- **Inputs to try:** a list of 50 services with a 100-character name without spaces; a `last_checked_at` in another year; `Retry-After` of 1, 23, 3600 and a non-numeric value; a 429 immediately followed by a successful manual refresh; two 429s in a row; a refresh failing twice and then succeeding; `404` with a different code; `getPublicDashboard` answering `{ services: [] }` after a list.
- **Contract:** every field read exists in `components['schemas']['PublicService']`; the wrapper adds no header or parameter; no status or code the contract does not list is given special handling beyond the two named.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design board or this file conflict with each other.
- You think you need a change outside your paths, a dependency, an edit to a spec or design file, or a state that is neither drawn on the board nor listed in this file.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for, in particular the move of `formatTime` to `lib/`.
- An icon name above does not exist in Lucide and no close match exists.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
