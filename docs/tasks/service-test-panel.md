# Task: service test panel

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

On the Add and the Edit service screens the admin can press `Run test` and see what the check would do with the values currently in the form, before saving: healthy or failed, the failure reason, how long the attempt took and, for an HTTP(S) check that got a response, the status code and the response body as plain text. The panel sits beside the form on a wide screen and after it on a narrow one, as the board draws it. Nothing is saved; the form stays editable while a test runs. The panel uses `testServiceCheck`, which is real on the server (`test-service-check-api`).

Requirements covered:

- FR-104: a test with the form's current check and timeout shows healthy or failed, the reason, the duration, and for HTTP the status code and the body (with the cut-off notice when the server says it was cut off).
- FR-105: a test saves nothing and changes no cached service: it calls no save operation, and leaves the service list and the form's own state as they were.
- FR-106: invalid settings are refused by the server (`422`) and the same field errors are shown on the fields and in the summary, and the panel says the test did not run; the client refuses first only what the form already checks.
- FR-61, in part: the failed result shows the failure reason in the dashboard's wording (one shared function).
- FR-74, in part: the field errors of a refused test are shown on their fields.
- NFR-4, in part: the button, the result and the body box are reachable from the keyboard, in the page's order.
- NFR-7: the body, the failure text, and every server message are shown as text, never as HTML.
- NFR-8: a `403 csrf_failed` offers a reload.

Out of scope:

