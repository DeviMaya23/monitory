# Task: HTTP probe

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The app gains the one piece of code that makes an HTTP(S) check attempt: given a method, a URL and a timeout, it makes one request and says healthy or failed, with the reason. It also adds the stub target server that this and later backend tasks test against in Go tests (the end-to-end suite needs its own, started outside Go, and is not this task). Nothing calls the probe yet: the scheduler task wires it in, so no admin-visible behavior changes.

Requirements covered, each in part, as far as one attempt with a method and a URL goes:

- FR-41: the timeout covers the attempt up to the final response's headers, redirects included. Reading the body inside the timeout is not built here, because no body is read yet.
- FR-42: healthy only when the final response arrives within the timeout and its status is 2xx. The JSON-rule half is not built here.
- FR-58: up to the configured number of redirects is followed; one more is a failed check. Re-sending the saved headers is not built here.
- FR-61: four of the seven reasons: timed out, could not connect, non-2xx status with the code, too many redirects. Also certificate problem, for an invalid certificate.
- FR-64: an invalid certificate fails the check (proven for an unknown authority and a wrong host). The "ignore certificate errors" option is not built here.

Out of scope:

- Retries, the check interval, status transitions and anything about time between attempts (FR-51 to FR-55, FR-10, NFR-6). The scheduler task.
- Query parameters, headers, the request body (FR-35, FR-37, FR-38), re-sending headers on a redirect (FR-58), JSON rules and reading the response body (FR-44 to FR-48, FR-73), the certificate expiry check and "ignore certificate errors" (FR-34, FR-50, FR-64), TCP checks (FR-33, FR-49, FR-52). All milestone 3, in the backlog.
- The duration, status code and body that a test-before-save shows (FR-104). Milestone 3.
- Wiring: `cmd/server/main.go`, `usecase/`, `worker/` and `handler/` do not change. No interface is defined for the probe here; its consumer defines it later (`ARCHITECTURE.md`, "Interfaces").
- The stub webhook receiver. Milestone 2.

## Role and ownership

Role: Backend.

You may change only:

- `backend/internal/adaptor/probe/**`
- `backend/internal/testutil/target_server.go` and `backend/internal/testutil/target_server_test.go` (both new)
- `backend/internal/domain/check.go` (new)

