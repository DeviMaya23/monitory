# Verification report: HTTP probe

Verifier branch: `verify/http-probe` (on top of builder branch `feat/http-probe`, commit `7adb900`).

**Verdict: no Blocking findings.** `make check` passes. The source is correct against the task file. One builder test (the caller-cancel case) was vacuous; I fixed it and added edge-case tests, all in the existing `http_test.go`. No source file was changed.

## 1. `make check`

Run, passed (exit 0) on `7adb900`, and again after my test changes. A fresh checkout had no frontend dependencies, so `npm ci` in `frontend/` came first (not committed). Lint reports 0 issues; the probe and testutil packages pass with the race detector, also at `-count=10`.

## 2. Acceptance criteria

"Real?" asks whether the named test would fail if the behavior were removed. "Mutated" means I broke the source and watched it fail (section 5); "by reading" means I judged it from the code and did not mutate it.

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| 1 | 200 healthy with nil failure; 204, 299 healthy; 300 (no Location), 304, 404, 500 `non_2xx_status` with the code (FR-42, FR-61) | `TestCheckHTTP_Status` | Yes. Mutated: 3xx healthy (M1), upper bound 298 (M1b), status dropped (M10) | Met |
| 2 | Method (GET, HEAD, POST, DELETE), path, query, `User-Agent: Monitory`, no body | `TestCheckHTTP_RequestShape` | Yes. Mutated: UA removed (M7). Method, query and body by reading | Met |
| 3 | Limit 2: 2 hops healthy with 3 requests; 3 hops `too_many_redirects`, `/end` never requested; limit 0: 1 hop fails; limit 5: 3 hops healthy (FR-58) | `TestCheckHTTP_RedirectLimit` | Yes. Mutated: no limit (M2), off by one (M2b), literal 3 (M2c) | Met |
| 4 | Redirect ending in 404 is `non_2xx_status` 404 | `TestCheckHTTP_RedirectToNotFound` | Yes, by reading: an unfollowed redirect would give 301 | Met |
| 5 | 150 ms delay with 50 ms timeout is `timed_out`; 20 ms delay with 200 ms timeout healthy (FR-41, FR-42) | `TestCheckHTTP_Timeout` | Yes. Mutated: deadline reported as `could_not_connect` (M3), timeout x1000 (M11) | Met |
| 6 | Timeout covers redirects: two 40 ms hops, 60 ms timeout | `TestCheckHTTP_TimeoutCoversRedirects` | Yes. Fails under M3 and M11 | Met |
| 7 | Timeout 0 is `timed_out` and the server received nothing | `TestCheckHTTP_ZeroTimeout` | Yes against "0 means no timeout". The explicit `<= 0` branch itself is redundant (M8 survives; see Non-blocking 4) | Met |
| 8 | 300 and 305 with `Location` are `non_2xx_status`, location not requested | `TestCheckHTTP_UnfollowedRedirectStatus` | Yes. Fails under M1 | Met |
| 9 | Closed port `could_not_connect`; table: unparsable URL, `ftp`, `BAD METHOD`, redirect to `ftp://`, hang-up (FR-61) | `TestCheckHTTP_CouldNotConnect` | Yes, by reading: each row reaches the default branch of `classify` | Met |
| 10 | Untrusted HTTPS is `certificate_problem`; plain-HTTP redirect to it too (FR-64, FR-61) | `TestCheckHTTP_CertificateProblem` | Yes. Mutated: cert maps to `could_not_connect` (M4) | Met |
| 11 | Stub pool as roots: named address healthy; unnamed host name `certificate_problem` | `TestCheckHTTP_TrustedRoots` | Yes. Fails under M4 | Met |
| 12 | Cancel after the stub reports arrival returns `context.Canceled` and a zero result; a caller deadline of 20 ms returns `DeadlineExceeded`; baseline returns a result | `TestCheckHTTP_CallerContext` | **After my fix, yes.** Before it, the cancel subtest was vacuous (Finding F1). Mutated: result instead of error on cancel (M5), deadline checked before the caller context (M9) | Met after fix |
| 13 | Every failure also checks `Healthy` false, non-nil `Failure`, `HTTPStatus` nil unless `non_2xx_status`; healthy checks nil `Failure` | helpers `requireFailed`, `requireStatus`, `requireHealthy` | Yes. Fails under M10 | Met |
| 14 | Twenty concurrent attempts, half slow and half fast, under the race detector | `TestCheckHTTP_Concurrent` | Partly. It catches data races in the prober (removing the `sync.Once` guard gave `DATA RACE`). It would not catch a logic mix-up that left results right | Met |
| 15 | Two attempts in a row arrive on two connections | `TestCheckHTTP_NewConnectionPerAttempt` | Yes. Mutated: keep-alive on (M6) | Met |
| 16 | Stub: scripted path answers status and body; unscripted 404 | `TestTargetServer_ScriptedAndUnscripted` | Yes, by reading | Met |
| 17 | Stub: delay observed; redirect answers status and `Location` | `TestTargetServer_DelayAndRedirect` | Yes, by reading. The "fast" half is wall-clock (Non-blocking 1) | Met |
| 18 | Stub: requests recorded in order with method, path, headers | `TestTargetServer_RecordsRequests` | Yes, by reading | Met |
| 19 | Stub HTTPS: refused by the default client, accepted by the stub's client | `TestTargetServer_HTTPS` | Yes, by reading | Met |
| 20 | `make check` passes | run | n/a | Met |
| 21 | Only allowed paths changed; `go.mod` and `go.sum` unchanged | `git diff --name-only` against the merge base | n/a | Met. Six files: the five allowed code files and the plan |

