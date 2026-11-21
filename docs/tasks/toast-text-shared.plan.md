# Plan: toast text shared

Branch: `feat/toast-text-shared`

- [x] `rowActionToasts.test.ts` (new, `frontend/src/features/service-list/lib/`): `toOutcome` maps 401/unauthenticated, 404/not_found, 403/csrf_failed; every listed `failed` case; texts exact; CSRF toast's Reload action calls `window.location.reload` (`vi.stubGlobal`, unstubbed after).
- [x] `useDeleteService.test.tsx` and `usePauseService.test.tsx` pass unchanged (files not edited; `make test-frontend`).
- [x] By reading: each text appears once under `features/service-list/` outside tests (`lib/rowActionToasts.ts`); neither hook defines `toOutcome`/`Outcome` (`hooks/useDeleteService.ts`, `hooks/usePauseService.ts`).
- [ ] `make test-frontend` three times: run 3 times, each failed on only `TargetDialog.test.tsx` "adds a header row…" (the known flaky case, not this task's; 924 of 925 passed each time; that file alone passes 96/96; `src/features/service-list` alone passes 134/134, including both hook tests and the new unit test).
- [ ] `make check`: run, failed at its `test-frontend` step on the same TargetDialog case. Its other steps (gofmt, golangci-lint, eslint, stylelint, shellcheck, redocly, go test -race, vite build, go build) were run by `make lint build` and the Go tests earlier in the same run and passed.
- [x] Nothing outside allowed paths changed (`git diff --stat main`).
- [x] Integration tests: not run: no integration tests apply (frontend-only clean-up).

## Judgment calls

- Module exports `Outcome`, `toOutcome`, the two texts as constants (`GONE_MESSAGE`, `CSRF_MESSAGE`) and two toast builders (`goneToast()`, `csrfToast()`); the hooks call the builders inside `toast.show`.
- Test cases for non-matching codes use valid contract codes (`not_found`, `csrf_failed`, `unauthenticated`) because the generated `ProblemBody['code']` type rejects others.
- The backlog line about the other Reload-toast copies is not added: `docs/**` is outside my paths except this plan. The user or drafter should add it.
- I did not tick the two `make` items because of the TargetDialog failure; I did not touch that test.