You may not change anything else: no other file under `backend/`, not `backend/go.mod` or `backend/go.sum`, not `backend/migration/**`, `backend/internal/api/**`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/http-probe.plan.md`), `.env.example` or the `Makefile`.

Shared files this task touches: none. Tasks that may run at the same time: `sign-in-api` (backend; it adds `backend/internal/domain/validation.go` and changes `domain/errors.go` and `domain/session.go`, none of which this task touches) and `sign-in-screen` (frontend).

## Operations used

None. This task implements no operation of `docs/openapi.yaml` and returns nothing over HTTP. The failure codes it produces are the `FailureReason.code` values of the contract, which already exist as `domain.FailureCode` constants in `backend/internal/domain/service.go`.

## Behavior

### What exists

- `backend/internal/adaptor/probe/doc.go` holds only the package comment.
- `domain.FailureCode` and its seven constants exist: `FailureTimedOut`, `FailureCouldNotConnect`, `FailureNon2xxStatus`, `FailureJSONRuleMatched`, `FailureInvalidOrMissingJSON`, `FailureTooManyRedirects`, `FailureCertificateProblem`.
- `config.Limits.MaxRedirects` (key `MAX_REDIRECTS`, default 3, least 0) exists. This task does not read the configuration; the limit is passed to the probe's constructor.
- `backend/internal/testutil/` has the test database and the conformance check, and no stub server.

### One attempt

The probe is built once with the redirect limit and is safe for concurrent use. Its one method takes a context and an HTTP check (method, URL, timeout) and returns a check result or an error.

- **The request:** the given method and URL, as they are. No body, no query parameters beyond those already in the URL. The probe sets one header itself, `User-Agent: Monitory`; Go's client adds its own (`Accept-Encoding`, `Connection: close`, `Referer` on a redirect, `Authorization` when the URL carries a user and password) and those stay as Go sends them. The client has no cookie jar.
- **The connection:** a new connection for every attempt (no keep-alive reuse between attempts), so each check tests that the service can be reached now. No proxy: the probe does not read `HTTP_PROXY`, `HTTPS_PROXY` or `NO_PROXY`, because only `platform/config` reads the environment. Any address is allowed, private and loopback included (requirements section 6).
- **The timeout:** one deadline of `Timeout` from the start of the attempt, set on a context derived from the caller's. It covers resolving the name, connecting, the TLS handshake, every redirect and waiting for the final response's headers.
- **The response body is not read by the probe.** It is closed as soon as the status is known. (Go's client may itself read a little of a redirect response before following it.)
- **Certificates:** verified against the system's trusted roots, on the first request and on every redirect. Nothing turns verification off.
- **Redirects:** responses 301, 302, 303, 307 and 308 with a `Location` are followed by Go's standard client rules (which also decide the method of the next request), up to the redirect limit. Any other 3xx (300, 304, 305), with or without `Location`, is a final response.

The outcome, decided in this order; the first that applies wins:

| # | When | Result |
|---|---|---|
| 1 | The caller's context ended before a response was in hand, by cancellation or by the caller's own deadline (not the probe's deadline) | no result; the method returns the caller's context error |
| 2 | `Timeout` is zero or negative, or the probe's deadline passed before the final response's headers arrived, at any stage | failed, `timed_out` |
| 3 | A certificate was rejected (self-signed, expired, wrong host, unknown authority), on any hop | failed, `certificate_problem` |
| 4 | A response needed one more redirect than the limit | failed, `too_many_redirects` |
| 5 | Any other failure to get a response: the request cannot be built (a method Go refuses, a URL that cannot be parsed, a scheme that is not `http` or `https`), the name does not resolve, the connection is refused or reset, the reply is not HTTP, a redirect points to a scheme other than `http` or `https` | failed, `could_not_connect` |
| 6 | The final response's status is 200 to 299 | healthy |
| 7 | Any other final status, including a 3xx that is not followed | failed, `non_2xx_status`, with the status code |

Once a final response is in hand, rows 6 and 7 decide, even if the caller's context ends at that moment. An empty method is sent as `GET`, as Go does.

Limits and boundaries:

- **Redirect limit N** (from the constructor, never a literal): a chain of exactly N redirects ending in a 2xx is healthy; a chain of N + 1 is `too_many_redirects`. With N = 0, the first redirect is `too_many_redirects`.
- **Status:** 200 and 299 are healthy; 199 cannot be a final status; 300 with no `Location`, 304, 404 and 500 are `non_2xx_status` with that code.
- **Timeout:** a response that arrives before the deadline is judged by its status; one that arrives after it is `timed_out`, whatever its status.

The result carries no URL, no header, no body and no error text. The method's only error is the caller's cancellation; every other failure is a result. The probe logs nothing (`CONVENTIONS.md`, "Logging").

### The stub target server

`testutil.NewTargetServer` (new) starts an in-process HTTP server for a test and stops it when the test ends. A test scripts, per path:

- the status code and the response body;
- a delay before the response;
- a redirect to another path or to an absolute URL, with a chosen 3xx status.

It can be started as plain HTTP or as HTTPS with a certificate the default trust store rejects (`httptest`'s own). It records every request it received (method, path, headers, remote address) so a test can assert what was sent and how many requests and connections were made. It gives a test a way to wait until a request has arrived at a path (a channel or a blocking call, not polling), so a test can cancel while the server is delaying. For the HTTPS variant it exposes its certificate pool and a client that trusts it. An unscripted path answers 404. A redirect script may also carry a delay. It is safe for concurrent requests.

### Known gaps

- **There are no saved headers to send or re-send.** Milestone 3 adds the saved headers and query parameters to the request and the re-sending rule of FR-58. `User-Agent` is on every hop already.
- **The timeout stops at the final response's headers.** FR-41 also covers reading the body; that comes with the JSON rules in milestone 3, which is when a body is first read.
- **An expired certificate is not proven by a test.** It takes the same path as the two proven cases; producing one needs a certificate generator the task does not build.
- **`STACK.md` says the check client is in `pkg/`.** `ARCHITECTURE.md` and `CONVENTIONS.md` say `adaptor/probe`, and this file follows them. Reported to the user; do not stop for it.
- **No JSON rules, so a 2xx is always healthy.** Milestone 3.
- **`certificate_problem` cannot be switched off for a service.** Milestone 3 adds "ignore certificate errors" and the expiry check.
- **`CONNECT` and `TRACE`** are passed to Go's client like any other method. What a server does with them is not this task's concern; no special handling.
- **The result has no duration.** FR-104 needs it in milestone 3.

## Structure

By `ARCHITECTURE.md`. Names marked "new" do not exist yet and are fixed by this file; other names are the builder's choice.

- `backend/internal/domain/check.go` (new):
  - `domain.HTTPCheck` (new): `Method string`, `URL string`, `Timeout time.Duration`.
  - `domain.CheckFailure` (new): `Code FailureCode`, `HTTPStatus *int` (set only for `non_2xx_status`), `JSONRuleField *string` (never set by this task).
  - `domain.CheckResult` (new): `Healthy bool`, `Failure *CheckFailure` (nil exactly when `Healthy` is true).
  - These are plain values, not tables: no struct tags, no migration.
- `backend/internal/adaptor/probe/http.go` (new) with `http_test.go`: `probe.HTTPProber` (new), built by `probe.NewHTTPProber(maxRedirects int)` (new), with the method `CheckHTTP(ctx context.Context, check domain.HTTPCheck) (domain.CheckResult, error)` (new). Its non-test code imports `domain` and the standard library only: not `usecase`, `worker`, `handler`, `platform/config` or `internal/api`. The prober has an unexported field for the trusted roots, nil in production (the system's roots); the constructor does not take it. A test in package `probe` sets it to the stub's pool to reach a trusted HTTPS server.
- `backend/internal/testutil/target_server.go` (new) with `target_server_test.go`.

Time: the probe's deadline is a `context.WithTimeout` on the caller's context, which every outbound call must have (`CONVENTIONS.md`). No `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` anywhere in this task, test files and the stub included. Where the stub or a test must wait in real time (the scripted delay), it uses a timer from `clock.Real{}` in `backend/pkg/clock`, which is the allowed way; `TESTING.md` permits real deadlines of at most 200 ms in adaptor tests.

Lint, with no `//nolint` available (`CONVENTIONS.md`):