- **Testing a saved service by id** and the settings that play no part in a test (interval, retries, retry interval, name, messages, alerts, public flag): the test sends the check and the timeout only (the contract's `ServiceTestInput`).
- **Clearing the result when the form changes:** the result stays until the next test (a known gap).
- **The test of a notification target** (`testTarget`): built in the alert list.
- **Any change to the server, the contract or the design files.**

## Prerequisite

`edit-service-screen`, `leave-prompt-data-router`, `service-form-json-and-cert-rows`, `service-form-type-tcp`, `service-name-link`, `toast-text-shared` and `test-service-check-api` are merged. `service-name-link` and `toast-text-shared` change `features/service-list/`, from which this task moves one file. The builder checks first that these exist on the default branch, and stops to ask if any is missing or named differently (it never creates them). Names come from those task files, which were not merged when this was written.

- In `features/service-form/`: `components/ServiceForm.tsx` (the form body shared by `AddServiceForm` and `EditServiceForm`, with the `form-layout` and `form-main` wrappers, the groups, the banners and the footer), `components/FormBanners.tsx`, `ErrorSummary.tsx`, `FieldErrorText.tsx`; `hooks/useSaveService.ts`, `useServerErrors.ts`, `useLeaveGuard.ts`; `lib/serviceInput.ts` with `toServiceInput`, `lib/formValues.ts` (`ServiceFormValues`, `ADD_DEFAULT_VALUES`), `lib/formChanged.ts`, `lib/certificateOptions.ts`, `lib/serviceType.ts`, `lib/timingGroup.ts` (`readWholeNumber`), `lib/fieldLabels.ts`, `lib/fieldIds.ts`; `service-form.css`.
- `lib/api/services.ts` with `createService`, `updateService`, `getService`; the generated `ServiceTestInput` (`check`, optional `settings`) and `ServiceTestResult` (`healthy`, `duration_ms`, optional `failure_reason`, `http_status`, `response_body`, `response_body_truncated`) in `lib/api/schema.d.ts`.
- `features/service-list/lib/failureReason.ts` (`failureReasonText(reason)`, "the only place this wording lives") and its test, imported by `ServiceRow.tsx` (the only importer besides its own test).
- In `styles/components.css`: `.status`, `.status--ok`, `.status--bad`, `.notice`, `.notice--bad`, `.notice--muted`, `.meta`, `.code-block`, `.subtle`, `.hint`, `.btn`.
- The server answers `POST /api/service-tests` (`testServiceCheck` is not a stub).

`package.json` and the lockfile do not change.

## Role and ownership

Role: Frontend.

You may change `frontend/src/features/service-form/**`, `frontend/src/lib/api/services.ts` and `services.test.ts` (the one wrapper), `frontend/src/lib/failureReason.ts` and `failureReason.test.ts` (new: the moved function and its test), `frontend/src/features/service-list/**` (only to delete the moved files and update the imports of `failureReasonText`; nothing else there), `frontend/src/test/fixtures.ts` (only if a helper is missing). You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `frontend/src/styles/components.css`, `frontend/src/components/**`, `frontend/src/hooks/**`, `frontend/src/app-shell/**`, `frontend/src/App.tsx`, `frontend/src/main.tsx`, `backend/**`, `e2e/**`, or `docs/**` (except your own plan file, `docs/tasks/service-test-panel.plan.md`). Do not change `features/alert-list/**` or `features/sign-in/**`.

Shared files this task touches, all owned by this task while it runs: everything under `features/service-form/`, `lib/api/services.ts`, the import lines of `failureReasonText` in `features/service-list/`. No other frontend task runs at the same time (all of them are prerequisites); any backend task may.

## Operations used

From `docs/openapi.yaml`. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this panel handles |
|---|---|---|
| `testServiceCheck` | `POST /api/service-tests` | 200 `ServiceTestResult`; 422 `validation_failed` with `errors[]`; 403 `csrf_failed`; 413 `payload_too_large`; 401 `unauthenticated` (left to the shell); 400, 415, 500 and a network failure as the generic failure. It lists no 404 and no 409 |

The body is `ServiceTestInput`: `check` (the same HTTP or TCP check the form sends on save) and `settings` with only `timeout_seconds`. The CSRF token is added by `apiRequest`. A completed test is `200` even when the check failed; `failure_reason` (`code`, `http_status` for `non_2xx_status`, `json_rule_field` for `json_rule_matched`) is present only when unhealthy; `http_status` and `response_body` are present only when an HTTP(S) check got a response; `response_body_truncated` is true when the body was cut off. The `422` can name only `check.*` paths and `settings.timeout_seconds` (the contract and `test-service-check-api`); the form's mapping handles them as it handles a save's.

## Behavior

### What exists

- `ServiceForm` renders `div.form-layout` with `div.form-main` (the banners, the groups) and the sticky footer, inside the form element. The panel's rules (`.test-panel*`, `.test-result*`, `.body-head*`, `.truncated`, the two-column `.form-layout` and its narrow-screen rules) were left out of `service-form.css` by the earlier tasks.
- `useServerErrors(errors)` holds the field errors of one response; the form passes it the errors of the last failed save.
- The form's client checks (URL filled, whole numbers for the timing texts, the days while the certificate switch is on, the port for TCP) run on submit through react-hook-form's registered `validate` rules.

### The panel

`aside.test-panel` (`aria-labelledby` its heading) is the second column of `form-layout` on a wide screen (sticky, as the board draws it) and follows the form on a compact screen (at the board's 900 px container breakpoint, static). It sits inside the `<form>` after `form-main`, so in the page's order: the groups, then the panel, then the footer. Contents:

1. `div.test-panel__head` with `h2.test-panel__title` `Test check`.
2. `p.hint` `Runs one attempt with the values in the form. Nothing is saved.`
3. The button `Run test` (`type="button"`, class `btn`, Lucide `FlaskConical`).
4. `div` with `aria-live="polite"`: the result area, empty until a test runs.

The panel is on both screens. Enter in a field submits the form (saves), not the test.

### Running a test

1. **Client checks first,** only what a test needs, with the messages the form already shows: for an HTTP(S) type the URL (`Enter a URL.`) and, while the certificate switch is on, the days (`Enter a whole number.`); for TCP the port (`Enter a whole number.`); for both the timeout text (`Enter a whole number.`). The name, the other timing texts, the messages and everything else are not checked. A failure shows the message under its field as on save, moves focus to the first invalid field in the page's order (the fields are checked by `trigger` with the names listed in page order, `url`, `cert_days` (only while the certificate switch is on), `timeout` for HTTP(S), `port`, `timeout` for TCP, and focus on error on; a hidden type's fields are not checked), sends nothing, leaves the previous result and the earlier test's field errors as they were, and the result area shows `div.test-result` (`role="alert"`) with `p.notice.notice--bad` (Lucide `CircleAlert`) `Test not run. Fix the highlighted fields first.`
2. **Running:** the button reads `Testing…`, has `aria-busy="true"` and is disabled; the result area shows `div.test-result` (`role="status"`) with `p.notice.notice--muted` `Running one attempt…`. The form stays editable and `Save service` still works. The previous result and the previous test's field errors are cleared when the test starts. The test is sent once per press; while one is in flight the button is disabled.
3. **The request** is `testServiceCheck({ check, settings: { timeout_seconds } })` with the check built by the same function that builds a save's (`toServiceInput` is split so that its check part is one exported builder shared by the save and the test; the timeout is the timeout text as an integer).
4. **When the answer arrives** (a `200` or a failure other than a `422`) the button is enabled again and focus goes back to it (it lost focus while disabled), unless the admin has left the page or moved focus elsewhere meanwhile (then focus is not moved). A `422` is the exception: the summary takes focus, as for a refused save. A client-check failure moves focus to the invalid field (step 1) and not to the button.
5. **Run test is disabled while a save is in flight** (the values are about to change meaning), and enabled again after a failed save.
6. **A save that succeeds while a test runs:** the page navigates away; the test's answer is dropped, no state is set after the page is gone.

### The result (a `200`)

`div.test-result` (`role="status"`) holding, in order:

- `div.test-result__verdict`: healthy: `span.status.status--ok` `Healthy`; failed: `span.status.status--bad` `Failed` followed by `span.test-result__reason` with the failure reason's text from `failureReasonText` (`Timed out`, `Returned HTTP 503 (expected 2xx)`, `JSON rule matched: {field}` and the others of the dashboard); a failed result with no `failure_reason` shows `Check failed`.
- `dl.meta`: `Took` with the duration as `{n} ms` using `en-US` thousands separators whatever the machine's locale (`1,204 ms`, `10,000 ms`); and, when `http_status` is present, `HTTP` with the code.
- For an **HTTP(S)** check:
  - when `http_status` is present: a head line `div.body-head` with `span.body-head__label` `Response body` and `span.subtle` `plain text` (a healthy result with a body) or `plain text, not rendered` (a failed one with a body), and no `span.subtle` when the body is empty; then, when `response_body` is not empty, `pre.code-block` with `tabindex="0"` and `aria-label="Response body"` holding the body as a text child, and, when `response_body_truncated` is true, `p.truncated` (Lucide `TriangleAlert`) `Cut off: the body is longer than 64 KB. Only the first 64 KB is shown.`; when the body is empty, `p.hint` `No response body.` instead of the box;
  - when `http_status` is absent (no response arrived): `p.hint` `No response was received, so there is no status code or body.`
- For a **TCP** check (the type at the time of the test): `p.hint` `TCP checks have no status code or body.` and no `HTTP` entry and no body.

In the result, `null` counts as absent for `failure_reason`, `http_status` and `response_body`, and an absent `response_body_truncated` is false. Which of the two (HTTP or TCP) applies is the type that was sent, not a field of the result. A body is rendered only as a React text child of the `pre`; the failure text and `json_rule_field` are text too (NFR-7).

### Failures of the request itself

All shown as `div.test-result` (`role="alert"`) with `p.notice.notice--bad` and Lucide `CircleAlert`; the `Run test` button is enabled again and is the retry; focus goes back to it as in "Running a test".

| Response | Text |
|---|---|
| `422 validation_failed` | `Test not run. Fix the highlighted fields first.` and each error on its field and in the summary, the summary taking focus (this row overrides the focus rule above), exactly as a refused save (see below) |
| `403 csrf_failed` | `The request wasn’t accepted. Reload the page and try again.` and a `Reload` button (Lucide `RefreshCw`, class `btn`) that calls `window.location.reload()` |
| `413 payload_too_large` | `The test is too large to send. Shorten the body or the header values.` |
| `400`, `415`, `500`, any other status, a network failure | `The test couldn’t be run. The server couldn’t be reached or returned an error.` |
| `401 unauthenticated` | Nothing on this panel: the shell ends the session and shows the sign-in form |

The board draws only the `422` state; the other three notices are decided with the user ("reuse the save wording").

### Field errors of a refused test

A `422` is mapped as the form maps a save's: each error on its field by its path (`check.url`, `check.method`, the rows, the rules, the certificate paths, `check.host`, `check.port`, `settings.timeout_seconds`), in the summary above the form with the same title and entries, the summary taking focus; a path with no input is listed as plain text. The form holds one set of server field errors as one state value `{ source: 'save' | 'test', errors }` (or none), the one of the last `422`, whether from a save or from a test: a new `422` of either kind replaces it; starting a test clears the set only when its source is `test` (a save's errors stay); starting a save clears whatever is there, as today (the save's own failure is cleared by `clearFailure`, the test's set by the form). `useServerErrors` is given the set's `errors` array and works as it does. Editing a field clears its error as on save.

