# Task: TCP probe

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

A TCP service is really checked. Today the check runner returns at once for a service of type TCP, so one stays `not_yet_checked` for ever, even though it can be saved. After this task the runner makes a TCP attempt (a connection to the saved host and port), retries a failed one with the same rule as an HTTP service, and records a result, so a TCP service moves to `healthy` or `unhealthy` on the dashboard. The runner also writes one log line for each finished sequence, with the failure reason, so that the admin can see in the log why a service went unhealthy.

Requirements covered:

- FR-49: a TCP port check is healthy if a connection is accepted within the timeout.
- FR-41, in part: the timeout covers the whole TCP attempt, the name lookup included.
- FR-52: a TCP check that fails for any reason is retried with the same rule as an HTTP check (retry count, retry interval; FR-51, FR-53, FR-54): the two types follow the same retry rule, shown by one table of cases run for both types; that the loop is not copied is a verifier check by reading.
- FR-61, in part: a TCP attempt that is not finished within the timeout is `timed_out`; any other failure to connect (refused, unreachable, an unknown host) is `could_not_connect`. The other reasons belong to HTTP.
- FR-33, in part: a service of type TCP is checked as a TCP port; an HTTP service is unchanged.

Out of scope:

- The type switch and the TCP fields of the form (`service-form-type-tcp`, frontend); saving a TCP service (`createService`, built; `updateService`, `update-service-api`).
- `testServiceCheck` for a TCP check (FR-104): `test-service-check-api` uses the probe this task builds.
- A log line for each attempt, and logging the host or port: `CONVENTIONS.md` forbids logging check URLs and the like; this task logs one line for each finished sequence and no address.
- Checking that the host is a valid host name or address at save time: the validation (`validateTCPCheck`) accepts any non-empty host and a port from 1 to 65535, and is not changed. A host that cannot be connected to is a failed check (`could_not_connect`).
- Reading from or writing to the connection: the check is only that the connection is accepted (FR-49); the probe closes it at once.
- Any change to the contract, the migrations, the configuration keys or the front end.

## Prerequisite

None beyond what is merged. The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `worker.CheckRunner` with `Run(ctx, service)`, `NewCheckRunner`, the `Prober` interface (`CheckHTTP`) and `CheckRecorder`, in `backend/internal/worker/check_runner.go`.
- `domain.CheckResult`, `CheckFailure`, `HTTPCheck` in `backend/internal/domain/check.go`, and `domain.FailureTimedOut`, `domain.FailureCouldNotConnect` in `backend/internal/domain/service.go`.
- `domain.Service` with `CheckType`, `TCPHost *string`, `TCPPort *int`, `TimeoutSeconds`, `RetryCount`, `RetryIntervalSeconds`.
- `adaptor/probe.HTTPProber` (`http.go`), whose context and deadline handling the TCP probe follows.

## Role and ownership

Role: Backend.

You may change only:

- `backend/internal/adaptor/probe/tcp.go` (new) and `tcp_test.go` (new); `backend/internal/adaptor/probe/doc.go` only if its text must change (it already names TCP checks).
- `backend/internal/domain/check.go` (the new `TCPCheck` type).
- `backend/internal/worker/check_runner.go` and `check_runner_test.go`.
- `backend/cmd/server/main.go` (wiring: the TCP prober and the logger into the runner).

You may not change anything else: not `backend/internal/usecase/**`, `backend/internal/handler/**`, `backend/internal/repository/**`, `backend/internal/worker/scheduler.go` and `scheduler_test.go` (`update-service-api` owns them), `backend/internal/adaptor/probe/http*.go` or `json_rules*.go`, `backend/internal/testutil/**`, `backend/migration/**`, `backend/internal/api/**`, `backend/go.mod`, `backend/go.sum`, `frontend/**`, `e2e/**`, `docs/**` (except your own plan file, `docs/tasks/tcp-probe.plan.md`), `.env.example` or the `Makefile`. No configuration key is added and none is renamed.

Shared files this task touches, owned by this task while it runs: `backend/cmd/server/main.go`, `backend/internal/worker/check_runner.go`, `backend/internal/domain/check.go`. Tasks that may run at the same time: `scheduler-test-flake` and `update-service-api` (backend; they change `worker/scheduler.go` and its test, the service usecase, the repository and the handler, none of which this task touches; neither touches `main.go`, the runner or `domain/check.go`) and the frontend group's tasks. `test-service-check-api` waits for this task and changes `main.go` and `domain/check.go` after it.

