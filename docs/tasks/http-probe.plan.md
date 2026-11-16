# Plan: HTTP probe

Branch: `feat/http-probe`. Files: `backend/internal/domain/check.go`, `backend/internal/adaptor/probe/http.go` (+ `http_test.go`), `backend/internal/testutil/target_server.go` (+ `target_server_test.go`).
P = `backend/internal/adaptor/probe/http_test.go`, S = `backend/internal/testutil/target_server_test.go`.

## Probe

- [x] 200 healthy with nil failure; table 204, 299 healthy; 300 (no Location), 304, 404, 500 `non_2xx_status` with code — P `TestCheckHTTP_Status`
- [x] Server sees given method (GET, HEAD, POST, DELETE), path and query, `User-Agent: Monitory`, no body — P `TestCheckHTTP_RequestShape`
- [x] Redirect limits: limit 2 with 2 hops healthy (3 requests); 3 hops `too_many_redirects`, final never requested; limit 0 one hop fails; limit 5 with 3 hops healthy — P `TestCheckHTTP_RedirectLimit`
- [x] Redirect ending in 404 is `non_2xx_status` 404 — P `TestCheckHTTP_RedirectToNotFound`
- [x] 150 ms delay with 50 ms timeout `timed_out`; 20 ms delay with 200 ms timeout healthy — P `TestCheckHTTP_Timeout`
- [x] Timeout covers redirects: two 40 ms hops, 60 ms timeout `timed_out` — P `TestCheckHTTP_TimeoutCoversRedirects`
- [x] Timeout 0 `timed_out`, server received no request (baseline: positive timeout reaches server) — P `TestCheckHTTP_ZeroTimeout`
- [x] 300 and 305 with Location are `non_2xx_status`, location not requested — P `TestCheckHTTP_UnfollowedRedirectStatus`
- [x] Closed port `could_not_connect`; table: unparsable URL, `ftp` scheme, `BAD METHOD`, redirect to `ftp://`, server closing without answering — P `TestCheckHTTP_CouldNotConnect`
- [x] Untrusted HTTPS stub `certificate_problem`; plain-HTTP redirect to it too — P `TestCheckHTTP_CertificateProblem`
- [x] With stub pool as roots: HTTPS by named address healthy; by unnamed host name `certificate_problem` — P `TestCheckHTTP_TrustedRoots`
- [x] Caller cancel while stub delaying returns `context.Canceled` and zero result; caller deadline 20 ms returns `context.DeadlineExceeded`; baseline returns a result — P `TestCheckHTTP_CallerContext`
- [x] Every failure case asserts Healthy false, Failure non-nil, HTTPStatus nil unless `non_2xx_status`; healthy cases nil Failure — shared helpers in P
- [x] 20 concurrent attempts (10 slow 100 ms, 10 fast) all right, race detector — P `TestCheckHTTP_Concurrent`
- [x] Two attempts in a row use two connections (remote addresses differ) — P `TestCheckHTTP_NewConnectionPerAttempt`

## Stub target server

- [x] Scripted path answers status and body; unscripted 404 — S `TestTargetServer_ScriptedAndUnscripted`
- [x] Scripted delay observed; scripted redirect answers status and Location — S `TestTargetServer_DelayAndRedirect`
- [x] Requests recorded in order with method, path, headers — S `TestTargetServer_RecordsRequests`
- [x] HTTPS variant refused by default client, accepted by its own client — S `TestTargetServer_HTTPS`

## Repo-wide

- [x] `make check` passes — outcome: run, passed
- [x] Nothing outside allowed paths changed; `go.mod`/`go.sum` unchanged — `git diff --stat main`
- [x] Integration tests: not applicable (no integration-tagged tests touched) — outcome: not run: task adds none and touches no code that has integration tests

## Judgment calls

- The stub is scripted with `Script(path, Route{...})` and started with `NewTargetServer(t, TargetTLS())`; the task fixed the behaviour but not the API. Besides the task's list, `Route` has `CloseWithoutAnswer` (for the closed-connection case) and the stub exposes `Arrived(path)`, a channel closed on a path's first request.
- The prober builds one `http.Client` and transport on first use (`sync.Once`), so the unexported roots can be set after construction. With a shared transport, `DisableKeepAlives` is what the two-connections test pins; I confirmed the test fails with it off.
- A caller context that is already done when `CheckHTTP` starts returns its error at once, before the timeout check (row 1 wins over row 2).
- A close error on the response body is ignored.
- Extra cases beyond the criteria: empty method sent as GET, redirect loop, negative timeout, an empty URL, `http://` with no host, a late 500 is `timed_out`, an already-cancelled context.
- Not done: the host-does-not-resolve case (needs a resolver) and a URL with a fragment or user and password have no test.
- Mutation checks run against the probe: keep-alive on, 3xx healthy, no redirect limit, certificate errors mapped to `could_not_connect`; each failed a test. Swapping rows 2 and 5 and returning a result on cancellation were not run.
- `make check` needed `npm ci` in `frontend/` first (not committed).
