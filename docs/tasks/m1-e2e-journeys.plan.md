# Plan: m1-e2e-journeys

Branch: feat/m1-e2e-journeys. Integration tests (`make test-integration`): not run: no Go code changes, only `e2e/**`.

## Harness
- [x] `cd e2e && npm ci && npm run typecheck` passes — `e2e/package.json`, `tsconfig.json`; typecheck script.
- [x] `--list` lists every journey; `--grep @smoke` lists journeys 1, 2 (add-and-healthy), 5 — titles in `e2e/journeys/*.spec.ts`.
- [x] Parallel tests get separate apps and stubs — `e2e/support/fixtures.ts`, `app.ts`, `stubTarget.ts`; checked with `--workers=2` and `--workers=1`.
- [x] `globalSetup` stops with `build the frontend first: make build` when dist holds only `.gitkeep`, builds binary otherwise — `e2e/support/globalSetup.ts`; checked by hand with dist emptied.
- [x] Clean environment (explicit env, not `process.env`) — `e2e/support/app.ts`; run once with `ADMIN_PASSWORD=wrong REQUIRE_HTTPS=true` exported.

## Journeys
- [x] Journey 1 (FR-1, FR-3, FR-4) — `e2e/journeys/sign-in.spec.ts`
- [x] Journey 2 (FR-6, 9, 10, 12 part, 59, 67, 112 part, 95 refresh) — `e2e/journeys/add-service.spec.ts` (two tests: smoke add-and-healthy; duplicate name and empty name)
- [x] Journey 3 (FR-54, 55, 61, 62) — `e2e/journeys/service-status.spec.ts`
- [x] Journey 4 (FR-10) — `e2e/journeys/service-status.spec.ts`
- [x] Journey 5 (FR-8, 71, 72, 70 part) — `e2e/journeys/delete-service.spec.ts`
- [x] Journey 6 (FR-5 part, 101, 103, 111, 114) — `e2e/journeys/restart.spec.ts`
- [x] Journey 7 (FR-102) — `e2e/journeys/first-start.spec.ts`

## Repo-wide
- [x] `make check` passes
- [x] `make test-e2e-smoke` passes in Chromium (or direct command, with reason)
- [x] Full Chromium project passes, twice in a row
- [x] Only `e2e/**` and this plan file changed

## Judgment calls
- `make check` failed once with `Select.test.tsx` (frontend, untouched by this task) timing out on a `listbox` lookup; the file passed 3 times alone and `make check` then passed. Reported as a flake of the existing suite, not changed.
- Run results: `make check` run, passed (second run); `make test-e2e-smoke` run, passed (Docker available); full Chromium project run 3 times (default workers, then `--workers=1`), all 11 tests passed, about 20 s with parallel workers and 46 s with one; Firefox and WebKit not run (only Chromium installed).
- The CSRF token for journey 5 comes from the `signIn` response body (`csrf_token`), as the contract says, not from a cookie.
- The "Discard unsaved changes?" dialog has role `dialog`, not `alertdialog`; the journey scopes to `dialog`. The task did not name the role.
- The empty-name error `Enter a name.` is matched with `.first()` since the screen may also show it in an error summary.
- The task file says the journeys list names `GET /api/services` items; the body shape (array or `{items}`) is handled both ways in the support reads.
- `waitForStatus` finds the badge by exact text inside the row (an XPath on the status word), because the badge has no role or label; no CSS class is used.
- Journey 5's first fixed wait is shortened by the time already spent after the toast, so the total is still 4 s after the toast.
- Journey 7 imports `test` from `@playwright/test` directly: it needs neither an app nor a stub.
- `e2e/package.json` has `private: true` and name `monitory-e2e`; `tsconfig` uses `module: nodenext` (TypeScript 6 deprecates `node10` resolution).
- Integration tests (`make test-integration`): not run: no Go code changed.
- Texts on screen that differed from the task file: none.

