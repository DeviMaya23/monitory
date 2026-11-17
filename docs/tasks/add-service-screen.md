# Task: add service screen

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The admin opens `/services/new` from the dashboard, types a name, picks a method, enters a URL and saves. The service is created through `createService`, the admin returns to the dashboard and a toast says it was added. The screen is the first part of the service form: the name, the method and the URL of an HTTP(S) check, and every way saving can fail. Everything else in the board's form (the type switch, query parameters, headers, body, rules, certificate options, timing, alerts, messages, the public-page switch and the test panel) comes with the milestone 2 and 3 tasks, and a service saved here gets the server's defaults for all of it.

Requirements covered:

- FR-6: the admin adds a service by name and an HTTP(S) address; it appears on the dashboard.
- FR-12, in part: an invalid value is refused, the server's message is shown on its field and nothing is saved.
- FR-59, in part: a name already used (ignoring case) is refused with a message on the Name field.
- FR-60, in part: the refusal at the service limit is a banner, and what was typed stays.
- FR-74, in part: the `422` field errors of the three fields on this screen (`name`, `check.method`, `check.url`) are shown on their fields; errors for other paths are listed in the summary only.
- FR-36, in part: the method is chosen from the nine the contract allows, `GET` by default.
- NFR-4, in part: the form works from the keyboard; focus goes where the outcome is.
- NFR-7: the typed name and URL, and the name in the success toast, are shown as text.
- NFR-8: a `403 csrf_failed` offers a reload.

Out of scope:

- The type switch and every TCP field, query parameters, headers, body, health rules, certificate options, timing, alerts, messages, the public-page switch, and the test panel with "Run test" (FR-33 to FR-50, FR-56, FR-57, FR-65, FR-68, FR-104 to FR-106, and the `check_budget_exceeded` and `requires_https_url` field errors). The milestone 2 and 3 form tasks (backlog). A service saved here is HTTP and gets the contract's defaults, so none of these errors can occur.
- The Edit screen at `/services/:serviceId`. It keeps its `NotBuilt` placeholder. The edit task reuses this feature.
- The "Discard unsaved changes?" prompt on the top-bar brand link, the browser's Back and Forward, and Sign out. Blocking in-app navigation needs react-router's `useBlocker`, which needs a data router; the app uses `BrowserRouter`. By the user's decision this task builds the prompt for the form's own exits only (see "Behavior") and leaves the rest as a known gap.
- The "session expired" banner of the board ("Taking you to sign-in…"). A `401` is handled by the shell, which replaces the page with the sign-in form at once; there is nothing to show first (see "Known gaps").
- The name counter and the length hints (the limits are deployment configuration, `docs/design/README.md`).
- Any change to `createService` on the server, and every other screen.
- End-to-end tests. The milestone's last task writes them.

## Prerequisite

`dashboard-screen` is merged, with its fix round. The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `components/ui/Toast.tsx` and `useToast`, with `show({ kind: 'success', message })`, and `ToastProvider` mounted above the session provider in `App.tsx`, so a toast outlives a route change.
- `frontend/src/lib/api/services.ts` with the exported types `Service` and `ServiceList`, and `frontend/src/test/fixtures.ts` with a typed builder for a `Service`.
- The dashboard route at `/` and `features/service-list/hooks/useServiceList.ts`, which exports `SERVICES_KEY` (`['services']`). `SessionProvider.test.tsx` and `App.test.tsx` use the literal `['services']`.
- `components/ui/Dialog.tsx` and the `.select-trigger`, `.banner`, `.error-text`, `.field`, `.input` and menu rules in `styles/components.css` (they exist).

`@base-ui/react` 1.9.0 (with its Select), `react-hook-form` 7.92.0, `@tanstack/react-query` 5.107.1, `react-router` 8.5.1 and `lucide-react` 1.73.0 are installed. `package.json` and the lockfile do not change.

## Role and ownership

Role: Frontend.