### Known gaps

- **The result is not cleared when the form changes:** it describes the values at the time of the test and may be stale (the board draws no such state).
- **Running a test while a save's `422` errors are shown** keeps them; a test's `422` then replaces them (one set of errors). A late `422` naming a path of a type that is no longer chosen (the type was switched during the test) is shown as the form shows any path with no input: in the summary as plain text.
- **`Run test` stays enabled** after a save that ended `not-found` on the Edit screen (the test needs no saved service).
- **The panel's `Reload` and 403 text** repeat wording that `FormBanners` has (`share-form-parts` shares the Reload words afterwards).
- **A long body is shown in full up to the server's cut,** in a scrollable box; nothing is paginated or searched.
- **The `Cut off` text names 64 KB** as the board and the contract do; the real limit is deployment configuration.
- **The body of a binary response** is shown with the replacement characters the server put in.

## Structure

By `ARCHITECTURE.md` and `CONVENTIONS.md`; follow the form's existing groups as the example. Names marked "new" are fixed by this file; others are the builder's choice. One hook per concern, each with a colocated test written in the same step.

- `frontend/src/lib/failureReason.ts` and `failureReason.test.ts`: moved from `features/service-list/lib/` unchanged (`failureReasonText`), because a second feature needs it (`ARCHITECTURE.md`: promote when a second feature needs it, at that moment). The user approves this shared place by approving this task. The imports in `features/service-list/` change; the old files go. No wording change.
- `lib/api/services.ts` (and test): `testServiceCheck(input)` over `apiRequest('POST', '/api/service-tests', input)`, typed with the generated `ServiceTestInput` and `ServiceTestResult`; the types exported.
- `features/service-form/lib/serviceInput.ts`: the check part of `toServiceInput` becomes an exported builder (for example `toCheckInput(values)`), used by the save and the test; a function `toTestInput(values)` builds the `ServiceTestInput` (the check, and `settings` with only `timeout_seconds`). Pure, with tests.
- `features/service-form/lib/testResult.ts` (new, with a test): the words of the panel (title, hint, button labels, notices), `formatDuration(ms)` (thousands separators, `{n} ms`), and the choice of what the result area shows for a result and a type (the lines of "The result").
- `features/service-form/hooks/useTestCheck.ts` (new, with a test through a harness): the test state machine: `idle`, `running`, `result` (the `ServiceTestResult` and the type it was for), `refused` (client checks failed or `422`), `failed` with the kind `csrf`, `too-large` or `unexpected`; `run(values)`, an in-flight guard (a second call while running sends nothing), an on-screen guard (no state set after unmount), and a way for the form to clear it. The `422` errors are handed to the form (a callback), not held here. One concern: running a test and classifying its outcome.
- `features/service-form/hooks/useServerErrors.ts` (and test) and the form: the one set of server field errors with its source (`save` or `test`), as in "Field errors of a refused test". The form decides which source a new set comes from.
- `features/service-form/components/TestPanel.tsx` (new, with a test) and `TestResult.tsx` (new, with a test), or the equivalent: the panel and its result area; presentational, taking the hook's state. `ServiceForm.tsx` places the panel after `form-main`, runs the client checks for the test (react-hook-form's `trigger` on the fields a test needs, then focus on the first invalid field by document order, as the submit does), and passes the values.
- `features/service-form/service-form.css`: the board's rules for the two-column `.form-layout`, `.test-panel*`, `.test-result*`, `.body-head*`, `.truncated` and their narrow-screen rules; values copied from `docs/design/service-form.css`; nothing else.

