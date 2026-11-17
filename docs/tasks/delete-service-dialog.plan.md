# Plan: delete service dialog

Branch: `feat/delete-service-dialog`. Paths are under `frontend/src/`.

## Acceptance criteria

- [x] `deleteService`: calls `apiRequest('DELETE', …)` once, resolves undefined, id encoded, rejection unchanged. File `lib/api/services.ts`; test `lib/api/services.test.ts`.
- [x] `AlertDialog`: role `alertdialog`, named by title, described by body, focus on `initialFocus`. File `components/ui/AlertDialog.tsx`; test `components/ui/AlertDialog.test.tsx`.
- [x] `AlertDialog`: Esc calls `onClose` once and focus returns to opener; backdrop click does not call it; `busy` blocks Esc; footer renders. Same test file.
- [x] `AlertDialog`: `finalFocus` overrides return focus. Same test file.
- [x] `useDeleteService`: `ask`/`cancel` without request; `confirm` calls once, in flight until settled, second `confirm` sends nothing. File `features/service-list/hooks/useDeleteService.ts`; test `useDeleteService.test.tsx`.
- [x] `useDeleteService` 204: exact removal, others keep identity and order, `dataUpdatedAt` kept, no refetch, success toast, asked cleared; last one leaves `[]`. Same test.
- [x] `useDeleteService`: in-flight list request is cancelled on 204. Same test.
- [x] `useDeleteService` 404 `not_found`: removal + already-deleted toast. Same test.
- [x] `useDeleteService` 403 `csrf_failed`: cache unchanged, toast with `Reload` calling `window.location.reload` once. Same test.
- [x] `useDeleteService`: 500, network error, 403 other code, 404 without body, 404 other code → generic toast, cache unchanged, asked cleared. Same test.
- [x] `useDeleteService`: 401 shows no toast, clears asked. Same test.
- [x] `useDeleteService`: no cache entry → none created. Same test.
- [x] `useDeleteService`: unmounted during request, 204 still removes and toasts. Same test.
- [x] `DeleteServiceDialog`: title, body for 3 / 1 / 0 targets, second paragraph. File `features/service-list/components/DeleteServiceDialog.tsx`; test `DeleteServiceDialog.test.tsx`.
- [x] `DeleteServiceDialog`: name `<b>x</b>` is text (NFR-7). Same test.
- [x] `DeleteServiceDialog`: Cancel focused on open; `Trash2` icon; deleting state disables both, `Deleting…`, `aria-busy`. Same test.
- [x] Screen: one `Delete {name}` button per row (paused, TCP too), `.btn__label` aria-hidden, header gains `Actions`. Files `ServiceRow.tsx`, `ServiceList.tsx`, `service-list.css`; test `ServiceList.test.tsx`.
- [x] Screen: click opens dialog, no request; two rows each own name and count. Same test.
- [x] Screen: Cancel / Esc close with no request and focus on the row's button; backdrop leaves it open. Same test.
- [x] Screen: confirm sends one request; pending state, Esc does nothing, second click sends none. Same test.
- [x] Screen 204: dialog gone, row gone, order kept, count in heading, toast, focus on `h1`; last service shows Empty block. Same test.
- [x] Screen 404 `not_found`: same removal and focus, already-deleted toast. Same test.
- [x] Screen 403 / 500 / network error: dialog gone, rows kept, right toast, focus on Delete button. Same test.
- [x] Screen: dialog text stable on refresh; refresh removing the service then 404 gives already-deleted toast. Same test.
- [x] Screen: `Updated {time}` unchanged after a removal. Same test.
- [x] App: delete answered 401 ends on sign-in with notice, no toast, `['services']` cache gone. File `DashboardPage.tsx`; test `App.test.tsx`.
- [x] Tests changed on purpose (`ServiceList.test.tsx` button assertion, render helper, pass-through mock; `App.test.tsx` mock) done as the task describes.
- [ ] `make check` passes: NOT fully. Every step passes (lint, lint-css, openapi-lint, 317 frontend tests, Go tests, builds) except `lint-md`, which fails on `docs/tasks/delete-service-dialog.md:80` (MD038, spaces inside a code span). That file is the task file; I may not change `docs/`. Reported, not worked around.
- [x] Nothing outside `frontend/src/` and this plan changed; `package.json` and lockfile unchanged.

## Integration tests

- [x] not run: no backend or integration-tested code is touched (frontend only; task says none applies).

## Judgment calls

- `finalFocus` returns `null`, not `undefined`, for "back to the opener": Base UI treats `undefined` as "do not return focus". The wrapper's prop type is `() => HTMLElement | null`.
- The cache change keeps every other service's *values and order*; TanStack's structural sharing may copy an object whose position changed, so identity is not asserted (the test uses `toStrictEqual`).
- `.svc-head > span:last-child { text-align: right }` carries the right-aligned `Actions` word (the board uses an inline style); `clip: rect(...)` from the board became `clip-path` because stylelint rejects `clip`.
- `cancel()` does nothing while a request is in flight, and `closedAs` is `kept` after a cancel.
- The 401 closes the dialog with `closedAs` `kept`; the shell replaces the page, so no focus move is needed.
- In `ServiceList.test.tsx`, a click is preceded by `focus()` because `fireEvent.click` does not focus the button; error toasts are found with `hidden: true` / `findAllByText`, since `Toast.tsx` hides high-priority toasts from the tree until focused and announces them twice.
- Lucide `Trash2` and `LoaderCircle` both exist in 1.73.0; no substitution.
- `ServiceListView`-level `SERVICES_KEY` left as is, as the task says.
