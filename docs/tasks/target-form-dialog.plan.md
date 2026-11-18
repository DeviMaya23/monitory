# Plan: target form dialog

Branch: `feat/target-form-dialog`. Prerequisites checked on `main` (merged in `f880b43`, `9481d5e`, `8e8f879`): `features/alert-list/**`, `lib/api/targets.ts`, `Dialog.tsx` passes `getPortalHost()`, `Target` is `EmailTarget | WebhookTarget`. Names are as the task file fixes them.

Integration tests: the task touches only `frontend/src/`; no Go code with integration tests. `make test-integration`: not run: frontend-only task, no backend code changed (no integration test applies).

`make check`: run, passed (36 frontend test files, 520 tests; lint, build and Go build included).

## Checklist (one item per acceptance criterion)

Paths are under `frontend/src/`.

### `lib/api/targets.ts`
- [x] `createTarget`/`updateTarget` call `apiRequest` with the right method/path, ids encoded, rejection unchanged — `lib/api/targets.ts`, `targets.test.ts`

### `RadioGroup`
- [x] radiogroup named by its label, checked option, click/arrow change once, Tab once, `disabled`, text + icon — `components/ui/RadioGroup.tsx`, `RadioGroup.test.tsx`

### `Dialog` (added props)
- [x] `showClose` (Close calls `onClose` once, not while `busy`, absent without prop); `sheet` classes; `finalFocus` — `components/ui/Dialog.tsx`, `Dialog.test.tsx` (new cases appended, old ones unchanged)

### Hooks
- [x] `useTargetDialog`: add/edit/snapshot/close — `features/alert-list/hooks/useTargetDialog.ts`, `.test.tsx`
- [x] `useSaveTarget` 201/200: request args, cache append/replace, `dataUpdatedAt` kept, no refetch, toast, no cache created, in-flight list cancelled, unmount still writes — `hooks/useSaveTarget.ts`, `.test.tsx`
- [x] `useSaveTarget` failures: field-errors, duplicate, full, not-found, csrf, unexpected, 401 none, no toast/cache change, no second submit, new object each time — same test file
- [x] `useTargetServerErrors`: errorFor first, clearField, clearField('headers'), clearHeaders, new response resets — `hooks/useTargetServerErrors.ts`, `.test.tsx`
- [x] `useTargetLeaveGuard`: changed rules, `beforeunload` only while changed and not saving — `hooks/useTargetLeaveGuard.ts`, `.test.tsx`

### `targetFields`
- [x] path → label/input id, unknown/`type` no input, constant 50 — `lib/targetFields.ts`, `targetFields.test.ts`

### Form (`components/TargetDialog.test.tsx`, `HeaderRows.test.tsx`; components `TargetDialog.tsx`, `HeaderRows.tsx`, `TargetDialogBanners.tsx`, `TargetDiscardDialog.tsx`)
- [x] Add dialog opens: title, Email chosen, Name focused, `0/50`, `12/50`, maxlength 50, Close, footer, no test row
- [x] Webhook shows URL/hint/headers; switching keeps values; submit sends only active type's fields, `name` as typed
- [x] `http://` warning cases; save still sent
- [x] Header rows: add/focus, names, remove renumber/focus, only row → Add header, order, empty row sent, no limit
- [x] Client checks: empty address / URL messages, nothing sent, focus, cleared on edit
- [x] `<b>x</b>` as text in dialog, row, button names
- [x] Enter submits once; Enter while saving sends nothing
- [x] `No custom headers.` shows/goes
- [x] Row `Edit {name|address}` labels, footer hint, no Add target when not list/empty (in `AlertList.test.tsx`)
- [x] Opening dialog closes an open removal question (`AlertList.test.tsx`)
- [x] Saving state: disabled, aria-busy, `Saving…`, spinner, Cancel/Close/Esc/backdrop inert, read-only, second submit
- [x] 201 and edit 200: close, new row last, sub line, toast, focus rules, `name: ''` → `Unnamed …`
- [x] Refresh while edit open leaves values alone
- [x] 422: summary count/entries, focus, field messages, links, plain entries, clear on edit, header remove clears, first of two
- [x] 409 `target_duplicate` on add and edit, email and webhook
- [x] 409 `alert_list_full`: banner, focus, values stay
- [x] 404 on add (close + refetch + service-gone h2 focus); 404 on edit (banner, Save enabled, Close and refresh)
- [x] Next submit clears previous; 409/422 other codes and `alert_list_full` on edit → `Something went wrong.`
- [x] 422 `headers` path: summary + message under rows, Add header / remove clears
- [x] Esc on discard question closes only the question
- [x] 403 csrf Reload; 500/network `Try again` resends
- [x] 401: no toast, no banner
- [x] Leaving: unchanged closes + focus; changed asks, focus Keep editing; Keep/Esc/backdrop; Discard; edit focus; values restored = unchanged
- [x] Removal focus follows board; Add/Edit disabled during removal (`AlertList.test.tsx`)
- [x] Changed tests: `AlertList.test.tsx` criteria replaced as the task lists

