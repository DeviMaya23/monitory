# Verification report: service test panel

Branch: `verify/service-test-panel` (reset onto `feat/service-test-panel` at `7802f93`, then the verifier's test additions on top).
Verdict: **no Blocking findings.** Five Non-blocking findings, all test quality or cosmetic.

## make check

- First run: failed. Three frontend tests timed out at 5 s (`AddServiceForm.test.tsx` two, `App.test.tsx` one) while 73 workers ran in parallel. A fresh checkout had no `node_modules`, so the first attempt failed earlier on `eslint: command not found`. I ran `npm ci` (lockfile unchanged), then `make check`.
- Each timed-out file passes alone (`AddServiceForm.test.tsx` 221/221, `App.test.tsx` 48/48).
- Second full run: **passed**, 73 files, 1305 tests, lint, build, contract lint, Go build, exit 0.
- Integration tests: **not run**. The diff touches only `frontend/` and docs, and the task file says none apply. No criterion depends only on an integration test.

## Acceptance criteria

"Real?" = the named test fails if the behaviour is removed (evidence: mutation run, see below), or "reading" where I only judged it from the test body.

| Criterion | Test | Real? | Status |
|---|---|---|---|
| `formatDuration` 0, 312, 1204, 10000 | `testResult.test.ts` formatDuration rows (verifier added 999, 1000, 600000) | Yes by reading (Intl formatter) | Met |
| `toTestInput` HTTP and TCP: check plus only `timeout_seconds` | `serviceInput.test.ts` "gives an HTTP form…", "gives a TCP form…" | Yes: M02, M20 fail it | Met |
| Save body unchanged | existing `toServiceInput` tests | Yes: M14 fails them | Met |
| `failureReasonText` moved, service-list unchanged | `lib/failureReason.test.ts`; service-list tests pass in `make check` | Yes by reading (moved unchanged) | Met |
| `testServiceCheck` calls `POST /api/service-tests` | `services.test.ts` | Yes by reading | Met |
| `run` goes running then result with answer and type | `useTestCheck.test.tsx` "goes running…" | Yes: M01, M02, M20 fail it | Met |
| Second `run` while running sends nothing | `useTestCheck.test.tsx` "sends nothing for a second run…" | Yes: M10 | Met |
| 422 calls callback and ends `refused` | `useTestCheck.test.tsx` "hands the errors of a 422…" | Yes by reading | Met |
| 403, 413, 500, 400, 415, TypeError end `failed` with the right kind | `useTestCheck.test.tsx` it.each | Yes: M15, M16 fail it | Met |
| 401 ends `idle`, shows nothing | `useTestCheck.test.tsx` "ends idle for a 401" and `ServiceForm.test.tsx` "a 401 ends on the sign-in form" | Yes: M17 | Met |
| No state after unmount | `useTestCheck.test.tsx` "sets no state…", "does not call the callback for a 422…" | **Partly.** The result path cannot be observed: M18 survives. The 422 callback path is real | Partly met |
| Idle panel: title, hint, button, empty `aria-live="polite"` | `TestPanel.test.tsx` idle, `ServiceForm.test.tsx` idle (both screens) | Yes by reading | Met |
| Healthy HTTP 200 / 312 ms with body, `pre` `tabindex=0` named `Response body` (FR-104) | `TestResult.test.tsx` first case | Yes by reading | Met |
| Cut-off line only when truncated | `TestResult.test.tsx` "shows the cut-off line only when…" | Yes: M05 | Met |
| 204 with empty body: `No response body.`, no box | `TestResult.test.tsx` | Yes by reading | Met |
| Failed 503, JSON rule, no reason (`Check failed`) (FR-61) | `TestResult.test.tsx` two cases, `testResult.test.ts` | Yes by reading | Met |
| Timed out, no status | `TestResult.test.tsx` "shows a timeout…" | Yes by reading | Met |
| TCP healthy and failed: TCP hint, no `HTTP`, no body | `TestResult.test.tsx` it.each, `ServiceForm.test.tsx` TCP | Yes: M06, M19 | Met |
| Markup in body and failure field is literal text (NFR-7) | `TestResult.test.tsx` "shows markup…" | Yes: M04 | Met |
| Running: `Testing…`, `aria-busy`, disabled, notice with `role=status`, old result gone | `TestPanel.test.tsx`, `ServiceForm.test.tsx` "shows Testing… busy…" | Yes by reading | Met |
| Panel order, Tab Alerts → `Run test` → `Cancel`, both screens (NFR-4) | `ServiceForm.test.tsx` `describe.each(['add','edit'])`, `AddServiceForm.test.tsx` tab case | Yes by reading (order assertions) | Met |
| Sends exactly check and timeout, HTTP rich and TCP (FR-104) | `ServiceForm.test.tsx` "what a test sends" | Yes: M01, M02, M14, M20 | Met |
| A test touches nothing (FR-105) | `ServiceForm.test.tsx` "calls no save, leaves the cache…" | Yes: M11 | Met |
| Test does not need name or other timing fields | `ServiceForm.test.tsx` "does not need what a save needs" | Yes: M03 fails 17 tests, this one among them | Met |
| Client checks: URL, timeout, days, TCP port, focus first invalid, nothing sent, alert notice (FR-106) | `ServiceForm.test.tsx` "client checks before a test" (6 cases) | Yes: M03, M12 | Met |
| 422 on `check.url` and `settings.timeout_seconds`: fields, summary, focus, notice, edit clears, markup as text (FR-106, FR-74, NFR-7) | `ServiceForm.test.tsx` "a refused test, 422" | Yes by reading | Met |
| Error sources (4 cases) | `ServiceForm.test.tsx` "the one set of server field errors", `useServerErrors.test.tsx` `useFieldErrorSet` | Yes: M07, M08 | Met |
| 403 notice and `Reload` once; 413; 500; network; second press sends; 401 (NFR-8) | `ServiceForm.test.tsx` "a request that failed as a whole" | Yes: M13, M15, M16, M17 | Met |
| Form editable and save works while pending; late answer sets nothing | `ServiceForm.test.tsx` "keeps the form editable…" | Yes for "no save call from test" (M11); late-answer part is the unobservable one (M18) | Met, with the M18 caveat |
| `Run test` disabled while saving, enabled after a failed save | `ServiceForm.test.tsx`, `TestPanel.test.tsx` | Yes: M09 | Met |
| Focus returns to `Run test`, not taken from another field | `ServiceForm.test.tsx` "focus after an answer" | Yes: M21 | Met |
| Result stays on edit, replaced by next test (known gap) | `ServiceForm.test.tsx` "the known gap" | Yes by reading | Met |
| Existing tests pass; counts changed on purpose | `AddServiceForm.test.tsx` (3 deliberate edits); `EditServiceForm.test.tsx` needed none | Yes | Met |
| `make check` passes | see above | n/a | Met (second run; first run had load timeouts) |
| Nothing outside allowed paths; `package.json` and lockfile unchanged | `git diff --stat 85763ae..HEAD` | n/a | Met |

## Plan check

Plan: `docs/tasks/service-test-panel.plan.md`.

- Every criterion of the task file appears in the plan. No criterion is missing.
- Every ticked item has an existing test that checks the behaviour, except the unmount item, whose result path is unobservable (finding N2).
- Plan versus diff:
  - The plan says `EditServiceForm.test.tsx` needed no change. Confirmed.
  - The plan does not mention the `LoaderCircle` icon on the running button. The board draws a spinner there; the task file names only `FlaskConical`. Small unlisted judgment call.
  - "A way for the form to clear it" (task, `useTestCheck`) was not built. The plan states this and says why.
  - The plan says the TCP host is not checked on the client. Matches the task ("only what the form already checks").
- No other difference found.

## Rule checks (by reading the diff)

- Dependencies: `package.json` and lockfile unchanged. Lucide 1.73.0 has `FlaskConical`, `TriangleAlert`, `CircleAlert`, `RefreshCw` and `LoaderCircle`.
- Changed paths are all inside the task's allowed list. No `backend/`, contract, `components/ui/`, `styles/components.css` or `docs/design/` change.
- `features/service-form/` imports nothing from `app-shell/` or another feature. `failureReasonText` comes from `lib/failureReason.ts`; `ServiceRow.tsx` imports it from `lib/`; the old files are gone.
- NFR-7: the body, failure text and `json_rule_field` are React text children. No `dangerouslySetInnerHTML`, no `eslint-disable`, no Base UI import in the feature.
- Request is built only by `toTestInput`, which uses the shared `toCheckInput`. The save and the test share one check builder (M14 fails a save test and a panel test).
- No save operation, cache write or toast is reachable from `useTestCheck`. Classification branches on `status` and `code`, never on text. The TCP or HTTP lines follow the type that was sent, not a field of the result.
- Contract: body is `ServiceTestInput` with only `check` and `settings.timeout_seconds`. Responses handled are 200, 422, 403, 413, 401, and the rest as generic.
- Design reference: the CSS values match `docs/design/service-form.css` for `.form-layout`, `.test-panel*`, `.test-result*`, `.body-head*`, `.truncated` and the 900 px rule. No board markup copied.
- Layout, by reading CSS only: the panel is the second column and sticky above 900 px, static at or below it. `.code-block` (existing in `components.css`) has `overflow: auto` and `max-height: 280px`. I did not check the look at 360 px, the sticky behaviour or a real server's answers.
- The app was **not** built and run in a browser. Everything above is from tests and reading.

## Mutation checks run

Each one broken in source, covering tests run, then reverted (`git status` clean afterwards). "Caught by" shows how many tests failed.

| # | Break | Result |
|---|---|---|
| M01 | send the whole `ServiceInput` | caught (4) |
| M02 | add a `settings` key beyond timeout | caught (6) |
| M03 | check the name before a test | caught (17) |
| M04 | render the body with `dangerouslySetInnerHTML` | caught (1) |
| M05 | drop the cut-off line | caught (1) |
| M06 | show `HTTP` for a TCP result | caught (1) |
| M07 | clear the save's errors when a test starts | caught (1) |
| M08 | keep a test's errors when a save starts | caught (2) |
| M09 | enable `Run test` while saving (button) | caught (2) |
| M09b | same, but only the guard in `onRunTest` | **survived** (equivalent: the disabled button blocks the click) |
| M10 | drop the in-flight guard | caught (1) |
| M11 | call `createService` from the test | caught (2) |
| M12 | `Test not run` notice on a successful result | caught (1) |
| M13 | drop the `Reload` button | caught (2) |
| M14 | hard-code the method in the shared builder | caught (3, save and panel tests) |
| M15 | 413 classified as unexpected | caught (2) |
| M16 | 403 `csrf_failed` not recognised | caught (2) |
| M17 | 401 shows a failure | caught (1) |
| M18 | set state after unmount (result path) | **survived** (N2) |
| M19 | TCP lines chosen by the result, not the type | caught (1) |
| M20 | timeout read from the wrong field | caught (5) |
| M21 | focus always taken after an answer | caught (1) |

## Extra cases tried (step 6)

Added as rows or subtests in the existing test files (`testResult.test.ts`, `ServiceForm.test.tsx`), all passing:

- Duration boundaries 999, 1000 and 600000 → `999 ms`, `1,000 ms`, `600,000 ms`.
- A `422` naming a path of the other type (`check.host` on an HTTP form, message containing `<i>`): listed in the summary as text, no element created, notice shown, button enabled.

Covered by existing tests: pressing `Run test` twice, each client-error state, markup in the body and in server messages, the 413, 500 and network failures, a save while a test is pending.

Not tried individually: a 64 KB and a cut-off body in a real response, a 120-character failure field, leaving the page by each exit other than a successful save, and the sequence test, edit, save. The unit path for each is covered, and the failure-field and body cases are rendered as plain text children.

## Findings

### Blocking

None.

### Non-blocking

- **N1. Frontend suite times out under full-parallel load.** (test quality) First `make check` had 3 timeouts at 5 s (`AddServiceForm.test.tsx` two, `App.test.tsx` one), which passed alone and in the second full run. `AddServiceForm.test.tsx` now takes about 130 s alone (221 tests). Matters when: CI or a busy laptop runs `make check` and the user sees a red build that a rerun clears.
- **N2. "No state after unmount" is unobservable on the result path.** (test quality) M18 survives: removing the `onScreen` guard fails no test, because React 18+ does not warn on a state update after unmount. The 422 callback variant is real. Matters when: the hook gains an effect or a side effect on the result state, which the guard would then be the only protection for.
- **N3. Leaving the page is tested through one exit only.** (test quality) Only "a save succeeds while a test runs" is exercised through the router. Cancel, the back link and the leave prompt reach the same unmount guard but are not run. Matters when: a leave path is added that stays mounted while the answer arrives.
- **N4. The board's status icons and running-notice spinner are not built.** (cosmetic) The board draws a check icon on `Healthy` and a spinner in `Running one attempt…`. The task text lists neither, and the build uses text only (the button spinner is built). Matters when: the user compares the panel with the board and wants the icons.
- **N5. A `422` with an empty `errors` list shows the generic failure notice.** (report only) The contract says `errors[]` accompanies `validation_failed`, so no trigger exists today.
- **N6. M09b is an equivalent mutant.** (report only) The `saving` guard in `onRunTest` is redundant with the disabled button.

## Docs or specs that no longer match

- `STACK.md`: no new dependency; Lucide stays at 1.73.0 and the icons used exist. Nothing to record.
- `docs/openapi.yaml`, `docs/requirements.md`: no change needed. FR-104, FR-105, FR-106 and NFR-8 are implemented as written.
- `docs/design/README.md`: no change. The board's `testServiceCheck 404` state is not built, as the task says.
- `docs/manual-checks.md`: nothing made out of date. The sticky panel, the 360 px look and the focus outline fall under its Narrow screens and Keyboard sections at the release milestone.
- Task file: "Prerequisite" names a `service-list/lib/failureReason.ts` that has now moved to `lib/failureReason.ts`. That is the intended change.

## What I changed

Tests only: two table rows in `lib/testResult.test.ts` and one subtest in `components/ServiceForm.test.tsx`, plus this report. No source file changed (`git status` was clean after every mutation).