## Operations used

None. No operation of `docs/openapi.yaml` changes. A TCP service saved by `createService` is the input; the result shows through `listServices` as before.

## Behavior

### What exists

- `CheckRunner.Run` skips a service whose type is not HTTP and returns nil: nothing is probed, waited for or recorded (`TestRun_TCPService` pins this). For an HTTP service it builds an `HTTPCheck` from the saved fields, makes an attempt through the `Prober`, retries up to `RetryCount` times (a negative count is zero) after a wait of `RetryIntervalSeconds` on the clock's timer, stops at the first healthy result, and records the last result unless the context has ended. A prober error is only a context error and ends the sequence with it.
- `worker.NewCheckRunner(prober, recorder, clock)`; `main.go` builds it once with the HTTP prober and passes `runner.Run` to the scheduler.
- `probe.HTTPProber.CheckHTTP` returns the caller's context error when that context ended; otherwise every failure is a result: the probe's own deadline is `timed_out`, anything else classified as `could_not_connect` or another code.
- `domain.Service.TCPHost` and `TCPPort` are set for a TCP service and nil for an HTTP one.

### The TCP probe (`probe.TCPProber`)

New, in `adaptor/probe/tcp.go`. `domain.TCPCheck` is new, in `domain/check.go`: the host, the port and the timeout of one attempt. `NewTCPProber()` takes no argument; the type is safe for concurrent use and keeps no state between attempts. `CheckTCP(ctx, check domain.TCPCheck) (domain.CheckResult, error)` makes one attempt:

1. If the caller's `ctx` has ended already, return its error and an empty result, without connecting.
2. If the timeout is zero or less, the attempt fails at once as `timed_out`, with no connection (as the HTTP probe does).
3. Otherwise connect to `host:port` over TCP with a context that ends at the timeout (the name lookup and the connect together are inside it), using the standard dialer; the address is joined with `net.JoinHostPort`, so an IPv6 host without brackets works. The timeout starts when the attempt starts.
4. A connection that is accepted is healthy (`Healthy` true, no failure). The probe closes it at once and sends or reads nothing. Whether the close fails is ignored.
5. A connection that fails is classified in this order: the caller's context ended (return its error and an empty result, as the HTTP probe); the probe's own deadline passed (`timed_out`); anything else (refused, no route, an unknown host, a reset, an unparsable host) is `could_not_connect`. Neither result carries an HTTP status or a rule field.

The only error the probe returns is the caller's context error. The dial function is a private field of the prober of type `func(ctx context.Context, network, address string) (net.Conn, error)`, defaulting to the standard dialer's `DialContext`; a test in the package replaces it (so the timeout and the name-lookup tests need no unroutable address and no real lookup). The caller of `NewTCPProber` never sees it.

### The runner (`CheckRunner.Run`)

The runner takes a second interface, `TCPProber` (`CheckTCP`), and a `*slog.Logger`: `NewCheckRunner(prober, tcpProber, recorder, clock, log)`; none of the five may be nil (`main.go` and the tests pass real or fake values, a logger over `io.Discard` where a test does not read it). The retry loop is one loop for both types: the type decides only how one attempt is made and from which saved fields, then the existing rule applies unchanged (attempt, then up to `RetryCount` retries each after `RetryIntervalSeconds` on the clock, stop at the first healthy result, a negative count is zero, the context winning over a wait, nothing recorded when the context has ended before the record). The loop is not copied.

- **HTTP** services: unchanged, including `errMissingHTTPSettings` when the method or the URL is missing.
- **TCP** services: build a `TCPCheck` from `TCPHost`, `TCPPort` and `TimeoutSeconds`. A TCP service with a missing host or port returns a new error `errMissingTCPSettings` (text: `check runner: tcp service has no host or port`) and records nothing; the scheduler logs it as `check sequence failed`, as it does for the HTTP case.
- **Any other type** returns a new error `errUnknownCheckType` (text: `check runner: unknown check type`) and records nothing. Today it returns nil; the validation never lets such a type be saved, so this is a guard.

### The log line

