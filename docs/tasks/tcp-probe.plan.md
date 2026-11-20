# Plan: TCP probe

Branch: feat/tcp-probe

## TCP probe (`backend/internal/adaptor/probe/tcp.go`, tests in `tcp_test.go`)
- [x] Accepting listener, timeout 2 s: healthy, Failure nil; listener sees one connection, read gives EOF with no data — `TestCheckTCP_Accepted`
- [x] Closed port: `could_not_connect`, no HTTP status, no rule field — `TestCheckTCP_ClosedPort`
- [x] Dial returning DNS not-found, refused, plain error, and a host with a space on the real dialer: `could_not_connect` — `TestCheckTCP_DialErrors`
- [x] Blocking dial, timeout 50 ms: `timed_out`, dialer ctx carries a deadline — `TestCheckTCP_Timeout`
- [x] Timeout zero / negative: `timed_out`, dial not called — `TestCheckTCP_NonPositiveTimeout`
- [x] Caller cancel during dial, caller deadline shorter than timeout, already-cancelled ctx: ctx errors, empty result, no dial when pre-cancelled — `TestCheckTCP_CallerContext`
- [x] IPv6 host without brackets joined as `[::1]:port` — `TestCheckTCP_IPv6Address`
- [x] Concurrent use under -race, each own result — `TestCheckTCP_Concurrent`

## Runner (`backend/internal/worker/check_runner.go`, tests in `check_runner_test.go`)
- [x] TCP healthy first attempt: one CheckTCP with saved host/port/3 s, no HTTP call, no timer, one record — `TestRun_TCPHealthyFirstAttempt`
- [x] Retry table, run for HTTP and TCP (count 2/interval 7: three failures, two 7 s waits, 6 s not enough; failure then success; count 0; negative) — `TestRun_RetryRule`
- [x] TCP failure code recorded as given — `TestRun_TCPRecordsFailureCode`
- [x] Context ends during TCP attempt / wait / before record: error, no record — `TestRun_TCPCancel`
- [x] Missing host, missing port, unknown type: error, no probe, no record — `TestRun_TCPMissingSettings`, `TestRun_UnknownCheckType`
- [x] HTTP unchanged; `TestRun_TCPService` replaced, HTTP baseline kept as `TestRun_HTTPServiceProbedAndRecorded`

## Log line (`check_runner_test.go`)
- [x] Healthy HTTP and TCP: one info `check finished`, healthy true, no failure_code — `TestRun_LogHealthy`
- [x] Unhealthy TCP after retries: one warn line, failure_code, no http_status; HTTP non_2xx has http_status; one line per sequence — `TestRun_LogUnhealthy`
- [x] No line when ctx ended before record, record failed, settings missing; unhealthy with no failure logs warn without failure_code — `TestRun_LogNoLine`, `TestRun_LogUnhealthyNoFailure`
- [x] Log never contains host, port, URL, header, query — `TestRun_LogSecrecy`

## Wiring / repo-wide
- [x] `domain.TCPCheck`, `main.go` wiring (TCP prober built once)
- [x] `make check` passes: run, passed (exit 0; frontend deps installed with `npm ci` first)
- [x] Integration tests (`make test-integration`): not run: the task touches no code with integration tests (they cover the mailer only) and Docker/Mailpit was not needed
- [x] Only allowed paths changed

Also run: probe TCP tests 10x under -race (passed); worker package 3x under -race (passed).

## Judgment calls
- The per-type difference lives in one private `attemptFunc` that returns a closure for one attempt; `Run` holds the single loop. Settings errors come from it before any attempt.
- `TCPCheck` fields are `Host`, `Port` (int), `Timeout`, matching `HTTPCheck` naming.
- The runner's log helper uses `LogAttrs` with the sequence's context; `http_status` is added only for `non_2xx_status` with a status set.
- `logSink` (not `syncBuffer`) is the log buffer name in `check_runner_test.go`: `scheduler_test.go` already declares `syncBuffer` in the same package and I may not change it.
- Test types shared by tests (`step`, `eventLog`) are reused for the fake TCP prober; the fake is a near copy of the HTTP fake because the interfaces differ in the check type.
- The host-with-a-space test uses the real dialer and took ~50 ms (the resolver rejects it); it needs no network but depends on the machine's resolver failing quickly.
- `make check` needed `npm ci` in the fresh worktree; `package-lock` is unchanged.
