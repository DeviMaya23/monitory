# Plan: m2-e2e-journeys

Branch: `feat/m2-e2e-journeys`. Only `e2e/**` and this file change.

## Harness
- [x] `cd e2e && npm ci && npm run typecheck` passes. Files: all of `e2e/support/*`, `e2e/journeys/*`. Test: `npm run typecheck`.
- [x] `--list` shows every journey; `--grep @smoke` lists the M1 smoke tests plus exactly M2 journeys 1 and 2. Files: spec titles. Test: `npx playwright test --project=chromium --list [--grep @smoke]`.
- [x] Parallel tests get their own app, stub, receiver, recipient. Files: `support/fixtures.ts`, `support/mailpit.ts` (`uniqueAddress`). Test: run with `--workers=1` and `--workers=3`.
- [x] Explicit app env (SMTP_*, retries, webhook timeout in `appEnv`; overrides via `appOverrides`). File: `support/app.ts`, `fixtures.ts`. Test: run with `SMTP_HOST`, `ADMIN_PASSWORD`, `ALERT_DELIVERY_RETRIES` set to other values in the shell.
- [x] M1 journeys still pass unchanged (helper timing fill). File: `support/helpers.ts`. Test: the M1 specs in the Chromium run.
- [x] No test clears Mailpit. File: `support/mailpit.ts` (read-only calls). Check: grep for DELETE.

## Journeys
- [x] Journey 1 (FR-14, 21, 22, 23, 25, 81, 93, NFR-7), `journeys/alert-email.spec.ts`, test `M2 journey 1 ... @smoke`.
- [x] Journey 2 (FR-23, 83, 90, 92, 93, NFR-7), `journeys/alert-webhook.spec.ts`, test `M2 journey 2 ... @smoke`.
- [x] Journey 3 (FR-20, 23, 65), `journeys/alert-webhook.spec.ts`, tests `M2 journey 3 custom messages` and `M2 journey 3 alerts off`.
- [x] Journey 4 (FR-83, 84, 85, 86, 115), `journeys/alert-failure.spec.ts`, tests `M2 journey 4 ...` (retries and notice) and `M2 journey 4 redirect`.
- [x] Journey 5 (FR-84, 85, 86), `journeys/alert-failure.spec.ts`, test `M2 journey 5 ...` with `appOverrides SMTP_HOST ''`.
- [x] Journey 6 (FR-89, 93, 107, 108), `journeys/test-alert.spec.ts`, five tests `M2 journey 6 ...`.
- [x] Journey 7 (FR-14, 15, 16, 17, 19, 80, 81, 88, 100), `journeys/alert-list.spec.ts`, test `M2 journey 7 ...`.
- [x] Journey 8 (FR-111), `journeys/alert-email.spec.ts`, test `M2 journey 8 ...`.

## Repo-wide
- [x] `make check` passes. Outcome: run, passed (exit 0)
- [x] `make test-e2e-smoke` (or the direct command) passes in Chromium. Outcome: `make test-e2e-smoke` not run: a Mailpit container of another worktree already holds ports 1025/8025, so `make mailpit-up` would clash; ran `cd e2e && npx playwright test --project=chromium` (full, includes every smoke test) against that Mailpit (v1.33.1): 25 passed.
- [x] The whole Chromium project passes at least twice in a row. Outcome: run twice, 25 passed each (about 1.1 min), with `SMTP_HOST`, `ADMIN_PASSWORD`, `ALERT_DELIVERY_RETRIES` set to other values in the shell; also `--workers=1` (3.9 min) and `--workers=3` (1.4 min): 25 passed. No flaky test seen.
- [x] Nothing outside `e2e/**` and this file changed (`git diff --stat origin/main`). Outcome: run; only `e2e/**` and this file differ; `package-lock.json` unchanged.
- [x] Integration tests (`make test-integration`): the task changes no code with integration tests (no `backend/**` change). Outcome: not run: no backend code touched, e2e only.

## Judgment calls
- Mailpit v1.33.1 (from `/api/v1/info`); search is `GET /api/v1/search?query=to:"<address>"`, bodies from `GET /api/v1/message/<id>`.
- Toasts have the role `dialog` too, so the target dialog is found by name (`Add target` or `Edit target`) through `targetDialog(page)`; plain `getByRole('dialog')` is ambiguous.
- A second `Target added.` toast can be up while the first still shows, so `addTarget` checks the toast with `.first()` and proves the save by the dialog closing.
- `GET /api/services` and `GET /api/services/{id}/targets` return plain arrays (contract), not `{items}`.
- The task's `waitForCount(receiver.hookRequests, 1)` is written as `waitForCount(() => receiver.hookCount(), 1)` since `read` returns a number.
- Journey 2 shows the markup name by checking no `b` element in the heading or `main` (locator by tag, not by class).
- Journey 4 step 5 and the retry-gap bounds follow the file; the delivery notice on the alert list is looked up by the webhook's URL (its label, since it has no name).
- Journey 8 step 2 waits for two more stub requests than were seen after sign-in, then asserts one mail.
- `settle` is the only fixed wait in the new code; `waitForMessages` polls with a 500 ms sleep as specified. M1's `delete-service.spec.ts` keeps its own waits.
- Mutation checks were not run (verifier's job).
- Texts on screen differing from the task file: none found.