No requirement beyond the five the task names is claimed. Each of FR-41, FR-42, FR-58, FR-61 and FR-64 is covered in part, as the task says.

## 3. Plan check

Read after sections 1 and 2.

- Every acceptance criterion appears in the plan. The plan does not list a stub criterion about `Arrived` or a delaying redirect, but the task does not list one as a criterion either.
- Every ticked item has a test that exists and checks the behavior, with one exception: the plan ticks "Caller cancel while stub delaying returns `context.Canceled`", but the test did not cancel mid-flight (F1). The builder's tick was wrong; the test is fixed now.
- Plan against diff: the claims about the judgment calls (one client built on first use, `CloseWithoutAnswer`, `Arrived`, already-done context wins over timeout, close error ignored) match the code. The extra cases it lists (empty method, loop, negative timeout, empty URL, `http://`, late 500, cancelled context) all exist.
- The plan says two mutations were not run (rows 2 and 5 swapped, cancel returning a result). I ran both (M3, M5). The second one exposed F1.
- "Not done: fragment, user and password, resolve failure." I added the first two as tests and tried the third by hand (section 6).

## 4. Rule checks

| Rule | Result |
|---|---|
| Paths (task "Role and ownership") | Pass: only the three places plus the plan |
| Dependencies | Pass: `go.mod` and `go.sum` unchanged, Go `1.27.4` unchanged, no new import outside the standard library and testify |
| `adaptor/probe` imports `domain` and stdlib only | Pass |
| No rules in the adaptor (transitions, retries, alerts) | Pass |
| No address filtering | Pass: none in the code |
| No environment | Pass: `Proxy: nil`, no `os.Getenv`, the default transport is not used |
| Certificates | Pass: `InsecureSkipVerify` appears nowhere in the diff; the stub's client is `httptest`'s own |
| The limit | Pass: `p.maxRedirects` from the constructor; mutation M2c (literal 3) fails |
| Body leaks | Pass: closed after the status is known; on error `Do` closes it, and on a refused redirect Go closes the earlier response |
| Nothing leaks out | Pass: results hold a code and a status only; nothing is logged (grep for `slog`, `log.`) |
| Time | Pass: no `time.Now`, `Sleep`, `After`, `NewTimer` in the diff; waits use `clock.Real{}` |
| Cookies | Pass: no jar |
| `CONVENTIONS.md`: layers, logging, no `//nolint`, outbound calls have a deadline, race detector | Pass |
| `nilerr`, `noctx`, `bodyclose`, `revive` | Pass: `golangci-lint` reports 0 issues |
| Data scoping, transactions, frontend rules | Not applicable: no data layer or frontend touched |

## 5. Mutation checks run

Each was applied to `backend/internal/adaptor/probe/http.go`, the probe tests run with `-race`, then the file reverted with `git checkout`.

