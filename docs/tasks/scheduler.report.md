# Verification report: scheduler

Verifier branch: `verify/scheduler` (built on `feat/scheduler` at `f90a2ef`).

Result: **1 Blocking finding** (`make check` fails), 3 Non-blocking. No pull request opened.

## Commands run

| Command | Result |
|---|---|
| `make check` | **failed** at `lint-md`: `docs/tasks/scheduler.plan.md:64 MD032/blanks-around-lists`. First needed `npm ci` in `frontend/` (not installed in the worktree) |
| Every other part of `make check`, run on its own | passed: gofmt, golangci-lint (0 issues), eslint, stylelint, shellcheck, `openapi-lint`, Go tests with `-race` (all packages), Vitest (159), `build` |
| `make test-integration` | not run: no `integration`-tagged test exists in the touched code (worker, `usecase/service`, `cmd/server`), and the task says none applies. No criterion depends only on an integration test |

## Criteria

"Real?" = would the named test fail if the behaviour were removed. "Yes (M)" means I confirmed it with a mutation (see "Mutation checks").

| # | Criterion | Test | Real? | Verdict |
|---|---|---|---|---|
| 1 | `Start` runs the sequence at once, with the service as given, no clock advance (FR-67, FR-111) | `TestStart_RunsFirstSequenceAtOnce` | Yes: asserts the call time equals the unadvanced clock and the whole service value | Met |
| 2 | 45 s interval: 44 s one call, 45 s two (second at 45 s), 90 s three (FR-10) | `TestScheduler_RunsAtTheInterval` | Yes (M: schedule from end) | Met |
| 3 | Two services, 30 s and 90 s: 4 and 2 calls after 90 s (FR-10) | `TestScheduler_ServicesRunAtOwnRates` | Yes | Met |
| 4 | Overrun: next starts at once, never two at once, next one interval after the late start, no burst (FR-10) | `TestScheduler_OverrunStartsNextAtOnce` | Yes (M: overlap, end-of-sequence) | Met |
| 5 | Blocked A does not delay B (NFR-6) | `TestScheduler_BlockedServiceDoesNotDelayAnother` | Yes: B's call time is asserted at B's scheduled time while A is blocked | Met |
| 6 | Error logged `check sequence failed` with `service_id`, `error`; next still runs | `TestScheduler_LogsSequenceErrorAndGoesOn` | Yes | Met |
| 7 | Cancelled return logs nothing, starts no timer | `TestScheduler_CancelledSequenceLogsNothing` | Yes (M: ctx check after the sequence) | Met |
| 8 | `Stop` during wait: nothing after `Advance`, timer stopped (FR-71) | `TestStop_DuringWait` | Yes (M: no timer stop) | Met |
| 9 | `Stop` during a sequence: context cancelled, goroutine ends, nothing scheduled (FR-71) | `TestStop_DuringSequence` | Yes (M: `Stop` without cancel hangs the test) | Met |
| 10 | `Stop` unknown, twice, after `Close`: no effect | `TestStop_UnknownTwiceAndAfterClose` | Partly: no panic is the only assertion, so any no-op passes. Acceptable for "no effect" | Met |
| 11 | `Start` for a started id: waits, cancels old, no overlap, one goroutine after, new interval | `TestStart_ReplacesRunningService` | Yes (M: drop cancel, drop wait) | Met |
| 12 | Two concurrent `Start`s, one id, `-race`: one entry, all ended after `Close` | `TestStart_ConcurrentSameID` | Yes (M: `Close` without wait) | Met |
| 13 | `Close` while a `Start` waits: `Close` returns, `Start` starts nothing, no goroutine remains | `TestClose_WhileStartWaits` | Yes (M: drop the re-check of `closed` panics the `WaitGroup`) | Met |
| 14 | Interval 0 and negative: nothing runs, one log with reason, no timer, running entry untouched | `TestStart_InvalidInterval` (3 subtests) | Yes (M: `<= 0` to `< 0` hangs the zero case) | Met |
| 15 | Returns exactly at / after the next time: next at once, no timer | `TestScheduler_LateSequenceNoTimer` | Yes (M: end-of-sequence) | Met |
| 16 | Context ended and timer fired together: no further sequence | `TestScheduler_ContextWinsOverFiredTimer` | Not mutated. The loop checks `ctx.Err()` before every sequence, and the test uses the clock hook to fire both together, so removing that check should fail it | Met |
| 17 | `Close` cancels running and waiting, waits for both, second `Close` at once, `Start` after `Close` runs nothing, started == returned | `TestClose_CancelsRunningAndWaitingAndWaitsForBoth` | Yes (M: `Close` without wait) | Met |
| 18 | 50 services started then closed under `-race` | `TestClose_ManyServices` | Yes (M: `Close` without wait) | Met |
| 19 | `StartChecks`: non-paused only, once each, in listed order (FR-111, FR-76 start-up half) | `TestStartChecks_StartsEveryServiceThatIsNotPaused` | Yes (M: start paused ones), with a not-paused baseline | Met |
| 20 | No services: nothing started, no error | `TestStartChecks_NoServices` | Weak: also passes if `StartChecks` did nothing at all, which criterion 19 rules out. Fine | Met |
| 21 | List error returned unchanged, nothing started | `TestStartChecks_ListErrorStartsNothing` | Yes (`ErrorIs`, `started` empty with a service in the repository) | Met |
| 22 | Existing `CreateService` / `DeleteService` tests pass unchanged | existing `service_test.go` tests | Yes. `git diff` shows only additions to `service_test.go` | Met |
| 23 | `make check` passes | n/a | n/a | **Not met** (Blocking finding 1) |
| 24 | `git diff go.mod go.sum` empty | diff read | n/a | Met |
| 25 | `grep -r NoopScheduler backend` finds nothing | grep | n/a | Met |
| 26 | Nothing outside the allowed paths changed | `git diff --name-only main...HEAD` | n/a | Met: only the allowed files plus `docs/tasks/scheduler.plan.md` |
| 27 | Wiring: FR-67 and FR-111 in the running app (no test, by design) | by hand | n/a | Met: see "Live run" |

