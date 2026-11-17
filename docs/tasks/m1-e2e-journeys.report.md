# Verification report: m1-e2e-journeys

Verifier branch: `verify/m1-e2e-journeys` (the branch this session was given; it was reset to `feat/m1-e2e-journeys` at `ee3965e`, so it holds the builder's commits plus this report).

**Result: no Blocking findings.** All 11 Chromium tests pass; every mutation I ran made at least one named journey fail.

Process note: I opened `m1-e2e-journeys.plan.md` in the same step as the e2e sources, before finishing the criteria table. I judged the criteria against the task file and the code, and the plan check below was done afterwards, but the order the instructions ask for was not strictly kept.

## Commands

| Command | Result |
|---|---|
| `make check` | run, passed (needed `cd frontend && npm ci` first: a fresh worktree has no frontend dependencies, as `ROLES.md` says) |
| `cd e2e && npm ci && npm run typecheck` | run, passed |
| `npx playwright test --project=chromium --list` / `--grep @smoke --list` | 11 tests; smoke lists exactly journey 1, journey 2 (add-and-healthy) and journey 5 |
| `npx playwright test --project=chromium`, with `ADMIN_PASSWORD=wrong REQUIRE_HTTPS=true CHECK_INTERVAL_DEFAULT_SECONDS=300` exported | run, 11 passed (21 s, 4 workers) |
| same, `--workers=2` | run, 11 passed (30 s) |
| same, `--workers=1` | run, 11 passed (47 s) |
| `make test-e2e-smoke` | not run: a Mailpit container from a sibling worktree already holds ports 1025 and 8025, and `mailpit-up` would collide with it. The direct command above ran the whole Chromium project instead |
| Firefox, WebKit | not run (only Chromium installed; the task lists this as a known gap) |
| `make test-integration` | not run: the diff contains no Go code, so no tests that have an integration tier are touched |

Flakiness: three full Chromium runs, no failure outside the mutations.

## Criteria

"Real?" = would the named test fail if the behaviour were removed. Yes means I saw it fail in a mutation; "by reading" means I did not mutate it.

| Criterion | Test | Real? | Status | Evidence |
|---|---|---|---|---|
| Harness: `npm ci && typecheck` | n/a | n/a | Met | ran, passed |
| Harness: `--list` and `@smoke` subset | n/a | n/a | Met | output above |
| Harness: parallel tests get separate apps and stubs | every test (fixtures) | Partly: by reading `fixtures.ts` (a new `App` and `StubTarget` per test, port 0) and by 4 workers passing together; I did not see two ports in an attached output, because output is attached only on failure | Met | `support/fixtures.ts`, `app.ts` |
| Harness: `globalSetup` stops with `build the frontend first: make build` | n/a | Yes: ran with `dist` holding only `.gitkeep`, saw the message | Met | `support/globalSetup.ts` |
| Harness: clean environment | all | Yes: passes with polluted shell variables; `appEnv` builds from `PATH` plus the table (`app.ts`); no `process.env` use except `PATH` | Met | grep, run above |
| Journey 1: FR-1 | `sign-in.spec.ts` journey 1 | Yes: M5 (a different error for a wrong username) failed it | Met | steps 2 |
| Journey 1: FR-3, FR-4 | same | Yes: M4 (gate removed) and M4b (gate removed on `GET /api/services` only) failed it | Met | steps 1, 5, 6 |
| Journey 2: FR-6, FR-9, FR-10, FR-67, FR-112 (part) | `add-service.spec.ts` journey 2 `@smoke` | Yes: M1 (no `Start` on create) failed it | Met | row, `HTTP` chip, `Healthy`, `Never` gone, stub got `GET /` |
| Journey 2: FR-12 (part), FR-59 | `add-service.spec.ts` "taken name and empty name" | Partly: by reading. The duplicate-name text, the one-row count and the zero-POST count are real assertions; not mutated | Met | message under `Name`, `Discard changes`, one row, `posts` 0 |
| Journey 2: FR-95 (refresh button) | `waitForStatus` in journey 3 | Yes: a no-op `Refresh` failed journey 3 only (journeys 2 and 6 pass because they load fresh pages) | Met | see finding N1 |
| Journey 3: FR-54 (part), FR-55, FR-61, FR-62 | `service-status.spec.ts` journey 3 | Yes: M1 failed it; the no-op Refresh failed it. The 503 reason text and its disappearance are asserted | Met | `Returned HTTP 503 (expected 2xx)` |
| Journey 4: FR-10 | `service-status.spec.ts` journey 4 | Yes: M1 failed it. The gap bounds are asserted for the first three requests | Met | 4,500 to 9,000 ms |
| Journey 5: FR-8, FR-72 | `delete-service.spec.ts` | Dialog texts, cancel keeps the row, delete removes it: by reading | Met | |
| Journey 5: FR-71 | same, step 6 | Yes: M3 (`DeleteService` does not call `Stop`) failed it | Met | stub count unchanged 8 s after a 4 s wait |
| Journey 5: FR-70 (part) | same, step 5 | by reading: targets `404` after delete | Met | |
| Journey 6: FR-111 (checks resume) | `restart.spec.ts` | Yes: M2 (`StartChecks` not called) failed at the poll: `Expected: > 1  Received: 1` | Met | |
| Journey 6: FR-111 (state kept) | same, step 4 | Yes: M7 (state rebuilt on every check) failed at `last_status_change_at`: expected the earlier time, got `null` | Met | |
| Journey 6: FR-114, FR-5 (part) | same, step 3 | by reading: the reload ends on `/sign-in` | Met | not mutated |
| Journey 6: FR-101, FR-103 | same, step 6 | by reading: old password refused, new accepted | Met | not mutated |
| Journey 7: FR-102 | `first-start.spec.ts` (4 cases) | by reading and run: asserts non-zero exit, the named key, absence of the other key, no listener | Met | not mutated |
| Repo-wide: `make check` | n/a | n/a | Met | |
| Repo-wide: `make test-e2e-smoke` | n/a | n/a | Partly met | not run through `make`, reason above; the whole project ran directly |
| Repo-wide: full Chromium run twice in a row | n/a | n/a | Met | three runs passed |
| Repo-wide: only `e2e/**` and the plan changed | n/a | n/a | Met | `git diff --stat origin/main` outside those paths shows nothing but this task's docs |

## Plan check

- Every acceptance criterion appears in the plan (harness five, journeys 1 to 7, repo-wide four).
- Every ticked item has a test or a command behind it. I could not reproduce one claim: the plan says `make check` failed once with a `Select.test.tsx` timeout. Mine passed on the first full run, so I cannot confirm or deny that flake.
- The plan says `make test-e2e-smoke` passed with Docker; I did not run it (see above).
- Plan versus diff: the files match the plan's list. The judgment calls it records (CSRF token from the response body, `dialog` role for the discard dialog, `.first()` on `Enter a name.`, `nodenext`) are all visible in the diff and none conflicts with the task file.
- The plan says journey 5's first fixed wait is shortened by the time since the toast. Correct in `delete-service.spec.ts:65`; the total stays 4 s after the toast.

## Rule checks

- **Dependencies:** `package.json` has exactly `@playwright/test` 1.64.1, `typescript` 6.0.3, `@types/node` 24.19.2, all exact. The lockfile resolves `@playwright/test` to 1.64.1. TypeScript and Node types equal the frontend's pins. No other dependency, no configuration key added.
- **Product code:** nothing outside `e2e/**` and the plan changed.
- **No fixed waits:** `waitForTimeout` appears only in `delete-service.spec.ts:65,67` (the two waits for nothing). Other timers: the 10 s and 15 s kill timers and the 100 ms readiness poll in the support code.
- **No CSS-class selectors:** grep for `.locator('.` and `[class` finds nothing. One XPath on the status word is used (`helpers.ts`, `readStatus`) because the badge has no role or label; exact text is matched.
- **Clean environment:** `process.env` is read only for `PATH` (`app.ts:25`); the first-start cases use `appEnv`.
- **The user can run it:** the comment at the top of `playwright.config.ts` names `make test-e2e-smoke`, `make test-e2e` and that `make build` comes first; no other documentation was added.
- **Config:** three projects, 60 s test timeout, 5 s expect timeout, `fullyParallel`, `retries: 0`, trace on failure, list and HTML reporters, no `baseURL`. All as the task says.
- **CONVENTIONS.md:** the diff holds no Go and no frontend code, so the layer, data-scoping and transaction rules cannot be broken by it.

## Mutation checks run

All against product code in this worktree, reverted with `git checkout` after each run (the working tree is clean).

| Mutation | Journeys that failed |
|---|---|
| M1: `CreateService` does not call `scheduler.Start` | 2, 3, 4, and also 5 and 6 (they add a service) |
| M2: `StartChecks` call removed from `main.go` | 6 only (at step 5) |
| M3: `DeleteService` does not call `Stop` | 5 only (at step 6) |
| M4: session gate removed entirely | all 7 browser journeys (1 at its first step, the rest on the sign-in redirect); too broad to show steps 5 and 6, which is why M4b was run |
| M4b: gate removed for `GET /api/services` only | 1 only |
| M5: wrong username returns a different error | 1 only |
| M6: `Refresh` button does nothing (frontend rebuilt, then reverted and rebuilt) | 3 only; journey 6 did not fail (finding N1) |
| M7: state rebuilt from empty on every check | 6 only (at step 4) |

Not run: the task's literal variant of the last item, "move `last_status_change_at` when the status is unchanged". M7 covers the same journey step.

## Extra cases tried

Against the built binary, with a hand-written probe (not committed):

- Service name of exactly 100 characters: 201. 101 characters: 422. A whitespace-only name: 422.
- URL of exactly 2,048 characters: 201. 2,049: 422.
- Six simultaneous creates of the same name: one 201, five 409; one row remains.
- A create without the CSRF header: 403.

## Findings

### Blocking

None.

### Non-blocking

- **N1. Journey 6 does not depend on the Refresh button.** Category: test quality. The task expects a no-op Refresh to make `waitForStatus` time out in journeys 3 and 6; only journey 3 failed, because journey 6 reloads or signs in again before it reads. Matters when: someone breaks Refresh in a way that journey 3's path does not touch (for example only after the first click). Journey 3 still catches the plain case.
- **N2. The parallel-apps criterion is shown by reading and by passing under 4 workers, not by an attached log showing two ports.** Category: test quality. Matters when: someone changes the fixture to share a port or a database and the tests happen not to collide. Report only.
- **N3. `make test-e2e-smoke` was not run by me.** Category: decision needed. Matters when: the CI job `e2e-smoke` on this pull request fails for a reason the direct command does not show (Mailpit start, `make build` ordering). The task says that failure belongs to this task.

## Docs or specs that no longer match

- `STACK.md` names Playwright but pins no version: after the merge, record `@playwright/test` 1.64.1 (`ROLES.md`). TypeScript 6.0.3 and `@types/node` 24.19.2 are already the frontend's.
- `docs/manual-checks.md`, "At each milestone": this is the last task of milestone 1, so the first line (`make test-e2e` in three browsers) is due. Nothing in the docs is wrong.
- `docs/openapi.yaml` and `docs/requirements.md`: no difference found.
