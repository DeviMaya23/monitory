# Plan: service test panel

Branch: `feat/service-test-panel`. Paths are under `frontend/src/`. Tick items as they are done.
Integration tests: no Go code is touched, so none apply (see the last item).

## Move and wrapper

- [ ] `failureReasonText` moves to `lib/failureReason.ts` unchanged, test moved to `lib/failureReason.test.ts`; `ServiceRow.tsx` imports it from `lib/`; old files deleted (test: `lib/failureReason.test.ts`, service-list tests unchanged)
- [ ] `testServiceCheck` calls `POST /api/service-tests` with the body; types exported (`lib/api/services.ts`, test: `lib/api/services.test.ts`)

## Pure logic

- [ ] `formatDuration`: 0, 312, 1204, 10000 (`features/service-form/lib/testResult.ts`, test: `testResult.test.ts`)
- [ ] `toTestInput` HTTP: the save's check plus `settings: { timeout_seconds: 7 }` only; TCP: TCP check, none of the HTTP keys; save body unchanged (`lib/serviceInput.ts`, test: `serviceInput.test.ts`)

## `useTestCheck` (`hooks/useTestCheck.ts`, test: `useTestCheck.test.tsx`)

- [ ] `run` sets `running`, then `result` with the answer and the type
- [ ] a second `run` while running sends nothing
- [ ] `422` with errors calls the errors callback and ends `refused`
- [ ] `403 csrf_failed`, `413`, `500`, `400`, `415` and a network `TypeError` end `failed` with `csrf`, `too-large`, `unexpected`
- [ ] a `401` ends `idle`, shows nothing
- [ ] no state set after unmount

## Panel and result (`components/TestPanel.tsx`, `TestResult.tsx`; tests: `TestPanel.test.tsx`, `TestResult.test.tsx`)

- [ ] Idle: title, hint, `Run test`, empty `aria-live="polite"` result area
- [ ] Healthy HTTP 200 / 312 ms with body: `Healthy`, `Took 312 ms`, `HTTP 200`, `plain text`, `pre` with `tabindex="0"` named `Response body` (FR-104)
- [ ] Cut-off line shows when truncated, not otherwise
- [ ] Healthy 204 with empty body: `No response body.`, no box
- [ ] Failed `non_2xx_status` 503, `json_rule_matched`, no reason → `Check failed` (FR-61)
- [ ] Timed out, no status: `Timed out`, `10,000 ms`, no-response hint, no `HTTP`, no box
- [ ] TCP healthy and failed: TCP hint, no `HTTP`, no body
- [ ] Markup in body and failure field shows as text (NFR-7)
- [ ] Running: `Testing…`, `aria-busy`, disabled, `Running one attempt…` with `role="status"`, previous result gone

## The form (`components/ServiceForm.tsx`; tests: `ServiceForm.test.tsx` (new, the panel's order and Tab), `AddServiceForm.test.tsx`, `EditServiceForm.test.tsx`)

- [ ] Panel after last group, before footer; Tab from Alerts group to `Run test` then `Cancel`; on Add and Edit (NFR-4)
- [ ] `Run test` sends exactly the check and timeout (HTTP with all parts; TCP) and the result shows (FR-104)
- [ ] A test touches nothing: no save calls, `['services']` unchanged, no toast, footer and values unchanged (FR-105)
- [ ] Test needs no name, no alert message; other timing fields with `abc` do not stop it
- [ ] Client checks: URL, timeout, cert days, TCP port; focus on first invalid field; nothing sent; `Test not run` alert (FR-106)
- [ ] Refused `422` on `check.url` and `settings.timeout_seconds`: fields, summary, summary focus, notice, edit clears, markup as text (FR-106, FR-74, NFR-7)
- [ ] Error sources: save `422` then test `422` replaces; test `422` then new test clears; save `422` then successful test keeps; new save clears test's errors (`hooks/useServerErrors.test.tsx` too)
- [ ] `403` notice + `Reload` calls `window.location.reload` once; `413`; `500`; network; button enabled, second press sends; `401` ends on sign-in (NFR-8)
- [ ] Form editable and `Save service` works while a test is pending; save that succeeds navigates, late answer sets nothing
- [ ] `Run test` disabled while saving; enabled after a failed save
- [ ] Focus returns to `Run test` if it was there; not taken if moved
- [ ] Result stays when a field is edited; replaced by the next test
- [ ] `service-form.css`: two-column `.form-layout`, `.test-panel*`, `.test-result*`, `.body-head*`, `.truncated`, narrow rules (checked by reading only)
- [ ] Existing tests of both forms pass; button/tab-stop counts changed on purpose

## Repo-wide

- [ ] `make check` passes
- [ ] Nothing outside allowed paths changed; `package.json` and lockfile unchanged
- [ ] Integration tests: not run: no Go code or integration-tested code is touched

## Judgment calls

(filled in at the end)