You may change `frontend/src/**`, with the files named under "Structure". You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `frontend/src/main.tsx`, `frontend/src/lib/api/request.ts`, `backend/**`, `docs/**` (except your own plan file, `docs/tasks/add-service-screen.plan.md`), or anything outside `frontend/src/`.

Shared files this task touches, all owned by this task while it runs:

- `frontend/src/App.tsx` and `frontend/src/App.test.tsx` (the `/services/new` route)
- `frontend/src/lib/api/services.ts` (adds `createService` and the shared query key)
- `frontend/src/test/fixtures.ts` (extends `problem`, adds what the tests need)
- `frontend/src/features/service-list/hooks/useServiceList.ts` (uses the shared key instead of its own `SERVICES_KEY`; the one edit this task makes inside `service-list`)
- `frontend/src/test/setup.ts`: only if Base UI's Select needs a jsdom polyfill the tests lack (state it in the plan)

Tasks that may run at the same time: none in the frontend. The backend task `scheduler` runs beside it and touches only `backend/`. `delete-service-dialog` waits for this one. Branch from the current default branch on GitHub (`origin/main`), which has `dashboard-screen` (#7) and `check-sequence-and-state` (#8); a stale local checkout would fail the Prerequisite check.

## Operations used

From `docs/openapi.yaml`. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this screen handles |
|---|---|---|
| `createService` | `POST /api/services` | 201 `Service`; 422 `validation_failed` with `errors[]` (`field`, `code`, `message`); 409 `service_name_taken` and `service_limit_reached`; 413 `payload_too_large`; 403 `csrf_failed`; 401 `unauthenticated` (left to the shell); 400, 415, 500 and a network failure as the generic failure |

The request body is `ServiceInput` with only `name` and `check` set: `check` is `{ "type": "http", "method": <chosen>, "url": <typed> }`. `settings`, `alerts_enabled`, `unhealthy_message`, `recovery_message` and `shown_on_public_view` are left out, so the server's defaults apply. The name and URL are sent as typed; the server trims them. The CSRF token is added by `apiRequest`. The server is real on `main` (`create-service-api` is merged).

## Behavior

### What exists

- `App.tsx` renders `<NotBuilt page="add service" />` at `/services/new`, inside `AdminLayout` (the gate and the top bar). This task replaces that one placeholder.
- `apiRequest` throws `ApiError` (with `status`, `code` and `problem`, whose `errors` hold the field errors) for a non-2xx response, and on `401 unauthenticated` calls the handler the session provider registered before it throws; the provider then ends the session, removes every cached query except the session and shows the sign-in notice.
- The dashboard has two `Add service` links to `/services/new`.
- `styles/components.css` has `.field`, `.label`, `.hint`, `.input`, `.select-trigger`, `.error-text`, `.banner*`, `.btn*`, `.spinner` and the menu popup rules. `service-form.css` rules (`.back-link`, `.page-head`, `.form-layout`, `.form-main`, `.form-banners`, `.group`, `.grid`, `.url-row`, `.form-foot*`) are not in the project yet.
- `components/ui/` has `Dialog`, `Switch` and `Toast`; there is no Select wrapper.

### The page

`<main class="page">`: a back link, the heading, the form, and the sticky footer. The layout is one column (the board's test panel is not built, so the form takes the full width of the form column).

- **Back link**: `Services`, with the Lucide `ArrowLeft` icon, to `/`.
- **Heading**: `h1` `Add service`.
- **Group `Service`**: a field `Name` (a text input, placeholder `e.g. API gateway`, no `maxlength`, no counter). Focus starts here. The board's `Type` control is not drawn (see "Known gaps").
- **Group `Request`**: a `Method` field (the Select wrapper below, default `GET`, the nine methods in the order `GET`, `HEAD`, `POST`, `PUT`, `DELETE`, `CONNECT`, `OPTIONS`, `TRACE`, `PATCH`) and a `URL` field (a `type="url"` input, as the board draws it, in the mono style, placeholder `https://`; the browser strips spaces around the value of a `url` input, so the URL is sent as the input holds it and a URL of only spaces is an empty one) with the hint `Starts with http:// or https://.` (the board's second sentence about query parameters is left out; they are not on this screen).
- **Footer** (`form-foot`, sticky to the bottom of the window): a status text on the left (`aria-live="polite"`), `Cancel` and `Save service` (the primary button) on the right. Enter in either single-line field submits the form. The form has `noValidate`.

The `Method` select and the `URL` input sit in one row on a wide screen (`url-row`) and stack at 360 px, as the board does.

### Submitting

1. **Client checks**, before any request, and only these two (`CONVENTIONS.md`, Forms): the name has at least one character that is not a space, and the URL has at least one character that is not a space. Each failure shows under its field (`.error-text` with the `CircleAlert` icon, the input `aria-invalid="true"` and `aria-describedby` pointing at it): `Enter a name.` and `Enter a URL.`. Both are shown at once; focus goes to the first invalid field; nothing is sent. The error clears when that field is edited. No summary is shown for these.
2. **Saving**: any banner, field error and summary from an earlier attempt is cleared when the request starts. `Save service` shows the spinner (`LoaderCircle`, class `spinner`), reads `Saving…` as the board draws it, and has `aria-busy="true"`; both footer buttons are disabled; the footer status reads `Saving…`; the two inputs are `readOnly` and the method select is disabled, so what is saved is what is on screen. The request is sent once per submit; a second submit while one is in flight is not possible (the button is disabled; Enter does nothing while saving).
3. **Success (201)**: the cached list is removed from the query cache (`removeQueries` on the shared `['services']` key), so that the dashboard, which is not mounted on this page, shows its Loading state and then the fresh list rather than a stale list or the "No services yet" block. A success toast `Service “{name}” added.` is shown with `{name}` the `name` in the 201 body (so the server's trimmed name, not the typed one), and the page navigates to `/`. The discard prompt and the browser's unload prompt do not appear. The curly quotes are as written. The cache is cleared on every 201, even when the admin has left the page meanwhile; the toast and the navigation happen only if the form is still on screen.

### Failures

Each failure ends the saving state: the buttons are enabled again, the inputs are editable, the typed values stay. Where the table says focus "stays on `Save service`", the form puts focus on that button explicitly once it is enabled again (it lost focus when it was disabled).

The 409 name-taken message is not a `422` error: it is its own outcome, held by the form beside the field errors (not in the summary), shown under Name, and cleared when the name is edited or a new submit starts. A new submit clears every banner, field error and summary before the client checks run, so an earlier server message never outlives the next attempt.

| Response | What is shown | Focus |
|---|---|---|
| `422 validation_failed` | A summary banner (error style, `role="alert"`) above the form, and each error on its field | The summary |
| `409 service_name_taken` | On the Name field, `Another service already uses this name (names ignore case).` (the board's wording; the contract gives no `message` for a 409). No summary | The Name input |
| `409 service_limit_reached` | Error banner, title `Service limit reached.`, text `This install can’t hold more services. Delete one to add this one.`, and a link `Back to services` to `/` (it is a link, not a button, and goes without the discard prompt) | Stays on `Save service` |
| `413 payload_too_large` | Error banner, title `The service is too large to save.`, text `Together its fields are over 1 MB. Shorten the name or the URL.` (the board names the body and headers, which are not on this screen) | Stays on `Save service` |
| `403 csrf_failed` | Error banner, title `The request wasn’t accepted.`, text `Reload the page and try again.`, and a `Reload` button (with the `RefreshCw` icon) that calls `window.location.reload()` | Stays on `Save service` |
| `400`, `415`, `500`, any other status, and a network failure | Error banner, title `Something went wrong.`, text `The server couldn’t be reached or returned an error. Your values are still here.`, and a `Try again` button (`RefreshCw` icon, the board's label) that submits the form again with the values as they are | Stays on `Save service` |
| `401 unauthenticated` | Nothing on this screen: the shell ends the session and shows the sign-in form | n/a |

A banner is replaced, not stacked, when a later attempt fails differently; a new submit clears it first. The banners are in one container with `aria-live="polite"`, and each banner has `role="alert"`, as the board has it.

**The `422` summary and the field errors.** The contract's `errors[]` hold `field`, `code` and `message`. The field shows the server's `message` as it is (`docs/design/README.md`: the board's fixed wording per code is not used). The summary title is `{n} fields need fixing before this can be saved.` (`1 field needs fixing before this can be saved.` for one), followed by a list with one entry per error, `{Label}: {message}`, in the order the server sent them. An entry for a field on this screen is a link; activating it moves focus to that input (or the method trigger). Mapping:

| Server `field` | Label | Where it shows |
|---|---|---|
| `name` | `Name` | under the Name input |
| `check.method` | `Method` | under the Method select |
| `check.url` | `URL` | under the URL input |
| any other path (for example `settings`, `check.type`, `check.headers[0].value`) | the path as the server sent it | in the summary only, as plain text without a link, because there is no field for it here; this cannot happen with the request this screen sends and is a guard |

If a path appears twice, each error is listed, and the field shows the first one. The summary does not list client-side errors. Editing a field clears that field's error and removes its entry from the summary and updates the count; when the last entry is gone, the summary is removed. Choosing another method clears the Method error. A banner of another kind is not affected by editing.

### Leaving the form

The form is **changed** when the name is not empty or the URL is not empty or the method is not `GET`. The name is compared as typed, without trimming (a name of only spaces counts as changed); the URL is compared as the input holds it.

- `Cancel` and the back link go to `/` at once when the form is not changed. When it is changed, they open the dialog (`components/ui/Dialog`): title `Discard unsaved changes?`, text `The changes to this service will be lost.`, buttons `Keep editing` (focused first, closes the dialog) and `Discard changes` (the primary-danger style the board shows; goes to `/`). Esc and a click on the backdrop do what `Keep editing` does. Focus returns to what opened the dialog.
- While the form is changed, and not while a request is in flight or after a success, the browser's own unload prompt is armed (closing or reloading the tab). The prompt is the browser's text; this task writes none.
- While saving, `Cancel` is disabled. The back link still works, and goes to `/` at once with no dialog (the form is saving; the request is not cancelled, and on a 201 the cache is cleared but no toast or navigation follows, see "Submitting").
- Esc on the form (outside the dialog) does nothing. The board lists Esc among the exits that open the prompt; it is not built (a gap below).
- The footer status reads `Unsaved changes` while the form is changed and not saving, and is empty otherwise.

### Keyboard and focus

Tab order: the brand link, Sign out, the back link, Name, Method, URL, Cancel, Save service. Every control shows the shared focus outline. The method select opens and moves with the arrow keys, and Enter or Space picks, as Base UI's Select does. The `422` summary is focusable (`tabindex="-1"`) so focus can be moved to it.

### The Select wrapper

`components/ui/Select.tsx` over Base UI's Select, the only file that imports it. The user approved this new shared component with this task. Props: an id, a visible `label` (the text of a `<label>`, as the board has it), the current `value`, `onValueChange`, a list of `{ value, label }` options, `disabled`, `invalid` (sets `aria-invalid` and the invalid style), and `aria-describedby`. The visible label names the trigger: if a `<label for>` does not do that with Base UI's trigger, use `aria-labelledby` on it (the test below decides). The trigger uses the `.select-trigger` rules and the Lucide `ChevronDown` icon; the popup uses the menu popup rules; the selected item shows a `Check` icon. Text is rendered as text. It has no behavior beyond Base UI's.

### Known gaps

- **No type control and no TCP fields.** The board draws `Type` (HTTP(S) or TCP port) and says changing it swaps the fields. A control that does nothing is not drawn (the same rule as the dashboard); the type switch comes with the TCP form task (backlog).
- **No test panel.** The board keeps "Test check" beside the form on desktop. It comes with `testServiceCheck`.
- **The discard dialog is the plain `Dialog` wrapper** (role `dialog`, no description link), not the board's alert dialog with a described body. The text sits in the dialog body. Extending the wrapper is left to the delete dialog task, which needs an alert dialog.
- **The prompt covers only the form's own exits.** The brand link, browser Back and Forward and Sign out leave a changed form without asking. Closing the tab or reloading it is covered by the browser's prompt. Tracked in the backlog.
- **A session that ends while saving** loses the typed values (the board's open question 5 is not built, `docs/design/README.md`), and no "Your session has ended" banner shows first.
- **The `422` field errors for anything but name, method and URL** cannot occur from this screen and are only listed in the summary.
- **A request that completes after the admin has left the page** still creates the service; the toast and navigation do not happen if the page is gone.

## Structure

By `ARCHITECTURE.md`; follow the sign-in feature as the example (a form component, a hook for the submit, a stylesheet). Names marked "new" are fixed by this file; others are the builder's choice.

- `frontend/src/lib/api/services.ts`: add `createService(input)` over `apiRequest('POST', '/api/services', input)`, typed with the generated `ServiceInput` and `Service`, and the query key as `servicesQueryKey` (`['services'] as const`, the same value). Change `features/service-list/hooks/useServiceList.ts` to use it and remove its own export `SERVICES_KEY` (nothing else imports it), so the two features share one key and neither imports the other. The value must stay `['services']`: `SessionProvider` clears the cache with the literal.
- `frontend/src/features/service-form/` (new feature, routes `/services/new` now and `/services/:serviceId` later):
  - `hooks/useCreateService.ts` (new) with a colocated test: the submit, the saving flag, and the outcome of each response in the "Failures" table as a value (a discriminated union such as `{ kind: 'field-errors', errors } | { kind: 'name-taken' } | { kind: 'limit' } | { kind: 'too-large' } | { kind: 'csrf' } | { kind: 'unexpected' }`, a new object for every failure), plus success handling (invalidate, toast, navigate) through callbacks or the router hooks. One concern: sending the request and classifying the result.
  - `hooks/useServerErrors.ts` (new) with a colocated test: holds the server's field errors, gives the error of a field, clears one field's error when it is edited, and gives the summary entries and count. One concern: the `422` state.
  - `hooks/useLeaveGuard.ts` (new) with a colocated test: whether the form is changed, the open state of the discard dialog, the handlers for Cancel and the back link, and the unload prompt. The unload listener is tested through a small harness component with `render()`, not `renderHook` (`CONVENTIONS.md`).
  - Forms use react-hook-form (`CONVENTIONS.md`): `register` for the two text inputs, `Controller` for the method select, `watch` for the values the "changed" rule reads. The server's errors are not put into react-hook-form's error state; `useServerErrors` and the 409 outcome own them.
  - `components/AddServiceForm.tsx` (new), `components/ErrorSummary.tsx` (new), `components/FormBanners.tsx` (new, the banners of the failures table), `components/DiscardDialog.tsx` (new, feature-owned, over the `Dialog` wrapper). Small presentational pieces as the builder sees fit.
  - `lib/fieldLabels.ts` (new) with a test: a pure function from a server `field` path to `{ label, target }` (`name`, `check.method`, `check.url` or no target), and the wording of the summary title. The only place the labels live.
  - `service-form.css` (new), imported by the feature's top component: the form rules copied from `docs/design/service-form.css` (values and rules only): `.back-link`, `.page-head*`, `.form-layout`, `.form-main`, `.form-banners`, `.group*`, `.grid`, `.url-row`, `.form-foot*` and their narrow-screen rules. Leave out the test panel, rows, segmented-control and counter rules.
- `frontend/src/components/ui/Select.tsx` (new) with a colocated test.
- `frontend/src/pages/AddServicePage.tsx` (new): the thin route entry.
- `frontend/src/App.tsx`: `/services/new` renders `AddServicePage`; `/services/:serviceId` and the rest keep their placeholders.
- `frontend/src/test/fixtures.ts`: extend `problem(status, code, detail?)` with an optional `errors` argument (typed `FieldError[]` from the generated types) so a test can build a `422` with field errors, keeping its current calls working; add whatever else the tests need beyond `makeService`, typed with the generated types.

## Design reference

Reference only, read-only: `docs/design/service-form.html` (states: Add service idle, Saving, Field errors from the server, Name already used, Service limit reached, Request too large, Request not accepted / unexpected error, Leave with unsaved changes) and `docs/design/service-form.css`; `docs/design/README.md` for where the boards differ from what is built (the server's `message` on a field; the field paths `check.url`, `check.method`; no name counter; the discard dialog is built). Copy values and rules from the styles into the project's CSS; never copy board markup or component code. Use the `components/ui/` wrappers; icons from Lucide only. Where the board and the contract disagree the contract wins.

Where this file differs from the board, by decision: no `Type` control, no test panel, no hints that mention query parameters, the 413 banner text names the name and the URL, the generic failure's button is `Try again` as the board has it and resubmits, no `Type` control, and the discard dialog is the plain `Dialog` wrapper. The wording that the board draws and this file copies: `Another service already uses this name (names ignore case).`, `Service limit reached.` with its second line and `Back to services`, `The service is too large to save.` (first line), `The request wasn’t accepted.` with `Reload the page and try again.`, `Something went wrong.` with its second line and `Try again`, `Saving…` (footer status and the button while saving), `Unsaved changes`, `Discard unsaved changes?` with its text and buttons. The texts this file adds, decided here: `Enter a name.`, `Enter a URL.`, `Service “{name}” added.`, the summary title and its singular, and the 413 second line.

## Dependencies

None. `package.json` and the lockfile do not change. Check that every Lucide icon named above (`ArrowLeft`, `CircleAlert`, `LoaderCircle`, `RefreshCw`, `ChevronDown`, `Check`) exists in 1.73.0 under that name; if one does not, use the closest and say so in the plan.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. Mock `createService` at the wrapper boundary with value-return spies, typed with the generated types through the fixtures; reject with `ApiError` built by the `problem` helper in `fixtures.ts`. Render with a memory router and `ToastProvider`, with a marker route at `/`. Use `user-event` (no fake timers are needed).

**Field labels (`lib/fieldLabels.test.ts`)**

- `name`, `check.method` and `check.url` map to `Name`, `Method` and `URL` with their targets; `settings` and `check.headers[2].value` map to themselves with no target; the summary title is `4 fields need fixing before this can be saved.` for four and `1 field needs fixing before this can be saved.` for one (FR-12).

**Select (`components/ui/Select.test.tsx`)**

- The trigger shows the current option's label; opening it lists every option; picking one calls `onValueChange` with its value; the arrow keys and Enter pick one; `disabled` blocks opening; `invalid` sets `aria-invalid`; the label names the trigger.

**`useCreateService` (`hooks/useCreateService.test.tsx`)**

- A 201 resolves as success with the returned service; the request carries exactly `name`, `check.type` `http`, `check.method` and `check.url` and no other property (so every default stays the server's) (FR-6).
- Each response of the "Failures" table maps to its outcome: 422 with two errors keeps both in order; 409 `service_name_taken`; 409 `service_limit_reached`; 413; 403 `csrf_failed`; 400, 415, 500 and a network failure to the generic one; the same failure twice in a row is still a new outcome (FR-12, FR-59, FR-60, NFR-8).
- The saving flag is true while the request is in flight and false after each outcome; calling submit again while saving sends nothing.
- A 401 that the shell handles shows no outcome of its own (the mock runs the registered handler before rejecting, as `apiRequest` does).

**`useServerErrors` (`hooks/useServerErrors.test.tsx`)**

- The error of `check.url` is returned for the URL field and not for the others; clearing a field removes only its error and its summary entry, and the count follows; clearing the last one empties the summary; a second error for one path keeps the first on the field and both in the summary; a path with no field is in the summary with no target.

**`useLeaveGuard` (`hooks/useLeaveGuard.test.tsx`)**

- The form is not changed with empty name and URL and method `GET`; it is changed by a name, by a URL, or by another method; a name of only spaces counts as changed (compared as typed); a URL is compared as the input holds it.
- Cancel on a pristine form goes on at once and opens no dialog; on a changed form it opens the dialog and does not go on; `Keep editing` closes it and stays; `Discard changes` goes on.
- The unload prompt is armed only while the form is changed and not saving and not after a success (a harness test dispatches `beforeunload` and checks `defaultPrevented`), and is removed on unmount.

**The screen (`components/AddServiceForm.test.tsx` and `App.test.tsx`)**

- Idle: heading `Add service`, back link `Services` to `/`, Name focused, Method shows `GET`, URL has the placeholder `https://`, the hint, `Cancel` and `Save service` enabled, an empty status, no banner, no counter, no `Type` control.
- Saving a valid form: the request has the typed name (with its spaces) and the URL as the input holds it, while it is in flight the primary button reads `Saving…` with `aria-busy="true"` and the spinner, both buttons are disabled, the footer says `Saving…`, the inputs are read-only and the select is disabled; after the 201 the page is at `/`, the `['services']` cache entry is gone (a query client pre-filled with a list shows no entry after the 201), the toast reads `Service “{name}” added.` with the name of the response (a response name different from the typed one proves the source), and no discard dialog or unload prompt appeared (FR-6, FR-12).
- The method select lists exactly `GET`, `HEAD`, `POST`, `PUT`, `DELETE`, `CONNECT`, `OPTIONS`, `TRACE`, `PATCH` in that order; choosing `PATCH` sends `PATCH`; the default sends `GET` (FR-36).
- Enter in the Name field and in the URL field submits the form once; Enter does nothing, and sends nothing, while a request is in flight; a double click on `Save service` sends one request (NFR-4).
- Client checks: an empty name, and a name of only spaces, show `Enter a name.`; an empty URL, and a URL typed as only spaces (which the `url` input holds as empty), show `Enter a URL.`; both at once focus Name; nothing is sent; editing the field clears its error; a URL that is not http(s) is not checked on the client and is sent (the server refuses it).
- 422 with errors on `name`, `check.url` and `check.method`, with the server's own `message` text on each field (non-default text, so a hardcoded wording fails): each field shows its message with `aria-invalid="true"` and `aria-describedby`; the summary shows `3 fields need fixing before this can be saved.` with three entries in the order given; the summary has focus; an entry's link moves focus to its input, and for the method to its trigger; editing the URL removes its error and entry and the title becomes `2 fields…`; editing the last two removes the summary (FR-12, FR-74, NFR-4).
- 422 for an unmapped path (`settings`): listed in the summary as plain text with no link, and no field shows an error.
- 409 `service_name_taken`: the text `Another service already uses this name (names ignore case).` under Name, Name focused, no summary and no banner, the typed values kept, the buttons enabled; editing the name clears it (FR-59).
- 409 `service_limit_reached`: the banner with both lines and a `Back to services` link to `/` that goes without a dialog even with the form changed; the typed values stay; no field error (FR-60).
- 413: the banner with the title and the second line as written; the values stay.
- 403 `csrf_failed`: the banner with `Reload`; clicking it calls `window.location.reload` once (the test replaces `window.location` with an object that has a `reload` spy and restores it after); the values stay (NFR-8).
- 500, and a network failure: the generic banner; `Try again` sends the same values again and a success then navigates; the banner is gone when the retry starts.
- A new submit clears the previous banner, field errors and summary before the request goes.
- A 401 `unauthenticated` ends on the sign-in form with the session-ended notice (the mock runs the registered handler before rejecting) and shows no banner (FR-4).
- Leaving: `Cancel` and the back link with an untouched form go to `/` with no dialog; with a typed name they open `Discard unsaved changes?` with `Keep editing` focused; `Keep editing` and Esc close it and keep the values; `Discard changes` goes to `/`; the footer reads `Unsaved changes` while changed and not saving; `Cancel` is disabled while saving.
- A name containing `<b>x</b>` typed into the form, and returned in the 201 body, shows as text in the toast (NFR-7).
- Focus after a failure: after a 403, a 413, a 409 limit and a generic failure the `Save service` button has focus (also when Enter in a field submitted it); after a 409 name error the Name input has focus; after a 422 the summary has focus.
- Leaving while saving: the back link goes to `/` at once with no dialog; when the request then answers 201 the `['services']` cache entry is gone and no toast is shown (a 201 after the form is on screen shows it).
- A server message that contains `<b>x</b>` (a 422 message, shown on the field and in the summary) renders as text (NFR-7).
- With the real dashboard route in `App.test.tsx` (`listServices` mocked to return the new service after the 201): submitting a valid form ends with the toast and the dashboard showing the new service's row (FR-6).
- Routes: `/services/new` shows the form inside the layout; `/services/some-id` and the other routes still show their placeholders; the signed-out gate still sends `/services/new` to the sign-in form (FR-4).

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

Tests this task changes on purpose: in `App.test.tsx`, one table, `adminRoutes`, feeds both the signed-in placeholder test (filtered to leave out `/`) and the signed-out gate test. The signed-in test also leaves out `/services/new` (its placeholder is gone, and the new criterion above replaces it), while the signed-out gate test keeps `/services/new` in its table, so a second filter or a separate list is needed; the gate assertion is unchanged. No other assertion is removed or loosened.

## Verifier checks

- **By reading the hooks:** the request is built only from `name`, the method and the URL; server data is not copied into component state (the 422 errors live in `useServerErrors` as the outcome of the last request, and clearing is by field); the outcome classifier branches on `ApiError.code` and `status`, never on text.
- **By reading the components:** no `dangerouslySetInnerHTML`; the name and URL, the server's messages and the toast name are React text children; no literal colour and no pixel value in `service-form.css` where a token exists, other than values copied from `docs/design/service-form.css`; only `components/ui/Select.tsx` imports the Base UI Select and only `components/ui/Dialog.tsx` imports its Dialog; no hand-written select, dialog or toast; icons from Lucide only.
- **Wording, by reading:** every string in the Failures table, the leave dialog and the toast appears exactly once, in the component or constant that owns it, with the curly quotes and the ellipsis as written. Field messages come from the server, never from a table in the client.
- **No dead controls:** the page has no `Type` control, no test button, no rows, no counter and no switch.
- **Layering:** `features/service-form/` imports nothing from `app-shell/` or another feature; the query key is shared through `lib/api/services.ts`; `useServiceList.ts` changed only in its use of the shared key, if at all.
- **Keyboard, by reading the DOM order and CSS:** Tab order as written; the summary has `tabindex="-1"`; read-only inputs are still focusable and `disabled` buttons are skipped; the dialog's first focus is `Keep editing`, and focus returns to Cancel or the back link on close.
- **Layout, by reading the CSS (jsdom cannot prove it):** the footer is sticky; at 360 px the method and URL stack and the footer buttons share the row and the status takes the full width, as the board's narrow rules do.
- **Inputs to try:** a 3,000-character URL pasted in (server answers 422 `too_long`, shown on the URL); a name with leading and trailing spaces (the 201 body's trimmed name is in the toast); a double-click on `Save service` and a double Enter (one request); a 422 followed by a successful retry; a 409 name error then a 403; leaving with only the method changed; the back link while saving.
- **Contract:** the 201 is typed `Service`; no field is assumed; the 422 `errors[].field` paths the screen maps are the ones the contract lists (`check.url`, `check.method`, `name`).

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the board or this file conflict with each other.
- You think you need a change outside your paths, a dependency, or an edit to a spec file. In particular, if a prerequisite name is missing, or the shared query key cannot be shared without changing more of `service-list` than the one use.
- A state this file does not list seems to be needed (a banner, a field error, a dialog): the board and `docs/design/README.md` list what is built, and anything else is not built.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), that no integration test applies, dependency versions (none changed), and anything you were unsure about. Also list every judgment call this file did not settle, and say that the layout, the sticky footer and the focus outline were checked by reading the CSS only, not in a browser, unless you ran the app.
