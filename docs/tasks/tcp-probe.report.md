# Verification report: TCP probe

Verifier branch: `verify/tcp-probe` (built on `feat/tcp-probe` at `c8b1836`)
Task: `docs/tasks/tcp-probe.md`. Plan: `docs/tasks/tcp-probe.plan.md`.

**Result: no Blocking findings.** One Non-blocking finding needs a decision from the user (empty host, finding N1).

- `make check`: passed on the final tree (exit 0, 0 lint issues, 773 frontend tests). The first run failed on one frontend test in a file this task does not touch (see N5); two full reruns and the file on its own passed. A fresh checkout needs `npm ci` in `frontend/` first.
- Probe tests ten times under `-race`: passed. Worker package three times under `-race`: passed.
- Integration tests: **not run: Docker is not running here.** The only integration test is `adaptor/mailer/mailer_integration_test.go`. This task touches no mailer code, and no criterion depends on an integration test.
- Live run of the built app: done (section "Live run").

## 1. Acceptance criteria

"Real?" says whether the named test fails if the behaviour is removed. "Yes (M#)" means I broke the source and watched it fail (section 4). "Yes (read)" means I judged it by reading only.

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| P1 | Accepting listener, 2 s: healthy, `Failure` nil; one connection; read gives EOF and no data (FR-49) | `TestCheckTCP_Accepted` | Yes (M7: connection not closed, the read times out instead of EOF) | Met |
| P2 | Closed port: `could_not_connect`, no HTTP status, no rule field | `TestCheckTCP_ClosedPort` | Yes (read): any other classification fails `requireFailure` | Met |
| P3 | Dial returns DNS not-found, refused, plain error: each `could_not_connect`; host with a space on the real dialer too | `TestCheckTCP_DialErrors` (3 rows + subtest) | Yes (read). The space-host row passes only if the real dialer fails; it depends on the resolver, see N4 | Met |
| P4 | Blocking dial, 50 ms: `timed_out`; dialer context carries the deadline (FR-41) | `TestCheckTCP_Timeout` | Yes (M3, M4). M4 first hung until the go test limit; I made it fail fast (N2, fixed) | Met |
| P5 | Timeout zero and negative: `timed_out`, dial not called | `TestCheckTCP_NonPositiveTimeout` | Yes (M11) | Met |
| P6 | Caller context: cancel during dial gives `context.Canceled` and an empty result; shorter caller deadline gives `DeadlineExceeded`; already cancelled gives its error with no dial | `TestCheckTCP_CallerContext` | Yes (M13) | Met |
| P7 | IPv6 host without brackets joined as `[::1]:port` | `TestCheckTCP_IPv6Address` | Yes (M12) | Met |
| P8 | One prober used by several goroutines under `-race` | `TestCheckTCP_Concurrent` | Partly: the prober holds no state, so it would pass with nothing removed. It guards only against a future shared field, through the race detector | Met (weak by nature) |
| R1 | TCP healthy first attempt: one `CheckTCP` with saved host, port, 3 s; no HTTP call, no timer; one record (FR-49) | `TestRun_TCPHealthyFirstAttempt` | Yes (M1, M20) | Met |
| R2 | TCP retries, same rule as HTTP, one table for both types: three failures give two waits of exactly 7 s (6 s is not enough) and the last failure recorded; failure then success with no further wait; count 0 and negative make one attempt (FR-52) | `TestRun_RetryRule` (HTTP and TCP) | Yes (M2: TCP with no retries; M10: wait one second short) | Met |
| R3 | TCP failure code recorded as given | `TestRun_TCPRecordsFailureCode` | Yes (M1); a code rewrite would fail the equality | Met |
| R4 | Context ending during a TCP attempt, during a wait, before the record: error, nothing recorded | `TestRun_TCPCancel` | Yes (M15 fails the "before the record" subtest) | Met |
| R5 | Missing host, missing port, unknown type: error, nothing recorded, no probe call | `TestRun_TCPMissingSettings`, `TestRun_UnknownCheckType` | Yes (M17, M8) | Met |
| R6 | HTTP unchanged; its tests pass apart from the constructor call | the existing `TestRun_*` HTTP tests | Yes (they ran against every runner mutation) | Met |
| R7 | `TestRun_TCPService` replaced; HTTP baseline kept | grep: the name is gone; `TestRun_HTTPServiceProbedAndRecorded` stays | Yes (read) | Met |
| L1 | Healthy sequence, HTTP and TCP: one info `check finished`, `healthy` true, no `failure_code`, with `service_id` and `service_name` | `TestRun_LogHealthy` | Yes (M9, M18) | Met |
| L2 | Unhealthy TCP after retries: one warn line, `failure_code`, no `http_status`; HTTP `non_2xx_status` has `http_status` | `TestRun_LogUnhealthy` | Yes (M14, M18) | Met |
| L3 | One line per sequence, not per attempt | `TestRun_LogUnhealthy/tcp after its retries` (`Len == 1` with three attempts) | Yes (M18) | Met |
| L4 | No line when the context ended before the record, when the record failed, when settings are missing; not-healthy with no failure is warn with no code | `TestRun_LogNoLine`, `TestRun_LogUnhealthy/not healthy with no failure` | Yes (M6, M15, M17; a log on the record-error path fails `record failed`, run as M21) | Met |
| L5 | Log captured as a buffer under a lock, one JSON object per line, attributes read by name | `logSink` in `check_runner_test.go` | Yes (read) | Met |
| L6 | Captured log never holds host, port, URL, header, query, body | `TestRun_LogNeverHoldsTheAddress` (TCP and HTTP, distinctive values, baseline `NotEmpty`) | Yes (M5) | Met |
| X1 | `make check` passes | run | n/a | Met (see top) |
| X2 | Nothing outside the allowed paths changed | `git diff --name-only cd23135 HEAD`: `main.go`, `tcp.go`, `tcp_test.go`, `domain/check.go`, `check_runner.go`, `check_runner_test.go`, the plan | n/a | Met |