- `nilerr` flags a function that sees a non-nil error and returns a nil one. Turning a failure into a result is this task's shape, so pass the error to the function that classifies it rather than discarding it.
- `noctx` and `bodyclose` apply to `testutil/target_server.go`, which is not a `_test.go` file: listeners and requests there take a context, and bodies are closed.
- `revive` wants a doc comment on every exported name.

## Dependencies

None. `net/http`, `crypto/tls`, `crypto/x509`, `context`, `errors`, `net/url` and `net/http/httptest` from the standard library. `go.mod` and `go.sum` do not change.

## Acceptance criteria

Tests run against the stub target server, in process. Real deadlines of at most 200 ms may be used to exercise a timeout (`TESTING.md`). Every criterion is a test that fails if the behavior is removed. No integration test (build tag `integration`) is needed.

**Probe (`adaptor/probe/http_test.go`)**

- A 200 is healthy, with a nil failure. A table: 204 and 299 healthy; 300 without `Location`, 304, 404 and 500 are `non_2xx_status` with that code in `HTTPStatus`.
- The request the server received has the given method (a table: `GET`, `HEAD`, `POST`, `DELETE`), the given path and query string, `User-Agent: Monitory`, and no body.
- With a prober built with a limit of 2: a chain of 2 redirects ending in 200 is healthy and the server received 3 requests; a chain of 3 is `too_many_redirects` and the final 200 was never requested. With a limit of 0: one redirect is `too_many_redirects`. With a limit of 5: a chain of 3 is healthy (the limit is not a literal 3).
- A redirect that ends in a 404 is `non_2xx_status` 404.
- A server that answers after 150 ms with a timeout of 50 ms is `timed_out`; with a timeout of 200 ms and a 20 ms delay it is healthy.
- The timeout covers redirects: two hops of 40 ms each with a timeout of 60 ms is `timed_out`.
- A timeout of 0 is `timed_out` and the server received no request.
- A 300 and a 305 that carry a `Location` are `non_2xx_status` with that code, and the location was not requested.
- A closed port (a listener opened and closed again) is `could_not_connect`. A table of other `could_not_connect` inputs: a URL that cannot be parsed, the scheme `ftp`, the method `BAD METHOD`, a redirect to `ftp://…`, a server that closes the connection without answering.
- An HTTPS stub server with its untrusted certificate is `certificate_problem`; a plain-HTTP redirect to that HTTPS server is `certificate_problem` too.
- With the stub's pool set as the trusted roots (a test in package `probe`): the HTTPS stub reached by an address its certificate names is healthy, and the same server reached by a host name its certificate does not name is `certificate_problem`.
- Cancelling the caller's context once the stub reports that the request arrived, while it is delaying, returns an error that is `context.Canceled` and a zero result. A caller context whose own deadline (20 ms) is shorter than the probe's timeout returns an error that is `context.DeadlineExceeded`, not a `timed_out` result. The same setup with neither returns a result (the baseline).
- In every test above that expects a failure, the assertion also checks `Healthy` false, a non-nil `Failure`, and `HTTPStatus` nil unless the code is `non_2xx_status`; every healthy case checks a nil `Failure`.
- Twenty attempts at once, half against a path that delays 100 ms and half against a fast one, all return the right result under the race detector. No assertion on which finished first.
- Two attempts in a row against the same server arrive on two connections (the server records the remote addresses, or counts new connections).

