# Plan: edit service screen

Branch: `feat/edit-service-screen`. Paths are under `frontend/src/` unless noted. Prerequisites checked after merging `origin/main` (#46, #48): all present.

## Lib and hooks

- [ ] `toFormValues` of a full HTTP service, a TCP service and a service with no `settings` — `features/service-form/lib/serviceInput.ts`, test `serviceInput.test.ts`
- [ ] `toServiceInput(toFormValues(service))` round trip (HTTP, TCP, sparse, `enabled:false` cert, no key of the other type) — `lib/serviceInput.ts`, test `serviceInput.test.ts`
- [ ] `isFormChanged` cases (equal, each field, rows added/removed, `'30 '`, put back, add defaults) — `lib/formChanged.ts`, test `formChanged.test.ts`
- [ ] `getService` / `updateService` call GET / PUT with encoded id; `serviceQueryKey` — `lib/api/services.ts`, test `services.test.ts`
- [ ] `useService` states (loading, loaded, session-ended, not-found, could-not-load, refetch, no focus refetch, no cached copy) — `hooks/useService.ts`, test `useService.test.tsx`
- [ ] `useUpdateService` (path id, body, `shown_on_public_view`, 200 removes `['services']` exact and keeps `['services', id]`, 404 not-found, 409 limit generic, others as create) — `hooks/useUpdateService.ts`, test `useUpdateService.test.tsx`; `hooks/useSaveService.ts` + `useSaveService.test.tsx` (mode create/update, in-flight guard, not-found drops list)
- [ ] `useCreateService` tests pass unchanged (`ServiceFormValues` import moves) — `hooks/useCreateService.test.tsx`
- [ ] `useLeaveGuard` takes `changed`; "what is changed" cases move — `hooks/useLeaveGuard.ts`, `useLeaveGuard.test.tsx`, `formChanged.test.ts`

## Page and states

- [ ] Loading state (back link, heading, `Loading service…`, no form, called with the address id) — `pages/EditServicePage.tsx`, `components/EditLoadStates.tsx`, test `pages/EditServicePage.test.tsx`
- [ ] Load failed (500): banner, `Try again` disabled while in flight, retry 200 shows form — `EditServicePage.test.tsx`
- [ ] Not found: replaces page, list entry removed, no back link/heading, link to `/`, focus on h2 — `EditServicePage.test.tsx`
- [ ] Session ended: no banner/form, ends on sign-in with notice — `EditServicePage.test.tsx`, `App.test.tsx`
- [ ] Routes: `/services/some-id` shows page; `/alerts` and others unchanged; signed-out gate; 401 notice — `App.tsx`, `App.test.tsx`

## Form

- [ ] Loaded HTTP service: every control at its saved value, heading, sub line, Name focused, footer empty, no banner — `components/EditServiceForm.tsx`, test `EditServiceForm.test.tsx`
- [ ] Loaded TCP service — `EditServiceForm.test.tsx`
- [ ] Sub line keeps loaded name while editing — `EditServiceForm.test.tsx`
- [ ] Save with nothing changed sends saved values + `shown_on_public_view` as loaded — `EditServiceForm.test.tsx`
- [ ] Save after edits sends each edit, to the address id — `EditServiceForm.test.tsx`
- [ ] Change of type both ways (FR-66) — `EditServiceForm.test.tsx`
- [ ] While saving states — `EditServiceForm.test.tsx`
- [ ] Success: `/`, list entry gone, `getService` once, toast with response name, no discard question — `EditServiceForm.test.tsx`
- [ ] Every failure of the Add table on the edit form; `<b>x</b>` as text — `EditServiceForm.test.tsx`
- [ ] `404` on save: banner, Save disabled, values stay, focus on link, link leaves without asking, Cancel asks — `EditServiceForm.test.tsx`
- [ ] `409 service_limit_reached` generic; Enter after 404 sends nothing; list entry gone — `EditServiceForm.test.tsx`
- [ ] Leaving: untouched leaves without question; changed asks; put back leaves; `Unsaved changes` footer — `EditServiceForm.test.tsx`
- [ ] `401` on save while changed ends on sign-in — `EditServiceForm.test.tsx`
- [ ] Saved name with `<b>x</b>` as text — `EditServiceForm.test.tsx`
- [ ] `ServiceForm` split; Add form unchanged, `AddServiceForm.test.tsx` passes as is — `components/ServiceForm.tsx`, `AddServiceForm.tsx`, `ServiceForm.test.tsx` only if needed

## Repo-wide

- [ ] `make check` passes: not run yet
- [ ] Nothing outside allowed paths changed; `package.json` and lockfile unchanged
- [ ] Integration tests: not run: frontend-only task, no Go code touched (task says none applies)

## Judgment calls

(filled at the end)
