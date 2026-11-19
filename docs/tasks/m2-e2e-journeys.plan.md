# Plan: m2-e2e-journeys

Branch: `feat/m2-e2e-journeys`. Only `e2e/**` and this file change.

## Harness
- [ ] `cd e2e && npm ci && npm run typecheck` passes. Files: all of `e2e/support/*`, `e2e/journeys/*`. Test: `npm run typecheck`.
- [ ] `--list` shows every journey; `--grep @smoke` lists the M1 smoke tests plus exactly M2 journeys 1 and 2. Files: spec titles. Test: `npx playwright test --project=chromium --list [--grep @smoke]`.
- [ ] Parallel tests get their own app, stub, receiver, recipient. Files: `support/fixtures.ts`, `support/mailpit.ts` (`uniqueAddress`). Test: run with `--workers=1` and `--workers=3`.
- [ ] Explicit app env (SMTP_*, retries, webhook timeout in `appEnv`; overrides via `appOverrides`). File: `support/app.ts`, `fixtures.ts`. Test: run with `SMTP_HOST`, `ADMIN_PASSWORD`, `ALERT_DELIVERY_RETRIES` set to other values in the shell.
- [ ] M1 journeys still pass unchanged (helper timing fill). File: `support/helpers.ts`. Test: the M1 specs in the Chromium run.
- [ ] No test clears Mailpit. File: `support/mailpit.ts` (read-only calls). Check: grep for DELETE.

## Journeys
- [ ] Journey 1 (FR-14, 21, 22, 23, 25, 81, 93, NFR-7), `journeys/alert-email.spec.ts`, test `M2 journey 1 ... @smoke`.
- [ ] Journey 2 (FR-23, 83, 90, 92, 93, NFR-7), `journeys/alert-webhook.spec.ts`, test `M2 journey 2 ... @smoke`.
- [ ] Journey 3 (FR-20, 23, 65), `journeys/alert-webhook.spec.ts`, tests `M2 journey 3 custom messages` and `M2 journey 3 alerts off`.
- [ ] Journey 4 (FR-83, 84, 85, 86, 115), `journeys/alert-failure.spec.ts`, tests `M2 journey 4 ...` (retries and notice) and `M2 journey 4 redirect`.
- [ ] Journey 5 (FR-84, 85, 86), `journeys/alert-failure.spec.ts`, test `M2 journey 5 ...` with `appOverrides SMTP_HOST ''`.
- [ ] Journey 6 (FR-89, 93, 107, 108), `journeys/test-alert.spec.ts`, five tests `M2 journey 6 ...`.
- [ ] Journey 7 (FR-14, 15, 16, 17, 19, 80, 81, 88, 100), `journeys/alert-list.spec.ts`, test `M2 journey 7 ...`.
- [ ] Journey 8 (FR-111), `journeys/alert-email.spec.ts`, test `M2 journey 8 ...`.

## Repo-wide
- [ ] `make check` passes. Outcome: (to fill)
- [ ] `make test-e2e-smoke` (or the direct command) passes in Chromium. Outcome: (to fill)
- [ ] The whole Chromium project passes at least twice in a row. Outcome: (to fill)
- [ ] Nothing outside `e2e/**` and this file changed (`git diff --stat origin/main`). Outcome: (to fill)
- [ ] Integration tests (`make test-integration`): the task changes no code with integration tests (no `backend/**` change). Outcome: not run: no backend code touched, e2e only.