Also covered, not in the criteria list: a context that ends right after a successful record still logs (`TestRun_LogAfterRecordSurvivesCancel`), and requirement FR-61 for TCP: `timed_out` and `could_not_connect` (P3, P4, R3).

## 2. Plan check

- Every criterion above is in the plan, except the "context ends right after a successful record still logs" behaviour. That one is in the task's Behavior section, not its criteria, and has a test.
- Two ticked items name tests that do not exist:
  - `TestRun_LogUnhealthyNoFailure`: the case is the subtest "not healthy with no failure is warn without a code" inside `TestRun_LogUnhealthy`.
  - `TestRun_LogSecrecy`: the test is `TestRun_LogNeverHoldsTheAddress`.
  The behaviours are tested; only the names are wrong (N3).
- Plan against diff: the plan does not mention that `main.go` also hoists the HTTP prober into a variable `httpProber`. The task said "nothing else in `main.go` changes" (N6).
- All other plan items match the diff. The plan's claim "probe TCP tests 10x and worker 3x under -race (passed)" held when I repeated it.
- Judged against the task file, not the plan: no criterion is unmet.

## 3. Rule checks (by reading the diff)

- **One retry loop for both types:** yes. `Run` holds the single loop; `attemptFunc` returns a closure that makes one attempt from the type's saved fields. The loop is not copied.
- **`CheckTCP` imports:** `tcp.go` imports `context`, `errors`, `net`, `strconv` and `domain`. Nothing from `usecase`, `worker` or `repository` (`go list -deps` confirms).
- **Untouched files:** `scheduler.go`, `scheduler_test.go`, the usecases, handler, repository, migrations, `go.mod`, `go.sum`, `.env.example`, the Makefile, `docs/**` apart from the plan: not in the diff.
- **Log call attributes:** exactly `service_id`, `service_name`, `healthy`, plus `failure_code` when unhealthy with a failure, plus `http_status` only for `non_2xx_status` with a status. No address, URL, header, query, body or rule.
- **`main.go`:** builds `probe.NewTCPProber()` once and passes the logger `log` that `run` already had. The scheduler still gets `runner.Run`. One extra change: `httpProber` hoisted into a variable (N6).
- **Dependencies:** none added. Go version unchanged (`go1.27.4` toolchain, no `go.mod` change). No pinned version changed.
- **CONVENTIONS.md:**
  - Layers: only `worker/` logs; the adaptor returns errors and logs nothing.
  - Outbound connections go through `adaptor/probe` only (rule 11).
  - Every outbound call takes a context with a deadline: the dial context carries the timeout.
  - All time goes through the clock: the wait uses `clock.NewTimer`.
  - "Never logged" list: respected.
  - No `//nolint` or other lint suppression added.
  - Data scoping and transactions: not touched.
- **TESTING.md:** tests sit in the existing test file of each source file; no `_edge` or `_regress` file. `worker` tests import `domain`, `worker` and `pkg/clock` only. No `time.Sleep`. Real deadlines are at most 50 ms in the probe tests (the 2 s timeouts are never reached).
- **Frontend rules:** not applicable.

