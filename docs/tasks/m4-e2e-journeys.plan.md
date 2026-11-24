# Plan: m4-e2e-journeys

Branch: `feat/m4-e2e-journeys`. Only `e2e/**` and this file change.
Integration tests: the task touches no Go code with integration tests, so `make test-integration` is not needed.
Outcome of `make test-integration`: not run: no backend code changed (only `e2e/**`).

## Harness
- [x] `visitor` fixture (cookie-less context with the app's base URL) — `e2e/support/fixtures.ts`; used by every journey.
- [x] Helpers `ServiceSpec.shownOnPublic`, `openStatusPage`, `visitorRefresh`, `setPublicView`, `publicNames`, `publicApi` — `e2e/support/helpers.ts`.
- [x] `npm ci && npm run typecheck` passes; `--list` and `--grep @smoke` list the right tests.
- [x] M1–M3 journeys still pass; no Mailpit use; every service `alerts: false`.

## Journeys
- [x] Journey 1 (FR-28, FR-40, FR-63, FR-112, FR-113, order, NFR-7) — `e2e/journeys/public-dashboard.spec.ts`, test `M4 journey 1 …@smoke`.
- [x] Journey 2 (FR-27, FR-68, FR-77, FR-78, FR-112, FR-113) — `public-dashboard.spec.ts`, test `M4 journey 2 …`.
- [x] Journey 3 (FR-26, FR-29, NFR-1) — `e2e/journeys/public-view-switch.spec.ts`, tests `M4 journey 3 …` (first `@smoke`).
- [x] Journey 4 (FR-29, FR-30, FR-31, FR-112) — `e2e/journeys/public-refresh.spec.ts`.
- [x] Journey 5 (FR-4, FR-32, FR-96, FR-99) — `e2e/journeys/public-rate-limit.spec.ts`, test `M4 journey 5 …`.
- [x] Journey 6 (FR-32, rule 12) — `public-rate-limit.spec.ts`, test `M4 journey 6 …`.
- [x] Journey 7 (FR-4, FR-96) — `e2e/journeys/health.spec.ts`.

## Repo-wide
- [x] `make check` passes (exit 0).
- [x] Chromium suite passes twice in a row: run, passed twice, 90 tests each, 3.2 min (4 workers) and 3.1 min (default workers). Slowest: journey 5 (1.1 min), journey 2 (~48 s), M2 alert-failure/test-alert (~13-26 s). `--workers=1` was not run.
- [x] `git diff --stat origin/main` shows only `e2e/**` and this file.
- [x] Branch pushed (`origin/feat/m4-e2e-journeys`).

## Notes
- `make test-e2e-smoke` not run: Docker Mailpit was already up (a sibling's container), so the direct command `cd e2e && npx playwright test --project=chromium` was used.
- Before the plan commit I merged `origin/main` (as the user asked) to get `public-dashboard-api` (#57).

## Judgment calls
- `waitForStatus` got an optional 4th argument `timeout` (default 30 s, unchanged behavior): journey 2's `pending-<s>` row needs 30 s+ to leave `Not checked yet`.
- `visitorRefresh` also accepts the `Refresh` button being gone afterwards (the "unavailable" answer removes it); journeys 3 and 4 need that.
- The "moment with no request" in journey 4 is an in-page 1 s timer on the running clock, not `waitForTimeout`/`settle`, so `settle` stays the only fixed wait.
- The `On`/`Off` word of the switch is read from the switch's wrapping `label` element (it is outside the switch and `aria-hidden`).
- Added helper `createService(page, spec)` (open Add, fill, save) in `helpers.ts`.
- Journey 6 asserts `200,200,200,429` before and after the restart: the task's sequence read as one count.
- Journey 1's "no link to the admin's pages" checks links named Add service, Services, Settings, Sign out.