### Repo-wide
- [x] `make check` passes — run, passed
- [x] (checked with `git diff main --stat`) Only `frontend/src/**` and this plan changed; `package.json`/lock unchanged; existing `Dialog.test.tsx` cases unchanged

Notes on where the tests live: the header-row criteria are in `TargetDialog.test.tsx` (through the real dialog) and in `HeaderRows.test.tsx` (generic behaviour); the `AlertList.test.tsx` criteria (Edit/Add buttons, removal focus, disabled during removal) are in `AlertList.test.tsx`; the opened-while-removal-question criterion is in `TargetDialog.test.tsx`.

## Judgment calls

- **Hidden submit button inside the form.** The footer's primary button is tied to the form by `form=`, but `user-event`'s Enter simulation only finds a submit button inside the form element, so Enter in an input did nothing in tests (real browsers do use a form-associated button). I added a `hidden`, `tabIndex=-1`, `aria-hidden` submit button inside the form as its default button, so Enter submits in both. The footer button is unchanged.
- **`useRemoveTarget.dismiss()`.** Opening the dialog must close an open removal question "with nothing sent" and without the focus move `cancel()` causes (it would send focus to that row's Remove). I added `dismiss()` to the hook rather than reuse `cancel()`. The hook has no new test file entry; `AlertList.test.tsx` / `TargetDialog.test.tsx` cover it through the screen.
- **After "Close and refresh"** the screen waits for the list's fetch to start and end (watching `view.fetching`), then focuses the row's Edit button or the page title. `useTargetList.refresh` stays `void` (an existing test passes its result to `act`).
- **Outcome-based focus on close.** `TargetDialog` reports how it ended (`left`, `added`, `saved`, `gone`, `refresh`) and `AlertList` decides the `finalFocus` and whether to fetch again; the opener comes from `useTargetDialog`'s state.
- **The nested discard question's backdrop.** Base UI renders no backdrop for a nested dialog, so a click on the page behind it lands on the question's own `.dialog-layer`; the test clicks that layer.
- **`failure` is derived from the mutation** (`useMemo` over its `error` and `variables`) rather than copied into state, so a repeat of the same kind is still a new object because each request resets the error first. `useSaveTarget` also exposes `clearFailure()` (a `mutation.reset()`), used so that a submit that fails the client checks drops the previous banner.
- **Email input** has the board's placeholder `name@example.com` and is not monospace (the task names `input--mono` for the URL only).
- **Dialog `finalFocus` and unmount.** `AlertList` unmounts `TargetDialog` when it closes (fresh form state for each opening, via a `nonce` key); Base UI still restores focus through `finalFocus` on unmount, as the tests show.
- **Toast role.** A toast has `role="dialog"`, so tests that wait for the form dialog to go look for the names `Add target` / `Edit target` only.
- **A stray formatting run.** I ran Prettier once without the project's style by mistake; I reverted every file it touched except my own, and re-formatted those with the repo's existing style (no semicolons, single quotes, width 120). The diff has no unrelated formatting changes.

