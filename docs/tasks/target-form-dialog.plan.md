# Plan: target form dialog

Branch: `feat/target-form-dialog`. Prerequisites checked on `main` (merged in `f880b43`, `9481d5e`, `8e8f879`): `features/alert-list/**`, `lib/api/targets.ts`, `Dialog.tsx` passes `getPortalHost()`, `Target` is `EmailTarget | WebhookTarget`. Names are as the task file fixes them.

Integration tests: the task touches only `frontend/src/`; no Go code with integration tests. `make test-integration`: not run: frontend-only task, no backend code changed.

## Checklist (one item per acceptance criterion)

Paths are under `frontend/src/`.

### `lib/api/targets.ts`
- [ ] `createTarget`/`updateTarget` call `apiRequest` with the right method/path, ids encoded, rejection unchanged — `lib/api/targets.ts`, `targets.test.ts`

### `RadioGroup`
- [ ] radiogroup named by its label, checked option, click/arrow change once, Tab once, `disabled`, text + icon — `components/ui/RadioGroup.tsx`, `RadioGroup.test.tsx`

### `Dialog` (added props)
- [ ] `showClose` (Close calls `onClose` once, not while `busy`, absent without prop); `sheet` classes; `finalFocus` — `components/ui/Dialog.tsx`, `Dialog.test.tsx` (new cases appended, old ones unchanged)

### Hooks
- [ ] `useTargetDialog`: add/edit/snapshot/close — `features/alert-list/hooks/useTargetDialog.ts`, `.test.tsx`
- [ ] `useSaveTarget` 201/200: request args, cache append/replace, `dataUpdatedAt` kept, no refetch, toast, no cache created, in-flight list cancelled, unmount still writes — `hooks/useSaveTarget.ts`, `.test.tsx`
- [ ] `useSaveTarget` failures: field-errors, duplicate, full, not-found, csrf, unexpected, 401 none, no toast/cache change, no second submit, new object each time — same test file
- [ ] `useTargetServerErrors`: errorFor first, clearField, clearField('headers'), clearHeaders, new response resets — `hooks/useTargetServerErrors.ts`, `.test.tsx`
- [ ] `useTargetLeaveGuard`: changed rules, `beforeunload` only while changed and not saving — `hooks/useTargetLeaveGuard.ts`, `.test.tsx`

### `targetFields`
- [ ] path → label/input id, unknown/`type` no input, constant 50 — `lib/targetFields.ts`, `targetFields.test.ts`

### Form (`components/TargetDialog.test.tsx`, `HeaderRows.test.tsx`; components `TargetDialog.tsx`, `HeaderRows.tsx`, `TargetDialogBanners.tsx`, `TargetDiscardDialog.tsx`)
- [ ] Add dialog opens: title, Email chosen, Name focused, `0/50`, `12/50`, maxlength 50, Close, footer, no test row
- [ ] Webhook shows URL/hint/headers; switching keeps values; submit sends only active type's fields, `name` as typed
- [ ] `http://` warning cases; save still sent
- [ ] Header rows: add/focus, names, remove renumber/focus, only row → Add header, order, empty row sent, no limit
- [ ] Client checks: empty address / URL messages, nothing sent, focus, cleared on edit
- [ ] `<b>x</b>` as text in dialog, row, button names
- [ ] Enter submits once; Enter while saving sends nothing
- [ ] `No custom headers.` shows/goes
- [ ] Row `Edit {name|address}` labels, footer hint, no Add target when not list/empty (in `AlertList.test.tsx`)
- [ ] Opening dialog closes an open removal question (`AlertList.test.tsx`)
- [ ] Saving state: disabled, aria-busy, `Saving…`, spinner, Cancel/Close/Esc/backdrop inert, read-only, second submit
- [ ] 201 and edit 200: close, new row last, sub line, toast, focus rules, `name: ''` → `Unnamed …`
- [ ] Refresh while edit open leaves values alone
- [ ] 422: summary count/entries, focus, field messages, links, plain entries, clear on edit, header remove clears, first of two
- [ ] 409 `target_duplicate` on add and edit, email and webhook
- [ ] 409 `alert_list_full`: banner, focus, values stay
- [ ] 404 on add (close + refetch + service-gone h2 focus); 404 on edit (banner, Save enabled, Close and refresh)
- [ ] Next submit clears previous; 409/422 other codes and `alert_list_full` on edit → `Something went wrong.`
- [ ] 422 `headers` path: summary + message under rows, Add header / remove clears
- [ ] Esc on discard question closes only the question
- [ ] 403 csrf Reload; 500/network `Try again` resends
- [ ] 401: no toast, no banner
- [ ] Leaving: unchanged closes + focus; changed asks, focus Keep editing; Keep/Esc/backdrop; Discard; edit focus; values restored = unchanged
- [ ] Removal focus follows board; Add/Edit disabled during removal (`AlertList.test.tsx`)
- [ ] Changed tests: `AlertList.test.tsx` criteria replaced as the task lists

### Repo-wide
- [ ] `make check` passes
- [ ] Only `frontend/src/**` and this plan changed; `package.json`/lock unchanged; existing `Dialog.test.tsx` cases unchanged

## Judgment calls
(filled at the end)
