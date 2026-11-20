# Plan: dashboard pause and resume

Branch: `feat/dashboard-pause-resume`. Frontend only; no integration tests apply.

## Acceptance criteria

- [ ] `pauseService` / `resumeService` wrappers: POST, no body, id encoded, resolve with the `Service`. File `frontend/src/lib/api/services.ts`; test `frontend/src/lib/api/services.test.ts`.
- [ ] Cache functions `replaceInList` / `removeFromList`: same position, load time kept, unknown id and no cache leave things alone, cancel in-flight list request first. File `features/service-list/lib/servicesCache.ts`; test `servicesCache.test.ts`.
- [ ] `useDeleteService` uses the shared remove function, behavior unchanged. File `hooks/useDeleteService.ts`; test: existing `useDeleteService.test.tsx` and delete tests in `ServiceList.test.tsx`, unchanged.
- [ ] `usePauseService`: toggle picks pause or resume by `paused`; in-flight lock per id (`isPending`), other ids not blocked. File `hooks/usePauseService.ts`; test `hooks/usePauseService.test.tsx`.
- [ ] `usePauseService`: 200 replaces the row and shows the right success toast with the answer's name. Same test file.
- [ ] `usePauseService`: 404 removes row + already-deleted toast; 403 toast with Reload (calls `window.location.reload` once); 401 no toast; 500 and network error show the action's failure toast; row unchanged after failures other than 404. Same test file.
- [ ] Row button: `Pause {name}` / `Resume {name}`, hidden visible label, Tab order button → Alerts → Delete (also paused and TCP rows). Files `components/ServiceRow.tsx`, `ServiceList.tsx`, `pages/DashboardPage.tsx`; test `components/ServiceList.test.tsx`.
- [ ] Pause flow on the dashboard: one request, `aria-disabled` while pending, second click and Enter ignored, other rows work, row shows Paused / no reason / flag / answer's times, button becomes `Resume`, toast, focus kept. `ServiceList.test.tsx`.
- [ ] Resume flow on the dashboard: same for a paused row. `ServiceList.test.tsx`.
- [ ] Name with markup shown as text in button name and both toasts (NFR-7). `ServiceList.test.tsx`.
- [ ] Failures on the dashboard: 403 (Reload, button usable again), 500, 404 (row gone, count down, toast), last row's 404 shows Empty. `ServiceList.test.tsx`.
- [ ] A list refresh arriving while a pause is in flight does not put the old row back. `ServiceList.test.tsx`.
- [ ] Replaced tests: "one Delete button per row" test updated and the mock gains `pauseService` and `resumeService`; `App.test.tsx` checked for row-button counts. `ServiceList.test.tsx`, `App.test.tsx`.
- [ ] `make check` passes. Outcome: (pending)
- [ ] Nothing outside allowed paths changed; `package.json` and lockfile unchanged.
- [ ] Integration tests: not run: this task touches no backend code and no code with integration tests.
