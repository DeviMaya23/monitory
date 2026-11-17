# Plan: add service screen

Branch: `feat/add-service-screen`. Role: Frontend (`frontend/src/**` only, and this plan).

Prerequisites checked on the branch's base (`origin/main`): `Toast.tsx` with `useToast` and `ToastProvider` above the session provider, `lib/api/services.ts` with `Service` and `ServiceList`, `test/fixtures.ts` with `makeService`, the dashboard route and `useServiceList.ts` exporting `SERVICES_KEY`, `Dialog.tsx`, and the `.select-trigger`, `.banner`, `.error-text`, `.field`, `.input` and menu rules. All present. The six Lucide icons named in the task exist in 1.73.0.

One item per acceptance criterion. Ticked when done and passing.

## Blocked: one "Stop and ask" condition applies to one item

- [ ] `useServiceList.ts` uses `servicesQueryKey` from `lib/api/services.ts` and drops its own `SERVICES_KEY`. **Not done, by the task's stop rule** ("the shared query key cannot be shared without changing more of `service-list` than the one use"). With the one edit made, `features/service-list/hooks/useServiceList.test.tsx` ("moves with the constant") fails: its `vi.doMock('../../../lib/api/services', () => ({ listServices }))` factory has no `servicesQueryKey`, so the hook throws on reading it. Making it pass needs a second edit inside `service-list` (that test's mock factory), which the task does not allow. Tried on this branch and reverted. What is done instead: `servicesQueryKey` is exported from `lib/api/services.ts` and `service-form` uses it; `useServiceList.ts` is untouched and keeps `SERVICES_KEY`, which has the same value `['services']`. See "Judgment calls".

## Field labels: `features/service-form/lib/fieldLabels.ts`, test `fieldLabels.test.ts`

- [x] `name`, `check.method`, `check.url` map to `Name`, `Method`, `URL` with targets; `settings` and `check.headers[2].value` map to themselves with no target; summary title for four and for one (FR-12)

## Select: `components/ui/Select.tsx`, test `Select.test.tsx`

- [x] Trigger shows the current label; opening lists every option; picking calls `onValueChange`; arrow keys and Enter pick; `disabled` blocks opening; `invalid` sets `aria-invalid`; the label names the trigger

## `useCreateService`: `features/service-form/hooks/useCreateService.ts`, test `useCreateService.test.tsx`

- [x] 201 is a success with the returned service; the request carries exactly `name`, `check.type` `http`, `check.method`, `check.url` (FR-6)
- [x] Each response of the Failures table maps to its outcome; 422 keeps two errors in order; the same failure twice is a new outcome (FR-12, FR-59, FR-60, NFR-8)
- [x] Saving flag true in flight and false after each outcome; a second submit while saving sends nothing
- [x] A 401 the shell handles gives no outcome

## `useServerErrors`: `features/service-form/hooks/useServerErrors.ts`, test `useServerErrors.test.tsx`

- [x] Error of `check.url` only on URL; clearing a field removes only its error and entry, count follows; clearing the last empties the summary; a second error on a path keeps the first on the field and both in the summary; an unmapped path is in the summary with no target

## `useLeaveGuard`: `features/service-form/hooks/useLeaveGuard.ts`, test `useLeaveGuard.test.tsx`

- [x] Changed rule: pristine; by name, by URL, by method; a name of only spaces; URL as the input holds it
- [x] Cancel pristine goes on with no dialog; changed opens the dialog and stays; `Keep editing` closes and stays; `Discard changes` goes on
- [x] Unload prompt armed only while changed, not saving, not after a success; removed on unmount (harness component, `beforeunload` and `defaultPrevented`)

## The screen: `features/service-form/components/AddServiceForm.tsx`, tests `AddServiceForm.test.tsx` and `App.test.tsx`

