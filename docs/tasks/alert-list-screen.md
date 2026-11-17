# Task: alert list screen

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The admin opens a service's alert list from the dashboard and sees its notification targets, in the order they were added, and can remove one. The dashboard gets the two ways in: an `Alerts` link on every row, and the "Alert delivery failed" notice becomes a link to the list. The screen is the first half of the alert list; the add and edit dialog is the next task (`target-form-dialog`), so this screen has no Add target and no Edit buttons yet.

Requirements covered:

- FR-17: the admin sees a service's alert list: each target's name, type and address or URL, in the order added; an empty list says so. The dashboard's `Alerts` link and the "Alert delivery failed" link (built here) are the ways to it.
- FR-18: the list shows only the targets of the service in the address.
- FR-80, in part: a target's name is shown; a target with no name shows `Unnamed email` or `Unnamed webhook`.
- FR-81, in part: the type is shown as an icon with a text alternative, and as a chip.
- FR-16: the admin removes a target after a two-step confirmation in the row; it leaves the list.
- NFR-4, in part: the screen and the inline confirmation work from the keyboard and focus goes where the outcome is (the dialog's keyboard rules belong to `target-form-dialog`).
- NFR-7: target names, addresses and the service name are shown as text.
- NFR-8, in part: removal goes through `apiRequest`, which sends the CSRF token; a `403 csrf_failed` shows the "request wasn’t accepted" toast.

Out of scope:

- Add target, Edit, the add and edit dialog, the test alert, field errors, the full-list and duplicate states and the "sent unencrypted" notice (FR-14, FR-15, FR-19, FR-82, FR-87 to FR-89, FR-92, FR-100, FR-107, FR-108). The next task, `target-form-dialog`, builds them, and with them the Add target button, the Edit button of each row and the `list-foot` hint. So the empty state here has no Add target button, and focus after a removal does not go to Edit or Add target (see "Outcomes").
- The "Last delivery failed" notice on a target (FR-86) and on the dashboard row's behaviour beyond the link. `Target.last_delivery_failed` is always false until delivery exists; the notice comes with the delivery task (backlog, milestone 2).
- The `Alerts` on/off switch and the two messages (FR-20, FR-65): the `Edit service` link below goes to `/services/:serviceId`, which is still the `NotBuilt` placeholder until the edit task.
- Pause, Resume, Edit buttons on the dashboard row, and the name as a link to Edit: their own tasks (backlog).
- `getService`: a stub on the server. The page reads the service's name and `alerts_enabled` from the cached `listServices` instead.
- Polling and a refresh button for the alert list itself: it has none (FR-95 is for the dashboard). The service list that the page also uses keeps its own 5-minute refresh while the page is open, by the user's decision.
- End-to-end tests. The milestone's last task writes them.

## Prerequisite

All merged on the default branch (the builder checks and stops to ask if one is missing; it creates none of them):

- `targets-api`: `listTargets` and `deleteTarget` are real on the server (`backend/internal/handler/targets.go`). This task runs against mocks.
- `delete-service-dialog`: the `Actions` column, `ServiceRow`'s `onDelete`, `useToast` usage, and `servicesQueryKey` in `lib/api/services.ts`.
- `frontend/src/App.tsx` has the route `/services/:serviceId/alerts` with `NotBuilt page="alert list"`.
- **The `Target` contract fix** (the user makes it in `docs/openapi.yaml` and runs `make generate`, before this task): the generated `Target` in `frontend/src/lib/api/schema.d.ts` is `{ type: "Target" } & Omit<TargetInput, "type">`, which loses `address`, `url`, `headers` and the real `type`. After the fix `Target` is an email shape or a webhook shape, each with `id` and `last_delivery_failed`, and `target.type` is `'email'` or `'webhook'`. The builder checks that `Target` has `address` for `type: 'email'` and `url` for `type: 'webhook'`; if not, it stops and says so.

## Role and ownership

Role: Frontend.

You may change `frontend/src/**`. You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `backend/**`, `docs/**` (except your own plan file, `docs/tasks/alert-list-screen.plan.md`), or anything else outside `frontend/src/`. Do not change `components/ui/*` (the wrappers are used as they are).

Shared files this task touches, all owned by this task while it runs:

- `frontend/src/App.tsx`: the alert-list route renders `AlertListPage` instead of `NotBuilt`.
- `frontend/src/test/fixtures.ts`: adds target fixtures (below).
- `frontend/src/features/service-list/**` (`ServiceRow.tsx`, `service-list.css` and their tests): the `Alerts` link and the delivery link.
- `frontend/src/lib/api/targets.ts` (new): `target-form-dialog` adds `createTarget` and `updateTarget` to it after this task merges.

Tasks that may run at the same time: `alert-dispatch` (backend only) and `portal-into-app` (frontend, but only `components/ui/*` and `styles/components.css`, which this task does not touch). No other frontend task runs beside this one; `target-form-dialog` waits for it.

## Operations used

From `docs/openapi.yaml`. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this screen handles |
|---|---|---|
| `listTargets` | `GET /api/services/{serviceId}/targets` | 200 (`Target[]`, at most 5, in the order added); 401 `unauthenticated` (the shell ends the session); 404 `not_found` (the service is gone); 500 `internal_error` and any other failure, including a network error, as "something went wrong". Real on the server |
| `deleteTarget` | `DELETE /api/services/{serviceId}/targets/{targetId}` | 204; 401 `unauthenticated`; 403 `csrf_failed`; 404 `not_found`; 500 `internal_error` and any other failure as a generic failure. Real on the server |
| `listServices` | `GET /api/services` | Unchanged. This task reads `id`, `name` and `alerts_enabled` (optional; absent means on) and, on the dashboard, `alert_delivery_failed` |

`Target` is `EmailTargetInput` or `WebhookTargetInput` plus `id` and `last_delivery_failed`: `type` is `email` (`address`) or `webhook` (`url`, `headers`); `name` is optional on both. The contract lists no 409, 422 or 429 for either operation here, and `deleteTarget` has no 400. Neither request has a body or query; `X-CSRF-Token` is added by `apiRequest` for the `DELETE`.

## Behavior

### What exists

- `apiRequest` throws `ApiError` (`status`, `code`) for a non-2xx response; on a `401` with code `unauthenticated` it first calls the handler the session provider registered, which ends the session. A 204 resolves to `undefined`. A network failure rejects with the fetch error, not an `ApiError`.
- `useServiceList()` (feature `service-list`) is the one query of the service list. It uses its own `SERVICES_KEY`, equal in value to `servicesQueryKey` from `lib/api/services.ts` (a tracked loose end; this task changes neither). It refetches every `REFRESH_INTERVAL_MS` in the background; `ServiceRow` already has the `Actions` cell with the Delete button and a `.svc__delivery` paragraph.
- `useToast().show({ kind, message, action? })`: an error toast stays until dismissed; a success toast goes after 5,000 ms.
- `components.css` has `.back-link`, `.page`, `.page-head*`, `.banner*`, `.btn*`, `.chip`, `.empty*`, `.skeleton`, `.notice`, `.plain-text`, `.sr-only`. The alert list's own rules (`.target-list`, `.target*`, `.alerts-banners`) are not in the project yet.
- The route `/services/:serviceId/alerts` exists and shows `NotBuilt` inside `AdminLayout`.

### The page

`AlertListPage` (the route entry) reads `serviceId` from the address, calls `useServiceList()` (a page may use any feature) and `useTargetList(serviceId)`, finds the service in the list by `id`, and gives the screen the service (or none) and the targets view. The service list is only a source of the name and the `alerts_enabled` flag: its own loading or failure never shows here. While the list has no match (still loading, could not load, or the id is not in it), the title has no name and no banner shows. A service that is not in the cached list is not "not found" by itself: only a `404` from `listTargets` is (the cached list can be older than the service).

Layout, top to bottom, inside `main.page` (the board's markup is a reference, not code): the back link, the page head, the live region `.alerts-banners` (`aria-live="polite"`), then the list or the state's block.

- Back link: Lucide `ArrowLeft` and the text `Services`, a `Link` to `/`. It is shown in every state except "service not found".
- Title `h1.page-title` with `tabindex="-1"`: `Alert list: ` followed by the service name as a plain text child in `span.plain-text`; with no name known, just `Alert list`.
- Sub line `p.page-sub`: `{n} targets · in the order added`, `1 target · in the order added`, `No targets · in the order added`. It is absent while loading and when the list could not be loaded.

### States

| State | When | What shows |
|---|---|---|
| Loading | `listTargets` has not answered | `p.sr-only` with `role="status"`: `Loading targets…`, and three skeleton rows (`aria-hidden`, a 28 px square and two bars each, as the board draws them) in a `ul.target-list` with `aria-hidden="true"` |
| List | 200 with at least one target | `ul.target-list` with `aria-label="Notification targets"`, one `li.target` per target, in the order the server sent |
| Empty | 200 with `[]` | `div.empty`: the Lucide `BellOff` icon (`empty__icon`), `h2.empty__title` `No notification targets`, `p` `No alerts will be sent for this service until you add an email address or a webhook.` Nothing else: no button (see Out of scope) |
| Alerts off | the service is found and `alerts_enabled` is `false`, and the list or the empty state is on screen (never with no data, never with "service not found"); in the live region it comes after the "Something went wrong" banner when both show | in the live region a `div.banner.banner--warn` (`role="status"`) with the `BellOff` icon, title `Alerts are off for this service.`, text `These targets receive nothing until alerts are turned on.`, and in `banner__actions` a `Link` styled `btn` to `/services/{serviceId}` with the text `Edit service` |
| Something went wrong | `listTargets` fails with anything but a `404` or a `401`, on the first load or on a later reload | in the live region a `div.banner.banner--warn` (`role="status"`) with Lucide `WifiOff`, title `Something went wrong.`, text `The server couldn’t be reached or returned an error.` and a `Try again` button (`btn`, Lucide `RefreshCw`, disabled while a request is in flight) that fetches the list again. A list already on screen stays below it. With no data, the list area is empty |
| Service not found | `listTargets` answers `404 not_found`, on the first load or on a reload | the whole page is replaced (no back link, no title): `div.empty` with Lucide `CircleAlert`, `h2.empty__title` `This service no longer exists`, `p` `It was deleted, so its alert list is gone too.` and a `Link` styled `btn btn--primary` to `/` with the text `Back to services`. The `h2` has `tabindex="-1"` and takes focus whenever this block replaces the page (including after a removal answered 404, see "Outcomes") |
| Session ended | any request answered `401 unauthenticated` | nothing here: the shell replaces the page with the sign-in form |

The board draws no pending state for "Try again"; the disabled button is decided here.

### A target row

`li.target`, a three-part grid as the board draws it: a 28 px type square, the main part and the actions.

- Type square: Lucide `Mail` for `email`, `Webhook` for `webhook`, `aria-hidden`, with a `span.sr-only` `Email` or `Webhook`.
- Title line: the name as `span.target__name.plain-text`; when `name` is absent, empty or only whitespace, `span.target__name.target__name--fallback` with `Unnamed email` or `Unnamed webhook`. Then the chip `EMAIL` or `WEBHOOK`.
- Address line `span.target__addr`: the `address` or the `url`, in full, as text. Headers are not shown.
- A target's name is never truncated by script: long names and URLs wrap (CSS only).
- Actions `div.target__actions`: one button, `Remove`: `btn btn--ghost-danger`, Lucide `Trash2` (decoration), `aria-label="Remove {label}"` where `{label}` is the name, or the address or URL when the name is absent, empty or only whitespace, and a visible `span` `Remove`.

### Removing a target

Clicking `Remove` does not send anything. In that row the actions are replaced by `div.target__confirm` (`role="group"`, `aria-label="Confirm removal"`) holding the text `Remove this target?`, a `Cancel` button (`btn`) and a `Remove` button (`btn btn--danger`, Lucide `Trash2`). Focus moves to that `Remove` button (the board says so). Only one row asks at a time: clicking `Remove` on another row closes the first question and opens the new one (when no request is in flight).

- `Cancel`, and Esc while focus is inside the group, restore the row's buttons and put focus on that row's `Remove` button. Nothing is sent.
- Enter or a click on the confirming `Remove` sends `deleteTarget` once.
- **Removing (request in flight):** `Cancel` is `disabled`. The confirming `Remove` is not `disabled` (that would drop focus): it has `aria-disabled="true"` and `aria-busy="true"`, ignores clicks and Enter, keeps focus, shows a spinning `LoaderCircle` (class `spinner`) in place of `Trash2` and reads `Removing…`. Esc does nothing. The `Remove` buttons of the other rows are `disabled`, and `ask` is a no-op while a request is in flight. A second click cannot send a second request.

The service's list is the cached one under `targetsQueryKey(serviceId)`. The answers, checked in this order (a `401 unauthenticated` first, then by status and code, never by message text):

| Result | Row | List | Toast | Focus |
|---|---|---|---|---|
| 204 | gone | the target is taken out of the cached list (below); the sub line follows | success, `Target removed.` | the next row's `Remove` button; with no next row, the page title (`h1`) |
| 404 with code `not_found` | gone | as for 204, then the list is fetched again (so that a deleted service shows "service not found") | error, `That target was already removed.` | as for 204; if the fetch then answers 404 and the page is replaced by "service not found", focus goes to that block's `h2` |
| 403 with code `csrf_failed` | back to its normal buttons | unchanged | error, `The request wasn’t accepted. Reload and try again.` with an action `Reload` that calls `window.location.reload()` | that row's `Remove` button |
| 401 with code `unauthenticated` | the shell has replaced the page | | none | none |
| anything else: 500, a network error, a 403 or 404 with another code or no problem body, any other status | back to its normal buttons | unchanged | error, `Couldn’t remove the target. Try again.` | that row's `Remove` button |

**Taking the target out of the cache.** On a 204 or a `not_found` 404: (1) an in-flight request for this list is cancelled first, so that a reload that started before the delete cannot put the row back; (2) the target with that `id` is removed from the cached array, the others keep their objects and order; if the cache holds no list, nothing is written; (3) the time of the last real load is kept (`setQueryData` with `updatedAt` set to the entry's `dataUpdatedAt`). The cache change and the toast belong to the mutation's options, so they happen even if the page is no longer mounted when the answer arrives. The empty state follows from the list becoming `[]`.

**Focus after a removal.** The removed row's elements are gone, so the page moves focus once the removal has settled (the in-flight flag is false, so the buttons it disabled are enabled again) and the list has updated: to the `Remove` button of the row that now stands where the removed one was, or to the `h1` when there is none. The Edit and Add target buttons the board names do not exist yet; `target-form-dialog` changes this rule to the board's.

### The dashboard

- **Alerts link.** In `ServiceRow`'s `Actions` cell, before the Delete button, a `Link` to `/services/{id}/alerts` (the id passed through `encodeURIComponent`): `btn btn--ghost btn--icon`, Lucide `Bell` (decoration), `aria-label="Alerts {name}"` (the service's name as text) and `span.btn__label` `Alerts` that is `aria-hidden` and visible only in the 360 px layout, exactly as the Delete button's label. It is shown for every service, paused or not, in every row state. It is a link, not a `button`, by the user's decision (the board draws a button; it only navigates).
- **Delivery notice.** When `alert_delivery_failed` is true, the row's notice becomes a `Link` to the same address, with the class `svc__delivery`, the `TriangleAlert` icon and the text `Alert delivery failed – view alert list` (en dash U+2013 with a space on each side). It is no longer a `p`. The rule copied from `docs/design/dashboard.css` is `.svc__delivery` with `text-decoration: none`, the colour kept on every state of the link and an underline on hover.

### Known gaps

- **`Edit service` goes to a placeholder.** `/services/:serviceId` shows `NotBuilt` until the edit task (milestone 3).
- **No Add target, no Edit.** Until `target-form-dialog` merges, the admin can only look at and remove targets, and an empty list has no way to add one. The two tasks are meant to merge one after the other.
- **The name comes from the cached service list.** A service created in another tab since the list was loaded has no name in the title until the list refreshes (it refetches on mount, because it is stale).
- **`last_delivery_failed` is not shown.** See Out of scope.
- **No pending look on the page's own reload after "Try again" beyond the disabled button.**
- **The skeleton count is fixed at three**, as the board draws it, whatever the list will hold.

## Structure

By `ARCHITECTURE.md`: the screen is the `alert-list` feature (route `/services/:serviceId/alerts`). Names marked "new" do not exist yet and are fixed by this file; other names are the builder's choice. Features do not import each other: the page, which assembles features, is the only file that uses `service-list`.

- `frontend/src/lib/api/targets.ts` (new) and `targets.test.ts` (new): the types `Target`, `TargetList` (from the generated schema), `targetsQueryKey(serviceId)` (an array that does **not** start with `'services'`, so that a refresh or removal of the service list never touches it), `listTargets(serviceId)` and `deleteTarget(serviceId, targetId)`, thin wrappers over `apiRequest` with both ids passed through `encodeURIComponent`, with a doc comment each in the style of `lib/api/services.ts`.
- `frontend/src/pages/AlertListPage.tsx` (new): as described under "The page". `App.tsx` uses it for the alert-list route.
- `frontend/src/features/alert-list/hooks/useTargetList.ts` (new) with a colocated test: one query on `targetsQueryKey` with no retry and no interval, and the screen state derived from it (`loading`, `not-found`, `could-not-load`, `empty`, `list`, plus `refreshFailed` and `fetching`) and a `refresh()`. A `404 not_found` error is `not-found` even when data is cached; the derived state is never copied into component state.
- `frontend/src/features/alert-list/hooks/useRemoveTarget.ts` (new) with a colocated test: the removal flow of one target from the click to the outcome. Returns the id of the target being asked about (or null), whether a request is in flight, and `ask(target)`, `cancel()`, `confirm()`; no raw setters. It owns the mutation, the cache change, the toasts and the "list is fetched again after a `404`". Keep the toast wording only here (the `Reload` text duplicates `SessionProvider.tsx` and the delete-service hook, as the service-list task already noted).
- `frontend/src/features/alert-list/components/AlertList.tsx` (new): the screen, from the props the page gives it (service or none, the targets view, the removal flow). It owns the focus move after a removal.
- `frontend/src/features/alert-list/components/TargetRow.tsx` (new): one row and its inline confirmation.
- `frontend/src/features/alert-list/components/AlertListBanners.tsx` (new): the live region's two banners (`Alerts are off…`, `Something went wrong.`).
- `frontend/src/features/alert-list/alert-list.css` (new): copy from `docs/design/alerts.css` (values and rules only) `.alerts-banners`, `.target-list`, `.target`, `.target + .target`, `.target__type`, `.target__main`, `.target__title`, `.target__name`, `.target__name--fallback`, `.target__addr`, `.target__actions`, `.target__confirm` and the 640 px block's rules for them. Leave out `.list-foot` and `.test-row` (the next task's). Add `.back-link + .page-head { margin-top: 6px }`, which the board sets inline.
- `frontend/src/features/service-list/components/ServiceRow.tsx`, `service-list.css`: the `Alerts` link and the `svc__delivery` link, as above. Copy from `docs/design/dashboard.css` the `.svc__delivery` link rules.
- `frontend/src/test/fixtures.ts`: add `makeEmailTarget`, `makeWebhookTarget` and `makeTargetList`, typed with the generated types, in the style of `makeService`.
- **Mocks of `lib/api/targets`** that keep the real `targetsQueryKey`: the pass-through form, `vi.mock(path, async (importOriginal) => ({ ...(await importOriginal()), listTargets: vi.fn(), deleteTarget: vi.fn() }))`, as `ServiceList.test.tsx` does for services (a plain automock turns the key function into a stub).

## Design reference

Reference only, read-only: `docs/design/alerts.html` (states Loading, List, Alerts off for this service, Empty, Remove a target, Service not found, Session expired / request not accepted / unexpected error) and `docs/design/alerts.css`; `docs/design/dashboard.html` and `dashboard.css` for the `Alerts` button and the delivery link; `docs/design/README.md` ("Additions that are built": the inline two-step confirm). Copy values and rules from the styles into the project's CSS; never copy board markup or component code. Use the `components/ui/` wrappers; icons from Lucide only. Where the board and the contract disagree the contract wins.

Texts copied from the board as written: the title, the sub line, `Loading targets…`, the empty state, the alerts-off banner, `Unnamed email`/`Unnamed webhook` (the board writes "Unnamed email/webhook"), `Remove this target?`, `Cancel`, `Remove`, the service-not-found block, `Something went wrong.` with `The server couldn’t be reached or returned an error.` and `Try again`, and `Alert delivery failed – view alert list`.

Texts decided here (not drawn): `Target removed.`, `That target was already removed.`, `Couldn’t remove the target. Try again.`, `Removing…`, `Services` as the back link text (the board draws it), the singular `1 target`, the `Edit service` link target, the disabled "Try again" while fetching, one question at a time, the focus after a removal, the removal toasts' kinds, that the Alerts control is a link, and that the Alerts-off banner also shows over the empty state.

## Dependencies

None. `@tanstack/react-query` 5.107.1, `react-router`, `lucide-react` 1.73.0 and `@base-ui/react` 1.9.0 are installed; `package.json` and the lockfile do not change. `Mail`, `Webhook`, `Trash2`, `Bell`, `BellOff`, `ArrowLeft`, `WifiOff`, `RefreshCw`, `LoaderCircle`, `CircleAlert` and `TriangleAlert` exist in Lucide 1.73.0 (if one is missing, use the closest and say so in the plan).

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed. Mock `listTargets`, `deleteTarget` and `listServices` at the wrapper boundary with value-return spies, typed through the fixtures. A request that answers late is a promise the test resolves. A rejection that stands for a problem response uses the `problem(status, code)` fixture. Time-driven tests use fake timers with `fireEvent` (`user-event` hangs there); other tests use `user-event`.

**`lib/api/targets.ts` (`targets.test.ts`, mocking `./request`)**

- `listTargets('abc')` calls `apiRequest('GET', '/api/services/abc/targets')` once and returns its value; `deleteTarget('abc', 't1')` calls `apiRequest('DELETE', '/api/services/abc/targets/t1')` and resolves to `undefined`; an id with a space and a slash is encoded in both positions; a rejection reaches the caller unchanged (NFR-8).
- `targetsQueryKey('abc')` does not start with `'services'` (so `servicesQueryKey` is not a prefix of it).

**`useTargetList` (`hooks/useTargetList.test.tsx`, a real query client)**

- Before an answer: `loading`. A list of two: `list`; `[]`: `empty`. A 500 or a `TypeError` with no data: `could-not-load`. A `404 not_found`: `not-found`, also when data was cached before. A 404 with another code: `could-not-load`.
- A failed reload with data cached: the state stays `list` and `refreshFailed` is true; `refresh()` fetches again and clears it when it answers 200.

**`useRemoveTarget` (`hooks/useRemoveTarget.test.tsx`, a real query client with a seeded list)**

- `ask` sets the asked id and `cancel` clears it with no request; `ask` for another target replaces the first; `ask` while a request is in flight changes nothing; `confirm` calls `deleteTarget` once with the service id and the target id, is in flight until the promise settles, and a second `confirm` while in flight sends nothing (FR-16).
- 204: the cached list loses exactly that target, the others keep their objects and order, `dataUpdatedAt` is what it was, `listTargets` is not called, the toast `Target removed.` is shown, the asked id is null.
- A list request in flight when the 204 arrives is cancelled: a reload started before `confirm`, resolving afterwards with the old list, does not bring the target back.
- 404 `not_found`: the same removal, then `listTargets` is called once more, and the error toast `That target was already removed.`
- 403 `csrf_failed`: the cache is unchanged; the error toast has the text above and a `Reload` action; clicking it calls `window.location.reload` once (the test replaces `window.location` and restores it) (NFR-8).
- A 500, a network `TypeError`, a 403 with another code, a 404 with no problem body (`new ApiError(404, null, null)`) and a 404 with another code each give `Couldn’t remove the target. Try again.`, leave the cache as it was and clear the asked id.
- 401 `unauthenticated`: no toast, asked id cleared.
- With no cached list a 204 creates none. Unmounting while the request is in flight and then resolving 204 still removes the target and shows the toast.

**The screen (`components/AlertList.test.tsx`, rendering `AlertListPage` in a `MemoryRouter` at `/services/s1/alerts` with a `ToastProvider` and a query client)**

- Loading: `Loading targets…` is a status and three skeleton rows are hidden from assistive technology; the title is `Alert list` plus the name once `listServices` answers; the back link `Services` goes to `/`.
- List of three (email with a name, webhook with no name, webhook with a long name and a long URL): rows in server order; the sub line `3 targets · in the order added`; each row shows type text (`Email`, `Webhook`), the chip, the name or `Unnamed webhook`, and the address or URL in full; the long name is in the DOM in full (FR-17, FR-80, FR-81). One target: `1 target · in the order added`.
- A name of `<b>x</b>` and a service named `<i>y</i>` appear as text and no `b` or `i` element exists (NFR-7).
- Empty: the heading `No notification targets`, the text, no button, the sub line `No targets · in the order added`.
- Alerts off: with `alerts_enabled: false` the banner and an `Edit service` link to `/services/s1` show with the list and with the empty state; with `true` or absent they do not; with the service not in the cached list or the list not loaded, no banner and the title has no name.
- Something went wrong: a 500 shows the banner and no list; `Try again` is disabled while the request is in flight and shows the list when it answers; a failed reload with the list on screen keeps the rows under the banner.
- Service not found: a 404 replaces the page with the block, `Back to services` goes to `/`, there is no back link and no title, and `document.activeElement` is the block's `h2`; a 404 on a reload with rows on screen does the same.
- Only `listTargets` decides "not found": the service list answering with a list that lacks `s1`, while `listTargets` answers 200, shows the targets with no name in the title.
- A request for `listTargets` uses the id from the address.
- Each row has one `Remove` button named `Remove {name or address}`; there is no Add target, no Edit button and no Edit link on the page.
- `Remove` opens the group `Confirm removal` in that row only, with `Remove this target?`, `Cancel` and `Remove`; focus is on the confirming `Remove`; no request is sent. Opening a second row's question closes the first. `Cancel` and Esc restore the row's buttons, focus is back on its `Remove` button, nothing is sent (NFR-4).
- Confirming sends one request with the right ids; while pending `Cancel` is disabled, the confirming `Remove` reads `Removing…` with `aria-busy` and `aria-disabled="true"` and still has focus, the other rows' `Remove` buttons are disabled, Esc does nothing, a second click and Enter send nothing.
- Both banners: with the list cached, a failed reload and `alerts_enabled: false`, `Something went wrong.` comes before `Alerts are off for this service.` in the live region; with no data and a failed load, only the first shows.
- A name of spaces only shows `Unnamed webhook` and the button is named after the URL.
- After a 204: the row is gone, the others are in the same order, the sub line shows the new count, the toast `Target removed.` shows, and `document.activeElement` is the next row's `Remove` button; removing the last row of three moves focus to the `h1`; removing the only target shows the empty state and focus is on the `h1`.
- After a 404 `not_found`: the same, with the toast `That target was already removed.`; when the refetch then answers 404, the page shows "service not found" and `document.activeElement` is its `h2`.
- After a 403 `csrf_failed`, a 500 and a network error: the row's normal buttons are back, every row is still there, the right toast shows, and focus is on that row's `Remove` button (the `Reload` button exists only for the 403).
- A 401 shows the sign-in form via the shell, no toast, and the cached list for that service is not shown.

**The dashboard (`ServiceRow` and `ServiceList` tests)**

- Every row has a link named `Alerts {name}` to `/services/{id}/alerts`, before the Delete button, for a paused row and a TCP row too; its visible text is `Alerts` in an `aria-hidden` `.btn__label`; it is a link and not a button; an id with a slash is encoded.
- A row with `alert_delivery_failed` shows one link named `Alert delivery failed – view alert list` to the same address; a row without it shows none.
- Clicking the `Alerts` link in the app routes to the alert list page (`App.test.tsx`: the route renders `AlertListPage`, no longer the placeholder).

Tests this task changes on purpose:

- `ServiceList.test.tsx`, "has one Delete button per row, no other row button, no switch, Open link or row links; only the Add service link is a link" (around line 160; reword its title, which says "only the Add service link is a link", to say the Alerts links too): `within(list).queryByRole('link')` (line 168) now expects exactly the `Alerts` links, one per row, and no other link in the list; `getAllByRole('link')` equal to 1 (line 171) becomes the Add service link plus one `Alerts` link per row. It still fails on a `Pause`, `Resume` or `Edit` button, a switch, an `Open` link and a name link. Nothing else in it is loosened.
- `ServiceList.test.tsx` (around line 227): `within(row('a')).queryByRole('link')` expects no link on a failed-delivery row; it now expects the `Alerts` link and, on a row with `alert_delivery_failed`, the delivery link, and no other. The test around line 216 that shows the notice as plain text now finds it as a link with the longer text.
- `App.test.tsx`: the alert-list route is listed in `adminRoutes` (around line 64) and in `placeholderRoutes` (around line 69), and the `it.each` over the placeholders (around line 106) expects "The alert list page is not built yet." That case no longer holds: the route leaves `placeholderRoutes`, and a signed-in case for it renders the real page with `listTargets` and `listServices` mocked (pass-through mock form). The signed-out case over `adminRoutes` stays.
- Any `ServiceRow` test that renders a row outside a router now needs one (`Link` requires it).

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

## Verifier checks

- **By reading `useRemoveTarget.ts`:** the cache change is `setQueryData` on `targetsQueryKey(serviceId)` with `updatedAt` kept, after `cancelQueries`; no refetch on a 204; a `not_found` refetches once; toasts and cache change are in the mutation's options, not in a callback passed to `mutate`; outcomes are chosen by `ApiError.code`, never by message text; a 401 shows nothing; server data is not copied into component state.
- **By reading `useTargetList.ts`:** the key does not begin with `'services'`; no `refetchInterval`; `404 not_found` wins over cached data.
- **By reading the components:** no `dangerouslySetInnerHTML`; the names and addresses are React text children, in `aria-label` too; no hand-written dialog, toast or menu; icons from Lucide only; no literal colour or pixel value in a rule where a token exists, other than values copied from `docs/design/alerts.css`; no import from `features/service-list` inside `features/alert-list` (only `pages/AlertListPage.tsx` imports it).
- **Wording, by reading:** every string in the tables above that is specific to this screen is defined once in the code and used from there (shared words such as `Remove`, `Cancel`, `Alert list` and `Services` may repeat; the `Reload` toast text also lives in two existing places), with the curly apostrophes, the en dash and the `…` as written.
- **Keyboard, by reading:** the group's initial focus is the confirming `Remove`; Esc is handled on the group and does nothing while in flight; `Cancel` and the other rows' `Remove` buttons use `disabled`, the confirming `Remove` uses `aria-disabled`; the Alerts link is an `a` in the Tab order before the Delete button; the `h1` and the service-not-found `h2` have `tabindex="-1"`.
- **Layout, by reading the CSS (jsdom cannot prove it):** the 640 px block stacks the actions and the confirmation under the main part, as the board does; long names and URLs use `overflow-wrap: anywhere`; the `Actions` column keeps its width.
- **Contract:** every field read exists in `components['schemas']['Target']` and `Service`; the statuses handled are those the contract lists for `listTargets` and `deleteTarget` plus "anything else".
- **Inputs to try:** five targets; a 50-character name with no spaces; a 2,048-character URL; a target with no name and a webhook; removing the first, the middle and the last row; a removal answered 404 after a reload already dropped the row; a reload that started before the removal and answers after it; Esc while removing; two failures in a row; the service list failing while `listTargets` works; the session ending by a 401 during a reload.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design boards or this file conflict with each other.
- You think you need a change outside your paths, a dependency, an edit to a spec or design file, or a state that is neither drawn on the board nor listed in this file.
- `targets-api` is not merged (`handler/targets.go` is missing) or `servicesQueryKey` is not in `lib/api/services.ts`.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
