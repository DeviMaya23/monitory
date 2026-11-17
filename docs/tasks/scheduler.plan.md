# Plan: scheduler

Branch: `feat/scheduler`.
S = `backend/internal/worker/scheduler_test.go`, U = `backend/internal/usecase/service_test.go`.
Integration tests: none apply (no `integration`-tagged test in the touched code). Outcome: not run: no integration tests in touched code.

## Scheduler (`worker/scheduler.go`)

- [ ] Start runs the sequence at once with the service as given, no clock advance — S `TestStart_RunsFirstSequenceAtOnce`
- [ ] Interval 45 s: 44 s one call, 45 s two (second at 45 s), 90 s three — S `TestScheduler_RunsAtTheInterval`
- [ ] Two services, 30 s and 90 s: after 90 s four and two calls — S `TestScheduler_ServicesRunAtOwnRates`
- [ ] Overrunning sequence: next starts at once, never two at once, next scheduled one interval after the late start, no burst — S `TestScheduler_OverrunStartsNextAtOnce`
- [ ] Blocked service A does not delay B — S `TestScheduler_BlockedServiceDoesNotDelayAnother`
- [ ] Error logged as `check sequence failed` with `service_id`, `error`; next one still runs — S `TestScheduler_LogsSequenceErrorAndGoesOn`
- [ ] Context-cancelled return logs nothing, starts no timer — S `TestScheduler_CancelledSequenceLogsNothing`
- [ ] Stop during wait: no further sequence, timer stopped — S `TestStop_DuringWait`
- [ ] Stop during a running sequence: context cancelled, goroutine ends, nothing scheduled — S `TestStop_DuringSequence`
- [ ] Stop unknown id, twice, after Close: no effect — S `TestStop_UnknownTwiceAndAfterClose`
- [ ] Stop called from inside a sequence does not deadlock — S `TestStop_FromInsideSequence`
- [ ] Start for a started id: waits for old, cancels old, never overlaps, one goroutine afterwards, new interval — S `TestStart_ReplacesRunningService`
- [ ] Two concurrent Starts for one id: one entry left, all ended after Close — S `TestStart_ConcurrentSameID`
- [ ] Close while a Start waits: Close returns, Start starts nothing, no goroutine remains — S `TestClose_WhileStartWaits`
- [ ] Interval 0 and negative: nothing runs, one `service not scheduled` log with reason, no timer; running entry untouched — S `TestStart_InvalidInterval`
- [ ] Returns exactly at / after next scheduled time: next at once, no timer — S `TestScheduler_LateSequenceNoTimer`
- [ ] Context ended and timer fired together: no further sequence — S `TestScheduler_ContextWinsOverFiredTimer`
- [ ] Close cancels running and waiting, waits for both, second Close at once, Start after Close runs nothing, started == returned — S `TestClose_*`
- [ ] 50 services started then closed under `-race` leave nothing running — S `TestClose_ManyServices`

## Usecase (`usecase/service.go`)

- [ ] StartChecks starts non-paused services once each in listed order, not the paused one — U `TestStartChecks_StartsEveryServiceThatIsNotPaused`
- [ ] No services: nothing started, no error — U `TestStartChecks_NoServices`
- [ ] List error returned unchanged, nothing started — U `TestStartChecks_ListErrorStartsNothing`
- [ ] Existing CreateService / DeleteService criteria still pass — existing U tests unchanged

## Wiring (`cmd/server/main.go`)

- [ ] Real scheduler built from runner, `defer Close` after services, `StartChecks` before server goroutine, Close before `e.Shutdown`; `noop_scheduler.go` deleted — by hand run (no test, per task)

## Repo-wide

- [ ] `make check` passes
- [ ] `git diff go.mod go.sum` empty
- [ ] `grep -r NoopScheduler backend` empty
- [ ] Only allowed paths changed
- [ ] Run by hand (FR-67, FR-111), result in report

## Judgment calls

(none yet)