After the result of a sequence has been recorded successfully, the runner writes one line, message `check finished`, at info level when the result is healthy and at warn level when it is not (decided by the user: one line for every finished sequence), with these attributes and no others: `service_id`, `service_name`, `healthy` (true or false), and, when unhealthy, `failure_code` (the code's text, for example `could_not_connect`) and, for `non_2xx_status`, `http_status`. A result that is not healthy and has no failure (the probes never make one) is logged unhealthy with no `failure_code`, and recorded as given. A context that ends right after a successful record does not stop the line: the record has happened. No line is written when the sequence ends without a record: the context ended, the record failed (the scheduler logs the error), or the settings are missing. Nothing about the address, URL, query, headers, body or JSON rule is logged (`CONVENTIONS.md`, Logging). It is one line for each sequence, not for each attempt. This line serves HTTP services too.

### Wiring (`cmd/server/main.go`)

Build `probe.NewTCPProber()` and pass it, with the existing HTTP prober, the recorder, `clock.Real{}` and the logger `log` that `run` already has, to `NewCheckRunner`. Nothing else in `main.go` changes: the scheduler still receives `runner.Run`.

### Known gaps

- Services already saved as TCP start being checked when this ships, so they move from `not_yet_checked` to `healthy` or `unhealthy`, and an unhealthy one alerts (FR-21) as any service does. That is the purpose of the task, not a defect.
- The test that the timeout covers the name lookup (FR-41) shows that the attempt's context carries the deadline into the dial function; a real dialer honouring a context deadline during a lookup is the standard library's and is not tested here.
- A host that resolves to several addresses is tried by the standard dialer's rules (all of them, within the one timeout); the result does not say which address was tried.
- An accepted connection is closed at once: a service that accepts and then drops connections is healthy (FR-49 asks only for an accepted connection).
- A service whose host is an unbracketed name with a port in it (`host:80`) is saved as typed; the check fails as `could_not_connect`.
- The failure reason is only in the log line and on the dashboard; the words shown to the admin are the frontend's.
- `json_rule_field` of a failed HTTP check is not logged.

## Structure

By `ARCHITECTURE.md` ("adaptors", "Background work"): the adaptor holds no business rules, the worker owns the retry loop.

- `adaptor/probe/tcp.go` (new): `TCPProber`, `NewTCPProber`, `CheckTCP`. Imports `domain` and the standard library; nothing from `usecase`, `worker` or `repository`.
- `domain/check.go`: `TCPCheck` (new), next to `HTTPCheck`.
- `worker/check_runner.go`: the `TCPProber` interface (new), the changed constructor, the shared loop, the two new errors, the log line. It imports `domain`, `pkg/clock` and the standard library only.
- `worker/check_runner_test.go`: a fake TCP prober beside the fake HTTP prober, its script and call recording in the same style; `TestRun_TCPService` is replaced (see criteria); the two `NewCheckRunner` calls in the file take the new arguments.
- `cmd/server/main.go`: the wiring above.

## Dependencies

None. The standard library only. No `go.mod` or `go.sum` change.

## Acceptance criteria

Probe tests (`adaptor/probe/tcp_test.go`) use a listener on `127.0.0.1:0` made in the test and, for the timeout, the prober's replaceable dial function; real deadlines are at most 200 ms (`TESTING.md`). Runner tests use the fake clock and fake probers, no `time.Sleep`, under `-race`. Non-default values everywhere (retry count 2, interval 7, timeout 3, not the defaults). None is an integration test.

**TCP probe (`adaptor/probe/tcp_test.go`)**

- A listener that accepts, with a timeout of 2 s: healthy, `Failure` nil (FR-49). The listener saw one connection, and reading it (with a deadline of 2 s) gives end-of-file with no data: the probe closed it and sent nothing.
- A closed port (a listener made and closed): `could_not_connect`, no HTTP status, no rule field.
- A replaced dial function that returns a name-lookup error (a `*net.DNSError` marked not found), one that returns a refused-connection error, and one that returns a plain error: each is `could_not_connect` (no real lookup is made: it would depend on the machine's resolver). A host with a space inside, with the real dialer, is `could_not_connect` too (it fails before any network).
- A replaced dial function that blocks until its context ends: with a timeout of 50 ms the result is `timed_out` (FR-41; the test is bounded by the 200 ms real-deadline limit of `TESTING.md`), and the context the dialer received carries the timeout as its deadline (the test reads it, so a missing deadline fails it).
- A timeout of zero and of a negative duration: `timed_out`, and the dial function was not called.
- The caller's context cancelled while the dial blocks: the error is `context.Canceled`, the result is empty (not `timed_out`); a caller deadline shorter than the timeout returns `context.DeadlineExceeded`; an already cancelled context returns its error and the dial function was not called.
- An IPv6 host without brackets (`::1`, only if the machine listens on it; otherwise the test checks the address the dial function received) is joined as `[::1]:port`.
- The same prober used by several goroutines at once under `-race` gives each its own result.

**Runner (`worker/check_runner_test.go`)**

- A TCP service with healthy first attempt: one `CheckTCP` call with the saved host, port and timeout (3 s as a duration), no HTTP call, no timer, one record with a healthy result (FR-49).
- TCP retries (FR-52), the same rules as HTTP: with a retry count of 2 and an interval of 7, three failed attempts record the last failure after two waits of exactly 7 s (the timer's duration, and the wait ends only when the clock advances 7 s, not 6 s); a failure then a success records healthy and makes no further wait; a retry count of zero and of a negative number make one attempt. Each of these has the HTTP baseline in the same test table, so the two types are shown to follow one rule.
- A TCP failure's code is recorded as given (`timed_out`, `could_not_connect`).
- The context ending during a TCP attempt, during a wait, and before the record: `Run` returns the context's error and records nothing, as for HTTP.
- A TCP service with a missing host, and one with a missing port: `Run` returns an error and records nothing, with no probe call. An unknown check type: an error, nothing probed or recorded.
- An HTTP service is unchanged: its existing runner tests pass without change in meaning (apart from the constructor call).
- `TestRun_TCPService` (which asserts a TCP service is skipped) is replaced by the tests above, and its HTTP baseline half stays as an HTTP test.

**The log line (`worker/check_runner_test.go`)**

- A healthy sequence (HTTP and TCP): one `check finished` line at info level, `healthy` true, no `failure_code`, with `service_id` and `service_name`.
- An unhealthy TCP sequence after its retries: one line at warn level, `healthy` false, `failure_code` as recorded, no `http_status`; an HTTP `non_2xx_status` failure has `http_status` with the code.
- One line for a sequence with retries, not one for each attempt.
- No line when the context ended before the record, when the record failed, and when the settings are missing. A not-healthy result with no failure is logged at warn with no `failure_code`.
- The test captures the log as `scheduler_test.go` does (a buffer written under a lock, one JSON object per line) and reads the attributes by name.
- The captured log text never contains the host, the port, the URL, a header or a query (the test seeds distinctive values and checks that none appears).

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

- **By reading:** one retry loop serves both types (no copied loop); `CheckTCP` imports nothing of `usecase`, `worker` or `repository`; `scheduler.go` and the service usecase are untouched; the log call has exactly the listed attributes; `main.go` builds the TCP prober once and changes nothing else.
- **Mutation checks** (restore after each): make the runner skip TCP again and see the runner tests fail; give a TCP service no retries and see the retry table fail; classify a deadline as `could_not_connect` and see the probe test fail; remove the timeout from the dialer's context and see the deadline test fail; log the host and see the secrecy test fail; log on a cancelled sequence and see the no-line test fail.
- **Inputs to try:** port 1 and 65535; a host with surrounding spaces (saved trimmed, so not reached here), an empty host (rejected at save, here an error); a retry count of 0 with a timeout equal to the interval; a closed listener that is re-opened between attempts (retry succeeds).
- **Run it:** the probe tests ten times under `-race` and the worker package three times; report failures. By hand, if a local server is wanted: run the app, add a TCP service for a port with a listener and one with none, and see `healthy` and `unhealthy` with reason `could not connect` on the dashboard and the `check finished` lines in the log; say if it was not done.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths (the scheduler, a usecase, a migration, a dependency, the contract).
- The signature of `NewCheckRunner` or the `Prober` interface differs from "What exists", or another task has changed the runner.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check` (and the integration-test command from `TESTING.md` if you touched code with integration tests; none is expected), commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), which tests ran, dependency versions (none changed), and anything you were unsure about. Also list every judgment call this file did not settle.