| # | Mutation | Result |
|---|---|---|
| M1 | 3xx counted healthy (`<= 399`) | Fails: `Status/300`, `Status/304`, `UnfollowedRedirectStatus` |
| M1b | Upper bound `<= 298` | Fails: `Status/299` |
| M2 | Redirect limit removed | Fails: `RedirectLimit` (3 hops, 1 hop at limit 0, loop) |
| M2b | Off by one (`>=`) | Fails: `RedirectLimit` 2 hops and 3 hops |
| M2c | Literal 3 instead of the limit | Fails: `RedirectLimit` limit 2 and limit 0 |
| M3 | Deadline reported as `could_not_connect` (rows 2 and 5 swapped) | Fails: `Timeout/late_response…`, `TimeoutCoversRedirects` |
| M4 | Certificate error mapped to `could_not_connect` | Fails: `CertificateProblem`, `TrustedRoots` |
| M5 | Cancel returns a timed-out result instead of an error | Original tests: only the deadline subtest failed, the cancel subtest passed (F1). After my fix both fail |
| M6 | Keep-alive on | Fails: `NewConnectionPerAttempt` |
| M7 | `User-Agent` removed | Fails: `RequestShape` (all four methods) |
| M8 | `Timeout <= 0` changed to `< 0` | **Survives.** Equivalent: a zero timeout expires at once and no request goes out (Non-blocking 4) |
| M9 | Deadline checked before the caller context | Fails: caller-deadline subtest |
| M10 | `HTTPStatus` left nil | Fails: every `non_2xx_status` test |
| M11 | Timeout multiplied by 1000 | Fails: `Timeout`, `TimeoutCoversRedirects` |
| M12 | `sync.Once` removed from client construction | `DATA RACE` reported by `TestCheckHTTP_Concurrent` |

## 6. Cases beyond the task file

Added as subtests or table rows in `http_test.go`; all pass at `-count=10` under `-race`:

- A silent server (accepts, never answers) over `http` and over `https` with a 100 ms timeout: `timed_out`, so the deadline also covers the request wait and the TLS handshake.
- `User-Agent: Monitory` on every hop of a two-redirect chain (the task's own tests only checked the first request).
- A URL with a fragment: the fragment is not sent; path and query are.
- A URL with a user and password: the server receives `Authorization: Basic dXNlcjpwdw==`.
- `https://` to a plain-HTTP server: `could_not_connect`.

Tried by hand, not kept as a test because it needs a resolver: `http://monitory-probe-test.invalid/` gave `could_not_connect` here.

Already in the builder's tests and behaving as the task says: empty URL, `http://` with no host, redirect loop (`too_many_redirects`), negative timeout (`timed_out`), the limit boundary at N, N+1 and 0, and concurrent attempts.

## 7. Integration tests

Not run: the repo has no test tagged `integration`, and the probe and the stub touch no code that has one. `make test-integration` would only start Mailpit and run nothing relevant to this task. No criterion depends only on an integration test.

## 8. Findings

### Blocking

None.

### Fixed by the verifier

**F1. The caller-cancel test did not cancel mid-flight (test quality; was a criterion gap).** `TestCheckHTTP_CallerContext`: the baseline subtest and the cancel subtest shared the path `/slow`, and `Arrived` stays closed after the first request. So `<-ts.Arrived("/slow")` returned at once and `cancel()` ran before the request was sent, hitting the early `ctx.Err()` check. Mutation M5 (result instead of error on cancel in `classify`) did not fail the cancel subtest. Fix: the cancel subtest uses its own path `/slow-cancel`, and asserts the server saw exactly one request before the cancel. With the fix, M5 fails the cancel subtest. The source was right all along.

### Non-blocking

1. **Wall-clock assertions can flake under load** (test quality). `TestTargetServer_DelayAndRedirect` asserts the no-delay request answers in under 100 ms, and several probe tests rely on gaps such as 20 ms delay against a 200 ms timeout. Matters when: CI runs the suite on a loaded runner with `-race` and one of these fails with no code change. Not reproduced in 10 consecutive local runs.
2. **`Arrived` closes once per path and never again** (latent bug in test support). A test cannot wait for a second request to the same path. Matters when: the scheduler task tests a retry against one path and wants to wait for the second attempt.
3. **A negative redirect limit behaves like 0** (report only). `NewHTTPProber(-1)` fails the first redirect. `config` has a minimum of 0, so no trigger exists.
4. **The `Timeout <= 0` early branch is redundant** (report only). `context.WithTimeout` with 0 already expires at once and nothing is sent (M8 survives). The branch is still clear and the behavior matches the task; no trigger.

## 9. Docs or specs that no longer match

- `docs/openapi.yaml`, `docs/requirements.md`: nothing to change.
- `STACK.md`: no dependency was added and no version adopted, so there is no version to record. It already says the check client is in `adaptor/probe`, so the task's "Known gaps" note that `STACK.md` says `pkg/` is out of date.
- `docs/tasks/backlog.md`: the "Left out of `http-probe`" rows (FR-10 and the scheduler, FR-34/50/64, FR-44 to FR-48, FR-58 re-sent headers, FR-61 reasons) still match what was built; they stay open for their tasks.
- `docs/manual-checks.md`: nothing is due from this merge (see the pull request).
