# Plan: test-service-check API

Branch: `feat/test-service-check-api`. Tick items as they are done. Integration tests: none of the touched code has any; see the last item.

## Prerequisites

- [ ] Checked on the branch: `TCPProber.CheckTCP`, `HTTPProber`/`NewHTTPProber`, `HTTPCheck` certificate fields, `normalizeServiceInput`, `validateCheck`, `validateSettings`, `NewServer`, `testerSpy`/`newRouter` exist.

## Probe (`adaptor/probe/http.go`, `http_test.go`)

- [ ] `TestHTTP` same verdicts as `CheckHTTP`: `TestTestHTTP_SameVerdictAsCheckHTTP` (table through both entry points)
- [ ] Status and body, no rules, 2xx/404/500, cert problem and rule match keep status+body: `TestTestHTTP_StatusAndBody`
- [ ] Truncation boundary (10 / 11 / empty): `TestTestHTTP_BodyLimit`
- [ ] No response gives nil status, empty body: `TestTestHTTP_NoResponse`
- [ ] Stalled body, no rules: same verdict as `CheckHTTP`, status, partial body: `TestTestHTTP_StalledBodyWithoutRules`
- [ ] Caller context cancelled during stalled body, and already ended: `TestTestHTTP_CallerContext`
- [ ] `CheckHTTP` tests unchanged and passing (existing `TestCheckHTTP_JSONBodyReadInsideTimeout`)

## Usecase (`usecase/service_tester.go`, `service_tester_test.go`, `service_validation.go`)

- [ ] Healthy HTTP, built `HTTPCheck` incl. the three certificate fields, on and off: `TestTestServiceCheck_HTTPAttempt`
- [ ] Trimming: `TestTestServiceCheck_Trims`
- [ ] Defaults and given timeout: `TestTestServiceCheck_Timeout`
- [ ] TCP: `TestTestServiceCheck_TCP`
- [ ] Failed attempt is a result: `TestTestServiceCheck_FailureIsAResult`
- [ ] No retry: `TestTestServiceCheck_NoRetry`
- [ ] Duration 1234 ms / 1999 µs / 0: `TestTestServiceCheck_Duration`
- [ ] Body made valid UTF-8: `TestTestServiceCheck_BodyUTF8`
- [ ] Validation same as a save, per rule, order, no probe call: `TestTestServiceCheck_ValidationMatchesSave`
- [ ] Timeout range and boundaries; other settings ignored; empty name fine: `TestTestServiceCheck_TimeoutRange`, `TestTestServiceCheck_OtherSettingsIgnored`
- [ ] Constructor takes only two probers, clock, limits (no writer): `newServiceTester` in the test, plus reading
- [ ] Ended context returns ctx error; probe error wrapped: `TestTestServiceCheck_Errors`
- [ ] `validateSettings` unchanged for a save (existing tests pass)

## Handler (`handler/service_tests.go`, `service_mapping.go`, `server.go`, tests)

- [ ] 200 healthy HTTP, no `failure_reason`: `TestTestServiceCheck_Healthy`
- [ ] 200 failed with reason, nested fields, truncated flag: `TestTestServiceCheck_Failed`
- [ ] TCP result without status/body: `TestTestServiceCheck_TCP`
- [ ] HTML/script body unchanged as JSON string: `TestTestServiceCheck_BodyIsText`
- [ ] Spy gets mapped input and timeout only: `TestToServiceTestInput` (service_mapping_test.go) and handler test
- [ ] 422 and 500 mapping: `TestTestServiceCheck_Errors`
- [ ] Gate failures never reach the spy (401, 403, 413, 415, 400): `TestTestServiceCheck_GateFailures`
- [ ] No log line on success: `TestTestServiceCheck_NoLog`
- [ ] Empty body with status: `TestTestServiceCheck_EmptyBody`
- [ ] Failure mapping shared with `toAPIState`: `toAPIFailureReason`

## Wiring

- [ ] `main.go` hoists the TCP prober and builds the service with the runner's probers

## Repo-wide

- [ ] `make check` passes: 
- [ ] Integration tests (`make test-integration`): 
- [ ] Nothing outside the allowed paths changed

## Judgment calls

(filled in at the end)