Requirement mapping: FR-10 (2, 3, 4), FR-67 (1, live run), FR-71 (8, 9), FR-111 (1, 19, live run), NFR-6 (5).

## Plan check (`scheduler.plan.md`, read after the criteria)

- Every criterion above appears in the plan. Nothing is missing from it. The plan also adds `TestScheduler_SchedulesFromTheStartOfTheSequence`, which is a real test and was needed because that mutation survived the other tests.
- Every ticked test exists and checks the behaviour (see the table).
- **The plan ticks "`make check` passes", and it does not.** The failure is in the plan file itself (line 64: a list directly under a paragraph without a blank line).
- Plan and diff otherwise agree. The plan's judgment calls (late-start counting, the extra `WaitGroup`, argument order, the invalid-interval check before `startMu`) match the code. The plan says the mutation "let a second sequence start while one runs" was not run. I ran it (run the sequence in a goroutine) and it failed 8 tests.
- The plan says the by-hand run covered the restart. I could not confirm "recovered after restart" (see "Live run").

## Rule checks

- **Dependencies:** `go.mod` and `go.sum` unchanged; no new import outside the standard library and in-repo packages.
- **Time:** `worker/scheduler.go` has no `time.Now`, `Sleep`, `After` or `NewTimer`. The one wait is a `clock.Clock` timer, stopped on the cancel path; on the fired path it has already fired. There is no literal number of seconds (the interval is `CheckIntervalSeconds`).
- **Goroutines:** one goroutine per started service, each with its own context and a `done` channel. A `WaitGroup` counts every goroutine, including those removed by `Stop`, so `Close` waits for all. Only `Start` starts goroutines, and the usecase and handlers start none. `entries` and `closed` are only touched under `mu`. The sequence function is never called under `mu` and nothing blocks under it. `Start` waits for an old goroutine under `startMu` only. `Stop` from inside a sequence does not deadlock (`TestStop_FromInsideSequence`).
- **No rule in the worker:** the scheduler reads no `Paused`, check type, status or database. `StartChecks` in `usecase` is the only place that skips paused services.
- **Layering:** `worker/scheduler.go` imports `domain`, `pkg/clock` and the standard library only. `main.go` only passes the pieces together.
- **Order in `main.go`:** `defer scheduler.Close()` is registered after the database's defer, so it runs first. `StartChecks` runs before the server goroutine, and a failure returns from `run` with the defer still active. `scheduler.Close()` runs before `e.Shutdown`.
- **Log contents:** the two log lines carry `service_id`, `reason` and the error text. The errors that can reach the log are `errMissingHTTPSettings`, `errInconsistentResult`, the probe's context errors and the state repository's errors. None of them embeds a URL, header or body.
- **Conventions:** no test-file naming violations (one test file per source file, new tests are in the existing files). `usecase` tests do not import `worker`. `worker` tests do not import `repository` or `adaptor`.

## Mutation checks run