## Design reference

Reference only, read-only: `docs/design/service-form.html` (states "Test running", "Test result healthy: long body, cut off", "Test result healthy: no body", "Test result failed: HTTP error with body", "Test result failed: timed out", "Test refused: fields invalid") with `docs/design/service-form.css` and `components.css`; `docs/design/README.md` (the board's `testServiceCheck 404` is not built: the contract lists none). Copy values and rules from the styles; never copy board markup or component code. Use the existing wrappers and Lucide icons only. Where the board and the contract disagree the contract wins.

Texts copied from the board as written: `Test check`, `Runs one attempt with the values in the form. Nothing is saved.`, `Run test`, `Testing…`, `Running one attempt…`, `Healthy`, `Failed`, `Took`, `HTTP`, `Response body`, `plain text`, `plain text, not rendered`, `No response body.`, `Cut off: the body is longer than 64 KB. Only the first 64 KB is shown.`, `No response was received, so there is no status code or body.`, `TCP checks have no status code or body.`, `Test not run. Fix the highlighted fields first.`. Where this file differs from the board, by decision: the failure reason is a line in the verdict row (`span.test-result__reason`, a class the stylesheet has) rather than the dashboard row's icon line, and the verdict words carry no icon (`StatusBadge` belongs to another feature). Texts decided here (not drawn): the `403`, `413` and generic notices above (the user chose "reuse the save wording"; the generic one omits the save banner's "Your values are still here." because the form is not at risk), the `Reload` button's use in the panel, and `Check failed` for a failed result with no reason.

