# Plan: scheduler

Branch: `feat/scheduler`.
S = `backend/internal/worker/scheduler_test.go`, U = `backend/internal/usecase/service_test.go`.
Integration tests: none apply (no `integration`-tagged test in the touched code). Integration tests (`make test-integration`): not run: no integration-tagged test in the touched code (worker, usecase/service, cmd/server); the task says no integration test applies.

## Scheduler (`worker/scheduler.go`)

- [x] Start runs the sequence at once with the service as given, no clock advance — S `TestStart_RunsFirstSequenceAtOnce`
- [x] Interval 45 s: 44 s one call, 45 s two (second at 45 s), 90 s three — S `TestScheduler_RunsAtTheInterval`
- [x] Two services, 30 s and 90 s: after 90 s four and two calls — S `TestScheduler_ServicesRunAtOwnRates`
- [x] Overrunning sequence: next starts at once, never two at once, next scheduled one interval after the late start, no burst — S `TestScheduler_OverrunStartsNextAtOnce`
- [x] Blocked service A does not delay B — S `TestScheduler_BlockedServiceDoesNotDelayAnother`
- [x] Error logged as `check sequence failed` with `service_id`, `error`; next one still runs — S `TestScheduler_LogsSequenceErrorAndGoesOn`
- [x] Context-cancelled return logs nothing, starts no timer — S `TestScheduler_CancelledSequenceLogsNothing`
- [x] Stop during wait: no further sequence, timer stopped — S `TestStop_DuringWait`
- [x] Stop during a running sequence: context cancelled, goroutine ends, nothing scheduled — S `TestStop_DuringSequence`
- [x] Stop unknown id, twice, after Close: no effect — S `TestStop_UnknownTwiceAndAfterClose`
- [x] Stop called from inside a sequence does not deadlock — S `TestStop_FromInsideSequence`
- [x] Start for a started id: waits for old, cancels old, never overlaps, one goroutine afterwards, new interval — S `TestStart_ReplacesRunningService`
- [x] Two concurrent Starts for one id: one entry left, all ended after Close — S `TestStart_ConcurrentSameID`
- [x] Close while a Start waits: Close returns, Start starts nothing, no goroutine remains — S `TestClose_WhileStartWaits`
- [x] Interval 0 and negative: nothing runs, one `service not scheduled` log with reason, no timer; running entry untouched — S `TestStart_InvalidInterval`
- [x] Returns exactly at / after next scheduled time: next at once, no timer — S `TestScheduler_LateSequenceNoTimer`
- [x] Context ended and timer fired together: no further sequence — S `TestScheduler_ContextWinsOverFiredTimer`
- [x] Close cancels running and waiting, waits for both, second Close at once, Start after Close runs nothing, started == returned — S `TestClose_*`
- [x] 50 services started then closed under `-race` leave nothing running — S `TestClose_ManyServices`

## Usecase (`usecase/service.go`)

- [x] StartChecks starts non-paused services once each in listed order, not the paused one — U `TestStartChecks_StartsEveryServiceThatIsNotPaused`
- [x] No services: nothing started, no error — U `TestStartChecks_NoServices`
- [x] List error returned unchanged, nothing started — U `TestStartChecks_ListErrorStartsNothing`
- [x] Existing CreateService / DeleteService criteria still pass — existing U tests unchanged

## Wiring (`cmd/server/main.go`)

- [x] Real scheduler built from runner, `defer Close` after services, `StartChecks` before server goroutine, Close before `e.Shutdown`; `noop_scheduler.go` deleted — by hand run (no test, per task)

## Repo-wide

- [x] `make check` passes
- [x] `git diff go.mod go.sum` empty
- [x] `grep -r NoopScheduler backend` empty
- [x] Only allowed paths changed
- [x] Run by hand (FR-67, FR-111), result in report

## Judgment calls

- Overrun: the sequence after a late one is counted from the late start (the task says both "scheduled for" and "no catch-up"); on-time sequences count from their scheduled time.
- `Close` also waits for goroutines already removed by `Stop` (an extra `WaitGroup`), so "no goroutine remains" holds after `Stop` then `Close`.
- `NewScheduler(sequence, clock, log)` argument order; the runner's method is `CheckRunner.Run`, passed as `runner.Run`.
- The plan items for `Close` tests are split into `TestClose_CancelsRunningAndWaitingAndWaitsForBoth` and `TestClose_ManyServices`. I added `TestScheduler_SchedulesFromTheStartOfTheSequence`, because mutation "schedule from the end" survived the other tests.
- `make check` needed `npm ci` in `frontend/` first (not installed in the worktree).
- The invalid-interval refusal comes before `startMu` is taken, so it never waits behind another `Start`.

## Mutation checks run

Each failed a named test: schedule from the end (`TestScheduler_SchedulesFromTheStartOfTheSequence`, overrun, late); catch-up (`TestScheduler_OverrunStartsNextAtOnce`); drop cancel of old (`TestStart_ReplacesRunningService` hangs: timeout); drop wait for old (`TestStart_ReplacesRunningService`); no timer stop (`TestStop_DuringWait`); `Close` without waiting (`TestClose_*`, `TestStart_ConcurrentSameID`); start paused services (`TestStartChecks_StartsEveryServiceThatIsNotPaused`). Not run: "let a second sequence start while one runs" (the loop is sequential by construction; there is no line to remove).

## Run by hand

Built binary, dev `.env` (port 8099, temp DB), local stub on 127.0.0.1:8098 answering 200, signed in, added an HTTP service with createService.
- Stub up: `GET /api/services` showed `healthy` with `last_checked_at` within 2 s of the add (FR-67).
- Stub stopped: after the retries (defaults 2 retries x 10 s, as my request left settings at their defaults) the state became `unhealthy`, `could_not_connect`, about 20 s after the sequence began. I did not watch a second interval check on the live app (covered by the fake-clock tests).
- Restart with the stub up: `last_checked_at` was updated at the moment of start-up, before the first poll (FR-111).
- Python's `http.server` answered each request after ~7 s here (reverse DNS), which delayed the first runs; a threaded stub without logging was used for the final runs.
