# Task: edit service screen

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The admin opens `/services/:serviceId`, sees the service's saved settings in the same form as Add service (name, type, request, health rules, HTTPS, TCP port, timing, alerts), changes any of them, including the type, and saves with `updateService`. The service keeps its state; the next check uses the new settings. The screen loads the service with `getService` and has its own loading, load-failure and "no longer exists" states. The form is the Add form's, built once: the Add screen and the Edit screen are two thin wrappers around one `ServiceForm`.

Requirements covered:

- FR-7: the admin edits any setting of a service: the form shows every saved value and sends them all with `updateService`.
- FR-39: the saved header values are displayed in full.
- FR-66: changing the type of a saved service is a save like any other (the server keeps the state; the form sends the other type's check).
- FR-20 and FR-65, in part: the alerts switch and the two messages show their saved values and are saved.
- FR-12, FR-59, FR-74, in part: the `422` errors, the name-taken refusal and every failure of a save are shown as on the Add screen.
- FR-4, in part: a `401` ends on the sign-in form, as on the other screens.
- NFR-4, in part: the screen works from the keyboard; focus goes where the outcome is.
- NFR-7: the saved name, the saved values and every server message are shown as text.
- NFR-8: a `403 csrf_failed` offers a reload.

Out of scope:

- **The test panel** (`testServiceCheck`): `service-test-panel` adds it to the form for both screens.
- **The public-page switch** (FR-68): its own milestone 4 task. The Edit form has no control for it and sends the saved flag back unchanged (see "What is sent").
- **The link to Edit on the dashboard** (the name as a link with ellipsis and tooltip, the row's Edit action): `service-name-link`. The alert list's `Edit service` link already goes to this route.
- **A "service limit reached" outcome:** `updateService` does not list it.
- **The Esc exit** of the discard question: not built, as on the Add screen.
- **Refetching the service while the form is open** (window focus, an interval): the form is filled once; see "Known gaps".
- **Any change to the server, the contract or the design files.**

## Prerequisite

`leave-prompt-data-router`, `service-form-json-and-cert-rows` and `service-form-type-tcp` are merged. The builder checks first that these exist on the default branch, and stops to ask if any is missing or named differently (it never creates them). Names come from those task files, which were not merged when this was written.

- The data router: `App.tsx` exporting `appRoutes`; `test/renderRoutes.tsx`; `hooks/useLeaveGate.ts` and `components/LeaveGateProvider.tsx`; in `features/service-form/hooks/`: `useLeaveGuard.ts` (returning `changed`, `dialogOpen`, `keepEditing`, `discard`, `markSaved`, and exporting `LEAVE_WITHOUT_ASKING`) and `useUnloadPrompt.ts`.
- In `features/service-form/`: `components/AddServiceForm.tsx`, `RequestRowsGroup.tsx`, `HealthRulesGroup.tsx`, `HttpsGroup.tsx`, `TypeField.tsx`, `TcpGroup.tsx`, `TimingGroup.tsx`, `AlertsGroup.tsx`, `ErrorSummary.tsx`, `FieldErrorText.tsx`, `FormBanners.tsx`, `DiscardDialog.tsx`; `hooks/useCreateService.ts` (`ServiceFormValues` with `name`, `type`, `method`, `url`, `query_params`, `headers`, `body_type`, `body_content`, `json_rules`, `json_rule_mode`, `cert_enabled`, `cert_days`, `ignore_cert_errors`, `host`, `port`, `alerts_enabled`, `unhealthy_message`, `recovery_message`, and the four timing texts; `toFailure`; `CreateFailure`), `useServerErrors.ts`; `lib/requestRows.ts` (`requestParts`, `DEFAULT_BODY_TYPE`), `lib/jsonRules.ts`, `lib/certificateOptions.ts` (the starting days and the builder of `certificate_check`), `lib/serviceType.ts`, `lib/timingGroup.ts` (`TIMING_DEFAULTS`, `readWholeNumber`), `lib/fieldLabels.ts`, `lib/fieldIds.ts`; `service-form.css`; and their tests.
- `lib/api/services.ts` with `createService`, `servicesQueryKey` and the exported types `Service`, `ServiceInput`, `FieldError`; `test/fixtures.ts` with `makeService`, `makeTcp`, `problem`, `validationProblem`, `fieldError`.
- `getService` and `updateService` are real on the server (`update-service-api` is merged).

`package.json` and the lockfile do not change.

## Role and ownership

Role: Frontend.

You may change `frontend/src/features/service-form/**`, `frontend/src/pages/` (a new `EditServicePage.tsx`), `frontend/src/App.tsx` and `App.test.tsx` (the route and its tests), `frontend/src/lib/api/services.ts` and `services.test.ts` (the two wrappers and a key), `frontend/src/test/fixtures.ts` (only if a helper is missing). You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `frontend/src/styles/components.css`, `frontend/src/components/**`, `frontend/src/hooks/**`, `frontend/src/app-shell/**`, `frontend/src/main.tsx`, `backend/**`, `e2e/**`, or `docs/**` (except your own plan file, `docs/tasks/edit-service-screen.plan.md`). Do not change `features/service-list/**`, `features/alert-list/**` or `features/sign-in/**`.

Shared files this task touches, all owned by this task while it runs: everything under `features/service-form/`, `App.tsx`, `App.test.tsx`, `lib/api/services.ts`. Tasks that may run at the same time: `service-name-link` (it changes `features/service-list/**` and adds `components/ui/Tooltip.tsx`, nothing here) and any backend task. `service-test-panel` waits for this one.

## Operations used

From `docs/openapi.yaml`. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this screen handles |
|---|---|---|
| `getService` | `GET /api/services/{serviceId}` | 200 `Service` (every setting, header values in full); 404 `not_found`; 401 `unauthenticated` (left to the shell); 500 and a network failure as the load failure. The contract lists no 400, 403 or other status; any other status is also the load failure |
| `updateService` | `PUT /api/services/{serviceId}` | 200 `Service`; 422 `validation_failed` with `errors[]`; 409 `service_name_taken`; 413 `payload_too_large`; 403 `csrf_failed`; 404 `not_found`; 401 left to the shell; 400, 415, 500 and a network failure as the generic failure. It lists no `service_limit_reached` |

`updateService` takes `ServiceInput` (the same body as `createService`) and replaces every editable setting: an omitted `settings` value becomes the configured default, an omitted `alerts_enabled` becomes true, an omitted `shown_on_public_view` becomes false, omitted messages become empty (`update-service-api`). The form therefore always sends everything it has.

## Behavior

### What exists

- `App.tsx` renders `<NotBuilt page="edit service" />` at `/services/:serviceId`, inside `AdminLayout`. This task replaces it. `/services/:serviceId/alerts` stays.
- `AddServiceForm` is the whole Add form (the heading `Add service`, the groups, the footer, the guard, `useCreateService`). `useCreateService` holds the save state machine and `toFailure` classifies a response.
- The alert list's banner `Alerts are off for this service.` links to `/services/{serviceId}` with `Edit service`.

### Two wrappers, one form

- `ServiceForm` (new, the body of today's `AddServiceForm`, moved without a change of behavior) takes: the page `title`, an optional `subtitle` (the saved name), `initialValues` (a `ServiceFormValues`: the form's default values and the start of "changed"), the save state (`saving`, `failure`, `submit`, `clearFailure`, and what the guard needs), and the id-free pieces. It renders the back link, the heading, the groups, the banners, the footer and the discard dialog.
- `AddServiceForm` stays the exported component of the Add screen (its tests keep working): `ServiceForm` with title `Add service`, no subtitle, the add defaults, `useCreateService`, the toast `Service “{name}” added.`.
- `EditServiceForm` (new): `ServiceForm` with title `Edit service`, the saved name as subtitle, the values of the loaded service as `initialValues`, `useUpdateService`, the toast `Service “{name}” saved.`.

### The page and its states

`EditServicePage` (a page, `pages/EditServicePage.tsx`) reads `serviceId` from the address and calls `useService(serviceId)` (see "Structure"). The state of the screen comes from that query; it is never copied into component state.

| State | When | What is shown |
|---|---|---|
| Loading | `getService` has not answered | `<main class="page">`: the back link `Services` (Lucide `ArrowLeft`, to `/`), the heading `Edit service`, and `p.sr-only` with `role="status"`: `Loading service…`. No form, no footer, no subtitle |
| Load failed | `getService` fails with anything but `404 not_found` or `401` (a 500, a network error, a `404` with another code or no problem body, any other status), on the first load or on a retry | The back link and the heading, then a `div.banner.banner--warn` (`role="status"`) with Lucide `WifiOff`, title `Something went wrong.`, text `The server couldn’t be reached or returned an error.` and a `Try again` button (`btn`, Lucide `RefreshCw`, disabled while the request is in flight) that fetches again. No form |
| Not found | `getService` answers `404 not_found` | The whole page is replaced (no back link, no heading): `div.empty` with Lucide `CircleAlert`, `h2.empty__title` `This service no longer exists`, `p` `It was deleted, so it can’t be edited.` and a `Link` styled `btn btn--primary` to `/` with the text `Back to services`. The `h2` has `tabindex="-1"` and takes focus when the block appears |
| Session ended | `getService` answers `401 unauthenticated` | Nothing: the page renders no content (`null`) for that moment; the shell ends the session (its handler runs before the request's error arrives) and replaces the page with the sign-in form. No banner |
| Loaded | `getService` answered 200 | The form (below) |

The query asks the server every time the page opens: no cached copy fills the form, it does not retry (`retry: false`), does not refetch on window focus or reconnect, and keeps nothing after the page closes (`gcTime: 0`). `ServiceForm` is mounted with `key={service.id}` once data exists, and its initial values are made from that first answer; a later answer never rewrites the form. The board draws no loading or load-failure state for this screen; both are decided here, on the alert list's pattern, with the wording above.

### The form when loaded

- **Heading** `Edit service` (`h1.page-title`) and under it `p.page-sub.plain-text` with the saved name as loaded (as the board draws it; it does not follow edits and stays the loaded name after a failed save).
- **Values.** Every control starts at the service's saved value (`toFormValues`, below): name, type, and for HTTP the method, URL, query parameter rows, header rows with their values in full (FR-39: shown as typed text, never masked), the body type and text, the JSON rule rows and mode, the certificate switch and its days, the ignore switch; for TCP the host and port; the four timing texts; the alerts switch and both messages. A saved value that the form has no control for is not shown.
- **Focus** starts on the Name input once the form is on screen.
- **Groups, order, hiding by type, client checks, error mapping and wording** are exactly the Add form's (the type field shows the saved type; changing it swaps the groups and keeps the other type's values, as `service-form-type-tcp` says). Footer: status text, `Cancel`, `Save service`.
- **Cancel and the back link** go to `/` (through the guard, as on the Add screen).
- **Changed** means: the form's values differ from `initialValues`, compared as typed (see "Structure": `isFormChanged`). The footer says `Unsaved changes` while changed and not saving; the discard question and the unload prompt follow the guard exactly as on the Add screen. An untouched Edit form, or one put back to its saved values, is unchanged.

### What is sent

`updateService(id, input)` with the same body the Add form builds from the values (`toServiceInput`, shared with create: name, the HTTP or TCP check, the alert fields, `settings`), plus `shown_on_public_view` set to the saved flag of the loaded service (`false` when the service has none), so that saving never changes it. The id is the one in the address.

### Success

On `200`: the cached service list (the exact key `['services']`, `exact: true`, as the Add screen's removal) is removed, so the dashboard loads fresh. The mounted `['services', id]` query is not removed (removing a mounted query can make it refetch or flip to loading before the page has gone); with `gcTime: 0` it goes when the page closes, and no further `getService` request is made after a save; a success toast `Service “{name}” saved.` with `{name}` the `name` in the `200` body (the server's trimmed name) is shown and the page navigates to `/`. The discard question and the unload prompt do not appear (`markSaved`). The cache is cleared on every `200`, even when the admin has left meanwhile; the toast and the navigation happen only if the form is still on screen. This is the Add screen's rule.

### Failures

The same outcomes as the Add screen, one shared classifier, with these differences:

| Response | What is shown | Focus |
|---|---|---|
| `422`, `409 service_name_taken`, `413`, `403 csrf_failed`, `400`, `415`, `500`, any other status, a network failure | As on the Add screen (summary and field errors; the name message under Name; the banners; `Try again` submits again). A `401` is left to the shell | As on the Add screen |
| `404 not_found` | Error banner (`role="alert"`) with Lucide `CircleAlert`, title `This service no longer exists.`, text `It was deleted, perhaps in another tab. It can’t be saved.` and a `Link` styled `btn` to `/` with `Back to services`, which goes without the discard question (it carries `LEAVE_WITHOUT_ASKING`). `Save service` is disabled from then on (Enter in a field does nothing: the submit handler itself returns while the failure is `not-found`, since a disabled button does not stop Enter; editing a field does not clear this failure) and the values stay on screen so they can be copied; `Cancel` and the back link still work (with the question, if changed). The cached list is dropped, so the dashboard no longer shows the service | The `Back to services` link |
| `409 service_limit_reached` | Cannot occur from `updateService`; classified as the generic failure if it arrives | Stays on `Save service` |

The `404` is its own outcome (a new kind of failure, produced by the update only; the create keeps classifying a `404` as the generic failure, since `createService` lists none). A new submit is not possible while the form shows it (the button is disabled; Enter does nothing).

### Known gaps

- **No refetch while the form is open:** a service changed elsewhere (another tab) is overwritten by the next save of this form.
- **The saved public flag is sent back as it was loaded:** if it changed elsewhere in the meantime, the save restores the loaded value.
- **A URL edited away from `https://` and back** leaves the certificate switches off (the Add form's rule), so such an Edit form stays "changed" until the switches are turned on again.
- **A `404` on save** leaves the typed values only on screen; they are not kept anywhere.
- **No test panel** until `service-test-panel`.
- **The page's own `Loading` state is invisible** to sighted users (only the status text for assistive technology); the board draws none.
- **The edit form of a TCP service has no HTTP values** (the server clears them on a type change): switching to HTTP(S) shows the add defaults for the HTTP groups.

## Structure

By `ARCHITECTURE.md`; follow the Add screen as the example. Names marked "new" are fixed by this file; others are the builder's choice. One hook per concern, each with a colocated test written in the same step.

- `lib/api/services.ts` (and test): `getService(id)` over `apiRequest('GET', …)` and `updateService(id, input)` over `apiRequest('PUT', …)`, both with `encodeURIComponent(id)`, typed with the generated types; and `serviceQueryKey(id)` = `['services', id]`. The Add screen's removal becomes `exact: true` on `servicesQueryKey` (the same effect there: nothing else is under it).
- `features/service-form/hooks/useService.ts` (new, with a test): the one `getService` query on `serviceQueryKey(id)` with the options above, and the screen state derived from it: `loading`, `session-ended` (a `401 unauthenticated` error), `not-found` (a `404 not_found` error), `could-not-load`, `loaded` with the `Service`, plus `refetch()` and `fetching`. A `404` with another code is `could-not-load`. On `not-found` the cached list entry (`['services']`, exact) is removed, as after a `404` on save.
- `features/service-form/lib/serviceInput.ts` (new, with a test): `toServiceInput(values)`, the body builder moved out of `useCreateService` without a change of what it sends; and `toFormValues(service)`, its inverse for an edit: HTTP `check` (method, URL, query and header rows as `{ name, value }`, the body's type and text with `none` and an empty text when absent, the rules with kind `text` and the text for a string value and kind `true` or `false` with an empty text for a boolean, the mode, `cert_enabled` and `cert_days` as text of `min_days_left` (the starting days when there is none), `ignore_cert_errors`) or TCP `check` (`type`, `host`, `port` as text); an absent `query_params`, `headers` or `json_rules` is an empty list, an absent `json_rule_mode` is `any`, an absent `certificate_check` is off with the starting days, an absent `ignore_certificate_errors` is off, a body with a type and no content has an empty text and a `none` body keeps no text; the HTTP values of a TCP service and the TCP values of an HTTP service are the add defaults; `settings` as text with the add defaults for any missing value; `alerts_enabled` (true when absent) and both messages (empty when absent). Pure functions.
- `features/service-form/lib/formChanged.ts` (new, with a test): `isFormChanged(current, initial)`, a deep comparison of every key as typed (rows and rules in order, an empty row counts, `'14 '` is not `'14'`). It replaces the field-by-field rule in `useLeaveGuard`; for the Add form `initial` is the add defaults and the result is the same as before. The add defaults move to `lib/formValues.ts` (new) as one exported constant, `ADD_DEFAULT_VALUES`, used by `AddServiceForm` and tests.
- `features/service-form/hooks/useSaveService.ts` (new, with a test): the save state machine of today's `useCreateService` (`saving`, `saved`, `failure`, `submit`, `clearFailure`, the in-flight guard, the on-screen ref, the cache removal on success) over a `send(values)` function and an `onSaved` callback; `toFailure(error, mode)` moves here, `mode` being `'create'` or `'update'`: `create` classifies exactly as today (a `404` is the generic failure); `update` returns the new kind `{ kind: 'not-found' }` for `404 not_found` and the generic failure for `409 service_limit_reached` (the update lists none). `CreateFailure` becomes `SaveFailure`. When a save ends `not-found`, the cached list entry is removed as on a success (the service is gone, the dashboard must reload). `hooks/useCreateService.ts` stays as a thin wrapper with the same return value and the same tests; `hooks/useUpdateService.ts` (new, with a test) is the other wrapper (`send` builds the body with `toServiceInput` plus the saved flag and calls `updateService(service.id, …)`).
- `features/service-form/lib/formValues.ts` (new, above) also takes `ServiceFormValues` and `DEFAULT_METHOD` (moved from `useCreateService.ts` and `useLeaveGuard.ts`); every import is updated.
- `features/service-form/hooks/useLeaveGuard.ts` (and test): takes `changed` as a boolean instead of every value (the form computes it once with `isFormChanged`; the `changed` the hook returns is that same value); the rest as `leave-prompt-data-router` made it. The cases about "what makes the form changed" move to `formChanged.test.ts`.
- `features/service-form/components/ServiceForm.tsx` (new, moved from `AddServiceForm.tsx`), `AddServiceForm.tsx` (thin), `EditServiceForm.tsx` (new, thin), `FormBanners.tsx` (the new `not-found` banner, with its link), `EditLoadStates.tsx` (new: the loading, load-failed and not-found blocks of the table above). Small presentational pieces as the builder sees fit.
- `pages/EditServicePage.tsx` (new): reads the id, calls `useService`, picks the state. `App.tsx`: `/services/:serviceId` renders it.
- `features/service-form/service-form.css`: only what the new states need that the file lacks (the board's rules, values copied from `docs/design/service-form.css`).
- `test/fixtures.ts`: only if a helper is missing (a service with headers, rules, certificate options and a body).

## Design reference

Reference only, read-only: `docs/design/service-form.html` (states "Edit service: every saved value shown (HTTP)", "Service not found", "Leave with unsaved changes (proposed)", "Saved" and "Request not accepted / unexpected error") with `docs/design/service-form.css`, and `docs/design/alerts.html` (the "Service not found" block and the "Something went wrong" banner, which the load states copy); `docs/design/README.md` ("Where the boards differ", "Additions that are built"). Copy values and rules from the styles; never copy board markup or component code. Use the existing wrappers; icons from Lucide only. Where the board and the contract disagree the contract wins.

Where this file differs from the board, by decision (the user chose the load states): the board draws the not-found state as a form with a banner; here a `404` on `getService` has no values to show and replaces the page like the alert list, while a `404` on `updateService` keeps the board's banner on the filled form. The loading and the load-failed states are not drawn. The name counter and limit hints are left out as on the Add screen.

Texts copied from the board as written: `Edit service`, the sub line, `This service no longer exists.` with `It was deleted, perhaps in another tab. It can’t be saved.` and `Back to services`. Texts decided here (not drawn): `Loading service…`, the load-failed banner (copied from the alert list: `Something went wrong.`, `The server couldn’t be reached or returned an error.`, `Try again`), the replaced-page block (`This service no longer exists`, `It was deleted, so it can’t be edited.`), and the toast `Service “{name}” saved.`.

## Dependencies

None. `package.json` and the lockfile do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. Mock `getService`, `updateService` and `createService` at the wrapper boundary with value-return spies (keep the real query keys), render with `renderRoutes` and a `ToastProvider`, use `user-event`, and build values with the fixtures (non-default values everywhere).

**`lib/serviceInput.ts`, `lib/formChanged.ts`**

- `toFormValues` of an HTTP service with two headers (an `Authorization` value in full), a query row, a JSON body, a `text` rule and a `false` rule, mode `all`, certificate check on with 30 days, ignore on, non-default timing, alerts off and both messages gives each text as the form holds it (kind `text` with its text, kind `false` with an empty text); of a TCP service gives type `tcp`, host, port as text and the add defaults for the HTTP values; of a service with no `settings` gives the add timing defaults (FR-7, FR-39).
- `toServiceInput(toFormValues(service))` equals the service's `name`, `check`, `settings`, `alerts_enabled` and messages for an HTTP and a TCP service (a round trip, with a rule list, a body, certificate options on; a saved `certificate_check` with `enabled: false` and days is not part of it: the form sends `{ enabled: false }`); the `check` has no key of the other type. A sparse HTTP service (only `type`, `method`, `url`) gives the add defaults for everything else, and a sparse TCP service likewise.
- `isFormChanged`: false for equal values; true for a changed name, type, URL, a method, a row edited, a row added or removed (an empty added row counts), a rule edited, the days `'30 '` against `'30'`, a timing text, the alerts switch, a message, a host, a port; false again when put back; the add defaults against themselves are unchanged, and a typed name against them is changed.

**`useService`, wrappers, `useSaveService`**

- `getService` and `updateService` call `GET` and `PUT` on `/api/services/{id}` with the id encoded (a request test on `apiRequest`).
- `useService`: before an answer `loading`; a 200 `loaded` with the service; a `401 unauthenticated` `session-ended`; `404 not_found` `not-found`; a 500, a network `TypeError` and a `404` with another code or no problem body `could-not-load`; `refetch` after a failure ends `loaded`; the query is not refetched on window focus, and a second mount asks the server again (no cached copy used).
- `useUpdateService`: the request is `updateService` with the path id, the body of `toServiceInput` and `shown_on_public_view` equal to the loaded flag (`true` stays `true`, absent is `false`); a 200 removes the `['services']` list entry (exact) and calls `onSaved`, and leaves the `['services', id]` entry; `404 not_found` is `{ kind: 'not-found' }`; a `409 service_limit_reached` is the generic failure; the other responses map as the Add screen's (the existing `useCreateService` tests pass unchanged, among them: a `404` on create is the generic failure) (FR-7, FR-12, FR-59, NFR-8).

**The page and its states (`EditServicePage` tests, `App.test.tsx`)**

- Loading: the back link, `Edit service` and the status `Loading service…` show, no form and no footer, and `getService` was called with the id from the address.
- Load failed (a 500): the warning banner with `Try again`, no form; the button is disabled while the retry is in flight; a retry answered 200 shows the form (FR-7).
- Not found: a `404 not_found` replaces the page with the block, the `['services']` list entry is removed, there is no back link and no heading, `Back to services` goes to `/`, and `document.activeElement` is the `h2`.
- Session ended: a `401` on `getService` (the mock runs the registered unauthenticated handler before it rejects, as `apiRequest` does; `App.test.tsx` mocks `lib/api/request`, so it calls `registeredHandler()`) renders no banner and no form, and ends on the sign-in form with the session-ended notice.
- Routes: `/services/some-id` shows the page inside the layout instead of the placeholder; `/services/some-id/alerts` and the other routes are unchanged; the signed-out gate still sends `/services/some-id` to the sign-in form; a `401` on `getService` ends on the sign-in form with the session-ended notice and no banner (FR-4).

**The form (`EditServiceForm.test.tsx`, `ServiceForm.test.tsx`)**

- Loaded HTTP service: the heading `Edit service`, the sub line with the saved name, Name focused, and every control at its saved value: type `HTTP(S)`, method, URL, query and header rows (the `Authorization` value visible in an input as typed, FR-39), body type and text, the rule rows and mode, the certificate switch on with its days, the ignore switch, the four timing texts, the alerts switch and both messages; the footer status is empty and no banner shows (FR-7).
- Loaded TCP service: type `TCP port`, host and port at their values, no Request, Health rules or HTTPS group.
- The sub line keeps the loaded name while the Name input is edited.
- Save with nothing changed sends the body of the saved values plus `shown_on_public_view` as loaded (`true` stays `true`; `false` stays `false`); a service that was shown is not hidden by an edit.
- Save after editing the name, a header value, a rule, the days, a timing text and the alerts switch sends each edited value and the rest as loaded; the request goes to the id in the address (FR-7, FR-20, FR-65).
- Change of type: an HTTP service switched to `TCP port` with a host and port typed sends `check: { type: 'tcp', host, port }` and no HTTP key; a TCP service switched to `HTTP(S)` with a URL typed sends the HTTP check (FR-66).
- While saving: the same read-only, disabled and `Saving…` states as the Add form; both footer buttons disabled.
- Success (200): the page is at `/`, the `['services']` list entry is gone, `getService` was called once in all (no refetch after the save), the toast reads `Service “{name}” saved.` with the name of the response (a response name different from the typed one proves the source), and no discard question or unload prompt appeared (FR-7).
- Every failure of the Add screen's failure table, on the edit form (a `422` with the server's own non-default message on a field and in the summary, `409 service_name_taken` under Name, `413`, `403 csrf_failed` with `Reload`, `500` and a network failure with `Try again` that resends the same values); a message with `<b>x</b>` shows as text (NFR-7, NFR-8).
- `404 not_found` on save: the banner `This service no longer exists.` with its text and `Back to services`; `Save service` is disabled; the values stay; focus is on the link; `Back to services` goes to `/` with no discard question even when changed; `Cancel` with a changed form asks.
- `409 service_limit_reached` on save shows the generic banner. After the `404` banner, Enter in the Name field sends nothing, and the `['services']` list entry is gone.
- Leaving: an untouched form leaves by `Cancel`, the back link, the brand link and Back with no question; a changed one asks on each (the guard's behavior on the new form); editing and putting everything back, including a row added and removed, a type switched and switched back, and `'30 '` retyped as `'30'`, leaves with no question; the footer says `Unsaved changes` only while changed (NFR-4).
- A `401` on save while changed ends on the sign-in form with the notice and no dialog and no banner (FR-4).
- A saved name containing `<b>x</b>` shows as text in the sub line and in the Name input (NFR-7).
- The Add form is unchanged: every `AddServiceForm.test.tsx` criterion passes as it is (`leave-prompt-data-router` changed its `setup`; this task changes nothing in it). Its "changed value … clean again when put back" case is the Add-side proof that `isFormChanged` equals the old rule.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

Tests this task changes on purpose: in `App.test.tsx`, `builtRoutes` gains `/services/0190-abc` (so the placeholder test no longer expects its placeholder; `adminRoutes` keeps it, so the signed-out gate test still covers it), and the module mock of `./lib/api/services` gains `getService` and `updateService`; `useLeaveGuard.test.tsx` (the guard takes `changed`; the cases about what makes the form changed move to `formChanged.test.ts`); `useCreateService.test.tsx` (`ServiceFormValues` is imported from `lib/formValues`; no assertion changes); and the typed fixtures `VALUES` and the harness of the guard test. No other assertion is removed or loosened.

## Verifier checks

- **By reading the hooks and libs:** the body is built in one place, `toServiceInput`, for create and update; the update sends `shown_on_public_view` from the loaded service and nothing else beyond what create sends; `toFormValues` and `toServiceInput` are inverses for what the form edits; `isFormChanged` is the only definition of "changed"; the query's state is derived, never copied into component state; the loaded values are read once (`initialValues`), never rewritten by a later answer; classification branches on `ApiError.code` and `status`, never on text.
- **By reading the components:** `ServiceForm` holds no create-only or update-only logic (the wrappers pass what differs); no `dangerouslySetInnerHTML`; the saved name, header values, messages and server messages are React text children; no literal colour or pixel value where a token exists, other than values copied from the design CSS; icons from Lucide only; Base UI only inside `components/ui/`; every string defined once, with the curly quotes and the ellipsis as written; `features/service-form/` imports nothing from `app-shell/` or another feature.
- **Header values:** nothing masks or truncates a header value in the edit form (no `type="password"`, no ellipsis in the value).
- **Contract:** the `200` is typed `Service`; no status or code beyond those in "Operations used"; the `404` on `getService` and on `updateService` are the only 404 handling.
- **Mutation checks to run:** drop `shown_on_public_view` from the update; send the typed values without the id's path; read `initialValues` again after a refetch; compare "changed" against the add defaults on the edit form; mask header values; make a `404` on update the generic failure; enable `Save service` after the `404`; keep a cached service as the form's start; show the form while loading; remove the mounted detail query on success; drop `LEAVE_WITHOUT_ASKING` from the not-found link; map a rule with kind `false` to `text`; leave the TCP values out of `toFormValues`. Each must fail at least one named test.
- **Inputs to try:** a service with 20 headers and 20 query rows, 10 rules, a 64 KB body; a header value with spaces and markup; a saved name with spaces; a TCP service switched to HTTP and back; a service deleted between load and save; a `422` on a field of the other type; saving twice quickly (one request); leaving by every exit after editing and after putting everything back.
- **What the verifier cannot prove:** the layout at 360 px and a real server's answers; say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design board or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a shared component or a `components/ui/` wrapper, an edit to a spec or design file, or a state that is neither drawn on the board nor listed in this file.
- A prerequisite name is missing or differs from "Prerequisite".
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps (the shared libs and the save hook first, then the form split, then the page and its states), push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), that no integration test applies, dependency versions (none changed), and anything you were unsure about. Also list every judgment call this file did not settle, and say that the layout and focus outline were checked by reading the CSS only, not in a browser, unless you ran the app.
