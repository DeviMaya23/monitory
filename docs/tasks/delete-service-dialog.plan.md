# Plan: delete service dialog

Branch: `feat/delete-service-dialog`. Paths are under `frontend/src/`.

## Acceptance criteria

- [ ] `deleteService`: calls `apiRequest('DELETE', …)` once, resolves undefined, id encoded, rejection unchanged. File `lib/api/services.ts`; test `lib/api/services.test.ts`.
- [ ] `AlertDialog`: role `alertdialog`, named by title, described by body, focus on `initialFocus`. File `components/ui/AlertDialog.tsx`; test `components/ui/AlertDialog.test.tsx`.
- [ ] `AlertDialog`: Esc calls `onClose` once and focus returns to opener; backdrop click does not call it; `busy` blocks Esc; footer renders. Same test file.
- [ ] `AlertDialog`: `finalFocus` overrides return focus. Same test file.
- [ ] `useDeleteService`: `ask`/`cancel` without request; `confirm` calls once, in flight until settled, second `confirm` sends nothing. File `features/service-list/hooks/useDeleteService.ts`; test `useDeleteService.test.tsx`.
- [ ] `useDeleteService` 204: exact removal, others keep identity and order, `dataUpdatedAt` kept, no refetch, success toast, asked cleared; last one leaves `[]`. Same test.
- [ ] `useDeleteService`: in-flight list request is cancelled on 204. Same test.
- [ ] `useDeleteService` 404 `not_found`: removal + already-deleted toast. Same test.
- [ ] `useDeleteService` 403 `csrf_failed`: cache unchanged, toast with `Reload` calling `window.location.reload` once. Same test.
- [ ] `useDeleteService`: 500, network error, 403 other code, 404 without body, 404 other code → generic toast, cache unchanged, asked cleared. Same test.
- [ ] `useDeleteService`: 401 shows no toast, clears asked. Same test.
- [ ] `useDeleteService`: no cache entry → none created. Same test.
- [ ] `useDeleteService`: unmounted during request, 204 still removes and toasts. Same test.
- [ ] `DeleteServiceDialog`: title, body for 3 / 1 / 0 targets, second paragraph. File `features/service-list/components/DeleteServiceDialog.tsx`; test `DeleteServiceDialog.test.tsx`.
- [ ] `DeleteServiceDialog`: name `<b>x</b>` is text (NFR-7). Same test.
- [ ] `DeleteServiceDialog`: Cancel focused on open; `Trash2` icon; deleting state disables both, `Deleting…`, `aria-busy`. Same test.
- [ ] Screen: one `Delete {name}` button per row (paused, TCP too), `.btn__label` aria-hidden, header gains `Actions`. Files `ServiceRow.tsx`, `ServiceList.tsx`, `service-list.css`; test `ServiceList.test.tsx`.
- [ ] Screen: click opens dialog, no request; two rows each own name and count. Same test.
- [ ] Screen: Cancel / Esc close with no request and focus on the row's button; backdrop leaves it open. Same test.
- [ ] Screen: confirm sends one request; pending state, Esc does nothing, second click sends none. Same test.
- [ ] Screen 204: dialog gone, row gone, order kept, count in heading, toast, focus on `h1`; last service shows Empty block. Same test.
- [ ] Screen 404 `not_found`: same removal and focus, already-deleted toast. Same test.
- [ ] Screen 403 / 500 / network error: dialog gone, rows kept, right toast, focus on Delete button. Same test.
- [ ] Screen: dialog text stable on refresh; refresh removing the service then 404 gives already-deleted toast. Same test.
- [ ] Screen: `Updated {time}` unchanged after a removal. Same test.
- [ ] App: delete answered 401 ends on sign-in with notice, no toast, `['services']` cache gone. File `DashboardPage.tsx`; test `App.test.tsx`.
- [ ] Tests changed on purpose (`ServiceList.test.tsx` button assertion, render helper, pass-through mock; `App.test.tsx` mock) done as the task describes.
- [ ] `make check` passes.
- [ ] Nothing outside `frontend/src/` and this plan changed; `package.json` and lockfile unchanged.

## Integration tests

- [ ] not run: no backend or integration-tested code is touched (frontend only; task says none applies).

## Judgment calls

(filled in at the end)
