# Task: dashboard public page switch

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The admin turns the public view on or off from the dashboard's toolbar, with the board's "Public page" switch, and can open the public page in a new tab from the `Open` link beside it. The switch reads and writes the setting with `getPublicViewSettings` and `updatePublicViewSettings`, both real on the server. While the setting has not loaded (or could not be loaded) the switch is disabled and shows no On or Off word. The task also makes the dashboard's two services query keys one.

Requirements covered:

- FR-26: the admin can turn the public view on or off; it is off until turned on (the server's default, shown as read).
- FR-28, in part: the `Open` link goes to the public page, which anonymous viewers see while the view is on.
- FR-95, in part: the dashboard's Refresh button and its automatic refresh also reload the setting.
- NFR-4, in part: the switch and the link are reachable by Tab in the toolbar's order and operable from the keyboard.
- NFR-8: a `403 csrf_failed` on a toggle offers a reload.

Out of scope:

- **The per-service toggle** (FR-27, FR-68) on the service form: `service-public-toggle`.
- **Which services appear on the public page:** unchanged (each service's saved flag, shown in the row's Public column).
- **Any change to the server, the contract or the design files.** `updatePublicViewSettings` with `{}` is read by the server as off; the decision is to keep it. The switch always sends `{ enabled }` with a boolean, so it never sends `{}`.
- **The page `/status`:** built (`public-dashboard-screen`); the link only points at it.

## Prerequisite

`dashboard-screen`, `dashboard-pause-resume`, `delete-service-dialog`, `toast-text-shared` and `service-name-link` are merged. The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `features/service-list/components/ServiceList.tsx` (the toolbar `div.dash-toolbar` with `Add service`, `Refresh`, the `Meta` text; it takes `view`, `deletion` and `pausing`), `ServiceRow.tsx`; `hooks/useServiceList.ts` exporting `SERVICES_KEY` and `useServiceList`, `usePauseService.ts`; `features/service-list/lib/rowActionToasts.ts` (`toOutcome`, `csrfToast`); `service-list.css`; and their tests.
- `pages/DashboardPage.tsx` composing the hooks; `lib/config.ts` with `REFRESH_INTERVAL_MS`.
- `lib/api/services.ts` exporting `servicesQueryKey` (`['services']`); `test/fixtures.ts`.
- `components/ui/Switch.tsx` (props `checked`, `onCheckedChange`, `label`, `disabled`, `description`; it shows the On or Off word itself) with its test.
- The generated `PublicViewSettings` (`{ enabled: boolean }`) in `lib/api/schema.d.ts`.
- `.switch-row`, `.switch*`, `.btn`, `.btn--ghost`, `.btn--sm`, `.sr-only` in `styles/components.css`.

`package.json` and the lockfile do not change.

## Role and ownership

Role: Frontend.

You may change `frontend/src/features/service-list/**`, `frontend/src/pages/DashboardPage.tsx`, `frontend/src/lib/api/publicView.ts` and `publicView.test.ts` (new), `frontend/src/components/ui/Switch.tsx` and `Switch.test.tsx` (one optional prop, see "Structure"), `frontend/src/test/fixtures.ts` (only if a helper is missing; `{ enabled: true }` may be written inline instead) and, in `frontend/src/App.test.tsx`, the module mocks, any assertion that lists the dashboard's controls, and new cases for this task. You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `frontend/src/styles/components.css`, any other file in `components/ui/`, `frontend/src/App.tsx`, `features/service-form/**`, `features/alert-list/**`, `backend/**`, `e2e/**`, or `docs/**` (except your own plan file, `docs/tasks/dashboard-public-switch.plan.md`).

Shared files this task touches, all owned by this task while it runs: `features/service-list/**` (`rowActionToasts.ts`, `service-list.css` included), `DashboardPage.tsx`, `components/ui/Switch.tsx`, `lib/api/publicView.ts`, and `App.test.tsx` and `test/fixtures.ts` as stated. Tasks that may run at the same time: `service-public-toggle` (it touches `features/service-form/**`; `App.test.tsx` and `fixtures.ts` are edited by both in other hunks) and any backend task. `share-form-parts` waits for this one (it moves `rowActionToasts.ts`' Reload toast and edits files in `features/service-list/lib/`). `service-public-toggle` waits for the form tasks, not for this one.

## Operations used

From `docs/openapi.yaml`. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this screen handles |
|---|---|---|
| `getPublicViewSettings` | `GET /api/settings/public-view` | 200 `PublicViewSettings`; 401 `unauthenticated` (left to the shell); 500 and a network failure as "not loaded". It lists no 403 and no 404 |
| `updatePublicViewSettings` | `PUT /api/settings/public-view` | 200 `PublicViewSettings`; 403 `csrf_failed`; 401 left to the shell; 400, 413, 415, 422, 500 and a network failure as the generic failure. It lists no 404 |

The request body is `{ "enabled": <boolean> }`. The CSRF token is added by `apiRequest`. The answer's `enabled` is the value to show.

## Behavior

### What exists

- The toolbar has `Add service`, `Refresh` and the `Meta` text (`Updated … · auto every 5 min`), in a wrapping flex row. The board's `dash-toolbar__spacer`, `public-toggle*` rules were left out of `service-list.css`.
- `useServiceList` owns the list query (`SERVICES_KEY`, refetching every `REFRESH_INTERVAL_MS`); `view.refresh` refetches it; `usePauseService` shows toasts for row actions through `rowActionToasts`.
- `components/ui/Switch` renders its On or Off word from `checked`.

### The toolbar control

After the `Meta` text, separated by the board's `span.dash-toolbar__spacer` (rendered by `ServiceList`, outside the box) so that it sits at the right end on a wide screen, one `div.public-toggle` (the board's bordered, inline box) holding, in this order:

1. The `Switch` wrapper with the label `Public page`, `checked` the setting's value, and its state word On or Off.
2. `span.public-toggle__sep` (`aria-hidden`), the divider.
3. The `Open` link (`a.btn.btn--ghost.btn--sm.public-toggle__link`) to `/status`, opening in a new tab (`target="_blank"`, `rel="noopener noreferrer"`), with the Lucide `ExternalLink` icon (`icon icon--sm`, `aria-hidden`, as the board draws it), the visible text `Open` and `span.sr-only` ` public page (new tab)`, so its accessible name is `Open public page (new tab)`.

At the compact width (the board's 640 px container breakpoint) the box is full width with the touch height, the link at its right end, and the `Meta` text moves after it, as the board draws it. The control shows in every state of the list (loading, empty, list, could not load), as the board draws it in loading, empty and refresh-failed.

Tab order in the toolbar: `Add service`, `Refresh`, the switch, `Open`.

### The setting's states

The setting comes from its own query (`getPublicViewSettings`, no retry, refetched every `REFRESH_INTERVAL_MS` with the list). The board draws none of these states; they are decided with the user:

| State | When | What is shown |
|---|---|---|
| Loading | no answer yet | The switch is disabled, its state word is not shown, and it is unchecked. The `Open` link is shown and works |
| Not loaded | the request failed (500, a network error, any status but a `200`) and no value is held | As Loading: disabled, no word. No banner and no toast. The `Refresh` button and the automatic refresh try again, and a success enables the switch |
| On | the last answer has `enabled: true` | Enabled, checked, the word `On` |
| Off | the last answer has `enabled: false` | Enabled, unchecked, the word `Off` |
| Refresh failed | a refetch fails while a value is held | The held value stays, as the list does; no toast |

A `401` is left to the shell, which ends the session and shows the sign-in form. The `Open` link is always shown and enabled, also when the view is Off (the public page's own "unavailable" state tells the visitor); decided with the user.

### Toggling

1. Turning the switch sends `updatePublicViewSettings({ enabled: <the new value> })` once. The switch keeps showing the last known value until the server answers (no optimistic change). While the request is in flight a further toggle does nothing; the switch is not given the `disabled` attribute during the request, so it keeps keyboard focus.
2. **Success (200):** the switch shows the answer's `enabled`: a refetch of the setting still in flight is cancelled first (`cancelQueries`), then the cached setting is replaced by the answer (as `servicesCache.ts` does), so an older answer cannot overwrite it and a success toast says `Public page turned on.` or `Public page turned off.` by the answer.
3. **Failures** end the request and leave the switch at its last known value:

| Response | Toast |
|---|---|
| `403 csrf_failed` | error, the shared `csrfToast` (`The request wasn’t accepted. Reload and try again.` with a `Reload` action that reloads the page) |
| `400`, `413`, `415`, `422`, `500`, any other status, a network failure | error, `Couldn’t turn the public page on. Try again.` or `Couldn’t turn the public page off. Try again.`, by the value that was being set |
| `401 unauthenticated` | nothing here: the shell ends the session |

The classification reuses `toOutcome` with its `gone` result (a `404 not_found`) treated as the generic failure: a `404` is not in the contract and is not the "already deleted" case of the row actions. A `401` while the request is in flight is the shell's.

### Refresh

`Refresh` and the banner's `Retry` button fetch the list and the setting together. The button's busy and disabled state follows the list request only (as today). The automatic refresh does both on the same interval.

### The one services key

`features/service-list/hooks/useServiceList.ts` uses `servicesQueryKey` from `lib/api/services.ts` and drops its own `SERVICES_KEY` export; every importer and the mock factory in `useServiceList.test.tsx` follow. The value stays `['services']` (the session provider clears the cache with the literal).

### Known gaps

- **No indication on the dashboard of how many services the public page shows;** the Public column still shows each service's flag.
- **The switch has no pending look** beyond not changing until the answer (the board draws none).
- **A setting changed in another tab** shows after the next refresh.
- **A failed load is silent:** the admin sees a disabled switch and no reason; Refresh retries.

## Structure

By `ARCHITECTURE.md`; follow `usePauseService` and `useServiceList` as the examples. Names marked "new" are fixed by this file; others are the builder's choice. One hook per concern, each with a colocated test written in the same step.

- `lib/api/publicView.ts` (new, with a test): `getPublicViewSettings()` over `apiRequest('GET', …)` and `updatePublicViewSettings(input)` over `apiRequest('PUT', …)` with the generated `PublicViewSettings`; the type and a query key `publicViewQueryKey` (`['public-view-settings']`) exported. The key is outside `['services']`: the session provider removes every non-session query on sign-out and a save of a service must not drop it.
- `features/service-list/hooks/usePublicView.ts` (new, with a test): the one query (no retry, `refetchInterval`, `refetchIntervalInBackground`, no refetch on focus or reconnect, as `useServiceList`) and the derived view: `state` (`loading`, `not-loaded`, `on`, `off`), `refresh()` and `toggle(next)`; the mutation, the in-flight guard (a ref, so two toggles in one tick send one request), the cache replacement on success and the toasts, through `rowActionToasts`' `csrfToast` and the wording above. One concern: the public view setting.
- `features/service-list/components/PublicToggle.tsx` (new, with a test): the box, the switch, the divider and the link; presentational, from the hook's view.
- `features/service-list/components/ServiceList.tsx`: takes the new `publicView` prop (as it takes `pausing`), renders `PublicToggle` in the toolbar and makes `Refresh` call both refreshes. `pages/DashboardPage.tsx` passes `usePublicView()`.
- `components/ui/Switch.tsx` (and test): one optional prop `hideState` (default false) that omits the state word's text (the element keeps its place so the layout does not shift); nothing else changes. The user approved this one-prop change with the task.
- `features/service-list/service-list.css`: the board's `.dash-toolbar__spacer` and `.public-toggle*` rules, with their rules in the 640 px block (`.public-toggle` full width at the touch height, the link at the right end, `.refresh-meta` after it); values copied from `docs/design/dashboard.css`; plus `.public-toggle .switch-row { min-height: 0 }`, which the board draws as an inline style, so the row does not overflow the box; nothing else.
- `lib/api/services.ts` is not changed (the key already exists there).

## Design reference

Reference only, read-only: `docs/design/dashboard.html` (states "Loading", "List", "Empty", "Refresh failed", "Action failed" for the toast) with `docs/design/dashboard.css` (`.dash-toolbar__spacer`, `.public-toggle*`, the 640 px block) and `docs/design/components.css` (`.switch`). Copy values and rules from the styles; never copy board markup or component code. Use the `Switch` wrapper and Lucide icons only. The board draws the switch only On; the other states are decided here.

Texts copied from the board as written: `Public page`, `On`, `Off`, `Open`, ` public page (new tab)`. Texts decided here (not drawn): `Public page turned on.`, `Public page turned off.`, `Couldn’t turn the public page on. Try again.`, `Couldn’t turn the public page off. Try again.`.

## Dependencies

None. `package.json` and the lockfile do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. Mock the two wrappers at the wrapper boundary with value-return spies typed with the generated types (keep the real query keys), render with a memory router and `ToastProvider`, use `user-event`; reject with `ApiError` built by the `problem` helper.

**`lib/api/publicView.ts`, `usePublicView`**

- `getPublicViewSettings` calls `GET /api/settings/public-view`; `updatePublicViewSettings({ enabled: true })` calls `PUT` with the body `{"enabled":true}`.
- State: before an answer `loading`; `{ enabled: true }` is `on`; `{ enabled: false }` is `off`; a 500 and a network `TypeError` with no value is `not-loaded`; a refetch that fails while `on` stays `on`; `refresh` after a failure ends `on`.
- Toggle: `toggle(true)` sends exactly `{ enabled: true }` once; two calls in one tick send one request; success replaces the cached value with the answer (a mock answering the opposite of what was asked proves the source) and shows the toast by the answer; each failure of the table gives its toast and keeps the value; a `404` is the generic toast, not the row actions' "already deleted"; a `401` shows no toast.

**The dashboard (`PublicToggle.test.tsx`, `ServiceList.test.tsx`, `App.test.tsx`)**

- The toolbar order and the Tab order (after the setting has loaded; the switch is disabled before) are `Add service`, `Refresh`, the switch named `Public page`, then `Open public page (new tab)`; Space on the focused switch toggles it (NFR-4).
- Loading and not loaded: the switch is disabled, unchecked and shows neither `On` nor `Off`; the `Open` link is shown, enabled, with `href="/status"`, `target="_blank"` and `rel` containing `noopener`; no banner and no toast; after the setting loads the switch is enabled and shows its word (FR-26).
- On shows a checked switch and `On`; Off shows an unchecked switch and `Off`; the `Open` link is the same in both (FR-26, FR-28).
- Turning the switch on from Off sends `{ enabled: true }`; while the request is pending the switch still shows Off and has not the `disabled` attribute and a second click sends nothing; on the answer it shows On and the toast `Public page turned on.` shows; turning it off shows `Public page turned off.` (FR-26).
- A `403 csrf_failed` shows the shared toast with `Reload` (clicking it calls `window.location.reload` once, with the usual spy) and the switch stays at its old value (NFR-8); a 500 shows `Couldn’t turn the public page on. Try again.` (and `…off…` when turning it off) and the switch keeps its value, and a second try sends again.
- The switch has no `disabled` attribute while the request is pending (this, not focus, is the proof: jsdom does not blur a focused element that becomes disabled, so a focus assertion alone cannot fail); focus is on it after the answer.
- A `getPublicViewSettings` refetch still pending when a toggle is answered cannot overwrite the answer: its older value arriving later leaves the answer shown.
- `Refresh` and the banner's `Retry` call both `listServices` and `getPublicViewSettings`; the automatic refresh does both after `REFRESH_INTERVAL_MS` (fake timers); the Refresh button's busy state follows the list only (a pending setting request alone does not disable it).
- The setting's request is not repeated when a toggle succeeds (no refetch after the answer).
- With the real dashboard route in `App.test.tsx`: the toolbar control shows and a toggle works; a `401` on the setting (the GET of a refresh and the PUT of a toggle, each: the test calls the registered unauthenticated handler before it rejects, as the other cases of the file do) ends on the sign-in form with the session-ended notice and no toast.
- The list key: `useServiceList` reads the shared `servicesQueryKey`, shown with the real key in its test (not an emptied one); no `SERVICES_KEY` export remains (only `useServiceList.ts` used it); `SessionProvider.test.tsx` and `App.test.tsx`, which use the literal `['services']`, pass unchanged.

**`components/ui/Switch.test.tsx`**

- With `hideState` the state word's text is empty for both values and the element is still in the row; without it the word shows as before (the existing cases pass unchanged).

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

Tests this task changes on purpose: every `ServiceList` render in `ServiceList.test.tsx` and `App.test.tsx` passes the new `publicView` prop or mocks the new wrappers (`App.test.tsx` mocks `lib/api/publicView`, and the cases that rely on a `getPublicViewSettings` answer set one in their `beforeEach`); any case that lists the toolbar's buttons or counts the page's links, buttons or tab stops gains the switch and the `Open` link; `useServiceList.test.tsx` mocks `lib/api/services` with an automock, which would empty `servicesQueryKey`: it switches to the `importOriginal` pattern that `ServiceList.test.tsx` and `App.test.tsx` use (real key, mocked requests). In `ServiceList.test.tsx` the case "has a Pause or Resume and a Delete button per row, no Edit button, no switch, Open link or name link; …" is renamed and two assertions are inverted on purpose: the switch and the `Open` link now exist (its `queryByRole('switch')` and `queryByRole('link', { name: /Open/ })` absences become presences) and the link count of `1 + 2 × 3` grows by the `Open` link; its own `Page` composition passes `usePublicView()`. `vi.resetAllMocks()` runs in `ServiceList.test.tsx` and `App.test.tsx`: both set a default `getPublicViewSettings` answer in their global `beforeEach` (a mock with no answer returns `undefined`, which the query library rejects), and `App.test.tsx` may gain new cases. No other assertion is removed or loosened.

## Verifier checks

- **By reading `usePublicView.ts`:** the request body is built from the boolean passed in, never `{}` and never a copy of server data; the cached value is replaced by the answer; classification branches on `ApiError.code` and `status`, never on text; the in-flight guard is a ref; no `disabled` attribute during a request; no toast on a `401`.
- **By reading the components:** the state word is hidden through `hideState` only; the link is an `a` with `target="_blank"` and `rel="noopener noreferrer"`; every string defined once with the curly quotes as written; no literal colour or pixel value where a token exists, other than values copied from the design CSS; icons from Lucide only; Base UI only inside `components/ui/`.
- **Layering:** `features/service-list/` imports nothing from `app-shell/` or another feature; the public setting's key is in `lib/api/publicView.ts`, not in `['services']`.
- **Contract:** the request and response are `PublicViewSettings`; no status or code beyond those in "Operations used".
- **Mutation checks to run:** send `{}`; send the old value; show the toast by the typed value instead of the answer; make the switch optimistic; drop the in-flight guard; add `disabled` during the request; show the word while loading; hide the link while Off; make `Refresh` skip the setting; leave a 404 as the "already deleted" toast; drop the `rel`. Each must fail at least one named test.
- **Inputs to try:** toggle twice quickly; a slow request with a refresh in the middle; a failure then a success; the setting loading after the list; Refresh with the setting failing; a toggle answered 403 then 500.
- **Layout, by reading the CSS (jsdom cannot prove it):** the control sits at the right end on a wide screen and is full width at or below 640 px with the link at its right end; the `Meta` text moves after it at the compact width.
- **What the verifier cannot prove:** the look at 360 px and a real server's answers; say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design board or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a `components/ui/` change beyond the one prop, or an edit to a spec or design file, or a state that is neither drawn on the board nor listed in this file.
- A prerequisite name is missing or differs from "Prerequisite".
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps (the wrapper and the hook first, then the toolbar, then the key change), push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), that no integration test applies, dependency versions (none changed), and anything you were unsure about. Also list every judgment call this file did not settle, and say that the layout and the focus outline were checked by reading the CSS only, not in a browser, unless you ran the app.
