# Plan: m1-e2e-journeys

Branch: feat/m1-e2e-journeys. Integration tests (`make test-integration`): not run: no Go code changes, only `e2e/**`.

## Harness
- [ ] `cd e2e && npm ci && npm run typecheck` passes — `e2e/package.json`, `tsconfig.json`; typecheck script.
- [ ] `--list` lists every journey; `--grep @smoke` lists journeys 1, 2 (add-and-healthy), 5 — titles in `e2e/journeys/*.spec.ts`.
- [ ] Parallel tests get separate apps and stubs — `e2e/support/fixtures.ts`, `app.ts`, `stubTarget.ts`; checked with `--workers=2` and `--workers=1`.
- [ ] `globalSetup` stops with `build the frontend first: make build` when dist holds only `.gitkeep`, builds binary otherwise — `e2e/support/globalSetup.ts`; checked by hand with dist emptied.
- [ ] Clean environment (explicit env, not `process.env`) — `e2e/support/app.ts`; run once with `ADMIN_PASSWORD=wrong REQUIRE_HTTPS=true` exported.

## Journeys
- [ ] Journey 1 (FR-1, FR-3, FR-4) — `e2e/journeys/sign-in.spec.ts`
- [ ] Journey 2 (FR-6, 9, 10, 12 part, 59, 67, 112 part, 95 refresh) — `e2e/journeys/add-service.spec.ts` (two tests: smoke add-and-healthy; duplicate name and empty name)
- [ ] Journey 3 (FR-54, 55, 61, 62) — `e2e/journeys/service-status.spec.ts`
- [ ] Journey 4 (FR-10) — `e2e/journeys/service-status.spec.ts`
- [ ] Journey 5 (FR-8, 71, 72, 70 part) — `e2e/journeys/delete-service.spec.ts`
- [ ] Journey 6 (FR-5 part, 101, 103, 111, 114) — `e2e/journeys/restart.spec.ts`
- [ ] Journey 7 (FR-102) — `e2e/journeys/first-start.spec.ts`

## Repo-wide
- [ ] `make check` passes
- [ ] `make test-e2e-smoke` passes in Chromium (or direct command, with reason)
- [ ] Full Chromium project passes, twice in a row
- [ ] Only `e2e/**` and this plan file changed

## Judgment calls
(to be filled)
