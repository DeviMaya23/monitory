# Plan: target test row

Branch: `feat/target-test-row`. Integration tests: not run: none apply (frontend only; no Go code touched).

Paths below are under `frontend/src/`. Outcome format for any integration item: `run, passed (<db version>)`, `run, failed`, or `not run: <reason>`.

## Acceptance criteria

### `lib/api/targets.ts`
- [x] `testTarget` calls `apiRequest('POST', '/api/services/s1/target-tests', input)` once, encodes the id, rejection unchanged. File: `lib/api/targets.ts`; test: `lib/api/targets.test.ts` ("testTarget …").

### `useTestTarget`
- [x] 200 delivered true / false-with-reason are results; no cache read/write, no toast, create/update not called. File: `features/alert-list/hooks/useTestTarget.ts`; test: `useTestTarget.test.tsx`.
- [x] 422 → `field-errors` in order; 404 → `not-found`; 403 csrf → `csrf`; 500 / TypeError / 413 / 403 other code / 404 no body → `unexpected`; 401 → none; new object per repeated failure; second `run` in flight sends nothing. Same test file.

### `TargetTestRow`
- [x] Idle, in flight, delivered, failed, failed with no reason, `<b>x</b>` as text, `aria-live="polite"`. File: `features/alert-list/components/TargetTestRow.tsx`; test: `TargetTestRow.test.tsx`.

### The dialog (`features/alert-list/components/TargetDialog.tsx`, test `TargetDialog.test.tsx`)
- [x] Row is last in the body (email, webhook; add, edit); after last field in Tab order; Enter and Space work.
- [x] Email: body as typed, pending state (aria-disabled, aria-busy, `Sending…`), second press sends nothing, form editable, footer primary enabled, Cancel/Close/Esc not blocked; delivered / failed shown; button keeps focus.
- [x] Webhook: body with rows in order (`headers: []` with none), no fields of the other type.
- [x] Client check: blank address / URL shows the save message, focus on the field, no call, editing clears it; blank Name / empty header rows don't stop the test.
- [x] Nothing saved: create/update/list not called, list and sub line unchanged, no toast, footer button / values / leave guard unchanged.
- [x] Result applies only to the values sent (edit name, contact, type, header row → hint; put back → result again; late answer after edit not shown; sending again shows the new result).
- [x] Test during save is sent; save during test is sent; late answer after close shows nothing, calls nothing, no list fetch on 404; when both fail only the latest action's failure shows.
- [x] 422: summary as for save, field messages, focus on summary, hint in result area, editing clears; a following successful test clears the summary.
- [x] 404: dialog closes, `listTargets` called again, 404 → "service not found" with `h2` focused; same for edit, no "This target no longer exists." banner.
- [x] 403 csrf: banner + `Reload` (calls `window.location.reload` once), focus not moved. 500 / network error: `Something went wrong.` + `Try again` sends the test again, not a save.
- [x] Save failure's `Try again` still saves; new test clears a save failure; new save clears a test failure.
- [x] 401: shell's sign-in form; no banner, no result.
- [x] Replaced idle-test assertion (`queryByText(/Send test alert/)`) now expects the row; `testTarget: vi.fn()` added to every mock factory of `lib/api/targets` (`TargetDialog.test.tsx`, `AlertList.test.tsx`, others found by grep).

### Other files
- [x] `TargetDialogBanners.tsx` takes the failure to show and the action `Try again` repeats (texts unchanged).
- [x] `useTargetServerErrors.ts` unchanged in shape; fed the current failure's errors.
- [x] `alert-list.css`: `.test-row`, `.test-row__result`, 640 px `.test-row .btn` rule copied from `docs/design/alerts.css`.
- [x] `gone` outcome comment updated in `TargetDialog.tsx`.

### Repo-wide
- [x] `make check` passes (exit 0; 773 frontend tests, build, backend build).
- [x] Only allowed paths changed; `package.json` and `package-lock.json` unchanged.
- [x] Pushed to `feat/target-test-row`.
- Integration test outcome: not run: no code with integration tests was touched.

## Judgment calls
- `useTestTarget.run(input, sent)` also takes the form values the request was sent with and exposes them as `sent`, next to `input`: the task asks for `sameValues` on form values, and `TargetInput` drops the other type's fields.
- The values are copied before sending (`getValues()` returns the form's live object, which later edits mutate in place; a test caught this).
- `TargetDialogBanners` needed no code change beyond doc comments: `onRetry` is already the action to repeat, chosen by the dialog (`lastAction`).
- A test's `422` focuses the summary; the other test failures leave focus alone, so the dialog's focus effect now branches on the action started last.
- `TargetTestRow` gets a `buttonRef` that the dialog holds but does not use to move focus (the button is `aria-disabled`, never `disabled`, so it never loses it).
- Tests' `Sending…` pending state is `aria-disabled`; the task's wording "disabled" in the row criterion is read the same way.
- App.test.tsx mocks `lib/api/targets` but renders no dialog and mocks no `createTarget`/`updateTarget`, so it did not get `testTarget`.
- A stray `npx prettier --write` early on reformatted `features/alert-list/` and `lib/api/targets.test.ts`; I reverted every tracked file with `git checkout` and redid my edits. My new files were re-formatted to the repo style (single quotes, no semicolons, 120 columns).
- Not run: the look at 360 px and a real delivery (jsdom cannot show them).
