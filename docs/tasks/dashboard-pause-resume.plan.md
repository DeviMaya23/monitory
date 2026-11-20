# Plan: dashboard pause and resume

Branch: `feat/dashboard-pause-resume`. Frontend only; no integration tests apply.

## Acceptance criteria

- [x] `pauseService` / `resumeService` wrappers: POST, no body, id encoded, resolve with the `Service`. File `frontend/src/lib/api/services.ts`; test `frontend/src/lib/api/services.test.ts`.
- [x] Cache functions `replaceInList` / `removeFromList`: same position, load time kept, unknown id and no cache leave things alone, cancel in-flight list request first. File `features/service-list/lib/servicesCache.ts`; test `servicesCache.test.ts`.
- [x] `useDeleteService` uses the shared remove function, behavior unchanged. File `hooks/useDeleteService.ts`; test: existing `useDeleteService.test.tsx` and delete tests in `ServiceList.test.tsx`, unchanged.
- [x] `usePauseService`: toggle picks pause or resume by `paused`; in-flight lock per id (`isPending`), other ids not blocked. File `hooks/usePauseService.ts`; test `hooks/usePauseService.test.tsx`.
- [x] `usePauseService`: 200 replaces the row and shows the right success toast with the answer's name. Same test file.
- [x] `usePauseService`: 404 removes row + already-deleted toast; 403 toast with Reload (calls `window.location.reload` once); 401 no toast; 500 and network error show the action's failure toast; row unchanged after failures other than 404. Same test file.
- [x] Row button: `Pause {name}` / `Resume {name}`, hidden visible label, Tab order button → Alerts → Delete (also paused and TCP rows). Files `components/ServiceRow.tsx`, `ServiceList.tsx`, `pages/DashboardPage.tsx`; test `components/ServiceList.test.tsx`.
- [x] Pause flow on the dashboard: one request, `aria-disabled` while pending, second click and Enter ignored, other rows work, row shows Paused / no reason / flag / answer's times, button becomes `Resume`, toast, focus kept. `ServiceList.test.tsx`.
- [x] Resume flow on the dashboard: same for a paused row. `ServiceList.test.tsx`.
- [x] Name with markup shown as text in button name and both toasts (NFR-7). `ServiceList.test.tsx`.
- [x] Failures on the dashboard: 403 (Reload, button usable again), 500, 404 (row gone, count down, toast), last row's 404 shows Empty. `ServiceList.test.tsx`.
- [x] A list refresh arriving while a pause is in flight does not put the old row back. `ServiceList.test.tsx`.
- [x] Replaced tests: "one Delete button per row" test updated and the mock gains `pauseService` and `resumeService`; `App.test.tsx` checked for row-button counts. `ServiceList.test.tsx`, `App.test.tsx`.
- [x] `make check` passes. Outcome: run, passed (exit 0; the Go part has no change from this task)
- [x] Nothing outside allowed paths changed; `package.json` and lockfile unchanged.
- [x] Integration tests: not run: this task touches no backend code and no code with integration tests.

## Judgment calls

- `servicesCache.ts` exports `removeFromList(queryClient, id)` and `replaceInList(queryClient, service)`; both share one private `changeList` helper.
- `usePauseService` tracks in-flight ids in a `Set` (state for rendering, a ref for the same-tick guard) because one `useMutation` serves every row. The options-level callbacks of `useMutation` run for each concurrent mutation, so two rows can pause at once.
- The success toast wording comes from the service's state before the click (`service.paused`), the name from the answer.
- `ServiceRow` ignores a click while `toggling` in addition to `aria-disabled`, since `aria-disabled` alone does not stop a click.
- The "refresh while pending" dashboard test waits one real 50 ms tick after the refresh answer. Without it the test passed even with the cancellation removed.
- Pause and Resume tests in `ServiceList.test.tsx` are in a new `describe`; the "one Delete button per row" test was rewritten as the task describes (the check for no `Edit` button, switch, `Open` link and name link is kept).
- `npm ci` was needed to run anything in this fresh worktree; `package.json` and the lockfile are unchanged. Prettier reports style warnings on 22 existing files; they are not part of `make check` and I left them.
- Mutation checks run: swap pause/resume, drop the list-request cancellation, drop `dataUpdatedAt`, `disabled` instead of `aria-disabled`, the 404 branch disabled. Each failed at least one test.