**Stub target server (`testutil/target_server_test.go`)**

- A scripted path answers with its status and body; an unscripted path answers 404.
- A scripted delay is observed; a scripted redirect answers with its status and `Location`.
- Requests are recorded in order with method, path and headers.
- The HTTPS variant is refused by a default `http.Client` and accepted by the client the stub hands out for its own certificate.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `go.mod` and `go.sum` are unchanged.

No existing test changes.

## Verifier checks

- **Paths:** the diff touches only the three places under "Role and ownership".
- **No rules in the adaptor:** `adaptor/probe` decides nothing about status transitions, retries or alerts, and imports only `domain` and the standard library.
- **No address filtering:** nothing rejects private, loopback or link-local addresses.
- **No environment:** the transport sets no proxy from the environment (`http.ProxyFromEnvironment` is not used; the default transport is not used as it is), and nothing calls `os.Getenv`.
- **Certificates:** `InsecureSkipVerify` appears nowhere in `adaptor/probe`. It may appear in `testutil` only in the client the stub hands out for itself.
- **The limit:** the redirect limit comes from the constructor; no literal 3 or 10 decides anything.
- **Leaks:** the response body is closed on every path, including redirects that are not followed and error returns.
- **Nothing leaks out:** the result and the error carry no URL, header or body; nothing is logged.
- **Time:** no `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` in the diff, tests and the stub included.
- **Cookies:** the client has no cookie jar.
- **Mutation checks to run:** treat 300 to 399 as healthy (the status table must fail); remove the redirect limit (the chain test must fail); swap rows 2 and 5 of the outcome table so a deadline reports `could_not_connect` (the timeout test must fail); map certificate errors to `could_not_connect` (must fail); return a result instead of an error on caller cancellation (must fail); enable keep-alive (the two-connections test must fail).
- **Inputs to try:** an empty URL; `http://` with no host; a URL with a fragment; a host that does not resolve (`could_not_connect`, if the test environment has a resolver; do not add a test that needs the network); a redirect loop (`too_many_redirects`); a negative timeout (`timed_out`); a URL with a user and password.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a migration, a config key, or an edit to a spec file.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.
- Go's standard client cannot produce one of the outcomes in the table as written (for example it cannot tell a rejected certificate from another connection failure).

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered in part (with the test that shows each), that no integration tests apply, that no dependency changed, and anything you were unsure about. Also list every judgment call this file did not settle.
