# Plan: worker test hardening

Branch: feat/worker-test-hardening. Prerequisites checked on the branch (it is based on main): `Scheduler.Restart`, `holdFirst`, `TCPProber.dial`, `errMissingTCPSettings`, `ServiceStateRepository.Update` reading `services` first, `domain.ErrServicePaused` all exist.

## Item 1: release a held sequence in a cleanup (`backend/internal/worker/scheduler_test.go`)
- [ ] Helper `newRelease(t)` (sync.Once close, `t.Cleanup` registered after `newSchedSetup`'s `sched.Close`); every test that held a channel (`TestScheduler_OverrunStartsNextAtOnce`, `TestClose_WhileStartWaits`, `TestClose_CancelsRunningAndWaitingAndWaitsForBoth`, all `holdFirst` tests) uses it; no direct `close(release)`.
- [ ] `holdFirst` waits for ctx end OR release, signals `cancelled` once, then waits for release. Test: the whole existing `scheduler_test.go`.
- [ ] Mutations M1, M7, M8, M9, W4 on `scheduler.go` (scratch, restored) each end in FAIL with no `test timed out`: `go test -race -timeout 120s ./internal/worker/`. Results: (to fill)
- [ ] Scratch `t.Fatal` in a holding test before release fails within `guard`, not a hang. Result: (to fill)
- [ ] Unmodified code: `scheduler_test.go` passes 30 times under `-race`. Result: (to fill)

## Item 2: empty TCP host
- [ ] Probe (`adaptor/probe/tcp.go`, `tcp_test.go`: new `TestCheckTCP_EmptyHost`): empty host + open listener is `could_not_connect`, dial stub not called; non-empty host baseline healthy; zero timeout + empty host is `timed_out`; ended context + empty host is the context error.
- [ ] Runner (`worker/check_runner.go`, `check_runner_test.go`: `TestRun_TCPMissingSettings` and `TestRun_LogNoLine` rows): host pointing to `""` is `errMissingTCPSettings`, nothing probed, recorded, no timer, no log line.

## Item 3: space-in-host test (`adaptor/probe/tcp_test.go`, `TestCheckTCP_DialErrors`)
- [ ] Replace `host with a space, real dialer` with a stub-dial row asserting address `bad host:81` and a lookup error is `could_not_connect`; no probe test uses the real dialer with a name needing a lookup.

## Item 4: not-found branch (`backend/internal/repository/service_state_test.go`)
- [ ] New test: state row without service row (FK off on a pinned connection, restored by cleanup registered before the delete); `Update` returns `domain.ErrNotFound`, apply not called, state row unchanged. Fails when the `services` read is removed (scratch). Result: (to fill)

## Repo-wide
- [ ] `make check` passes. Result: (to fill)
- [ ] Integration tests (`make test-integration`): (to fill)
- [ ] Only allowed paths changed.