- [x] Idle state — `AddServiceForm.test.tsx`
- [x] Saving a valid form, then the 201: at `/`, cache entry gone, toast with the response's name, no dialog or unload prompt (FR-6, FR-12) — `AddServiceForm.test.tsx`
- [x] Method select lists the nine in order; `PATCH` sends `PATCH`; default sends `GET` (FR-36) — `AddServiceForm.test.tsx`
- [x] Enter in Name and in URL submits once; Enter while in flight sends nothing; a double click sends one request (NFR-4) — `AddServiceForm.test.tsx`
- [x] Client checks: `Enter a name.`, `Enter a URL.`, both at once focus Name, nothing sent, editing clears, a non-http(s) URL is sent — `AddServiceForm.test.tsx`
- [x] 422 on `name`, `check.url`, `check.method`: messages, `aria-invalid`, `aria-describedby`, summary title and order, summary focused, links move focus, editing removes entries and then the summary (FR-12, FR-74, NFR-4) — `AddServiceForm.test.tsx`
- [x] 422 for `settings`: plain text in the summary, no field error — `AddServiceForm.test.tsx`
- [x] 409 `service_name_taken`: text under Name, Name focused, no summary or banner, values kept, buttons enabled, editing clears (FR-59) — `AddServiceForm.test.tsx`
- [x] 409 `service_limit_reached`: banner, both lines, `Back to services` to `/` with no dialog, values stay, no field error (FR-60) — `AddServiceForm.test.tsx`
- [x] 413: banner title and second line; values stay — `AddServiceForm.test.tsx`
- [x] 403 `csrf_failed`: banner with `Reload`, `window.location.reload` once; values stay (NFR-8) — `AddServiceForm.test.tsx`
- [x] 500 and a network failure: generic banner; `Try again` resends the same values, success navigates; banner gone when the retry starts — `AddServiceForm.test.tsx`
- [x] A new submit clears the previous banner, field errors and summary before the request goes — `AddServiceForm.test.tsx`
- [x] 401 `unauthenticated` ends on the sign-in form with the notice and no banner (FR-4) — `App.test.tsx`
- [x] Leaving: Cancel and the back link, pristine and changed; dialog with `Keep editing` focused; `Keep editing` and Esc; `Discard changes`; `Unsaved changes` status; Cancel disabled while saving — `AddServiceForm.test.tsx`
- [x] A name with `<b>x</b>` shows as text in the toast (NFR-7) — `AddServiceForm.test.tsx`
- [x] Focus after a failure: `Save service` after 403, 413, 409 limit and generic (also by Enter); Name after 409 name; summary after 422 — `AddServiceForm.test.tsx`
- [x] Leaving while saving: back link goes to `/` at once, no dialog; the later 201 removes the cache entry and shows no toast — `AddServiceForm.test.tsx`
- [x] A 422 message with `<b>x</b>` renders as text on the field and in the summary (NFR-7) — `AddServiceForm.test.tsx`
- [x] With the real dashboard: a valid submit ends with the toast and the new service's row (FR-6) — `App.test.tsx`
- [x] Routes: `/services/new` shows the form in the layout; `/services/some-id` and the others keep placeholders; the signed-out gate still covers `/services/new` (FR-4) — `App.test.tsx`

## Repo-wide

- [x] `make check` passes: run, passed (271 frontend tests, the Go tests, lint, contract lint, build)
- [x] Nothing outside the allowed paths changed; `package.json` and `package-lock.json` unchanged. Two things to know: `frontend/src/styles/components.css` gained one rule (`.menu-layer`, see "Judgment calls"), and `useServiceList.ts` is unchanged (see "Blocked")

## Integration tests

- `make test-integration`: not run: frontend-only task, no Go code and no code with integration tests is touched.

## Judgment calls

