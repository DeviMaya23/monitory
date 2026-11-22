# Plan: edit service screen

Branch: `feat/edit-service-screen`. Paths are under `frontend/src/` unless noted. Prerequisites checked after merging `origin/main` (#46, #48): all present.

## Lib and hooks

- [x] `toFormValues` of a full HTTP service, a TCP service and a service with no `settings` — `features/service-form/lib/serviceInput.ts`, test `serviceInput.test.ts`
- [x] `toServiceInput(toFormValues(service))` round trip (HTTP, TCP, sparse, `enabled:false` cert, no key of the other type) — `lib/serviceInput.ts`, test `serviceInput.test.ts`
- [x] `isFormChanged` cases (equal, each field, rows added/removed, `'30 '`, put back, add defaults) — `lib/formChanged.ts`, test `formChanged.test.ts`
- [x] `getService` / `updateService` call GET / PUT with encoded id; `serviceQueryKey` — `lib/api/services.ts`, test `services.test.ts`
- [x] `useService` states (loading, loaded, session-ended, not-found, could-not-load, refetch, no focus refetch, no cached copy) — `hooks/useService.ts`, test `useService.test.tsx`
- [x] `useUpdateService` (path id, body, `shown_on_public_view`, 200 removes `['services']` exact and keeps `['services', id]`, 404 not-found, 409 limit generic, others as create) — `hooks/useUpdateService.ts`, test `useUpdateService.test.tsx`; `hooks/useSaveService.ts` + `useSaveService.test.tsx` (mode create/update, in-flight guard, not-found drops list)
- [x] `useCreateService` tests pass unchanged (`ServiceFormValues` import moves) — `hooks/useCreateService.test.tsx`
- [x] `useLeaveGuard` takes `changed`; "what is changed" cases move — `hooks/useLeaveGuard.ts`, `useLeaveGuard.test.tsx`, `formChanged.test.ts`

## Page and states

- [x] Loading state (back link, heading, `Loading service…`, no form, called with the address id) — `pages/EditServicePage.tsx`, `components/EditLoadStates.tsx`, test `pages/EditServicePage.test.tsx`
- [x] Load failed (500): banner, `Try again` disabled while in flight, retry 200 shows form — `EditServicePage.test.tsx`
- [x] Not found: replaces page, list entry removed, no back link/heading, link to `/`, focus on h2 — `EditServicePage.test.tsx`
- [x] Session ended: no banner/form, ends on sign-in with notice — `EditServicePage.test.tsx`, `App.test.tsx`
- [x] Routes: `/services/some-id` shows page; `/alerts` and others unchanged; signed-out gate; 401 notice — `App.tsx`, `App.test.tsx`

## Form

- [x] Loaded HTTP service: every control at its saved value, heading, sub line, Name focused, footer empty, no banner — `components/EditServiceForm.tsx`, test `EditServiceForm.test.tsx`
- [x] Loaded TCP service — `EditServiceForm.test.tsx`
- [x] Sub line keeps loaded name while editing — `EditServiceForm.test.tsx`
- [x] Save with nothing changed sends saved values + `shown_on_public_view` as loaded — `EditServiceForm.test.tsx`
- [x] Save after edits sends each edit, to the address id — `EditServiceForm.test.tsx`
- [x] Change of type both ways (FR-66) — `EditServiceForm.test.tsx`
- [x] While saving states — `EditServiceForm.test.tsx`
- [x] Success: `/`, list entry gone, `getService` once, toast with response name, no discard question — `EditServiceForm.test.tsx`
- [x] Every failure of the Add table on the edit form; `<b>x</b>` as text — `EditServiceForm.test.tsx`
- [x] `404` on save: banner, Save disabled, values stay, focus on link, link leaves without asking, Cancel asks — `EditServiceForm.test.tsx`
- [x] `409 service_limit_reached` generic; Enter after 404 sends nothing; list entry gone — `EditServiceForm.test.tsx`
- [x] Leaving: untouched leaves without question; changed asks; put back leaves; `Unsaved changes` footer — `EditServiceForm.test.tsx`
- [x] `401` on save while changed ends on sign-in — `EditServiceForm.test.tsx`
- [x] Saved name with `<b>x</b>` as text — `EditServiceForm.test.tsx`
- [x] `ServiceForm` split; Add form unchanged, `AddServiceForm.test.tsx` passes as is — `components/ServiceForm.tsx`, `AddServiceForm.tsx`, `ServiceForm.test.tsx` only if needed

## Repo-wide

- [x] `make check` passes: run, passed (exit 0; 67 test files, 1215 frontend tests, Go tests, builds, contract lint)
- [x] Nothing outside allowed paths changed; `package.json` and lockfile unchanged
- [x] Integration tests (`make test-integration`): not run: frontend-only task, no backend code touched, and the task file says none applies

## Judgment calls

- `markSavedRef`: the wrappers create the hook before the form exists, so each passes a ref into `ServiceForm`, which stores the guard's `markSaved` in it. The task did not say how the guard reached the wrapper's `onSaved`.
- `useService` derives `could-not-load` from `query.isFetched` with no data, not from `isError`: a retry resets the query to pending, and the banner has to stay (with `Try again` disabled) while the retry runs. It also sets `refetchOnMount: 'always'` and `staleTime: 0` next to `gcTime: 0`.
- `toFormValues` keeps `min_days_left` as the days text even when a saved `certificate_check` is `enabled: false`; the task only fixed the case with no days.
- A `404` with a problem body of another code, or no body, is the generic failure on save (the classifier branches on `status` and `code` together).
- The `401` on save test is in `App.test.tsx` (it needs the shell's handler); the form test file does not repeat it.
- `useLeaveGuard.test.tsx`: the harness is reduced to a name input and `changed` follows it; the "what makes the form changed" cases are now in `formChanged.test.ts`, written against `isFormChanged`. Its "put back" row only re-asserts that equal values are unchanged; the end-to-end "put back" cases are in `EditServiceForm.test.tsx`.
- `test/fixtures.ts` gained `makeRichService` (a service with every setting non-default); no existing helper covered headers, rules, certificate options and a body.
- `EditServiceForm.test.tsx` renders the real `EditServicePage` rather than the bare form, so "`getService` called once in all" can be asserted.
- The first full parallel run showed one `AddServiceForm.test.tsx` case ('shows a name with markup as text in the toast') typing `h<b` under load; it passed alone and in the final `make check`. I did not change that test.
- Commits are grouped slightly differently from the task's suggestion: the shared libs, hooks, guard change, form split and page wiring are in one commit, and the tests of the page and form are in the next.
- Layout and focus outline were checked by reading the CSS only, not in a browser; the app was not run.
