# Task: dashboard screen

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The admin lands on `/` and sees every monitored service in a list: status, name, type, the failure reason when unhealthy, last check, last change, whether alerts are on and whether the service is shown on the public page. A Refresh button and a refresh every five minutes keep it current; times are in the viewer's local time. The task also adds the toast wrapper the later screens need, and uses it for the one thing that has no place to show an error today: a failed sign-out.

This is data only. The row actions (Pause, Resume, Alerts, Edit, Delete), the public-page switch and every link to an unbuilt screen come with the tasks that build what they do; this task draws no control that does nothing.

Requirements covered:

- FR-9, FR-62: the list, with every field FR-62 names (name, type, status, last check, last change, failure reason when unhealthy, alerts on or off, shown on the public view).
- FR-61, in part: the wording of all seven failure reasons, shown under the name of an unhealthy service.
- FR-77, FR-112, in part: a paused service shows as paused instead of its status (the pause action itself is milestone 3).
- FR-86, in part: a row shows a notice when `alert_delivery_failed` is true (the server sets it from milestone 2).
- FR-94: times in the viewer's local time.
- FR-95: a Refresh button, and a refresh every `REFRESH_INTERVAL_MS`.
- NFR-7: names and failure text are plain text.

Out of scope:

- Pause, Resume, Alerts, Edit and Delete buttons, the name as a link to Edit, the "Alert delivery failed" link, the public-page switch and the "Open public page" link. Each comes with its own task (see the backlog: the row actions, the alert list, the edit screen, the delete dialog, the public view). The backlog already has a line for them.
- The delete confirmation dialog, the "Action failed" toasts for row actions, the "Service added" and "paused" toasts. Their tasks. The toast wrapper built here supports a success toast so they can use it; this task shows only error toasts.
- The add-service screen. `Add service` links to `/services/new`, which stays the `NotBuilt` placeholder until its task.
- The server side of `listServices`. A backend task builds it. This task runs against mocks and does not wait for it; until it merges, a real server answers 501 and the dashboard shows the "could not load" state below.
- The service-limit-reached state on the dashboard. The board draws nothing there (the refusal is shown in the form).
- End-to-end tests. The milestone's last task writes them.

## Role and ownership

Role: Frontend.

You may change `frontend/src/**`. You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `backend/**`, `docs/**` (except your own plan file, `docs/tasks/dashboard-screen.plan.md`), or anything else outside `frontend/src/`.

Shared files this task touches, all owned by this task while it runs:

- `frontend/src/App.tsx` and `frontend/src/App.test.tsx`
- `frontend/src/app-shell/SessionProvider.tsx` and `frontend/src/app-shell/SessionProvider.test.tsx`
- `frontend/src/test/fixtures.ts`

It reads `frontend/src/main.tsx`, `frontend/src/lib/api/request.ts` and `frontend/src/lib/config.ts` and changes none of them.

Tasks that may run at the same time: `create-service-api` and `http-probe`, both backend only. No other frontend task runs beside this one; `add-service-screen` and the delete-dialog task wait for it.

## Operations used

From `docs/openapi.yaml`. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this screen handles |
|---|---|---|
| `listServices` | `GET /api/services` | 200 `ServiceList` (at most 50, already ordered by name ignoring case); 401 `unauthenticated` (the app shell ends the session, see below); anything else, including 500, a network failure and today's 501 from the real server, as a failed load |

`target_count` is in the response and is not used here. The two operations the shell already uses (`getSession`, `signOut`) keep their behavior except for the failed-sign-out toast below.

## Behavior

### What exists