| Mutation (in `worker/scheduler.go` unless noted) | Failed |
|---|---|
| Schedule from the end of the sequence | `TestScheduler_OverrunStartsNextAtOnce`, `TestScheduler_LateSequenceNoTimer`, `TestScheduler_SchedulesFromTheStartOfTheSequence` |
| Run the sequence in a goroutine, so a second one can start while one runs | 8 tests, including the first-call and overrun tests |
| No timer stop on cancel | `TestStop_DuringWait` |
| Drop the cancel of the old entry in `Start` | `TestStart_ReplacesRunningService` (hangs, timeout) |
| Drop the wait for the old goroutine | `TestStart_ReplacesRunningService` (close of closed channel) |
| `Close` returns without waiting | `TestStop_DuringSequence`, `TestStart_ConcurrentSameID`, `TestClose_ManyServices` |
| `Stop` without the cancel (FR-71) | `TestStop_DuringSequence` hangs, timeout |
| Drop the second `closed` check in `Start` | `TestClose_WhileStartWaits` (panic: `WaitGroup` reused) |
| Drop the context check after the sequence | `TestScheduler_CancelledSequenceLogsNothing` and 3 more |
| Accept interval 0 (`<= 0` to `< 0`) | `TestStart_InvalidInterval` (hangs) |
| Start paused services (`usecase/service.go`) | `TestStartChecks_StartsEveryServiceThatIsNotPaused` |

Every source file was restored after each run; `git status` shows no source change.

## Tests added

In `backend/internal/worker/scheduler_test.go`:

- `TestScheduler_IntervalLimits`: intervals 30 and 86400, one second short and exact. Passed.
- `TestScheduler_StartStopCloseFromManyGoroutines`: 20 rounds of concurrent `Start`, `Stop`, `Start` over 4 ids, then `Close`. Asserts it returns, and that started calls equal returned calls. Passed under `-race`, 5 runs.

## Live run

I built the binary and ran it with a temp database on 127.0.0.1:8096. A threaded stub answered 200 on 127.0.0.1:8097. I signed in and added a service with a 30 s interval, 0 retries and a 2 s timeout, through `POST /api/services`.

- **Add (FR-67):** `GET /api/services` showed `healthy` with `last_checked_at` 0.1 s after the add.
- **Interval (FR-10):** the next check was at +30.0 s (`09:22:33`), start to start.
- **Stub stopped:** the check at +60 s saved `unhealthy`, `could_not_connect`.
- **Restart (FR-111):** a new check was saved at start-up, before any wait (`last_checked_at` `09:23:14`, about 1 s after the process started). It hit the stub before the stub was listening, so the status stayed `unhealthy`. I deleted the service before the next interval, so I did not see it recover. The immediate check is what FR-111 asks for.
- **Delete (FR-71):** `DELETE` answered 204, the list was empty, and `SIGTERM` stopped the app cleanly (`stopped` logged, process exited).

## Findings

### Blocking

1. **`make check` fails (acceptance criterion "make check passes").** `make lint-md` reports `docs/tasks/scheduler.plan.md:64 error MD032/blanks-around-lists`. Reproduce: `cd frontend && npm ci`, then `make check`. The plan ticks this item as passed. Fix: a blank line before the list at line 64 of the plan. I did not change it, because the plan is the builder's file. Nothing else in `make check` fails.

### Non-blocking

1. **A `Stop` followed by a `Start` for the same id can overlap** (latent bug). `Stop` removes the entry without waiting, so the next `Start` finds no old entry and does not wait for the old goroutine; the old sequence can still be running when the new one starts. I reproduced it with a scratch test (a first call that blocks until released after cancel, then `Stop`, `Start`: `maxRunning` was 2, expected 1). I did not keep it, since it would fail `make check`. This follows the task file as written ("`Stop` does not wait", and `Start` waits only for an entry in the map), and today `Stop` is only called after a delete, so the id is never started again. Matters when: the pause and resume task calls `Stop` and then `Start` for one service, or edit does. The fix is likely to keep a removed-but-running entry in a second map until it ends, or for `Stop` to leave the entry for `Start` to wait on.
2. **No test of the `Stop`-then-`Start` case** (test quality). It is the gap behind finding 1. Matters when: the same task as above; add it with the fix.
3. **A service with `Paused` true is still started by `Start` itself** (decision needed, report only). By design the worker does not read `Paused`, so anything other than `StartChecks` that calls `Start` for a paused service starts it. Matters when: resume or edit calls `Start` directly. No trigger today.

## Docs or specs that no longer match

- `STACK.md`: no dependency added, so no version to record.
- `docs/openapi.yaml`, `docs/requirements.md`: no change needed. No operation changed.
- `docs/tasks/backlog.md`: the line "Left out of `scheduler`: a log line per check outcome" is still accurate. Non-blocking finding 1 belongs in the backlog against the pause and resume task, whenever the user wants it tracked.
- `ARCHITECTURE.md` and `docs/manual-checks.md`: nothing in them mentions the no-op scheduler, so nothing is stale.
