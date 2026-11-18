# Verification report: target test row

Branch: `verify/target-test-row` (this session's branch, reset onto `feat/target-test-row` at `1b2585f`; pushed under that name).
Verdict: **no Blocking findings.** Source was not changed. No test was added: every mutation below failed at least one existing test, except the three listed as survivors, and those are equivalent changes (see Mutation checks).

`make check`: **run, passed** (exit 0; 773 frontend tests, frontend build, backend lint and tests with `-race`, `go build`). The first attempt failed only because `frontend/node_modules` was missing; `npm ci` fixed that and `package-lock.json` is unchanged.

## 1. Criteria

Test files: `TD` = `features/alert-list/components/TargetDialog.test.tsx` ("the test row"), `TR` = `TargetTestRow.test.tsx`, `UH` = `hooks/useTestTarget.test.tsx`, `AP` = `lib/api/targets.test.ts`.
"Real?" = would the test fail if the behavior were removed (mutation id from section 4 in brackets where I ran it).

| Criterion | Test | Real? | Status |
|---|---|---|---|
| `testTarget` calls POST once, path, id encoded, rejection unchanged (NFR-8) | AP "testTarget": calls POST once / encodes the service id / lets a rejection reach the caller | Yes: exact call args asserted, `rejects.toBe(error)` | Met |
| Hook: 200 delivered / failed are results; no cache read or write, no toast, create/update not called (FR-108) | UH "is a result, not a failure, and touches nothing…" (2 rows) | Yes: `getQueryData` identity, `dataUpdatedAt`, `isFetching`, toast spy [M2 failed 3 dialog tests; UH not reached since mutation hit onSuccess, dialog tests caught it] | Met |
| Hook: 422 field-errors in order; 404 not-found; 403 csrf; 500, TypeError, 413, 403 other code, 404 no body = unexpected; 401 none; new object on repeat; second run in flight sends nothing | UH "a failure, by status and code" (4 tests), "sends nothing for a second run" | Yes [M16, M17, M19 each failed exactly the matching UH test] | Met |
| Row: idle, in flight, delivered, failed, failed without reason, `<b>x</b>` as text (NFR-7), polite live region | TR (7 tests) | Yes [M10 failed "shows a reason with markup as text"; M11 failed "in flight"] | Met |
| Row last in the body (email, webhook; add, edit); Tab order; Enter and Space (NFR-4) | TD "is the last element of the form's body in %s" (4 rows), "comes after the header rows and the warning", "is reached by Tab… Enter and Space" | Yes: `lastElementChild` has `test-row`; Tab lands on the button, Tab again on Cancel | Met |
| Email: body as typed, name `''`; pending state; second press nothing; form editable; footer enabled; Cancel/Close/Esc not blocked; Delivered / Failed; focus kept (FR-107) | TD "sends the email as typed…", "shows Failed: and the reason", "does not block Cancel, Close or Esc…", "closes an untouched edit form at once…" | Yes [M5 readonly-while-testing failed; M6 block-closing failed 6; M11 `disabled` failed; M20 blur failed 5] | Met |
| Webhook body with rows in order, `headers: []`, no fields of the other type (FR-107) | TD "sends a webhook as {…}", "sends headers: [] with no rows" | Yes [M7 failed 5] | Met |
| Client check: blank address / URL message on the field, focus, no call, edit clears; blank Name and empty rows do not stop (FR-108) | TD "a blank %s contact…" (2 rows), "a blank Name and empty header rows do not stop the test" | Yes [M3 skip-check failed 3; M4 name-check failed 21] | Met |
| Nothing saved: no create/update/list, list and sub line unchanged, no toast, footer, values, leave guard (FR-108) | TD "saves nothing…", "leaves an untouched form closable at once after a test" | Yes [M1 save-on-test failed 19; M2 cache write failed 3] | Met |
| Result applies only to the values sent; any edit hides, put back shows again; late result not shown; new test shows its own | TD "the result and the values" (name/contact/type rows, header row, late arrival) | Yes [M8 keep-result failed 5; M22 no-copy failed the header-row test] | Met |
| Test during save is sent; save during test is sent; late answer after close shows nothing, calls nothing, no list fetch on 404; only the last action's failure shows | TD "a test and a save together" (4), "after the dialog has closed" (4 rows) | Yes [M21 failed "shows only the failure of the action started last"] | Met |
| 422: summary as for a save, field messages, focus on summary, hint, edit clears, good test clears the summary (FR-82, FR-89, FR-110) | TD "a 422 shows the summary and field messages…" | Yes [M12 close-on-422 and M15 no-focus each failed it] | Met |
| 404 closes, list refetched, "service not found" with `h2` focus; same for edit, no "no longer exists" banner | TD "a 404 on an add…", "a 404 on an edit…" | Partly real: closing/refetch is real [M14 failed both]; the "no banner" assertion cannot fail, because the dialog closes at once (see survivor S1) | Met |
| 403 csrf: banner + Reload once, focus kept (NFR-8); 500 / network: banner, values kept, Try again re-tests | TD "a 403 csrf_failed…", "%s shows Something went wrong…" (2 rows) | Yes [M9 failed 2, M20 failed 3] | Met |
| Save failure's Try again saves; new test clears save banner and summary; new save clears test failure | TD "a save failure's Try again still saves…" | Real for Try again and for the new-save direction. The "new test clears a save failure" half cannot fail (S2) | Met |
| 401: sign-in form, no banner, no result | TD "a 401 shows the sign-in form…", UH "maps a 401" | Yes [M18 failed UH] | Met |
| Idle-test assertion replaced; `testTarget: vi.fn()` in mock factories | TD "shows the board's form… the test row"; `AlertList.test.tsx` +1 line; `App.test.tsx` +0 | Yes | Met (App.test.tsx renders no dialog; the plan says so) |
| Test data schema-typed; `new ApiError(404, null, null)` for no body | UH, TD | n/a | Met |
| `make check` passes; nothing outside allowed paths; `package.json`, lockfile unchanged | run | n/a | Met (`git diff dbb1d73 HEAD --stat`: only `alert-list/**`, `lib/api/targets*.ts`, the plan) |

Requirement IDs: FR-107, FR-108, FR-82/89/110 (in part), NFR-7, NFR-8, NFR-4 (in part): all met as above.

## 2. Plan check

- Every criterion of the task file appears in the plan, in the same order. No criterion is missing.
- Every ticked item has a test that exists and checks the behavior (confirmed by reading the tests and by the mutations above), with the two exceptions in S1 and S2 where one assertion in an otherwise real test is vacuous.
- Plan vs diff: plan says `useTestTarget.run(input, sent)` exposes `sent` and copies the form values: both true in the diff. `TargetDialogBanners.tsx` changed only doc comments: true. `useTargetServerErrors.ts` unchanged: true. `buttonRef` is held and not used (`testRef` in `TargetDialog.tsx` is never read): matches the plan's judgment call, see Non-blocking N3.
- The plan says "773 frontend tests"; I got 773.
- The plan's integration line (not run: none apply) is accurate.

## 3. Rule checks

- **Dependencies:** none added; `package.json`, lockfile and `STACK.md` unchanged; versions unchanged.
- **Layers / data scoping / transactions:** frontend only. `TargetTestRow` has no request code; `useTestTarget` is the only caller of `testTarget`. No transactions involved.
- **`useTestTarget.ts`:** no cache write, no toast, no refetch on success. Failures chosen by `ApiError.status` and `code`, never text. 401 gives `null`. `result`, `input`, `sent` and `failure` derive from the mutation (`useMemo` over `error`/`variables`), not copied to state.
- **`TargetDialog.tsx`:** the body is built by `toInput`; the client check is `trigger` on the active contact field, which uses the existing `validate` rules (no second copy); result gated by `sameValues(values, test.sent)`; a test does not touch `guard`, `saving` or the footer button; closing is not blocked; `404` closes through `onFinish({kind:'gone'})` for add and edit.
- **Components:** reason is a React text child in `span.plain-text`, no `dangerouslySetInnerHTML`; button `type="button"`; Lucide icons only; strings defined once in `TEXT`; `…` and `’` as written. No hand-written widget and no design-reference code copied (CSS values only).
- **Keyboard:** the row is last in the form; focus is never moved on delivered, failed, csrf and unexpected (button never `disabled`); the summary takes focus on a 422.
- **CSS:** `.test-row`, `.test-row__result` and the 640 px rule are identical in value to `docs/design/alerts.css` lines 30, 31 and 42 and use tokens. `.test-row` wraps (`flex-wrap: wrap`). Not provable in jsdom: the look at 360 px.
- **Contract:** body is `EmailTargetInput` / `WebhookTargetInput` via `toInput`; handled statuses are 200, 422, 404, 403 csrf, 401, else "something went wrong"; `delivered: false` is a 200 result.

## 4. Mutation checks run

Each was applied to the source, the alert-list and `targets.test.ts` tests run, then reverted (`git status` clean afterwards).

| # | Mutation | Result |
|---|---|---|
| M1 | also save the target on a test | failed (19) |
| M2 | `onSuccess` invalidates the cache | failed (3) |
| M3 | skip the client check | failed (3) |
| M4 | also require a non-blank Name | failed (21) |
| M5 | form read-only while testing | failed (1) |
| M6 | Cancel/Close disabled while testing | failed (6) |
| M7 | send an extra field of the other type | failed (5) |
| M8 | keep the result after an edit (no `sameValues`) | failed (5) |
| M9 | `Try again` saves after a test failure | failed (2) |
| M10 | reason as HTML | failed (1, `TargetTestRow`) |
| M11 | `disabled` instead of `aria-disabled` | failed (2) |
| M12 | close the dialog on a 422 | failed (1) |
| M13 | `delivered: false` thrown as an error | failed (7) |
| M14 | a test 404 does not close | failed (2) |
| M15 | no summary focus on a test 422 | failed (1) |
| M16 | 403 any code = csrf | failed (1, `useTestTarget`) |
| M17 | 401 gives `unexpected` | failed (1, `useTestTarget`) |
| M18 | button `type="submit"` | failed (24) |
| M19 | no in-flight guard in `run` | failed (1, `useTestTarget`) |
| M20 | blur the button when the test ends (lose focus) | failed (5) |
| M21 | show the save failure instead of the last action's | failed (1) |
| M22 | do not copy the form values before sending | failed (1) |
| S1 | drop the `not-found` guard so the edit "no longer exists" banner could show | **survived** |
| S2 | do not call `clearFailure()` when a test starts | **survived** |

Survivors: both are equivalent changes in the current code. S1: the dialog closes on a test 404 before the banner can render, so the guard in `failure = …` is redundant. S2: after a test starts, `lastAction` is `'test'`, so a stale save failure is hidden anyway, and the next save clears it. Both lines are harmless defense; the two vacuous assertions are listed in Non-blocking.

## 5. Other cases tried (by reading the code and tests)

Blank address with spaces; webhook blank URL; email with SMTP failure text (`no SMTP account configured`); markup in a reason; test, edit, test; Cancel while pending (changed and untouched form); test during a save and a save during a test; 422 then corrected test; 404 on an edit dialog; the late answer after close for a result, 422, 500 and 404; two presses in the same tick (guarded by `inFlight` and tested at hook level); form values mutated after sending (copy tested). Integration tests: none apply (frontend only); "not run: none touch this code". Criteria depending only on integration tests: none. A webhook to a refusing receiver and a real delivery were not run (jsdom and no SMTP here); the milestone's end-to-end and manual checks cover them. I did not run the built app in a browser; no live run.

## 6. Findings

### Blocking

None.

### Non-blocking

- **N1 (test quality): two assertions cannot fail.** TD "a 404 on an edit…" asserts no "This target no longer exists." text after the dialog is gone, and TD "a save failure's Try again…" asserts a new test clears the save banner, which the last-action rule already hides. Both tests stay real for their main behavior. Matters when: someone changes the dialog so a test 404 no longer closes it, or removes the `lastAction` rule; the first assertion would then be the only guard and it would be asserting against an unmounted dialog. Category: test quality.
- **N2 (decision needed): a test's 404 is ignored if a save was started after it.** If a test is in flight and the admin presses Save, then the test answers 404, the dialog stays open (only the latest action's failure counts); the save will 404 as well in that case. Matters when: a test answers 404 while the save started after it succeeds, which would need the service to be deleted between the two requests. Report only.
- **N3 (cosmetic): `testRef` in `TargetDialog.tsx` is created and passed but never read.** Matters when: a lint rule on unused refs is added or someone assumes it moves focus. Category: cosmetic.

## 7. Docs or specs that no longer match

- `docs/design/README.md`: the board disables the test button while testing; the build uses `aria-disabled` (task file: "the user may list it in `docs/design/README.md`"). Not listed yet.
- `docs/tasks/backlog.md`, "Milestone 2: alerting" table: the target-test-row's slice (FR-107, FR-108 screen half) can leave the table once this merges, since its task file exists.
- `docs/manual-checks.md`: no change. Nothing from this merge makes a heading due on its own; "At each milestone" waits for the milestone 2 end-to-end task.
- `docs/openapi.yaml`, `docs/requirements.md`, `STACK.md`: no change; no version adopted.