## 4. Mutation checks run

Each was applied to the source, the named test run, then restored with `git checkout`.

| # | Break | Result |
|---|---|---|
| M1 | Runner returns nil for TCP again (skip) | Failed: `TestRun_TCPHealthyFirstAttempt`, `_RetryRule`, `_TCPRecordsFailureCode`, `_TCPCancel`, `_TCPMissingSettings`, `_LogHealthy`, `_LogUnhealthy`, `_LogAfterRecordSurvivesCancel` |
| M2 | TCP gets no retries | Failed: `TestRun_RetryRule`, `_TCPCancel`, `_LogUnhealthy` |
| M3 | Deadline classified as `could_not_connect` | Failed: `TestCheckTCP_Timeout` |
| M4 | Dial gets the caller context, not the timeout context | Before my change: hung until go test's limit (40 s in my run). After: fails at once in `TestCheckTCP_Timeout` |
| M5 | Log the TCP host | Failed: `TestRun_LogNeverHoldsTheAddress` |
| M6 | Log on a cancelled sequence | Failed: `TestRun_LogNoLine` |
| M7 | Accepted connection not closed | Failed: `TestCheckTCP_Accepted` |
| M8 | Unknown type accepted as healthy | Failed: `TestRun_UnknownCheckType` |
| M9 | Healthy line logged at warn | Failed: `TestRun_LogHealthy` |
| M10 | Wait one second short | Failed: `_RetryRule`, `_AllAttemptsFail`, `_WaitBoundary`, others |
| M11 | No `timeout <= 0` guard | Failed: `TestCheckTCP_NonPositiveTimeout` |
| M12 | No `net.JoinHostPort` | Failed: `TestCheckTCP_IPv6Address` |
| M13 | Caller context error turned into a result | Failed: `TestCheckTCP_CallerContext` |
| M14 | `http_status` dropped | Failed: `TestRun_LogUnhealthy` |
| M15 | Record even when the context ended | Failed: `TestRun_TCPCancel/before the record`, `_CancelBeforeRecord`, `_LogNoLine` |
| M17 | Missing port not an error | Failed: `TestRun_TCPMissingSettings/nil port`, `_LogNoLine` |
| M18 | Log once per attempt | Failed: `TestRun_LogHealthy`, `_LogUnhealthy` |
| M20 | TCP timeout doubled | Failed: `TestRun_TCPHealthyFirstAttempt` |
| M21 | Log on the record-error path | Failed: `TestRun_LogNoLine/record failed` |

(M16 and M19 are not listed: M19 only doubled the line and did not isolate the order, so M21 replaced it.) All sources are restored; `git status` shows only my test change.

## 5. Live run

I built the binary from this branch and ran it on `127.0.0.1:18417` with a temporary database (`REQUIRE_HTTPS=false`, test credentials). I signed in through the API and added three TCP services through `createService` with a 1 s timeout, retry count 1, interval 1 s:

- `tcp-open` (`127.0.0.1:18431`, a local listener): `healthy`; log line `INFO check finished ... "healthy":true`.
- `tcp-closed` (`127.0.0.1:18432`, no listener): `unhealthy`, reason `could_not_connect` through `listServices`; log line `WARN check finished ... "failure_code":"could_not_connect"`, one line for the whole sequence (the retry ran 1 s after the first attempt).
- `tcp-blackhole` (`10.255.255.1:81`): this machine answered "no route" in 22 ms, so it was `could_not_connect`, not `timed_out`. A live `timed_out` was not reproduced; the unit tests cover it (P4).

No log line held a host or port. I did not open the dashboard in a browser: the words shown to the admin are the frontend's and out of scope. I stopped my two processes (the app and the listener) afterwards.

## 6. Cases tried beyond the task file

