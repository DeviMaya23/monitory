# Plan: m4-e2e-journeys

Branch: `feat/m4-e2e-journeys`. Only `e2e/**` and this file change.
Integration tests: the task touches no Go code with integration tests, so `make test-integration` is not needed.
Outcome of `make test-integration`: not run: no backend code changed (only `e2e/**`).

## Harness
- [ ] `visitor` fixture (cookie-less context with the app's base URL) — `e2e/support/fixtures.ts`; used by every journey.
- [ ] Helpers `ServiceSpec.shownOnPublic`, `openStatusPage`, `visitorRefresh`, `setPublicView`, `publicNames`, `publicApi` — `e2e/support/helpers.ts`.
- [ ] `npm ci && npm run typecheck` passes; `--list` and `--grep @smoke` list the right tests.
- [ ] M1–M3 journeys still pass; no Mailpit use; every service `alerts: false`.

## Journeys
- [ ] Journey 1 (FR-28, FR-40, FR-63, FR-112, FR-113, order, NFR-7) — `e2e/journeys/public-dashboard.spec.ts`, test `M4 journey 1 …@smoke`.
- [ ] Journey 2 (FR-27, FR-68, FR-77, FR-78, FR-112, FR-113) — `public-dashboard.spec.ts`, test `M4 journey 2 …`.
- [ ] Journey 3 (FR-26, FR-29, NFR-1) — `e2e/journeys/public-view-switch.spec.ts`, tests `M4 journey 3 …` (first `@smoke`).
- [ ] Journey 4 (FR-29, FR-30, FR-31, FR-112) — `e2e/journeys/public-refresh.spec.ts`.
- [ ] Journey 5 (FR-4, FR-32, FR-96, FR-99) — `e2e/journeys/public-rate-limit.spec.ts`, test `M4 journey 5 …`.
- [ ] Journey 6 (FR-32, rule 12) — `public-rate-limit.spec.ts`, test `M4 journey 6 …`.
- [ ] Journey 7 (FR-4, FR-96) — `e2e/journeys/health.spec.ts`.

## Repo-wide
- [ ] `make check` passes.
- [ ] Chromium suite passes twice in a row; time and slowest tests reported.
- [ ] `git diff --stat origin/main` shows only `e2e/**` and this file.
- [ ] Branch pushed.
