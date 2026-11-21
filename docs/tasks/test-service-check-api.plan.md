# Plan: test-service-check API

Branch: `feat/test-service-check-api`. Tick items as they are done. Integration tests: none of the touched code has any; see the last item.

## Prerequisites

- [x] Checked on the branch: `TCPProber.CheckTCP`, `HTTPProber`/`NewHTTPProber`, `HTTPCheck` certificate fields, `normalizeServiceInput`, `validateCheck`, `validateSettings`, `NewServer`, `testerSpy`/`newRouter` exist.

## Probe (`adaptor/probe/http.go`, `http_test.go`)

- [x] `TestHTTP` same verdicts as `CheckHTTP`: `TestTestHTTP_SameVerdictAsCheckHTTP` (table through both entry points)
- [x] Status and body, no rules, 2xx/404/500, cert problem and rule match keep status+body: `TestTestHTTP_StatusAndBody`
- [x] Truncation boundary (10 / 11 / empty): `TestTestHTTP_BodyLimit`
- [x] No response gives nil status, empty body: `TestTestHTTP_NoResponse`
- [x] Stalled body, no rules: same verdict as `CheckHTTP`, status, partial body: `TestTestHTTP_StalledBodyWithoutRules`
- [x] Caller context cancelled during stalled body, and already ended: `TestTestHTTP_CallerContext`
- [x] `CheckHTTP` tests unchanged and passing (existing `TestCheckHTTP_JSONBodyReadInsideTimeout`)

## Usecase (`usecase/service_tester.go`, `service_tester_test.go`, `service_validation.go`)

- [x] Healthy HTTP, built `HTTPCheck` incl. the three certificate fields, on and off: `TestTestServiceCheck_HTTPAttempt`
- [x] Trimming: `TestTestServiceCheck_Trims`
- [x] Defaults and given timeout: `TestTestServiceCheck_Timeout`
- [x] TCP: `TestTestServiceCheck_TCP`
- [x] Failed attempt is a result: `TestTestServiceCheck_FailureIsAResult`
- [x] No retry: `TestTestServiceCheck_NoRetry`
- [x] Duration 1234 ms / 1999 µs / 0: `TestTestServiceCheck_Duration`
- [x] Body made valid UTF-8: `TestTestServiceCheck_BodyUTF8`
- [x] Validation same as a save, per rule, order, no probe call: `TestTestServiceCheck_ValidationMatchesSave`
- [x] Timeout range and boundaries; other settings ignored; empty name fine: `TestTestServiceCheck_TimeoutRange`, `TestTestServiceCheck_OtherSettingsIgnored`
- [x] Constructor takes only two probers, clock, limits (no writer): `newServiceTester` in the test, plus reading
- [x] Ended context returns ctx error; probe error wrapped: `TestTestServiceCheck_Errors`
- [x] `validateSettings` unchanged for a save (existing tests pass)

## Handler (`handler/service_tests.go`, `service_mapping.go`, `server.go`, tests)

- [x] 200 healthy HTTP, no `failure_reason`: `TestTestServiceCheck_Healthy`
- [x] 200 failed with reason, nested fields, truncated flag: `TestTestServiceCheck_Failed`
- [x] TCP result without status/body: `TestTestServiceCheck_TCP`
- [x] HTML/script body unchanged as JSON string: `TestTestServiceCheck_BodyIsText`
- [x] Spy gets mapped input and timeout only: `TestToServiceTestInput` (service_mapping_test.go) and handler test
- [x] 422 and 500 mapping: `TestTestServiceCheck_Errors`
- [x] Gate failures never reach the spy (401, 403, 413, 415, 400): `TestTestServiceCheck_GateFailures`
- [x] No log line on success: `TestTestServiceCheck_NoLog`
- [x] Empty body with status: `TestTestServiceCheck_EmptyBody`
- [x] Failure mapping shared with `toAPIState`: `toAPIFailureReason`

## Wiring

- [x] `main.go` hoists the TCP prober and builds the service with the runner's probers

## Repo-wide

- [ ] `make check`: lint 0 issues, backend tests (race) passed, contract and builds fine; NOT fully green: the frontend suite fails one test, `TargetDialog.test.tsx` "adds a header row and focuses its name..." (FR-92), timing out at 5000 ms in the full run (3 of 3 full runs after the first; the first `make check` passed; the file alone passes 96/96). No frontend file is changed on this branch, and `frontend/**` is outside my paths, so I did not touch it.
- [x] Integration tests (`make test-integration`): not run: the only integration-tagged tests are the mailer's (Mailpit), no file there is touched; Docker is not running here. Probe, usecase and handler packages: run, passed under `-race` (probe and usecase three times; handler once, about 65 s).
- [x] Nothing outside the allowed paths changed

## Judgment calls

- The test of an unexpected probe error says `run the check test: <probe error text>`; the probe text is passed on as the task allows.
- `HTTPTestOutcome` embeds `CheckResult` (so `out.Healthy`, `out.Failure` work and a fake builds it as `HTTPTestOutcome{CheckResult: ...}`).
- Invalid bytes become U+FFFD one per byte (Go's `[]rune` conversion), so a 3-byte character cut after 2 bytes gives two U+FFFD. The task said "invalid bytes become U+FFFD" without saying runs collapse.
- The context check after a probe error: if the request context has ended, its error is returned whatever the probe's error was; a probe that succeeds is trusted.
- In `TestHTTP` the status is set whenever a final response arrived; `CheckHTTP` still reads no body without rules, and with rules still skips the body when the certificate is too close to expiry (the verdict does not need it). `TestHTTP` reads the body in that case too.
- The shared failure mapping is `toAPIFailureReason(code, status, field)`; `toAPIState` passes the stored fields and the test mapping passes the failure's.
- `NewServer` takes the new `ServiceCheckTester` right after `tester`.
- `routerOptions.checkTester` defaults to a healthy spy; `TestToServiceTestInput` lives in `service_mapping_test.go`, the other handler tests in `service_tests_test.go`.
- Probe table uses short JSON bodies (at most 10 bytes) because the test prober's body limit is 10.
- Ran `npm ci` in `frontend/` to get `make check` going (node_modules is not tracked).
