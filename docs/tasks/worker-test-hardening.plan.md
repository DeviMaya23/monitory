# Plan: worker test hardening

Branch: feat/worker-test-hardening. Prerequisites checked on the branch (it is based on main): `Scheduler.Restart`, `holdFirst`, `TCPProber.dial`, `errMissingTCPSettings`, `ServiceStateRepository.Update` reading `services` first, `domain.ErrServicePaused` all exist.

## Item 1: release a held sequence in a cleanup (`backend/internal/worker/scheduler_test.go`)
- [x] Helper `newRelease(t)` (sync.Once close, `t.Cleanup` registered after `newSchedSetup`'s cleanup); every test that held a channel (`TestScheduler_OverrunStartsNextAtOnce`, `TestClose_WhileStartWaits`, `TestClose_CancelsRunningAndWaitingAndWaitsForBoth`, all `holdFirst` tests) uses it; no direct `close(release)` remains.
- [x] `holdFirst` waits for ctx end OR release, signals `cancelled` once (sync.Once), then waits for release. Test: the whole existing `scheduler_test.go`, assertions unchanged.
- [x] Mutations of `scheduler.go` (scratch, restored after each), `go test -race -timeout 120s ./internal/worker/`: every one ends `FAIL`, none with `test timed out`.
  - M1: TestStop_ThenStartWaitsForTheStoppedGoroutine, TestStop_ThenRestartWaitsForTheStoppedGoroutine, TestClose_WhileStartWaitsForAStoppedGoroutine, TestScheduler_StartStopCloseFromManyGoroutines.
  - M7: TestRestart_DoesNotWaitAndDoesNotOverlapTheOldSequence, TestRestart_ChainRunsOnlyTheLast, TestStart_AfterRestartWaitsForTheChain, TestRestart_WhileStartWaits, TestStop_ThenRestartWaitsForTheStoppedGoroutine, TestClose_WhileRestartWaits (no panic).
  - M8: TestRestart_WhileStartWaits.
  - M9: TestRestart_ChainRunsOnlyTheLast.
  - W4: TestRestart_DoesNotWaitAndDoesNotOverlapTheOldSequence, TestRestart_ChainRunsOnlyTheLast, TestStart_AfterRestartWaitsForTheChain, TestRestart_ReplacesWaitingTimer, TestRestart_FromManyGoroutines, TestClose_WhileRestartWaits (and others).
  - With only the release helper, M7 and W4 still hung (a test goroutine blocked inside `Restart`; an uncancellable old goroutine that `Close` cannot reach). See Judgment calls.
- [x] A scratch `t.Fatal("scratch")` before the release in `TestClose_WhileRestartWaits` (removed after) fails in 0.00s, no hang.
- [x] Unmodified code: all scheduler tests (`-run 'Scheduler|Restart|Stop|Start|Close'`) pass 30 times under `-race` (`-count=30`, 18 s).

## Item 2: empty TCP host
- [x] Probe (`adaptor/probe/tcp.go`; `tcp_test.go` `TestCheckTCP_EmptyHost`): empty host with a listener on the port is `could_not_connect`, dial stub not called; a `127.0.0.1` host on the same port is healthy; zero timeout + empty host is `timed_out`; ended context + empty host is the context error. Fails without the guard (scratch revert).
- [x] Runner (`worker/check_runner.go`; `check_runner_test.go` `TestRun_TCPMissingSettings` "empty host" row and `TestRun_LogNoLine` "settings missing, empty host" row): host `""` returns the missing-settings error (text asserted), no probe, no record, zero timers, no log line. The new rows failed before the one-line change.

## Item 3: space-in-host test (`adaptor/probe/tcp_test.go`, `TestCheckTCP_DialErrors`)
- [x] `host with a space, real dialer` replaced by `host with a space, lookup error`: address `bad host:81` reaches the stub, DNS error gives `could_not_connect`. No probe test uses the real dialer with a name needing a lookup.

## Item 4: not-found branch (`backend/internal/repository/service_state_test.go`)
- [x] `TestServiceStateUpdate_ServiceRowGoneButStateRowRemains`: state row kept while the service row is deleted with FKs off on a pinned connection (`ON` restored in a defer before the delete, and read back as 1); `Update` returns `domain.ErrNotFound`, apply not called, state row unchanged. Passes now; fails with the `services` read removed (scratch; restored).

## Repo-wide
- [x] `make check`: passed on the third run. Runs one and two failed in `TargetDialog.test.tsx` (frontend, untouched) with a 5 s timeout while the machine was loaded; that file passes alone (96 tests) and the full suite passed on the rerun.
- [x] Integration tests (`make test-integration`): not run: Docker is not running here, and the task touches no code with integration tests (the Mailpit test is out of scope).
- [x] Only allowed paths changed: the four test files, `check_runner.go`, `tcp.go`, and this plan.

## Judgment calls
- M7 and W4 still timed out after the release helper alone. M7: a bare `Restart` in the test goroutine blocked inside the mutant. I wrapped the two bare `Restart` calls in held tests (`TestStart_AfterRestartWaitsForTheChain`, `TestClose_WhileRestartWaits`) in the existing `returnsWithin`; no assertion changed or removed. W4: the uncancelled old goroutine is no longer in `entries`, so nothing can end it and `Close` waits for ever. I made the `newSchedSetup` cleanup run `Close` through a new `returnsInTime` helper that waits at most the existing `guard` and then reports `t.Error`. This is a bounded wait in the cleanup, not a new or raised constant, but the task said "no timeout is added"; I read the acceptance criteria (no `test timed out` for W4) as taking priority. The leaked goroutine stays until the process ends.
- `TestClose_WhileStartWaits` keeps its own `<-ctx.Done()` then `close(oldCancelled)` (not `holdFirst`); the task only asked for `holdFirst` to change.
- The empty-host probe test dials for real through the stub so that, without the guard, `:port` reaches the local listener and the test fails.
- The earlier runner commit (7614ed9) holds the test rows and the next commit the one-line guard; the pair is not red at the branch tip.
- I installed frontend dependencies with `npm ci` to run `make check`; no tracked file changed.