## Dependencies

None. Check that Lucide's `FlaskConical`, `TriangleAlert`, `CircleAlert` and `RefreshCw` exist in 1.73.0 under those names; if one does not, use the closest and say so in the plan.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. Mock `testServiceCheck` (and `createService` or `updateService` where a save is involved) at the wrapper boundary with value-return spies typed with the generated types, keep the real query keys, render with `renderRoutes` and a `ToastProvider`, use `user-event`, and use non-default values everywhere. Reject with `ApiError` built by the `problem` helper.

**`lib/testResult.ts`, `lib/serviceInput.ts`, `lib/failureReason.ts`, `lib/api/services.ts`**

- `formatDuration` (the same under another machine locale): `0` is `0 ms`, `312` is `312 ms`, `1204` is `1,204 ms`, `10000` is `10,000 ms`.
- `toTestInput` of an HTTP form gives the check of the save and `settings: { timeout_seconds: 7 }` and no other key (no name, no interval, no messages); of a TCP form gives the TCP check and the timeout, none of the HTTP keys; the save's body is unchanged (the existing `toServiceInput` tests pass).
- `failureReasonText` keeps every case of its moved test; the dashboard still shows the same texts (the service-list tests pass unchanged).
- `testServiceCheck` calls `POST /api/service-tests` with the body.

**`useTestCheck`**

- `run` sets `running`, then `result` with the answer and the type; a second `run` while running sends nothing; a rejected `422` with errors calls the errors callback with them and ends `refused`; `403 csrf_failed`, `413`, a `500`, a `400`, a `415` and a network `TypeError` end `failed` with `csrf`, `too-large`, `unexpected` (the last four the same kind); a `401` ends `idle` and shows nothing; after unmount a late answer calls no callback and changes nothing observable.

**The panel and the result (`TestPanel.test.tsx`, `TestResult.test.tsx`)**

