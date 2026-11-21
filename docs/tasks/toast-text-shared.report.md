# Verifier report: toast text shared

Verifier branch: `verify/toast-text-shared` (started from `feat/toast-text-shared` at `9c29fd3`; only this report is added, no test needed a change).

**Result: no Blocking findings.** `make check` passed (after `npm ci` in `frontend/`; a fresh checkout has no installed dependencies, and no tracked file changed).

| Check | Result |
|---|---|
| `make check` | run, passed (frontend 925/925 tests, backend lint 0 issues, builds) |
| `make test-frontend` ×3 | run, passed all three times (50 files, 925 tests each); `TargetDialog.test.tsx` did not flake |
| Integration tests | not run: none apply (frontend-only change; the only integration-tagged tests are in `adaptor/mailer`, untouched). No criterion depends only on an integration test |
| Built app, live run | not run: no screen changes; every behavior is reachable through the hook and unit tests |

## Criteria

"Real?": yes means the test fails if the behavior is removed (shown by a mutation below).

| # | Criterion | Test or evidence | Real? | Verdict |
|---|---|---|---|---|
| 1 | `toOutcome` maps 401/`unauthenticated`, 404/`not_found`, 403/`csrf_failed` | `rowActionToasts.test.ts` › `toOutcome` rows 1–3 | yes (M3–M7) | met |
| 2 | `failed` for: 403, 404, 401 with another code; a 500; 500 and 404 with `csrf_failed`; plain `Error`; string; `undefined` | same table, rows 4–12 | yes: any-403, code-only and status-only mutants each fail it | met |
| 3 | Texts equal the two strings exactly (typographic `’`) | `the texts are exactly what the admin reads today`, `the gone toast…` | yes (M1, M2) | met |
| 4 | CSRF toast has action `Reload` calling `window.location.reload`, stubbed with `vi.stubGlobal`, unstubbed in `afterEach` | `the CSRF toast carries a Reload action…` | yes (M8, M9) | met |
| 5 | Both hook tests pass unchanged | `git diff` shows neither `.test.tsx` touched; both pass (3 full runs) | yes: M1, M2, M8, M9 fail both files | met |
| 6 | Each text once outside tests; hooks neither define nor use own `toOutcome`/`Outcome`; both import | grep of `features/service-list` (non-test): only `rowActionToasts.ts:16,19`; both hooks import `csrfToast, goneToast, toOutcome` | n/a (reading) | met |
| 7 | `make test-frontend` three times | three passing runs, above | n/a | met |
| 8 | `make check` passes | above | n/a | met |
| 9 | Nothing outside allowed paths | `git diff origin/main...HEAD --stat`: two hooks, two new files, the plan; no `package*.json` | n/a | met |

Requirements covered: none (clean-up); FR-8, FR-72, FR-75 keep their existing proofs, which still pass.

## Plan check

Read after the criteria. Every criterion is in the plan.

- Two items are unticked (`make test-frontend` ×3 and `make check`) because the builder's runs failed on the known flaky `TargetDialog` case. They passed on every run here, so both are now met; the plan is stale on those two lines, not wrong about the code.
- Every ticked item has its test and the test checks the behavior. The plan's claim "`git diff --stat main`" is only valid against `origin/main` (local `main` here is behind); the diff is as the plan says.
- Judgment calls match the diff: exports are `Outcome`, `toOutcome`, `GONE_MESSAGE`, `CSRF_MESSAGE`, `goneToast()`, `csrfToast()`.
- The plan says the backlog line was not added; `docs/tasks/backlog.md:93` already holds it (the drafter added it).

## Rule checks

- Diff touches only the two hooks, `rowActionToasts.ts`, `rowActionToasts.test.ts` and the plan. Hook test files, `package.json` and the lockfile are untouched; no dependency added.
- The module imports only `ApiError`: no React, `useToast` or hooks. It lives in `features/service-list/lib/` next to `servicesCache.ts`; no shared component or new folder.
- The apostrophe in `wasn’t` is the typographic one in the module, the test and the old code (checked by grep for the straight one: none).
- Other toast texts in the hooks are unchanged (diff shows only the two moved texts and the `already-deleted` → `gone` rename).
- Match is by status and code, never by message text; `instanceof ApiError` guards both.
- Frontend library check: nothing hand-written that the component library provides; no design reference code involved.
- No layer, data-scoping or transaction rule applies.

## Mutation checks run

Each applied to `rowActionToasts.ts`, `vitest run src/features/service-list`, then reverted (`git status` clean).

| # | Mutation | Failed |
|---|---|---|
| M1 | reword the 404 text | `useDeleteService`, `usePauseService`, `ServiceList`, unit test |
| M2 | reword the CSRF text | `useDeleteService`, `usePauseService`, `ServiceList`, unit test |
| M3 | any 403 is `csrf` | unit test and `useDeleteService` (not `usePauseService`) |
| M4 | 404 by code alone | unit test only |
| M5 | 404 by status alone | unit test and `useDeleteService` |
| M6 | CSRF by code alone | unit test only |
| M7 | 401 by status alone | unit test only |
| M8 | Reload `onClick` does nothing | both hook tests and unit test |
| M9 | Reload label changed | both hook tests, `ServiceList`, unit test |

## Findings

**Blocking:** none.

**Non-blocking:**

1. Test quality. `usePauseService.test.tsx` does not fail when any 403 is treated as CSRF (M3); only the unit test and the delete hook test catch it. Matters when: someone gives the pause hook its own outcome rule again; the unit test then no longer protects it.
2. Cosmetic. The plan's two `make` lines are unticked though they pass. Matters when: report only.

Cases tried beyond the task file: every ApiError status/code cross-pairing in the table, non-`ApiError` inputs, and the builders returning a fresh object per call (no shared mutable toast). No boundary, malformed-input or concurrency case applies to a pure mapping function; the hooks' second-request guards are untouched and covered by their existing tests.

## Docs or specs that no longer match

None. No dependency version adopted (none changed); `docs/openapi.yaml`, `requirements.md` and `STACK.md` are unaffected. The backlog line for the other Reload-toast copies already exists (`docs/tasks/backlog.md:93`).