- **The shared query key (blocked item).** Kept `useServiceList.ts` and its test untouched rather than edit a second file in `service-list`. The key exists twice with the same value until the user decides: `servicesQueryKey` in `lib/api/services.ts` (used by `service-form`) and `SERVICES_KEY` in `useServiceList.ts`. The fix that needs approval is one line in `useServiceList.test.tsx`: add `servicesQueryKey: ['services']` to the `vi.doMock` factory of "moves with the constant", then make the one edit in the hook.
- **Tests that mock `lib/api/services` keep the real key.** Vitest's automock empties an exported array, so `servicesQueryKey` would become `[]` and `removeQueries` would then drop every query, the session included. `App.test.tsx`, `AddServiceForm.test.tsx` and `useCreateService.test.tsx` therefore mock the module with a factory that spreads the real module and replaces only the request functions. In `App.test.tsx` this replaced the bare `vi.mock('./lib/api/services')`; no existing assertion changed. A later test that automocks this module while the form is rendered would hit the same trap.
- **Where the copied CSS rules are.** The task says `.back-link`, `.page-head*`, `.group*` and `.grid` come from `docs/design/service-form.css`; they are in `docs/design/components.css` and already in the project's `styles/components.css`, so they are not copied again. `service-form.css` has `.form-layout` (one column), `.form-main`, `.form-banners`, `.url-row`, `.form-foot*` and the narrow rules. Three rules are not in the board's stylesheet: `.back-link + .page-head { margin-top: 6px }` and `.form-summary` (both are the board's inline styles), and `.form-banners:empty { display: none }` so that the always-present live region adds no gap when empty.
- **`.menu-layer` in `styles/components.css`.** One rule, `z-index: 10`, on the select popup's positioner, so the method list is not painted under the sticky footer (`z-index: 2`) and stays under a dialog (`20`). The board has no rule for this.
- **The footer is inside the form, inside `main`,** as the task's page description says; the board draws it after `main`. It keeps the board's rules unchanged, so it is as wide as the page content, not the window.
- **The URL hint gives way to an error.** With an error on the URL the error text replaces the hint and is the input's description, as the board's error state draws it; the hint returns when the error is cleared.
- **`useWatch` instead of `watch`.** The task names `watch`; react-hook-form's `watch()` raises the `react-hooks/incompatible-library` lint warning, and `useWatch` is the same subscription as a hook, with no warning.
- **Focus by element id.** The summary links, the first focus and the name-taken focus use the three field ids (`lib/fieldIds.ts`) rather than refs, because the Select wrapper's props, as the task lists them, have no ref to the trigger.
- **A `422` with no `errors`** (or an empty list) is the generic failure: there is nothing to show on a field.
- **`saved` flag.** `useCreateService` also returns `saved` (true after a 201), which `useLeaveGuard` takes so the unload prompt is not armed between the 201 and the navigation.
- **Clearing by field.** Editing a field removes every server error of that field's path (both, when a path came twice). An entry for a path with no field stays until the next submit.
- **Banner icons.** `CircleAlert` for the limit, too-large and not-accepted banners and the summary, `WifiOff` for the generic one, as the board draws them. The task names no banner icon.
- **`Select` renders the label and the trigger;** the caller wraps them in `.field` and places the error text. A `<label for>` names Base UI's trigger (a native button), so no `aria-labelledby` was needed. No jsdom polyfill was needed; `test/setup.ts` is unchanged.
- **Fixtures.** `problem` takes an optional fourth argument `errors`; `validationProblem(...errors)` and `fieldError(field, message, code?)` are added.
- **Extra tests** beyond the criteria: two submits in one tick, a banner replaced by a later failure, a banner kept while editing, Esc on the form, only the method changed, and in `App.test.tsx` a return to a dashboard that had cached an empty list.

## Not verified in a browser

- The layout, the sticky footer, the 360 px stacking and the focus outline were checked by reading the CSS only. The app was not run.
- **Likely visible defect, not fixed here:** Base UI portals render under `body`, outside `#root.app`. The font, the resets, the `.app :focus-visible` outline and the `@container app` narrow rules are all scoped to `.app`, so the discard dialog and the method list (the first portalled popups any screen shows) probably render in the browser's default font, without the shared focus outline and without the narrow-screen dialog rules. The cause is in the shell's styles and `index.html`, outside this task's named files; it needs the user's decision.
- **Possible stale dashboard:** when the admin leaves by the back link while saving, the dashboard is already mounted when the 201 arrives. `removeQueries` (as the task specifies) drops the cache entry but does not make a mounted query refetch, so the new service may not show until the next refresh. `invalidateQueries` would cover it. Not changed: the task names `removeQueries` and its criterion checks the entry is gone.