- Idle: `Test check`, the hint and `Run test` show; the result area is empty and has `aria-live="polite"`.
- A healthy HTTP result with status 200, 312 ms and a body shows `Healthy`, `Took 312 ms`, `HTTP 200`, `Response body` with `plain text`, and the body in a `pre` with `tabindex="0"` and the accessible name `Response body` (FR-104).
- With `response_body_truncated` true the cut-off line shows; with false it does not.
- A healthy 204 with an empty body shows `Response body` with no `plain text`, `No response body.` and no box; a failed result with an empty body does the same.
- A failed `non_2xx_status` result with status 503 shows `Failed`, `Returned HTTP 503 (expected 2xx)`, `1,204 ms`, `HTTP 503`, `plain text, not rendered` and the body as text; a `json_rule_matched` result shows `JSON rule matched: checks.db.status`; a failed result with no reason shows `Check failed` (FR-61).
- A timed-out result with no status shows `Timed out`, `10,000 ms`, `No response was received, so there is no status code or body.`, no `HTTP` entry and no body box.
- A TCP result (healthy and failed) shows `TCP checks have no status code or body.` and no `HTTP` entry and no body.
- A body of `<b>x</b><script>alert(1)</script>` and a failure field of `<i>y</i>` show literally as text and no element is created from them (NFR-7).
- Running: the button reads `Testing…` with `aria-busy="true"` and is disabled, `Running one attempt…` shows with `role="status"`; the previous result is gone.

**The form, on both screens (`AddServiceForm.test.tsx` and `EditServiceForm.test.tsx`; `ServiceForm.test.tsx` does not exist: create it only for cases that do not belong to one screen)**

- The panel is in the page's order after the last group and before the footer, and Tab goes from the last control of the Alerts group to `Run test`, then to `Cancel` (NFR-4); it shows on the Add screen and on the Edit screen.
- Pressing `Run test` with a filled HTTP form sends exactly the check and the timeout of the form (typed values: method `POST`, a header row, a JSON body, a rule, the certificate switch on with 30 days, timeout `7`, and nothing else), and the result shows; with TCP chosen it sends the TCP check and the timeout (FR-104).
- A test touches nothing: after a test, `createService`, `updateService` and `getService` were not called by it, the `['services']` entry is unchanged, no toast shows, the footer says what it said before (`Unsaved changes` or empty) and the form's values and focusable state are unchanged (FR-105).
- The test does not need what a save needs: with an empty Name and an empty alert message the test still runs; the other timing fields with `abc` do not stop it.
- Client checks: an empty URL shows `Enter a URL.`, a timeout of `abc` shows `Enter a whole number.`, certificate days of `abc` with the switch on shows it under the days, a TCP port of `''` shows it under Port; each focuses the first invalid field in page order, sends nothing, and the panel shows `Test not run. Fix the highlighted fields first.` with `role="alert"` (FR-106).
- A refused test (`422`) with the server's own non-default messages on `check.url` and `settings.timeout_seconds`: each shows on its field with `aria-invalid` and `aria-describedby`, the summary lists both with its title, the summary has focus, the panel shows the `Test not run` notice; editing the URL clears its error and entry; a message with markup shows as text (FR-106, FR-74, NFR-7).
- Error sources: a save's `422` on `name`, then a test with a `422` on `check.url`: the set is the test's (the name error is gone); a test's `422`, then starting another test clears it; a save's `422` then a test that succeeds keeps the save's errors; starting a save clears a test's errors.
- `403 csrf_failed`: the notice and `Reload`, which calls `window.location.reload` once (replace `window.location` with a spy object and restore it) (NFR-8); `413`; `500` and a network error: each notice as written, the button enabled and a second press sends again; a `401` ends on the sign-in form with the session-ended notice and no panel text (FR-4).
- While a test is pending the form stays editable and `Save service` works; a save that succeeds while the test is pending navigates away and a late answer is not rendered and calls no callback (a `422` answered after unmount does not call the errors callback).
- While a save is in flight `Run test` is disabled; after a failed save it is enabled again.
- Focus: after an answer, focus is on `Run test` when it was there when the test started; if focus had moved to another field meanwhile it is not taken.
- The result stays when a field is edited and is replaced by the next test (the known gap, pinned).
- The existing tests of both forms pass; those that count buttons or tab stops are changed on purpose below.
- A client error left by a refused test (`Enter a URL.`) goes when the field is edited, and a client error of a field a test does not check (`Enter a name.` from an earlier save) is untouched by a test.
- With a result on screen, Tab from the Alerts group goes to `Run test`, then to the body box (`tabindex="0"`), then to `Cancel`; with the `403` notice, `Reload` sits between the button and `Cancel`.
- A type switched while a test is pending: the result is the one for the type that was sent (a TCP result keeps the TCP line after switching to HTTP(S)), and a late answer does not change the new type's fields.
- On the Edit screen a TCP service's test sends the TCP check and shows the TCP result line.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