- `apiRequest` (`lib/api/request.ts`) throws `ApiError` for a non-2xx response and, on `401` with code `unauthenticated`, calls the handler the session provider registered before it throws. The provider then ends the session, removes every other cached query and shows the sign-in notice.
- `lib/config.ts` has `REFRESH_INTERVAL_MS` (5 minutes). Nothing uses it yet.
- `App.tsx` renders `<NotBuilt page="dashboard" />` at `/`, inside `AdminLayout` (the gate and the top bar). This task replaces that one placeholder.
- `SessionProvider.tsx` runs a sign-out mutation; on any failure other than `401 unauthenticated` it shows nothing and the button is enabled again.
- `styles/components.css` has the page, banner, button, status badge, chip, `.skeleton`, `.empty`, `.spinner`, `.sr-only` and the toast viewport and toast rules. It does not have the dashboard rules (`.dash-toolbar`, `.refresh-meta`, `.svc*`, `.flag`).
- `components/ui/` has the `Dialog` and `Switch` wrappers; there is no toast wrapper.

### The data and the refresh

One TanStack query, key `['services']`, in `useServiceList`. Its function calls `listServices`.

- `retry: false`, `refetchInterval: REFRESH_INTERVAL_MS`, `refetchIntervalInBackground: true`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`. The interval is the named constant, never a literal.
- Rows are shown in the order the server sent them. The screen does not sort.
- The page does not copy the data into component state; everything shown is derived from the query.
- A refresh, manual or automatic, never empties the list: the old rows stay while it runs and after it fails.
- The session provider already removes every query except `['session']` when a session ends, so the cached list never reaches another admin.

States, derived from the query in this order (`isFetched` is false until the first request has answered; TanStack resets a data-less query to pending while it refetches, so `status` cannot tell the first load from a retry):

| Data | Request | What is shown |
|---|---|---|
| none, `isFetched` false | first load in flight | **Loading** |
| none, `isFetched` true | the first load failed, or its Retry is in flight | **Could not load** |
| `[]` | | **Empty** |
| one or more services | | **List** |

In **Empty** and **List**, a **refresh failed** banner is added above the list whenever the last request failed. It stays while a refetch runs and is removed when a request succeeds. The automatic refresh keeps running after a failure.

A `401 unauthenticated` is never shown as a failure: the shell has ended the session and the page is replaced by the sign-in form.

### The page

The page is `<main class="page">`: a heading block, a toolbar, then the state's content.

**Heading block**: `h1` `Services`, and a line under it:

| State | Line |
|---|---|
| Loading | `Loading · times in your local time` |
| Could not load | `Not loaded · times in your local time` |
| Empty | `No services · times in your local time` |
| List, one service | `1 service · times in your local time` |
| List, n services | `n services · times in your local time` |

**Toolbar**, left to right:

- `Add service`: a link to `/services/new`, styled as the primary button, with the Lucide `Plus` icon. Always available, in every state.
- `Refresh`: a button with the Lucide `RefreshCw` icon and the text `Refresh`. While any request for the list is in flight (first load, manual or automatic refresh, a Retry) it is disabled, has `aria-busy="true"` and shows a spinning `LoaderCircle` (class `spinner`) in place of the icon.
- A meta text: `Updated <strong><time>HH:MM:SS</time></strong> · auto every N min` (the `strong` carries the board's `.refresh-meta strong` style), where the time is that of the last successful response (today's format, see "Times") and `N` is `REFRESH_INTERVAL_MS` divided by 60,000, rounded to the nearest whole number. While loading: `Loading…`. In Could not load: `Not loaded yet · auto every N min`.

**Loading**: five skeleton rows, as the board draws (hidden from assistive technology, in the list frame marked `aria-busy="true"`), and a visually hidden status `Loading services…` (`role="status"`). No other message.

**Could not load**: the refresh-failed banner (below) without the second line, above nothing: no rows, no empty message.

**Empty**: the empty block with the Lucide `ListPlus` icon, title `No services yet`, text `Add a web endpoint or a TCP port. Monitory checks it in the background and alerts you when it goes down or recovers.`, and a second `Add service` link (primary).

**The refresh-failed banner**: a warning banner, `role="status"`, with the Lucide `TriangleAlert` icon.

| Where | Title | Second line | Button |
|---|---|---|---|
| Empty or List | `Couldn’t refresh.` | `Showing data from {time}.` where `{time}` is the last successful response (today's format) | `Retry` with the `RefreshCw` icon |
| Could not load | `Couldn’t load services.` | none | `Retry` with the `RefreshCw` icon |

`Retry` refetches the list. While a request is in flight `Retry` and `Refresh` are disabled. The banner stays until a request succeeds.

**List**: a `ul` labelled `Services` inside the list frame, with a visual column header (hidden from assistive technology) `Status`, `Service`, `Last check`, `Last change`, `Alerts`, `Public`. One `li` per service, with these parts, in this order, as on the board (`docs/design/dashboard.html`, "List"):

- **Status**: a badge with icon, word and shape, never colour alone: `Healthy` (`CircleCheck`, solid), `Unhealthy` (`CircleX`, solid), `Not checked yet` (`CircleDashed`, dashed outline), `Paused` (`CirclePause`, squared, neutral). A service with `paused` true shows `Paused` whatever its state; otherwise the badge follows `state.status`.
- **Name** as plain text (not a link, see "Known gaps") with the type chip `HTTP` or `TCP` from `check.type`. The name wraps in full at every width. Under it, in this order and only when they apply:
  - the failure reason: when the service is not paused, its status is `unhealthy` and `state.last_failure_reason` is not null; the `CircleAlert` icon and the reason text from "Failure reasons";
  - the delivery notice: when `alert_delivery_failed` is true, whether or not the service is paused; the `TriangleAlert` icon and the text `Alert delivery failed` (plain text; the board adds a link to the alert list, which is not built).
- **Last check**: a `time` element with the formatted time (see "Times"), or the text `Never` when `state.last_checked_at` is null.
- **Last change**: the same, or the text `—` (with `aria-label="None"`, as the board has it) when `state.last_status_change_at` is null.
- At 360 px (the card layout) "Last check" and "Last change" carry a visible label (`.svc__label`), hidden on wide screens, as the board has it.
- **Alerts**: a flag with the Lucide `Bell` icon and `On` when `alerts_enabled` is true, `BellOff` and `Off` when false, followed by the visually hidden text `alerts` (with a leading space). The contract leaves `alerts_enabled` optional with default true, so an absent value reads as `On`.
- **Public**: when the service is not paused, `Eye` and `Shown` when `shown_on_public_view` is true, `EyeOff` and `Hidden` when false (the contract's default for an absent value is false, so absent reads as `Hidden`), followed by the visually hidden text `on public page` or `from public page` (each with a leading space). When the service is paused the flag reads `Paused` with `EyeOff`, followed by the visually hidden text `, hidden from public page`.

A paused row has the paused background. At 360 px width (the board's container rule at 640 px) each row becomes a card with labelled "Last check" and "Last change", and nothing scrolls sideways.

All text from the server (names, failure fields) is rendered as text, never as HTML (NFR-7).

### Failure reasons

The text under the name of an unhealthy service, by `last_failure_reason.code`. One pure function maps a reason to its text; it is the only place the wording lives.

| `code` | Text |
|---|---|
| `timed_out` | `Timed out` |
| `could_not_connect` | `Could not connect` |
| `non_2xx_status` | `Returned HTTP {http_status} (expected 2xx)` |
| `json_rule_matched` | `JSON rule matched: {json_rule_field}` |
| `invalid_or_missing_json` | `Response is not valid JSON, or the JSON is missing` |
| `too_many_redirects` | `Too many redirects` |
| `certificate_problem` | `Certificate problem` |

For `non_2xx_status` with a null `http_status` the text is `Returned an HTTP error (expected 2xx)`; for `json_rule_matched` with a null `json_rule_field` it is `JSON rule matched`. (The contract allows a null in both fields; the board draws only the filled cases.) An unknown code is shown as `Check failed`. The failure reason is never shown on the public page.

### Times

One pure function formats an ISO timestamp for the viewer, taking the timestamp, the current time, and optionally a locale and a time zone (the defaults are the viewer's, `Intl.DateTimeFormat`). The result is placed in `<time dateTime="<the ISO string as received>">`.

| The time is | Shown as (en-GB, as on the board) | Fields formatted |
|---|---|---|
| on the same calendar day as now, in the viewer's time zone | `14:31:52` | hour, minute, second; 24 or 12 hour as the locale prefers |
| earlier in the same year | `12 Nov, 08:14:03` | day, short month, hour, minute, second |
| in another year | `3 Jan 2025, 08:14` | day, short month, year, hour, minute (no seconds) |

The punctuation is whatever the locale's `Intl.DateTimeFormat` produces; tests check the parts, not the comma. A time on a later day than today in the same year (clock skew) uses the same-year format; one in a later year uses the other-year format. A string that is not a valid date is shown as received. "Never" and "—" are not times and are handled by the row.

### Sign-out failures

The toast wrapper (below) is mounted once, above the session provider, so the sign-out mutation can use it. A sign-out that fails now shows a toast, and the admin stays signed in with the button enabled again (as before):

| Failure | Toast |
|---|---|
| `403 csrf_failed` | error toast, `The request wasn’t accepted. Reload and try again.`, with an action button `Reload` that reloads the page (`window.location.reload()`) |
| any other failure except `401 unauthenticated` (a network failure, 500, anything else) | error toast, `Couldn’t sign out. Try again.`, no action button |

A `401 unauthenticated` still ends the session with no toast, as today. The toast text for `csrf_failed` is the board's; the other text is not on the board and is decided here.

### The toast wrapper

`components/ui/Toast.tsx` and `components/ui/useToast.ts`, over the Base UI toast in `@base-ui/react` (already installed); only the wrapper imports it. The board's `.toast-viewport`, `.toast` and `.toast__text` rules are already in `styles/components.css`.

- `ToastProvider` renders its children, the viewport, and every toast. `useToast()` returns `show({ kind, message, action? })` where `kind` is `'success'` or `'error'`, `message` is the text and `action` is an optional `{ label, onClick }`.
- A toast shows a leading icon (`CircleCheck` for success, `CircleAlert` for error, decoration only), the message in `.toast__text`, the action button when given (a ghost button, as the board draws `Reload`), and a Dismiss button (`X` icon, accessible name `Dismiss`).
- A success toast uses Base UI's normal priority and disappears by itself after 5,000 ms (a named constant in the wrapper). An error toast uses Base UI's `priority: 'high'` (the user chose Base UI's own behavior for errors) and has no timeout: it stays until dismissed or until its action is used. Every toast has the Dismiss button.
- The wrapper does not override Base UI's roles or `aria-hidden`. So, as Base UI 1.9.0 does it: the root of a toast is a dialog (an `alertdialog` for an error) and is focusable; the root of an error toast is `aria-hidden="true"` until it has focus; an error toast's message also appears in a visually hidden `role="alert"` node that Base UI adds next to the viewport while the viewport is not focused (it renders only the toast's `title` and `description`, so the wrapper passes the message as the toast's `title`); the viewport is a polite live region labelled `Notifications`; the Dismiss button is `aria-hidden` until the toast is hovered or has focus (the action button is not hidden). Base UI gives every toast a 5,000 ms timeout by default, so the wrapper passes a timeout of 0 for errors (never) and 5,000 ms for successes. At most three toasts are active at once (Base UI's provider limit). Timers pause while a toast is hovered or focused.
- Text is rendered as text.

### Known gaps

- **The name is not a link and has no tooltip, and wraps at every width.** The board links the name to Edit and clips it to one line on desktop with a tooltip; Edit does not exist yet and a non-focusable name could not carry the tooltip for keyboard users. The edit task adds the link, the ellipsis and the tooltip. Tracked in the backlog.
- **The delivery notice has no link** to the alert list (not built). The alert-list task adds it.
- **The page has no Pause, Alerts, Edit, Delete, public switch or "Open public page"** (see "Out of scope").
- **"Today" is fixed at render time.** A page left open past midnight shows yesterday's times in the "today" format until the next refresh re-renders it.
- **The error toast for a failed sign-out is shown once per failure.** Two quick failures stack two toasts; no de-duplication.
- **An error toast's root and its Dismiss button are hidden from assistive technology until the toast is hovered or focused**, and its message is in the page twice (the visible toast and Base UI's hidden alert node). This is Base UI's high-priority behavior, which the user chose over overriding it.
- **Until `listServices` is built on the server** the real app answers 501 and the dashboard shows "Could not load". That is expected.

## Structure

By `ARCHITECTURE.md`. Names marked "new" do not exist yet and are fixed by this file; other names are the builder's choice.

- `frontend/src/lib/api/services.ts` (new): a thin wrapper `listServices()` over `apiRequest`, typed with the generated types, and the exported types `Service` and `ServiceList` from `schema.d.ts`. Shared, because later features (the form, the alert list) use the same types.
- `frontend/src/features/service-list/` (new feature, route `/`):
  - `hooks/useServiceList.ts` (new) with a colocated test: the query above and the derived state (`loading`, `could-not-load`, `empty`, `list`), the banner flag, the time of the last success, a `refresh()` mutator and whether a request is in flight. Raw query objects are not returned.
  - `components/ServiceList.tsx` (new): the heading block, toolbar, banner and the state's content, taking what it needs as props from the hook's result; imports nothing from `app-shell/` or another feature.
  - `components/ServiceRow.tsx` (new), `components/StatusBadge.tsx` (new), and small components for the skeleton rows, the empty block and the banner, as the builder sees fit.
  - `lib/failureReason.ts` (new) with a test: the wording above, a pure function. `lib/formatTime.ts` (new) with a test. They stay in this feature; they are promoted to `lib/` when the service form's test result needs the wording (`ARCHITECTURE.md`, "Naming and promotion").
  - `service-list.css` (new), imported by the feature's top component: the dashboard rules copied from `docs/design/dashboard.css` (values and rules only): `.dash-toolbar`, `.refresh-meta`, `.svc-list`, `.svc-head`, the `.svc` and `.svc__*` rules (including the `grid-area` rules of the 640 px block) and `.flag*`, `.loading-row`. Leave out `.dash-toolbar__spacer`, the `.public-toggle*` rules, the `.svc__title--tip` tooltip rules and `.svc__actions*`. The grid has six columns (the board's template without the last, `132px`, actions column), in the wide layout and the 640 px card layout (no `actions` area). The `.svc__name` ellipsis rules are not copied: the name wraps (`white-space: normal`, `overflow-wrap: anywhere`) at every width.
- `frontend/src/pages/DashboardPage.tsx` (new): the thin route entry that connects `useServiceList` to `ServiceList`.
- `frontend/src/components/ui/Toast.tsx` (new), `frontend/src/components/ui/useToast.ts` (new) and `Toast.test.tsx` (new), two source files because of the lint rule `react-refresh/only-export-components`.
- `frontend/src/app-shell/SessionProvider.tsx`: the sign-out mutation's failure handling calls `useToast`.
- `frontend/src/App.tsx`: `ToastProvider` wraps the routes (above `SessionProvider`); `/` renders `DashboardPage` instead of the placeholder. The other routes keep their placeholders.
- `frontend/src/test/fixtures.ts`: add a typed builder for a `Service` (every state: healthy, unhealthy with each reason, not yet checked, paused, TCP) and one for a `ServiceList`, so a mock that drifts from the contract fails the type check.

## Design reference

Reference only, read-only: `docs/design/dashboard.html` (states Loading, List, Empty, Refresh failed, Refreshing, Session expired, Time format, Failure reason wording, List dark theme) and `docs/design/dashboard.css`; `docs/design/README.md` for where the boards differ from what is built. Copy values and rules from the styles into the project's CSS; never copy board markup or component code. Use the `components/ui/` wrappers; add the toast wrapper as above; icons from Lucide only. Where the board and the contract disagree the contract wins (the README lists it: "Alert delivery failed" and the delete dialog's target count come from `listServices`).

States and texts this file adds beyond the board, decided by the user: the first load failing (the warning banner `Couldn’t load services.`, the line `Not loaded · times in your local time` and the meta `Not loaded yet · auto every N min`); the fallback reason texts (`Check failed`, `Returned an HTTP error (expected 2xx)`, `JSON rule matched`); the Dismiss button on every toast, error toasts included; the sign-out failure text `Couldn’t sign out. Try again.`. The board does draw the public-page switch, the "Open" link and the row buttons; this task leaves them out by the user's decision (data only), and each comes with the task that builds what it does.

## Dependencies

None. `@base-ui/react` 1.9.0 (with its toast), `@tanstack/react-query`, `react-router`, `lucide-react` 1.73.0 are installed; `package.json` and the lockfile do not change. Check that every Lucide icon named above exists in 1.73.0 under that name; if one does not, use the closest and say so in the plan.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. Mock `listServices` at the wrapper boundary with value-return spies, typed with the generated types through the fixtures. Time-driven tests use fake timers; with fake timers fire events with `fireEvent` (`user-event` hangs), other tests use `user-event`. Set the system time and pass a fixed locale and time zone where a time is shown.

**Failure reasons (`lib/failureReason.test.ts`)**

- Each of the seven codes gives its exact text; `non_2xx_status` with 503 gives `Returned HTTP 503 (expected 2xx)`; `json_rule_matched` with `checks.db.status` gives `JSON rule matched: checks.db.status`; the two null cases and an unknown code give the fallbacks above (FR-61).

**Times (`lib/formatTime.test.ts`, locale `en-GB`, zone `UTC`, now fixed)**

- A time earlier today shows hour, minute and second only; earlier this year shows `12 Nov` and `08:14:03`; another year shows `3 Jan 2025` and `08:14` without seconds; just before and just after midnight in the zone fall on either side of "today"; the same instant formatted in another zone differs as the zone does; a time later in the same year than now uses the same-year format, one in a later year uses the other-year format, and a string that is not a date comes back as received (FR-94). The caller places the original ISO string in `datetime`.

**`useServiceList` (`hooks/useServiceList.test.tsx`)**

- Before the first answer the state is `loading`; a 200 with services is `list`, with `[]` is `empty` (FR-9).
- A first load that fails (network error, 500) is `could-not-load`, and `refresh()` from there calls `listServices` again and shows the data when it succeeds; while it is in flight the state stays `could-not-load`, not `loading`.
- A refresh that fails after data keeps the data and sets the banner flag; the next success clears it; the time of the last success is the time of the last 200 (FR-95).
- The list is refetched exactly after `REFRESH_INTERVAL_MS` and not one millisecond before, and again after another interval, also after a failure; with the constant mocked to another value (2 minutes) the refetch moves with it (FR-95).
- Rows come back in the order the server sent them, given an unsorted list.

**The screen (`components/ServiceList.test.tsx` and `App.test.tsx`)**

- Loading: five skeleton rows are in the page inside a list marked `aria-busy="true"`, the status `Loading services…` (`role="status"`) is present, `Add service` is enabled, `Refresh` is disabled with `aria-busy="true"` and the spinner, the heading line says `Loading · times in your local time` and the meta says `Loading…`.
- Could not load: the heading line says `Not loaded · times in your local time` and the meta `Not loaded yet · auto every 5 min`.
- List: one row per service, with the badge word and the name, in the order given; a healthy, an unhealthy, a not-checked and a paused service show `Healthy`, `Unhealthy`, `Not checked yet` and `Paused`; the type chip is `HTTP` or `TCP` (FR-9, FR-62).
- A paused service shows `Paused` and not its stored status, shows no failure reason even though its state is unhealthy with a reason, and its Public flag reads `Paused` with the hidden text `, hidden from public page` (FR-77, FR-112).
- An unhealthy, unpaused service shows its failure reason text under the name; a healthy one shows none, and neither does an unhealthy one whose reason is null (FR-61, FR-62).
- A row with `alert_delivery_failed` shows `Alert delivery failed`, paused or not; without it nothing is shown; the text is not a link (FR-86).
- Last check and last change: a null last check shows `Never`, a null last change shows `—`; a real value is in a `time` element whose `datetime` is the received ISO string and whose text is the formatted time (FR-62, FR-94).
- Alerts and Public flags: `On` and `Off`, `Shown` and `Hidden`, each with its hidden text; a service with `alerts_enabled` and `shown_on_public_view` left out reads `On` and `Hidden` (FR-62).
- The `—` of a null last change has `aria-label="None"`.
- The meta's minute count follows the constant rounded to the nearest minute (a mocked 90,000 ms reads `auto every 2 min`, 80,000 ms reads `auto every 1 min`).
- The heading line shows `1 service`, `7 services` and `No services` as in the table, and the meta shows `Updated` with the last success time and `auto every 5 min`; with the constant mocked to 2 minutes it shows `auto every 2 min` (FR-95).
- Empty: the title and text are exactly as written, and there are two `Add service` links, both to `/services/new` (the toolbar's and the empty block's).
- Refresh: clicking it calls `listServices` once, disables it with a spinner and `aria-busy` while in flight, keeps the rows as they are, and enables it again (FR-95).
- A failed refresh shows the banner (`role="status"`) `Couldn’t refresh.` with `Showing data from <last success time>.`, keeps every row, and `Retry` refetches (disabled while a request is in flight); the next success removes the banner. In Could not load the banner reads `Couldn’t load services.` with no second line and no rows and no empty block.
- A `401 unauthenticated` on a refresh (the test makes the mocked call run the registered handler before it rejects, as `apiRequest` does) ends on the sign-in form with the session-ended notice, and the cached `['services']` data is gone (FR-4).
- The page has no `Pause`, `Resume`, `Alerts`, `Edit` or `Delete` button, no switch and no `Open` link, and no row name is a link.
- The `/` route shows the dashboard inside the layout instead of the placeholder; `/services/new` and the other routes still show theirs.
- A name containing `<b>x</b>` and a failure field containing markup render as text (NFR-7).

**Toast wrapper (`components/ui/Toast.test.tsx`)**

- A success toast shows its message and is gone after exactly 5,000 ms and not at 4,999 ms; an error toast is announced through the `role="alert"` node (found by role) and is still there after a long time (fake timers).
- Dismiss removes a toast; an action button shows when given, calls its `onClick` once and the toast is removed. Because Base UI marks the Dismiss button, and the root of an error toast, `aria-hidden` until the toast is hovered or focused, the test hovers or focuses the toast first (or queries with `hidden: true`), and the message of an error toast is in the page twice, so it is found with `findAllByText` or through the alert node, not `getByText`. The action button is not hidden and is found by role.

**Sign-out failures (`app-shell/SessionProvider.test.tsx`, `App.test.tsx`)**

- A sign-out answered `403 csrf_failed` shows the error toast `The request wasn’t accepted. Reload and try again.` with `Reload`; clicking `Reload` calls `window.location.reload` once; the admin stays signed in and the Sign out button is enabled again (NFR-8).
- A sign-out answered 500, or failing with a network error, shows `Couldn’t sign out. Try again.` with no action button and the same stay-signed-in outcome.
- A sign-out answered `401 unauthenticated` and one answered 204 show no toast and end on the sign-in form as before (FR-3).

Tests this task changes on purpose, all in `App.test.tsx` unless named:

- Every test that waits for `The dashboard page is not built yet.` now waits for the dashboard instead: the signed-in `/` case, "unreachable: / ends on the form with the banner, and Retry rechecks", `/sign-in` while signed in, a successful sign-in, the 204 sign-out test, the 500 sign-out test and the session-ended test. The `['/', 'dashboard']` row leaves the signed-in placeholder test only (the dashboard has its own tests above); the signed-out gate test ("signed out: %s ends on the sign-in form and never shows a placeholder (FR-4)") keeps `/` in its table, so the signed-out `/` case stays tested, and the other four routes keep their assertions in both tests. This replaces those placeholder assertions on purpose; nothing else is removed or loosened.
- `App.test.tsx` mocks `./lib/api/request` with only `setCsrfToken` and `setUnauthenticatedHandler`, so it also mocks `./lib/api/services` (`vi.mock`), and every test that reaches `/` gives `listServices` a default answer (an empty list) after `vi.resetAllMocks()`, because an automocked `listServices` returns `undefined`, which the query treats as a failure.
- "after a 500 is enabled again and the page stays" in `App.test.tsx` and "on a 500 stays signed in" in `SessionProvider.test.tsx` keep their assertions and gain the toast assertions above.
- `renderAt` in `App.test.tsx` renders `<App />`, which now mounts `ToastProvider` itself, so it does not wrap again. The `setup` helper of `SessionProvider.test.tsx` renders the provider alone and now wraps it in `ToastProvider`.
- Asserting `Reload`: jsdom's `window.location.reload` cannot be replaced directly, so the test replaces `window.location` with an object that has a `reload` spy for the test and restores it after.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

## Verifier checks

- **By reading `useServiceList.ts`:** the interval is `REFRESH_INTERVAL_MS`, not a literal; server data is not copied into component state; the state is derived with `isFetched`, not `status` or `error`.
- **By reading the components:** no `dangerouslySetInnerHTML`; every name and failure field is rendered as a React text child; no literal colour, and no pixel value in a rule where a token exists, other than the values copied from `docs/design/dashboard.css`; status is shown by icon, word and badge shape; no hand-written toast, dialog or switch (the toast is the Base UI wrapper); only `components/ui/Toast.tsx` imports the Base UI toast; icons come from Lucide only.
- **No dead controls:** the rendered rows contain no button and no link; the only links on the page are the two `Add service`.
- **Keyboard, by reading the DOM order and CSS:** Tab order is the brand link, Sign out, Add service, Refresh, then the banner's Retry; every control has the shared focus outline (`:focus-visible` rule from `components.css`); the Refresh and Retry buttons use `disabled`, so a disabled button is skipped.
- **Layout and style, by reading the CSS (jsdom cannot prove them):** a paused row has the paused background (`.svc--paused`); the 640 px card layout shows the labelled "Last check" and "Last change" and has no `actions` area; the six column-header words are `Status`, `Service`, `Last check`, `Last change`, `Alerts`, `Public`; the name wraps in full with `overflow-wrap: anywhere` and no ellipsis.
- **Inputs to try:** a list of 50 services with a 100-character name with no spaces (wraps, no sideways scroll at 360 px by the CSS); a service whose `last_checked_at` is in another year; an unhealthy service with each of the seven reasons and with `http_status` null; a paused unhealthy service with `alert_delivery_failed` true; `listServices` answering `[]` and then a failure; a refresh that fails twice and then succeeds; the sign-out failing twice in a row (two toasts).
- **Contract:** every field the screen reads exists in `components['schemas']['Service']`; no field was assumed. `listServices` handling covers 200 and "anything else", with 401 left to the shell.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design boards or this file conflict with each other.
- You think you need a change outside your paths, a dependency, an edit to a spec or design file, or a state that is neither drawn on the board nor listed in this file.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.
- The Base UI toast cannot give what "The toast wrapper" describes (for example, a per-kind timeout, a high-priority error toast, an action or a Dismiss button).
- An icon name above does not exist in Lucide 1.73.0 and no close match exists.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
