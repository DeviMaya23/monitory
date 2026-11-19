# Verification report: m2-e2e-journeys

Verifier branch: `verify/m2-e2e-journeys` (reset to the builder's `feat/m2-e2e-journeys` at `cde0b1a`, plus one test fix and this report).

**Result: no Blocking findings.** One gap in journey 4 (FR-83 ordering) was found by a mutation, and fixed in this branch by a test assertion.

## Commands run

| Command | Result |
|---|---|
| `make check` | run, passed (after `npm ci` in `frontend/` and `e2e/`) |
| `cd e2e && npm run typecheck` | run, passed |
| `npx playwright test --project=chromium --list` / `--grep @smoke --list` | run: 25 tests; smoke lists the M1 smoke tests (`add-service`, `delete-service`, `sign-in`) plus exactly M2 journeys 1 and 2 |
| Whole Chromium project, default workers (4), 3 times | run, passed 25/25 each (1.1–1.2 min) |
| `--workers=3` / `--workers=1` | run, passed 25/25 (1.4 min / 3.9 min) |
| Subset (journeys 4 redirect, 4 retries, 6, 7) with `SMTP_HOST=bogus.invalid ADMIN_PASSWORD=zzz ALERT_DELIVERY_RETRIES=9` in the shell | run, passed 8/8 (the full run under altered env is the builder's claim; I verified a subset) |
| `make test-e2e-smoke` | **not run**: another worktree's Mailpit container (`alert-dispatch-builder-mailpit-1`) holds 1025/8025, so `make mailpit-up` would clash. The direct command ran against that Mailpit, **v1.33.1** (`/api/v1/info`) |
| `make test-integration` | **not run**: this task changes no backend code, and the target clears the whole shared mailbox, which holds another session's mail. Integration tests exist (`alert-dispatch` against Mailpit); no criterion of this task depends only on them |

Flakiness: 5 full Chromium runs, no failure and no flaky test.

## Criteria

"Real?" = would the named test fail if the behaviour were removed (mutation id in brackets, see "Mutation checks"). Met = yes unless said.

| Criterion | Test | Real? | Status |
|---|---|---|---|
| `npm ci && typecheck` | `npm run typecheck` | n/a | met |
| `--list` and `--grep @smoke` | list runs above | n/a | met |
| Parallel tests: own app, stub, receiver, recipient | fixtures + `uniqueAddress`; `--workers=1` and `3` pass | Yes: every mail read filters by `to:"<random>"`; shared mailbox with 4 workers never crossed | met |
| Explicit app env | `appEnv`/`spawn(env)`; subset run with shell overrides | Yes for the subset; full-suite claim is the builder's | met |
| M1 journeys unchanged and passing | M1 specs in every full run | Yes (helper Timing fill is conditional on the group) | met |
| No test clears Mailpit | grep: no Mailpit DELETE call | n/a | met |
| J1 FR-14, FR-81 (add email target, row, toast) | `M2 journey 1` | Partly asserted by UI; no mutation | met |
| J1 FR-21, FR-22, FR-23, FR-93, NFR-7 | `M2 journey 1` | Yes [nodispatch fails it] | met |
| J1 FR-25 (no more while unhealthy) | `M2 journey 1` step 3 | Yes [u2u] | met |
| J2 FR-90, FR-92, FR-23, FR-93, NFR-7 | `M2 journey 2` | Yes [nodispatch, nohdr] | met |
| J2 FR-83 (email and webhook of one list) | `M2 journey 2` | Yes [nodispatch] | met |
| J2 NFR-7 on screen (no `b` element) | `M2 journey 2` `h1 b`, `main b` | Plausible; `main`/`h1` exist in the frontend; no mutation run | met |
| J3 FR-65, FR-23 custom messages as text | `M2 journey 3 custom messages` | Yes [nodispatch]; text-vs-HTML escape not mutated | met |
| J3 FR-20 alerts off | `M2 journey 3 alerts off` | Yes [alertsoff] | met |
| J4 FR-85 three attempts, gaps | `M2 journey 4 retries…` | Yes [retry0] | met |
| J4 FR-83 a failing webhook does not hold up the email | same | **Not before this report**: [sequential] passed the builder's test. Fixed here (mail time before the third attempt); now fails under [sequential] | met (after fix) |
| J4 FR-86 notice, cleared on later success | same | Yes [nowrite, noclear] | met |
| J4 FR-84 status unchanged by a failed delivery | same | Yes [statuschange] | met |
| J4 FR-115 redirect not followed | `M2 journey 4 a redirect…` | Yes [redirect] | met |
| J5 FR-84, FR-85, FR-86 no SMTP account | `M2 journey 5` | Yes [nowrite] | met |
| J6 FR-107, FR-93 delivered email, test mail text | `M2 journey 6 email, delivered` | Yes [testmail2] | met |
| J6 FR-107, FR-85 webhook delivered/failed, one request per press, no retries | `…webhook, delivered and failed` | Yes [testretry] | met |
| J6 FR-107, FR-108 only the target in the form, nothing saved | `…only the target in the form`, `…email, delivered` | Partly: [testmail2] fails both. "Sends to the other targets" and "saves" were not mutated: `TargetTestService` has no repository or dispatcher, so the code cannot do either | met |
| J6 no SMTP account text | `…no SMTP account` | Not mutated; text assertion | met |
| J6 FR-108, FR-89 invalid input sends nothing | `…invalid settings send nothing` | Not mutated; asserts texts, focus, `aria-invalid`, receiver count 0 | met |
| J7 FR-19 sixth refused, input kept | `M2 journey 7` | Yes [sixth] | met |
| J7 FR-88 duplicates (case, exact URL) | `M2 journey 7` | Yes [dup] | met |
| J7 FR-14, 15, 16, 17, 80, 81, 100 (add, edit, remove, order, name, http warning) | `M2 journey 7` | Assertions are specific (order via `nth`, new name, count, toasts, reload); not mutated | met |
| J8 FR-111 restart, no duplicate, later change alerts | `M2 journey 8` | Yes [restartloss, u2u] | met |
| `make check` | run | n/a | met |
| Smoke/Chromium passes via `make` or direct | direct command, see above | n/a | met (make not run, reason given) |
| Chromium project passes at least twice in a row | 5 runs | n/a | met |
| Nothing outside `e2e/**` and plan changed | `git diff --stat origin/main...HEAD`: 11 files, all `e2e/**` plus the plan | n/a | met |

## Plan check

Read after the criteria. Every criterion of the task file is in the plan. Every ticked item has a test that exists and ran. Differences between plan and diff: none. One plan item is thinner than the task: journey 4 is ticked for FR-83 although the test only showed that the mail arrived, not that it arrived while the webhook was still failing (fixed, see findings). The plan's claim that the full runs were done under altered shell env was verified only for a subset. `Mutation checks were not run` is true and is this report's job.

## Rule checks

- **No product change / dependencies:** the diff touches only `e2e/**` and the plan; `e2e/package.json` and `package-lock.json` unchanged; no new dependency.
- **Fixed waits:** the only new `waitForTimeout` is in `settle` (10 s). `setTimeout` appears in the stub's `setDelay`, in `waitForMessages`' 500 ms poll (both specified), and in M1 files. `delete-service.spec.ts` keeps M1's waits.
- **Selectors:** no `.locator('.…')` or `[class`. Tag selectors `h1 b`, `main b`; the M1 xpath in `readStatus` is unchanged.
- **Shared mailbox:** no Mailpit delete; every read is `to:"<own address>"`.
- **Isolation:** `--workers=1` and `--workers=3` both pass.
- **Test files:** my one change is an assertion in the existing `alert-failure.spec.ts`; no `_edge` or `_regress` file.
- **CONVENTIONS (layers, data scoping, transactions):** not applicable, no backend or frontend code in the diff.

## Mutation checks run

Scratch worktree, never committed, then removed. Each shows the journey that failed.

| Mutation | Failed |
|---|---|
| `nodispatch`: step 7 of `RecordCheckResult` skipped | journeys 1, 2, 3 custom, 8 |
| `u2u`: alert on unhealthy to unhealthy too | journeys 1 (step 3), 8 |
| `alertsoff`: `AlertsEnabled` ignored | journey 3 alerts off (custom messages still passed, as it should) |
| `retry0`: `attempt == 1` | journey 4 retries |
| `redirect`: sender follows redirects | journey 4 redirect |
| `nowrite`: `last_delivery_failed` never set | journeys 4 (both) and 5 |
| `noclear`: never cleared on success | journey 4 retries |
| `statuschange`: a failed outcome sets the service healthy | journey 4 retries |
| `restartloss`: all states reset to healthy at start | journey 8 |
| `sixth`: cap +1 | journey 7 |
| `dup`: a duplicate reports success | journey 7 |
| `testretry`: test alert retries a failed webhook | journey 6 webhook |
| `testmail2`: test email sent twice | journey 6 email and only-the-target |
| `nohdr`: custom headers dropped | journey 2 |
| `sequential`: targets delivered one after another | passed the builder's journey 4; fails after my fix |

Two of my first attempts were invalid (a database CHECK constraint refused the SQL; a patch did not compile) and were redone before counting. Not run: a test-alert mutation that saves the target or sends to the whole list (the usecase has no repository or dispatcher to do it with), and a mutation making the mail HTML.

## Findings

### Blocking

None.

### Non-blocking

1. **Test quality, fixed in this branch.** Journey 4 step 1 asserted only that the email arrives, not that it arrives while the webhook is still failing, so delivering targets one after another (FR-83) passed. I added `expect(Date.parse(mail.created)).toBeLessThan(hooks[2].at)` in `alert-failure.spec.ts`; it passes on the unmutated app (also in the altered-env run) and fails under `sequential`. Matters when: someone makes delivery sequential or a shared worker pool.
2. **Test quality.** Journey 6 never shows that a test alert is not sent to the other targets or saved, beyond one email going to `A` and none to `B`, and an empty list afterwards. Matters when: `TargetTestService` is given a target repository or the dispatcher.
3. **Cosmetic.** `utcStampNear` allows 4 minutes where the task says 3 (it adds 60 s for the minute truncation). `waitForCount` keeps an unused `last` variable. Report only.
4. **Test quality.** Journey 7 steps (edit, order, name, `http://` warning, remove) have no mutation run; the assertions are specific, so this is a risk of the unmutated kind. Report only.

## What I could not prove

Firefox and WebKit, a real SMTP provider (the manual check), and the 360 px layouts. `make test-e2e-smoke` and `make test-integration` were not run (reasons above).

## Docs or specs that no longer match

- `STACK.md` does not record the versions adopted by the M1 and M2 e2e work: `@playwright/test` 1.64.1, `typescript` 6.0.3 (e2e), `@types/node` 24.19.2, and Mailpit v1.33.1 (the compose file uses the `latest` tag).
- The task file writes `waitForCount(receiver.hookRequests, 1)`; the helper takes a function returning a number, so the journeys use `() => receiver.hookCount()` (plan, judgment calls). Reword if the file is reused.
- `docs/openapi.yaml` and `docs/requirements.md`: no change needed.
