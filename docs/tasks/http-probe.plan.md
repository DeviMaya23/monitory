# Plan: HTTP probe

Branch: `feat/http-probe`. Files: `backend/internal/domain/check.go`, `backend/internal/adaptor/probe/http.go` (+ `http_test.go`), `backend/internal/testutil/target_server.go` (+ `target_server_test.go`).
P = `backend/internal/adaptor/probe/http_test.go`, S = `backend/internal/testutil/target_server_test.go`.

## Probe
- [ ] 200 healthy with nil failure; table 204, 299 healthy; 300 (no Location), 304, 404, 500 `non_2xx_status` with code — P `TestCheckHTTP_Status`
- [ ] Server sees given method (GET, HEAD, POST, DELETE), path and query, `User-Agent: Monitory`, no body — P `TestCheckHTTP_RequestShape`
- [ ] Redirect limits: limit 2 with 2 hops healthy (3 requests); 3 hops `too_many_redirects`, final never requested; limit 0 one hop fails; limit 5 with 3 hops healthy — P `TestCheckHTTP_RedirectLimit`
- [ ] Redirect ending in 404 is `non_2xx_status` 404 — P `TestCheckHTTP_RedirectToNotFound`
- [ ] 150 ms delay with 50 ms timeout `timed_out`; 20 ms delay with 200 ms timeout healthy — P `TestCheckHTTP_Timeout`
- [ ] Timeout covers redirects: two 40 ms hops, 60 ms timeout `timed_out` — P `TestCheckHTTP_TimeoutCoversRedirects`
- [ ] Timeout 0 `timed_out`, server received no request (baseline: positive timeout reaches server) — P `TestCheckHTTP_ZeroTimeout`
- [ ] 300 and 305 with Location are `non_2xx_status`, location not requested — P `TestCheckHTTP_UnfollowedRedirectStatus`
- [ ] Closed port `could_not_connect`; table: unparsable URL, `ftp` scheme, `BAD METHOD`, redirect to `ftp://`, server closing without answering — P `TestCheckHTTP_CouldNotConnect`
- [ ] Untrusted HTTPS stub `certificate_problem`; plain-HTTP redirect to it too — P `TestCheckHTTP_CertificateProblem`
- [ ] With stub pool as roots: HTTPS by named address healthy; by unnamed host name `certificate_problem` — P `TestCheckHTTP_TrustedRoots`
- [ ] Caller cancel while stub delaying returns `context.Canceled` and zero result; caller deadline 20 ms returns `context.DeadlineExceeded`; baseline returns a result — P `TestCheckHTTP_CallerContext`
- [ ] Every failure case asserts Healthy false, Failure non-nil, HTTPStatus nil unless `non_2xx_status`; healthy cases nil Failure — shared helpers in P
- [ ] 20 concurrent attempts (10 slow 100 ms, 10 fast) all right, race detector — P `TestCheckHTTP_Concurrent`
- [ ] Two attempts in a row use two connections (remote addresses differ) — P `TestCheckHTTP_NewConnectionPerAttempt`

## Stub target server
- [ ] Scripted path answers status and body; unscripted 404 — S `TestTargetServer_ScriptedAndUnscripted`
- [ ] Scripted delay observed; scripted redirect answers status and Location — S `TestTargetServer_DelayAndRedirect`
- [ ] Requests recorded in order with method, path, headers — S `TestTargetServer_RecordsRequests`
- [ ] HTTPS variant refused by default client, accepted by its own client — S `TestTargetServer_HTTPS`

## Repo-wide
- [ ] `make check` passes — outcome: 
- [ ] Nothing outside allowed paths changed; `go.mod`/`go.sum` unchanged — `git diff --stat main`
- [ ] Integration tests: not applicable (no integration-tagged tests touched) — outcome: not run: task adds none and touches no code that has integration tests

## Judgment calls
(filled at the end)
