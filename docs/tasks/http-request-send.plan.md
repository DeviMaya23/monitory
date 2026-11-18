# Plan: http request send

Branch: feat/http-request-send. Prerequisites checked on the branch: `HTTPProber`, `HTTPCheck`, `CheckRunner`, `Service` fields and `testutil.TargetServer` all exist.

Files: `domain/check.go`, `adaptor/probe/http.go` + `http_test.go`, `worker/check_runner.go` + `check_runner_test.go`.

## Acceptance criteria

- [ ] Domain: `HTTPCheck` gains `QueryParams`, `Headers`, `BodyType`, `BodyContent` (`domain/check.go`; used by every test below)
- [ ] Probe, query parameters: order, existing query kept first, bare `?`, trailing `&`, 20 params, duplicate names, empty value, encoding of `&`, `=`, space, non-ASCII, none given, fragment (`http_test.go`, `TestCheckHTTP_QueryParams`)
- [ ] Probe, headers: canonical name, duplicates in order, saved User-Agent / Content-Type replace defaults, none given, 4,096-char value and 20 headers (`http_test.go`, `TestCheckHTTP_Headers`)
- [ ] Probe, body: json/text/form content types, none and empty type, empty json body, unknown type, 65,536 bytes, five methods, non-ASCII and line break (`http_test.go`, `TestCheckHTTP_Body`)
- [ ] Probe, attempt unchanged: 200 healthy, 500 `non_2xx_status`, delay gives `timed_out` with a body (`http_test.go`, `TestCheckHTTP_RequestOutcome`)
- [ ] Probe, CR/LF in a value and empty name give `could_not_connect` and send nothing (`http_test.go`, `TestCheckHTTP_RefusedHeader`)
- [ ] Probe, redirects (FR-58): two 302 hops, other host name, Content-Type on body-less GET after 302, User-Agent on every hop, 307 and 302 after POST, limit still fails (`http_test.go`, `TestCheckHTTP_RedirectsCarrySavedRequest`)
- [ ] Probe, concurrency: two checks with different headers on one prober, redirects included (`http_test.go`, `TestCheckHTTP_ConcurrentHeaders`)
- [ ] Probe, existing tests pass unchanged
- [ ] Runner: four fields copied for first attempt and every retry (`check_runner_test.go`, `TestRun_PassesSavedRequest`)
- [ ] Runner: service with none of them gives the unchanged three-field check (existing `TestRun_HealthyFirstAttempt` assertion, plus nil/empty explicit check)
- [ ] Runner: TCP and missing method/URL behave as before (existing tests)
- [ ] `make check` passes
- [ ] No change outside the allowed paths; no go.mod, config or main.go change

## Integration tests

No integration test applies (no Mailpit-backed code is touched): not run: no code with integration tests is touched.
