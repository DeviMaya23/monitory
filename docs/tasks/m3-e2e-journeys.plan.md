# Plan: m3-e2e-journeys

Branch: `feat/m3-e2e-journeys`. Only `e2e/**` and this file change.

## Harness
- [ ] `cd e2e && npm ci && npm run typecheck` passes. Files: `e2e/support/*`, `e2e/journeys/*`, `package.json`. Test: `npm run typecheck`.
- [ ] `--list` shows every journey; `--grep @smoke` lists the M1 and M2 smoke tests plus exactly the JSON-rule test of journey 1 and the first test of journey 2. Files: spec titles. Test: `npx playwright test --project=chromium --list [--grep @smoke]`.
- [ ] Parallel tests get their own app, site, TCP stub and certificates. Files: `support/fixtures.ts` (`site`, `tlsSite`, `tcp`), `support/stubSite.ts`, `support/stubTcp.ts`. Test: full run with `--workers=1` and `--workers=4`.
- [ ] `makeCert` days left match the preset. File: `support/certs.ts`. Test: a one-off script printing `notAfter` of `validCert(10)` (10 days 12 hours from now); output recorded under Judgment calls.
- [ ] M1 and M2 journeys still pass unchanged. Files: `support/helpers.ts`, `fixtures.ts` (additions only). Test: the M1 and M2 specs in the Chromium run.
- [ ] No test clears Mailpit. Check: grep for `DELETE` in `e2e/`.

## Journeys
- [ ] Journey 1 (FR-41, 42, 44, 45, 46, 47, 48, 58, 61, 62, 73, 104), `journeys/check-failures.spec.ts`, tests `M3 journey 1 ...` (the JSON text test is `@smoke`).
- [ ] Journey 2 (FR-33, 49, 52, 55, 61), `journeys/check-tcp.spec.ts`, tests `M3 journey 2 ...` (the first is `@smoke`).
- [ ] Journey 3 (FR-35, 36, 37, 39, 58), `journeys/check-request.spec.ts`, tests `M3 journey 3 ...`.
- [ ] Journey 4 (FR-34, 50, 61, 64, 74 in part), `journeys/check-certificates.spec.ts`, tests `M3 journey 4 ...`.
- [ ] Journey 5 (FR-51, 53, 54, 112), `journeys/check-retries.spec.ts`, tests `M3 journey 5 ...`.
- [ ] Journey 6 (FR-38, 74, 104, 105, 106, NFR-7), `journeys/test-panel.spec.ts`, tests `M3 journey 6 ...`.
- [ ] Journey 7 (FR-12, 59, 66, 67, 74), `journeys/edit-service.spec.ts`, tests `M3 journey 7 ...`.
- [ ] Journey 8 (FR-62, 75, 76, 78, 79, 111), `journeys/pause-resume.spec.ts`, tests `M3 journey 8 ...`.
- [ ] Journey 9 (FR-38, 56, 57, 59, 60, 65, 69, 74, 106), `journeys/service-validation.spec.ts`, describes A to E.
- [ ] Each FR-61 reason (`timed_out`, `could_not_connect`, `non_2xx_status`, `json_rule_matched`, `invalid_or_missing_json`, `too_many_redirects`, `certificate_problem`) is produced by a test and its dashboard text asserted. Files: journeys 1, 2, 4.
- [ ] Every limit of journey 9 has a test at the limit that saves and one past it that is refused with nothing saved. File: `service-validation.spec.ts`.

## Repo-wide
- [ ] `make check` passes. Outcome: (pending)
- [ ] `make test-e2e-smoke` (or the direct command) passes in Chromium. Outcome: (pending)
- [ ] The whole Chromium project passes at least twice in a row; time and slowest tests reported. Outcome: (pending)
- [ ] Nothing outside `e2e/**` and this file changed (`git diff --stat origin/main`). Outcome: (pending)
- [ ] Integration tests (`make test-integration`): the task changes no code with integration tests (no `backend/**` change). Outcome: (pending)

## Judgment calls
(pending)
