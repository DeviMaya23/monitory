# Plan: TCP probe

Branch: feat/tcp-probe

## TCP probe (`backend/internal/adaptor/probe/tcp.go`, tests in `tcp_test.go`)
- [ ] Accepting listener, timeout 2 s: healthy, Failure nil; listener sees one connection, read gives EOF with no data — `TestCheckTCP_Accepted`
- [ ] Closed port: `could_not_connect`, no HTTP status, no rule field — `TestCheckTCP_ClosedPort`
- [ ] Dial returning DNS not-found, refused, plain error, and a host with a space on the real dialer: `could_not_connect` — `TestCheckTCP_DialErrors`
- [ ] Blocking dial, timeout 50 ms: `timed_out`, dialer ctx carries a deadline — `TestCheckTCP_Timeout`
- [ ] Timeout zero / negative: `timed_out`, dial not called — `TestCheckTCP_NonPositiveTimeout`
- [ ] Caller cancel during dial, caller deadline shorter than timeout, already-cancelled ctx: ctx errors, empty result, no dial when pre-cancelled — `TestCheckTCP_CallerContext`
- [ ] IPv6 host without brackets joined as `[::1]:port` — `TestCheckTCP_IPv6Address`
- [ ] Concurrent use under -race, each own result — `TestCheckTCP_Concurrent`

## Runner (`backend/internal/worker/check_runner.go`, tests in `check_runner_test.go`)
- [ ] TCP healthy first attempt: one CheckTCP with saved host/port/3 s, no HTTP call, no timer, one record — `TestRun_TCPHealthyFirstAttempt`
- [ ] Retry table, run for HTTP and TCP (count 2/interval 7: three failures, two 7 s waits, 6 s not enough; failure then success; count 0; negative) — `TestRun_RetryRule`
- [ ] TCP failure code recorded as given — `TestRun_TCPRecordsFailureCode`
- [ ] Context ends during TCP attempt / wait / before record: error, no record — `TestRun_TCPCancel`
- [ ] Missing host, missing port, unknown type: error, no probe, no record — `TestRun_TCPMissingSettings`, `TestRun_UnknownCheckType`
- [ ] HTTP unchanged; `TestRun_TCPService` replaced, HTTP baseline kept as `TestRun_HTTPServiceProbedAndRecorded`

## Log line (`check_runner_test.go`)
- [ ] Healthy HTTP and TCP: one info `check finished`, healthy true, no failure_code — `TestRun_LogHealthy`
- [ ] Unhealthy TCP after retries: one warn line, failure_code, no http_status; HTTP non_2xx has http_status; one line per sequence — `TestRun_LogUnhealthy`
- [ ] No line when ctx ended before record, record failed, settings missing; unhealthy with no failure logs warn without failure_code — `TestRun_LogNoLine`, `TestRun_LogUnhealthyNoFailure`
- [ ] Log never contains host, port, URL, header, query — `TestRun_LogSecrecy`

## Wiring / repo-wide
- [ ] `domain.TCPCheck`, `main.go` wiring (TCP prober built once)
- [ ] `make check` passes: not run yet
- [ ] Integration tests (`make test-integration`): not run yet — decide at end (task touches no integration-tested code)
- [ ] Only allowed paths changed
