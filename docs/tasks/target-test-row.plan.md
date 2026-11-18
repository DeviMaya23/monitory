# Plan: target test row

Branch: `feat/target-test-row`. Integration tests: none apply (frontend only; no Go code touched).

Paths below are under `frontend/src/`. Outcome format for any integration item: `run, passed (<db version>)`, `run, failed`, or `not run: <reason>`.

## Acceptance criteria

### `lib/api/targets.ts`
- [ ] `testTarget` calls `apiRequest('POST', '/api/services/s1/target-tests', input)` once, encodes the id, rejection unchanged. File: `lib/api/targets.ts`; test: `lib/api/targets.test.ts` ("testTarget …").

### `useTestTarget`
- [ ] 200 delivered true / false-with-reason are results; no cache read/write, no toast, create/update not called. File: `features/alert-list/hooks/useTestTarget.ts`; test: `useTestTarget.test.tsx`.
- [ ] 422 → `field-errors` in order; 404 → `not-found`; 403 csrf → `csrf`; 500 / TypeError / 413 / 403 other code / 404 no body → `unexpected`; 401 → none; new object per repeated failure; second `run` in flight sends nothing. Same test file.

### `TargetTestRow`
- [ ] Idle, in flight, delivered, failed, failed with no reason, `<b>x</b>` as text, `aria-live="polite"`. File: `features/alert-list/components/TargetTestRow.tsx`; test: `TargetTestRow.test.tsx`.

### The dialog (`features/alert-list/components/TargetDialog.tsx`, test `TargetDialog.test.tsx`)
- [ ] Row is last in the body (email, webhook; add, edit); after last field in Tab order; Enter and Space work.
- [ ] Email: body as typed, pending state (aria-disabled, aria-busy, `Sending…`), second press sends nothing, form editable, footer primary enabled, Cancel/Close/Esc not blocked; delivered / failed shown; button keeps focus.
- [ ] Webhook: body with rows in order (`headers: []` with none), no fields of the other type.
- [ ] Client check: blank address / URL shows the save message, focus on the field, no call, editing clears it; blank Name / empty header rows don't stop the test.
- [ ] Nothing saved: create/update/list not called, list and sub line unchanged, no toast, footer button / values / leave guard unchanged.
- [ ] Result applies only to the values sent (edit name, contact, type, header row → hint; put back → result again; late answer after edit not shown; sending again shows the new result).
- [ ] Test during save is sent; save during test is sent; late answer after close shows nothing, calls nothing, no list fetch on 404; when both fail only the latest action's failure shows.
- [ ] 422: summary as for save, field messages, focus on summary, hint in result area, editing clears; a following successful test clears the summary.
- [ ] 404: dialog closes, `listTargets` called again, 404 → "service not found" with `h2` focused; same for edit, no "This target no longer exists." banner.
- [ ] 403 csrf: banner + `Reload` (calls `window.location.reload` once), focus not moved. 500 / network error: `Something went wrong.` + `Try again` sends the test again, not a save.
- [ ] Save failure's `Try again` still saves; new test clears a save failure; new save clears a test failure.
- [ ] 401: shell's sign-in form; no banner, no result.
- [ ] Replaced idle-test assertion (`queryByText(/Send test alert/)`) now expects the row; `testTarget: vi.fn()` added to every mock factory of `lib/api/targets` (`TargetDialog.test.tsx`, `AlertList.test.tsx`, others found by grep).

### Other files
- [ ] `TargetDialogBanners.tsx` takes the failure to show and the action `Try again` repeats (texts unchanged).
- [ ] `useTargetServerErrors.ts` unchanged in shape; fed the current failure's errors.
- [ ] `alert-list.css`: `.test-row`, `.test-row__result`, 640 px `.test-row .btn` rule copied from `docs/design/alerts.css`.
- [ ] `gone` outcome comment updated in `TargetDialog.tsx`.

### Repo-wide
- [ ] `make check` passes.
- [ ] Only allowed paths changed; `package.json` and `package-lock.json` unchanged.
- [ ] Pushed to `feat/target-test-row`.

## Judgment calls
(filled in at the end)