- Ports 1 and 65535: the address handed to the dialer is `127.0.0.1:1` and `127.0.0.1:65535` (new test `TestCheckTCP_PortLimits`). Against the real dialer on this machine both gave `could_not_connect`. Ports 0, 65536 and -1 also gave `could_not_connect` with no hang and no error (validation rejects them at save).
- A closed listener re-opened on the same port between attempts: the first attempt fails, the second is healthy (new test `TestCheckTCP_ListenerReopened`; it skips if another process takes the port).
- A host with surrounding spaces (`" 127.0.0.1 "`): `could_not_connect`.
- **An empty host (`""`) with a listener on the port: healthy.** See N1.
- Retry count 0 with timeout equal to the interval: one attempt, no timer (covered by the retry table's "retry count zero" row, which uses a different interval; the equal-value case differs only in a value the loop never reads).
- Concurrent writes: the runner keeps no per-sequence state; `-race` over three runs of the worker package and ten of the probe package showed nothing. The TCP path has no concurrency test of its own beyond the probe's (P8); it shares one loop with HTTP, which has `TestRun_ConcurrentSequences`.

Changes I made to tests (in `backend/internal/adaptor/probe/tcp_test.go`, no source changed):

1. `TestCheckTCP_Timeout`: the dial stub now returns an error at once when the context has no deadline, instead of blocking.
2. New `TestCheckTCP_PortLimits` and `TestCheckTCP_ListenerReopened`.

## 7. Findings

### Blocking

None.

### Non-blocking

**N1. An empty host reaches the dialer and counts as healthy.** Category: latent bug / decision needed.
Reproduce: `NewTCPProber().CheckTCP(ctx, domain.TCPCheck{Host: "", Port: <port with a local listener>, Timeout: time.Second})` returns `Healthy: true`. `net.JoinHostPort("", "81")` gives `:81`, which the standard dialer reads as the local machine. In the runner, only a nil `TCPHost` is "missing", so a service with `TCPHost = ""` is probed and records `healthy` whenever the port is open locally, whatever the real target is.
The task's "Inputs to try" says "an empty host (rejected at save, here an error)". The builder did not return an error. I did not classify it as Blocking because the product cannot produce this input today: `validateTCPCheck` rejects an empty host and no acceptance criterion names it. If you read "here an error" as required, treat this as Blocking and have the runner return `errMissingTCPSettings` for an empty host.
Matters when: a row with `tcp_host = ''` reaches the runner. The database only requires `NOT NULL`, so a hand-edited row would do it, and so would `update-service-api` (running at the same time) if its update path ever skips `validateTCPCheck`.

**N2. The timeout test hung instead of failing when the dial context had no deadline.** Category: test quality. Fixed in this branch (see section 6).
Matters when: someone removes the timeout from the dial context; before the fix CI would have waited for go test's 10-minute limit.

**N3. The plan names two tests that do not exist** (`TestRun_LogUnhealthyNoFailure`, `TestRun_LogSecrecy`). Category: cosmetic.
Matters when: the user or a later agent searches the plan's test names to find coverage.

**N4. The space-in-host test depends on the machine's resolver.** Category: test quality.
`TestCheckTCP_DialErrors/host with a space, real dialer` passes here in about 50 ms. The task says it fails before any network, but whether that holds depends on the resolver (Go's own or the system's).
Matters when: the tests run on a runner whose system resolver blocks on an invalid name for more than the 2 s timeout; the result would then be `timed_out` and the test would fail.

**N5. A frontend test timed out once under load.** Category: test quality.
`TargetDialog.test.tsx` ("adds a header row ... (FR-92)") failed at its 5 s limit during the first full `make check`. It passed alone (96 of 96) and in two later full runs. It is not touched by this task.
Matters when: CI runs the frontend suite on a slow or busy runner.

**N6. `main.go` also hoists the HTTP prober into a variable.** Category: decision needed.
The task said the wiring changes nothing else in `main.go`. The change is harmless, and the plan does not list it. It does make part of `docs/tasks/test-service-check-api.md` (line 98: "Hoist the HTTP prober (built inline today ...) and the TCP prober into variables") out of date: the HTTP prober is already hoisted and the TCP prober is still inline.
Matters when: `test-service-check-api` starts, and its builder reads "built inline today".

Report only (no concrete trigger): if the probe's deadline passes at the same instant a real refusal arrives, the attempt is classed `timed_out` rather than `could_not_connect`. The result is wrong only for that instant, and either way the check fails.

## 8. Docs or specs that no longer match

- `docs/tasks/test-service-check-api.md`, line 98: the HTTP prober is no longer "built inline today" in `main.go`; this branch hoists it into `httpProber`. The TCP prober is still inline, so that task must hoist only that one (N6).
- `docs/tasks/backlog.md`, line 27: still true (the type switch and TCP form fields are left to `service-form-type-tcp`). It should stay open until that task merges.
- `docs/openapi.yaml`: unchanged and still matches; no operation changed.
- `docs/requirements.md`: unchanged. FR-49, FR-52, FR-41 and FR-61 now hold for TCP in the backend.
- `STACK.md`: nothing to record. No dependency was added or changed, so no version was adopted. Its line on outbound TCP through `adaptor/probe` is now true.
- `docs/manual-checks.md`: nothing out of date.
