# Plan: http request send

Branch: feat/http-request-send. Prerequisites checked on the branch: `HTTPProber`, `HTTPCheck`, `CheckRunner`, `Service` fields and `testutil.TargetServer` all exist.

Files: `domain/check.go`, `adaptor/probe/http.go` + `http_test.go`, `worker/check_runner.go` + `check_runner_test.go`.

## Acceptance criteria

- [x] Domain: `HTTPCheck` gains `QueryParams`, `Headers`, `BodyType`, `BodyContent` (`domain/check.go`; used by every test below)
- [x] Probe, query parameters: order, existing query kept first, bare `?`, trailing `&`, 20 params, duplicate names, empty value, encoding of `&`, `=`, space, non-ASCII, none given, fragment (`http_test.go`, `TestCheckHTTP_QueryParams`)
- [x] (one deviation, see Judgment calls) Probe, headers: canonical name, duplicates in order, saved User-Agent / Content-Type replace defaults, none given, 4,096-char value and 20 headers (`http_test.go`, `TestCheckHTTP_Headers`)
- [x] Probe, body: json/text/form content types, none and empty type, empty json body, unknown type, 65,536 bytes, five methods, non-ASCII and line break (`http_test.go`, `TestCheckHTTP_Body`)
- [x] Probe, attempt unchanged: 200 healthy, 500 `non_2xx_status`, delay gives `timed_out` with a body (`http_test.go`, `TestCheckHTTP_RequestOutcome`)
- [x] Probe, CR/LF in a value and empty name give `could_not_connect` and send nothing (`http_test.go`, `TestCheckHTTP_RefusedHeader`)
- [x] Probe, redirects (FR-58): two 302 hops, other host name, Content-Type on body-less GET after 302, User-Agent on every hop, 307 and 302 after POST, limit still fails (`http_test.go`, `TestCheckHTTP_RedirectsCarrySavedRequest`)
- [x] Probe, concurrency: two checks with different headers on one prober, redirects included (`http_test.go`, `TestCheckHTTP_ConcurrentHeaders`)
- [x] Probe, existing tests pass unchanged
- [x] Runner: four fields copied for first attempt and every retry (`check_runner_test.go`, `TestRun_PassesSavedRequest`)
- [x] Runner: service with none of them gives the unchanged three-field check (existing `TestRun_HealthyFirstAttempt` assertion, plus nil/empty explicit check)
- [x] Runner: TCP and missing method/URL behave as before (existing tests)
- [x] `make check` passes
- [x] No change outside the allowed paths; no go.mod, config or main.go change

## Integration tests

No integration test applies (no Mailpit-backed code is touched): not run: no code with integration tests is touched.

Outcome: `make check` run, passed. Integration tests: not run: nothing this task touches has integration tests.

## Judgment calls

- **Two saved `User-Agent` headers cannot both be sent.** The task asks for two values and no default; `net/http` writes a single `User-Agent` line, the first value. The test `two saved User-Agents...` pins what is sent (`A` only, no `Monitory`). This is a deviation from the criterion, not fixable without a custom transport; the user should decide whether to relax the task text.
- Saved headers reach redirected requests through the request context (a value read by the shared client's redirect policy), so no state is shared between checks.
- On every request and hop, any value held under a saved header's name (library copy or default) is deleted before the saved values are added, so `Authorization` is never doubled on a same-host redirect.
- Query parameters are only touched when at least one is given; the fragment is cut only in that case (the library drops it anyway).
- Extra tests beyond the list: empty parameter name (`=v`), CR in a header name, a saved `User-Agent` on every hop, a 302 after POST without a saved `Content-Type`.
- Ran `npm ci` in `frontend/` so `make check` could lint; no tracked file changed.
- Mutation checks were not run by the builder.
