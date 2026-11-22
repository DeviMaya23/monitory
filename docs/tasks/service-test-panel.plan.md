# Plan: service test panel

Branch: `feat/service-test-panel`. Paths are under `frontend/src/`. Tick items as they are done.
Integration tests: no Go code is touched, so none apply (see the last item).

## Move and wrapper

- [x] `failureReasonText` moves to `lib/failureReason.ts` unchanged, test moved to `lib/failureReason.test.ts`; `ServiceRow.tsx` imports it from `lib/`; old files deleted (test: `lib/failureReason.test.ts`, service-list tests unchanged)
- [x] `testServiceCheck` calls `POST /api/service-tests` with the body; types exported (`lib/api/services.ts`, test: `lib/api/services.test.ts`)

## Pure logic

- [x] `formatDuration`: 0, 312, 1204, 10000 (`features/service-form/lib/testResult.ts`, test: `testResult.test.ts`)
- [x] `toTestInput` HTTP: the save's check plus `settings: { timeout_seconds: 7 }` only; TCP: TCP check, none of the HTTP keys; save body unchanged (`lib/serviceInput.ts`, test: `serviceInput.test.ts`)

## `useTestCheck` (`hooks/useTestCheck.ts`, test: `useTestCheck.test.tsx`)

- [x] `run` sets `running`, then `result` with the answer and the type
- [x] a second `run` while running sends nothing
- [x] `422` with errors calls the errors callback and ends `refused`
- [x] `403 csrf_failed`, `413`, `500`, `400`, `415` and a network `TypeError` end `failed` with `csrf`, `too-large`, `unexpected`
- [x] a `401` ends `idle`, shows nothing
- [x] no state set after unmount

## Panel and result (`components/TestPanel.tsx`, `TestResult.tsx`; tests: `TestPanel.test.tsx`, `TestResult.test.tsx`)

- [x] Idle: title, hint, `Run test`, empty `aria-live="polite"` result area
- [x] Healthy HTTP 200 / 312 ms with body: `Healthy`, `Took 312 ms`, `HTTP 200`, `plain text`, `pre` with `tabindex="0"` named `Response body` (FR-104)
- [x] Cut-off line shows when truncated, not otherwise
- [x] Healthy 204 with empty body: `No response body.`, no box
- [x] Failed `non_2xx_status` 503, `json_rule_matched`, no reason → `Check failed` (FR-61)
- [x] Timed out, no status: `Timed out`, `10,000 ms`, no-response hint, no `HTTP`, no box
- [x] TCP healthy and failed: TCP hint, no `HTTP`, no body
- [x] Markup in body and failure field shows as text (NFR-7)
- [x] Running: `Testing…`, `aria-busy`, disabled, `Running one attempt…` with `role="status"`, previous result gone

## The form (`components/ServiceForm.tsx`; tests: `ServiceForm.test.tsx` (new, the panel's order and Tab), `AddServiceForm.test.tsx`, `EditServiceForm.test.tsx`)

- [x] Panel after last group, before footer; Tab from Alerts group to `Run test` then `Cancel`; on Add and Edit (NFR-4)
- [x] `Run test` sends exactly the check and timeout (HTTP with all parts; TCP) and the result shows (FR-104)
- [x] A test touches nothing: no save calls, `['services']` unchanged, no toast, footer and values unchanged (FR-105)
- [x] Test needs no name, no alert message; other timing fields with `abc` do not stop it
- [x] Client checks: URL, timeout, cert days, TCP port; focus on first invalid field; nothing sent; `Test not run` alert (FR-106)
- [x] Refused `422` on `check.url` and `settings.timeout_seconds`: fields, summary, summary focus, notice, edit clears, markup as text (FR-106, FR-74, NFR-7)
- [x] Error sources: save `422` then test `422` replaces; test `422` then new test clears; save `422` then successful test keeps; new save clears test's errors (`hooks/useServerErrors.test.tsx` too)
- [x] `403` notice + `Reload` calls `window.location.reload` once; `413`; `500`; network; button enabled, second press sends; `401` ends on sign-in (NFR-8)
- [x] Form editable and `Save service` works while a test is pending; save that succeeds navigates, late answer sets nothing
- [x] `Run test` disabled while saving; enabled after a failed save
- [x] Focus returns to `Run test` if it was there; not taken if moved
- [x] Result stays when a field is edited; replaced by the next test
- [x] `service-form.css`: two-column `.form-layout`, `.test-panel*`, `.test-result*`, `.body-head*`, `.truncated`, narrow rules (checked by reading only)
- [x] Existing tests of both forms pass; button/tab-stop counts changed on purpose

## Repo-wide

- [x] `make check` passes (run, exit 0)
- [x] Nothing outside allowed paths changed; `package.json` and lockfile unchanged (checked with `git diff --stat`)
- [x] Integration tests: not run: only frontend files changed; no Go code or code with integration tests is touched

## Judgment calls

- **Lucide names:** `FlaskConical`, `TriangleAlert`, `CircleAlert` and `RefreshCw` all exist in 1.73.0 under those names.
- **`useTestCheck` API:** besides `run(values)` it has `refuse()` (the client checks failed). The form runs the client checks with react-hook-form's `trigger`, so the hook never sees invalid values. The task's "a way for the form to clear it" was not needed: the next test replaces the state.
- **Which fields a test validates:** `trigger` on URL, certificate days and timeout for HTTP; port and timeout for TCP. The TCP host is not checked on the client (the form never checked it); the server's `422` covers an empty host.
- **One set of errors:** `useFieldErrorSet` in `useServerErrors.ts` keeps a test's `422` and the save errors it found on screen; a newer save failure hides the test's set. Starting a test or a save drops the test's set. I first tried setting state while rendering and it lost updates against the form's batched events, so the set is derived.
- **Tab-order and button-count tests:** the cases in `AddServiceForm.test.tsx` gained `Run test`. `EditServiceForm.test.tsx` needed no change. The panel's own cases for both screens are in the new `ServiceForm.test.tsx`.
- **Focus return:** it applies to results and to the `403`, `413` and generic failures. A `422` focuses the summary and a client refusal focuses the first invalid field.
- **Layout:** checked by reading the CSS (copied from `docs/design/service-form.css`) only. I did not run the app in a browser, so the sticky panel, the 360 px look and the focus outline are unchecked.