Tests this task changes on purpose: the cases that list every button's text or count the page's tab stops in `AddServiceForm.test.tsx` and `EditServiceForm.test.tsx` (the idle button lists, the Tab-order blocks, and the "locks the inputs and the buttons while saving, and releases them" case, where `Run test` is also disabled) gain `Run test` (the count of buttons grows by one; the Tab order from the Alerts group goes to `Run test` before `Cancel`); `useServerErrors.test.tsx` gains the source cases; the imports of `failureReasonText` in `features/service-list/` change with the moved files (no assertion changes). The idle cases that assert "no test button" or "no test panel" (written by the earlier tasks) now expect the panel. No other assertion is removed or loosened.

## Verifier checks

- **By reading `useTestCheck.ts` and the panel:** the request is built only by `toTestInput` from the form's values; no save operation, no cache write and no toast is reachable from the test code; classification branches on `ApiError.code` and `status`, never on text; the result is never copied into the form's state; the type used to choose the TCP or HTTP lines is the one that was sent.
- **By reading the components:** the body, the failure text, `json_rule_field` and every server message are React text children; no `dangerouslySetInnerHTML`; no literal colour or pixel value where a token exists, other than values copied from the design CSS; icons from Lucide only; no Base UI import in the feature; every string defined once with the curly quotes and the ellipsis as written; `features/service-form/` imports nothing from `app-shell/` or another feature (`failureReasonText` comes from `lib/`); `features/service-list/` imports it from `lib/`, and `lib/failureReason.ts` has no copy left behind.
- **The shared builder:** the save and the test use the same check builder; a mutation to it fails a save test and a test-panel test.
- **Contract:** the request body is `ServiceTestInput` with only `check` and `settings.timeout_seconds`; the result fields read are those of `ServiceTestResult`; no status or code beyond those in "Operations used".
- **Mutation checks to run:** send the whole `ServiceInput`; add `settings` fields beyond the timeout; check the name before a test; render the body with `dangerouslySetInnerHTML`; drop the cut-off line; show `HTTP` for a TCP result; clear the save's errors when a test starts; keep a test's errors when a save starts; enable `Run test` while saving; drop the in-flight guard; call `createService` from the test; show the `Test not run` notice for a successful result; drop the `Reload` button. Each must fail at least one named test.
- **Inputs to try:** a body of 64 KB and one cut off; a body that looks like HTML and one that looks like JSON; a 120-character failure field; a duration of 0, 999, 1000 and 600000; pressing `Run test` twice quickly; pressing it with the form in each of its client-error states; a test, an edit, then a save; a test pending while the page is left by every exit; a `422` that names a path of the other type.
- **Layout, by reading the CSS (jsdom cannot prove it):** the panel is the second column and sticky above 900 px and static after the form at or below it; the body box scrolls (`overflow: auto`, a max height from the board) and has the shared focus outline; nothing scrolls the page sideways at 360 px.
- **What the verifier cannot prove:** the look at 360 px, the sticky behavior and a real server's answers; say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design board or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a shared component, or an edit to a spec or design file, or a state that is neither drawn on the board nor listed in this file.
- A prerequisite name is missing or differs from "Prerequisite", or `testServiceCheck` answers with a status or a field the contract does not list.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps (the moved function and the wrapper first, then the builder and the hook, then the panel and the form), push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), that no integration test applies, dependency versions (none changed), and anything you were unsure about. Also list every judgment call this file did not settle, and say that the layout, the sticky panel and the focus outline were checked by reading the CSS only, not in a browser, unless you ran the app.
