# Plan: toast text shared

Branch: `feat/toast-text-shared`

- [ ] `rowActionToasts.test.ts` (new, `frontend/src/features/service-list/lib/`): `toOutcome` maps 401/unauthenticated, 404/not_found, 403/csrf_failed; every listed `failed` case; texts exact; CSRF toast's Reload action calls `window.location.reload` (`vi.stubGlobal`, unstubbed after).
- [ ] `useDeleteService.test.tsx` and `usePauseService.test.tsx` pass unchanged (files not edited; `make test-frontend`).
- [ ] By reading: each text appears once under `features/service-list/` outside tests (`lib/rowActionToasts.ts`); neither hook defines `toOutcome`/`Outcome` (`hooks/useDeleteService.ts`, `hooks/usePauseService.ts`).
- [ ] `make test-frontend` passes three times.
- [ ] `make check` passes.
- [ ] Nothing outside allowed paths changed (`git diff --stat main`).
- [ ] Integration tests: not run: no integration tests apply (frontend-only clean-up).
