# Task: test-service-check API

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The admin can test a check with the settings in the form before saving: `testServiceCheck` becomes real. It validates the check and the timeout the way a save does, makes one attempt with no retries (HTTP or TCP), and answers 200 with the result: healthy or failed with the failure reason, how long the attempt took and, for an HTTP(S) check that got a response, its status code and its body (up to the configured limit, cut off with a flag). It saves nothing, changes no saved service and sends no alert. The task has three parts, built in this order: the HTTP probe gets a second entry point that also returns the status and the body; a usecase with no repository; the handler and the wiring.

Requirements covered:

- FR-104: one attempt with no retries, with the form's timeout, request, JSON rules and certificate settings; healthy or failed with the reason (FR-61); the duration; for an HTTP(S) check that got a response, its status code and body, the body read up to `RESPONSE_BODY_MAX_BYTES` (the same configured limit as FR-73, `.env.example`: "FR-73, FR-104") and cut off with `response_body_truncated` true beyond it; the body is read even when the check has no JSON rules (the exception to FR-73), and only for a test.
- FR-105: a test touches no saved state: the usecase is given no repository, no recorder and no dispatcher; a test shows that nothing it is given can write.
- FR-106: invalid settings are `422 validation_failed` with the same fields, codes and messages as a save (FR-74), and no test runs.
- FR-61, in part: the failure reason of a failed test is one of the saved reasons, as the probes produce it.
- NFR-7: the body is returned as a JSON string, never interpreted, and never saved or logged.
- NFR-8: the operation needs a session and the CSRF token (the policy router enforces it; a test shows it).
- The finding of the `http-certificate-options` verifier (a check built from form values must set the three certificate fields; this task carries it): the test sets `CertificateCheck`, `CertMinDaysLeft` and `IgnoreCertificateErrors`, shown by tests.

Out of scope:

- The Test panel in the form (`service-test-panel`, frontend).
- Changing what a saved check does: `CheckHTTP` and the runner keep their behavior (the body of a saved check is still read only when it has JSON rules). The new entry point is used by a test only.
- A rate limit, a queue or a concurrency limit on tests: one admin; a test is bounded by its timeout.
- Testing a saved service by id, name uniqueness and the interval, retries and budget settings: the test needs the check and the timeout only (the contract's `ServiceTestInput`).
- Logging a test: no line is written for it (the URL, headers and body must never be logged, and there is nothing else worth a line).

## Prerequisite

`tcp-probe`, `update-service-api` and `pause-resume-api` are merged. The first supplies the TCP probe, the others the shared files this task changes next. The builder checks first that these exist on the default branch (with the names of the merged code), and stops to ask if any is missing (it never creates them):

- `probe.TCPProber` with `CheckTCP(ctx, domain.TCPCheck) (domain.CheckResult, error)` and `domain.TCPCheck` (host, port, timeout) from `tcp-probe`; `main.go` builds a TCP prober and an HTTP prober for the runner.
- `probe.HTTPProber` with `CheckHTTP` and `NewHTTPProber(maxRedirects, maxBodyBytes int, clock)`, and `domain.HTTPCheck` with its certificate fields (`CertificateCheck`, `CertMinDaysLeft`, `IgnoreCertificateErrors`).
- `usecase.normalizeServiceInput`, `ValidateServiceInput` and the private `validateCheck`, `validateSettings` in `usecase/service_validation.go`; `domain.ServiceLimits` with the `Timeout` range and its default.
- `handler.Server`, `NewServer`, `toCheckInput` and `toAPIState`-style mapping in `handler/service_mapping.go`; `serviceSpy`/`targetSpy`/`testerSpy` and `newRouter` in `handler/helpers_test.go`.

## Role and ownership

Role: Backend.

You may change only: `backend/internal/adaptor/probe/http.go` and `http_test.go`; `backend/internal/domain/check.go`, `domain/service_input.go`, and the new `domain/service_test_result.go`; `backend/internal/usecase/service_tester.go` (new) with `service_tester_test.go` (new), `service_validation.go` and `service_validation_test.go` (one private helper, see "Structure"), `fakes_test.go`; `backend/internal/handler/server.go`, `service_mapping.go`, `service_mapping_test.go`, `service_tests.go` (new) with `service_tests_test.go` (new), `helpers_test.go`; `backend/cmd/server/main.go` (wiring).

You may not change `backend/internal/worker/**`, the rest of `adaptor/` (`tcp.go`, `json_rules.go`), `backend/internal/testutil/**` (the target server already scripts a status, body and delay), `backend/internal/handler/problem.go` and `router.go`, `backend/internal/repository/**`, the rest of `usecase/` and `domain/`, `backend/internal/api/**` (generated), `backend/migration/**`, `backend/go.mod`, `backend/go.sum`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/test-service-check-api.plan.md`), `.env.example` or the `Makefile`. No configuration key is added: the body limit is the existing `RESPONSE_BODY_MAX_BYTES`.

Shared files this task touches, owned by this task while it runs: `adaptor/probe/http.go`, `domain/check.go`, `handler/server.go`, `handler/helpers_test.go`, `usecase/fakes_test.go`, `cmd/server/main.go`. All three prerequisite tasks changed some of them and are merged. No other task runs at the same time except the frontend group's (frontend only).

## Operations used

From `docs/openapi.yaml`:

- `testServiceCheck`: `POST /api/service-tests`, body `ServiceTestInput` (`check`, optional `settings`). Responses used: 200 (`ServiceTestResult`), 400, 401, 403, 413, 415, 422, 500. It lists no 404 and no 409; none is added. A stub today.

The request and response types are the generated ones. `ServiceTestResult` requires `healthy` and `duration_ms`; `failure_reason`, `http_status`, `response_body` and `response_body_truncated` are optional and are omitted, not null, when they do not apply.

## Behavior

### What exists

- `HTTPProber.CheckHTTP(ctx, check)` makes one request. A failure to get a response is classified (caller's context error, then the probe's deadline, certificate, redirects, anything else). A response is judged: certificate expiry first; then, with no JSON rules, the status; with rules, the body is read (at most the configured limit plus one byte) and a rule match wins over a non-2xx status, a non-2xx status wins over `invalid_or_missing_json`. Its only error is the caller's context error. It returns no status code except inside a `non_2xx_status` failure and no body.
- The tests of `probe` use `testutil.TargetServer` (scripted status, body, delay, TLS).
- `usecase.TargetTestService` is the precedent: validate, make one attempt, a failed attempt is a result, an error is for invalid input or an ended context. `handler/target_tests.go` is the handler precedent.
- `validateCheck` and the check rules of a save, `validateSettings` (all four timing values and the worst-case budget), `normalizeServiceInput` (private to `package usecase`).

### The probe: `HTTPProber.TestHTTP`

New, next to `CheckHTTP`, with the new `domain.HTTPTestOutcome` (the `CheckResult`, `HTTPStatus *int`, `Body string`, `BodyTruncated bool`). It makes the same single request with the same deadline, redirect rule, headers, body, certificate handling and classification as `CheckHTTP`, and it returns the same verdict in every case, with these additions:

1. When a final response was received, `HTTPStatus` is its status code, whatever the verdict (also for a certificate problem, a JSON rule match or a non-2xx status). When none was (could not connect, timed out before the headers, too many redirects, a certificate error at connect), `HTTPStatus` is nil and the body empty.
2. The body is read whether or not the check has JSON rules, under the same deadline, at most `maxBodyBytes` plus one byte. If the body is longer than `maxBodyBytes`, `Body` holds the first `maxBodyBytes` bytes and `BodyTruncated` is true; a body of exactly `maxBodyBytes` bytes is whole and not truncated. A body with no bytes is the empty string with a status.
3. JSON rules, when present, are judged on the same bytes by the same rules as in `CheckHTTP` (the limit for them is the same configured value, so one read serves both). With no rules the verdict is the one `CheckHTTP` would give from the status (and the certificate check), and reading the body never changes it: a read error or a deadline during the body read, with no rules, leaves the verdict as `CheckHTTP` would have given and `Body` holding what was read, `BodyTruncated` false. With rules, a read error is classified exactly as `CheckHTTP` does.
4. The only error returned is the caller's context error, with an empty outcome, wherever the context ends: before the request, during it, or during the body read (also with no rules: a caller who left gets the context error, not a verdict).

`CheckHTTP`'s behavior does not change; in particular it still never reads a body without JSON rules. Where the two share the request, the judgment or the classification, they share one implementation, not two copies.

### The usecase: `ServiceCheckTestService`

New, in `usecase/service_tester.go`, in the style of `TargetTestService`. Its constructor takes an HTTP prober interface (`TestHTTP`), a TCP prober interface (`CheckTCP`), a `Clock` and `domain.ServiceLimits`. It takes no repository, recorder, dispatcher or scheduler, so it cannot write anything or send anything (FR-105). The input type `domain.ServiceTestInput` is new (a `CheckInput` and an optional timeout in seconds), the result type `domain.ServiceTestResult` new (healthy, the failure, the duration in whole milliseconds, an optional HTTP status, the body, and the truncated flag).

`TestServiceCheck(ctx, input) (domain.ServiceTestResult, error)`:

1. **Normalize** with `normalizeServiceInput`, called as it is (it is private to `package usecase`, and this service and `UpdateService` are in that package: no new shared place, decided by the user): the URL and the host are trimmed, header and query names and header values and JSON rule fields are trimmed, so the test sends what a save would store.
2. **Validate** (FR-106): the check by `validateCheck` (all the rules and messages of a save: type, method, URL and its length with the query parameters, query parameters, headers, body, JSON rules and mode, certificate options and "requires an https URL", TCP host and port), then the timeout alone: an omitted timeout is the configured default, one outside the configured range is `out_of_range` on `settings.timeout_seconds` with the message a save gives (`The timeout is %d to %d seconds.`). The other values of `settings` (interval, retry count, retry interval) are ignored and not validated, and the worst-case budget is not checked: they play no part in a test (decided by the user: "invalid settings" in FR-106 means the check and the timeout; the form shows the other errors when the admin saves). The name and the messages are not part of the input. Any field error is `domain.ValidationError` with every field, in the order a save gives them, and nothing runs. The timeout rule is one helper shared with `validateSettings`, not copied.
3. **Build the attempt.** HTTP: an `HTTPCheck` with the method, the URL, the timeout (effective seconds as a duration), the query parameters, headers, body type (an empty type is `none`) and content, JSON rules and mode (an empty mode is any), and the three certificate fields: `CertificateCheck` from the enabled flag, `CertMinDaysLeft` from the days only when it is enabled, `IgnoreCertificateErrors`. TCP: a `TCPCheck` with the trimmed host, the port and the timeout.
4. **Run it once**, no retry, no wait, with the request's context. The duration is the clock's time after the attempt minus before, in whole milliseconds, rounded down, never negative.
5. **Answer.** `Healthy` and the failure as the probe gave them. For HTTP, the status, the body and the truncated flag as `TestHTTP` gave them, and the body is made valid UTF-8 (invalid bytes become U+FFFD, a partial character at the cut too), since it is shown as text and sent as JSON (decided by the user: the usecase does it, so the rule is explicit and tested). For TCP there is no status and no body. A failed attempt is a result, never an error.
6. **Errors:** invalid input is the validation error, and it comes before anything else, even if the context has ended; an ended request context is returned as the context's error, as `TestTarget` does (no result); an unexpected error from a probe is returned wrapped with a fixed text such as `run the check test` and the error's own text, never the check's URL, host, headers or body (the router logs the text of an unexpected error).

### The handler: `testServiceCheck`

In `handler/service_tests.go`, in the style of `target_tests.go`:

1. A missing body is `errMalformedRequest`. The body is mapped by a new `toServiceTestInput` (in `service_mapping.go`): the check by the existing `toCheckInput` (so a malformed check is a 400 and an unknown or missing type is left to validation), and the timeout from `settings.timeout_seconds` when `settings` is present.
2. The usecase's answer is mapped to `api.ServiceTestResult`: `healthy`, `duration_ms`; `failure_reason` only when unhealthy (`code`, plus `http_status` only for `non_2xx_status` and `json_rule_field` only for `json_rule_matched`, the way `toAPIState` maps the saved reason: the builder extracts that mapping into one helper that `toAPIState` and this mapping both call, rather than copying it); `http_status` and `response_body` only when the usecase returned a status; `response_body_truncated` always present (false or true). Errors go to the policy router as they are: a validation error is 422, others are 500 with the text hidden.
3. No log line for a test (see "Out of scope").

### Wiring (`cmd/server/main.go`)

Hoist the HTTP prober (built inline today as an argument of `NewCheckRunner`) and the TCP prober (added by `tcp-probe`) into variables, and build `usecase.NewServiceCheckTestService` with those same instances (one instance of each, so the body limit and the redirect limit are the same as the runner's), `clock.Real{}` and the service limits, and pass it to `handler.NewServer` as a new argument (`NewServer` and its caller in `helpers_test.go`'s `newRouter` change together). Nothing else in `main.go` changes.

### Known gaps

- A test runs an attempt for as long as its timeout, in the request: the request holds a connection that long. Many tests at once are not limited.
- A test uses the app's network position: it can reach any host the app can reach, including private addresses. That is the admin's own monitor; no filtering is built.
- A test of an HTTP check follows the redirect limit from the configuration, like a saved check.
- The failure reason is the code; the words for it are the frontend's.
- A body that is not text (binary) is shown with invalid bytes replaced; no content-type handling.

## Structure

By `ARCHITECTURE.md`: adaptor holds no rules, the usecase decides, the handler maps.

- `adaptor/probe/http.go`: `TestHTTP`, sharing the request building, the judgment and the classification with `CheckHTTP` (a private method both call is the expected shape; its name is the builder's). `domain/check.go`: `HTTPTestOutcome`.
- `domain/service_input.go`: `ServiceTestInput`. `domain/service_test_result.go` (new): `ServiceTestResult`.
- `usecase/service_tester.go` (new): the service, its two small prober interfaces and its constructor. `usecase/service_validation.go`: one private helper for the timeout range, used by `validateSettings` (no change in what a save answers) and by the test's validation.
- `handler/server.go`: a `ServiceCheckTester` interface, a field and a `NewServer` argument (its own line each, as the file's comment asks). `handler/service_tests.go` (new): `TestServiceCheck` on `*Server` (a method on `Server` shadows the stub; `stubs.go` needs no edit). `handler/service_mapping.go`: `toServiceTestInput` and the result mapping.
- Tests: `usecase/fakes_test.go` or the new test file: fake HTTP and TCP probers that record their calls and can advance the fake clock; `handler/helpers_test.go`: a spy for the new interface and `newRouter`'s new argument.

## Dependencies

None. The standard library and what `STACK.md` already names. No `go.mod` or `go.sum` change.

## Acceptance criteria

Probe tests use `testutil.TargetServer` with a small `maxBodyBytes` (for example 10); real deadlines at most 200 ms. Usecase tests use the fake clock and fake probers. Non-default values everywhere. None is an integration test.

**Probe (`adaptor/probe/http_test.go`)**

- `TestHTTP`, same verdicts as `CheckHTTP`: a table run through both entry points over the same scripted routes (2xx, 404, 500, redirect chain within and over the limit, timeout, closed port, certificate problem, expiry too close, JSON rule match, invalid JSON, JSON rules with a body over the limit) gives the same `CheckResult` from both.
- Status and body: a 2xx response with a body gives `HTTPStatus` 200, the body whole, `BodyTruncated` false, with no JSON rules (the exception to FR-73). A 404 and a 500 give their status and body. A response whose verdict is a certificate problem or a rule match still has its status and body.
- Truncation boundary with `maxBodyBytes` 10: a body of 10 bytes is whole and not truncated; one of 11 bytes gives the first 10 bytes and `BodyTruncated` true; an empty body gives the empty string with the status.
- No response (closed port, timeout before headers, too many redirects): `HTTPStatus` nil, body empty.
- With no rules, a body that stalls past the deadline after the headers (a raw listener that sends the headers and part of a body and then waits, as `rawServer` in `http_test.go` does; `TargetServer` cannot do it): the verdict is the one `CheckHTTP` gives for the same route (healthy for a 2xx), the status is returned, and the body holds what arrived.
- The caller's context cancelled during that stalled body read, with no rules: the context error and an empty outcome.
- The caller's context cancelled or already ended: the context error and an empty outcome.
- `CheckHTTP`'s existing tests pass unchanged, among them the one that shows a stalled 2xx body times out with rules and is healthy without them (`rawServer`, `http_test.go`): it proves `CheckHTTP` still does not read a body when the check has no rules.

**Usecase (`usecase/service_tester_test.go`)**

- Healthy HTTP: the fake prober gets one `TestHTTP` call with the method, the trimmed URL, the timeout in seconds as a duration, the query parameters, headers, body type and content, rules and mode, and the three certificate fields exactly (certificate check on with 30 days, ignore on; and the same off, where `CertMinDaysLeft` is zero); the result carries the status, the body and the flag the prober returned.
- Trimming: a URL and a TCP host with surrounding spaces reach the prober trimmed; header names and values and query names are trimmed (the same inputs as the `createService` trimming tests).
- Defaults: no `settings` gives the configured default timeout; a timeout given is used.
- TCP: one `CheckTCP` call with the trimmed host, the port and the timeout; no `TestHTTP` call; the result has no status and no body.
- A failed attempt (each failure code the fake returns) is a result with the failure as given, `Healthy` false, not an error.
- No retry: a failing fake is called once; no timer or wait.
- Duration: a fake that advances the clock by 1234 ms gives `1234`; by 1999 µs gives `1`; by zero gives `0`.
- Body made valid UTF-8: a body with an invalid byte and a cut multi-byte character comes back with U+FFFD in their place; a valid body is unchanged.
- Validation (FR-106): for each rule a save has (missing type, unknown type, bad method, empty and too-long URL, URL without http or https, too many and nameless query rows, header limits, body too long and unknown body type, too many JSON rules, a rule without field or value, an unknown rule mode, certificate check without days or with 0 days, certificate options with an http URL, TCP host empty and port 0 and 65536), the same field, code and message as `ValidateServiceInput` gives for the same check (the test passes it a valid name and a default timeout and compares the check's errors, leaving out `name` and `settings`), the prober is not called, and the errors come in the same order. A timeout of 0 and one above the configured maximum are `out_of_range` on `settings.timeout_seconds` (and the boundary values are accepted). Other `settings` values out of range (retry count, interval) are ignored and the test runs. An empty name is not an error here.
- Nothing can write: the test builds the service with exactly the two fake probers, the clock and the limits, nothing else. That nothing writes is proven by the verifier's reading check (no repository, recorder, dispatcher or scheduler in the file's imports or constructor), not by this test alone.
- The context ended during the attempt: the context's error, no result. A prober's unexpected error comes back wrapped (`ErrorIs`).
- `validateSettings` still gives the same errors for a save (the existing tests pass unchanged).

**Handler (`handler/service_tests_test.go`, `service_mapping_test.go`)**

- 200 for a healthy HTTP result with status, body and `response_body_truncated` false: the JSON has `healthy` true, `duration_ms`, `http_status`, `response_body`, and no `failure_reason`.
- 200 for a failed result: `failure_reason` with the code; `http_status` inside it only for `non_2xx_status`, `json_rule_field` only for `json_rule_matched`; the top-level `http_status` and body present when the usecase returned them; a truncated body has the flag true.
- A TCP result has neither `http_status` nor `response_body`, and `response_body_truncated` false.
- The body is returned as given in a JSON string: a body that looks like HTML or script arrives unchanged as text with the JSON content type (NFR-7).
- The spy receives the mapped input: the check, and the timeout from `settings` (nil when `settings` is absent); `settings` with other fields maps only the timeout.
- Errors: a validation error is 422 with every field; an unexpected error is 500 `internal_error` with its text hidden.
- Gate failures never reach the spy: no session (401), no CSRF token (403), a body over the limit (413), a content type that is not JSON (415), a malformed body or a malformed check (400).
- No log line is written for a successful test (the captured log is empty after a call); a 500 gets the router's usual `unexpected error` line, which the test does not require to be empty.
- A 204 or other response with no body: `response_body` is the empty string and present, `http_status` present.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

- **By reading:** `ServiceCheckTestService` imports no repository, recorder, dispatcher or scheduler, and its constructor takes none; `CheckHTTP`'s code path is unchanged for a check without rules (still no body read); the request, judgment and classification are shared, not copied; the body limit is `maxBodyBytes`, not a literal 64 KB or 65536; `normalizeServiceInput` is called, not copied; no new configuration key; the handler adds no status or field the contract lacks; nothing logs a URL, header or body; `toAPIState`'s failure mapping is reused.
- **Mutation checks** (restore after each): drop the certificate fields from the built `HTTPCheck` and see the usecase test fail; read the body only when there are rules and see the probe test fail; change `>` to `>=` at the truncation boundary and see the boundary test fail; skip the trim and see the trimming test fail; validate the retry count in the test and see the ignore test fail; return an error for a failed attempt and see the "failure is a result" test fail; give `TestHTTP` a different verdict order than `CheckHTTP` and see the table fail.
- **Inputs to try:** a body of exactly the limit and one more; a binary body; a 204 with no body; a redirect chain ending on a large body; an https check with an untrusted certificate with and without ignore; a TCP host with spaces; a timeout of 1 and of the maximum; two tests at once under `-race`; the same request twice (no state: the saved services list is unchanged, shown by a repository-free usecase by construction).
- **Run it:** the probe, usecase and handler packages three times under `-race`; report failures. By hand if wanted: run the app, call the operation with `curl` for a local server and for a closed port, and read `listServices` before and after (unchanged); say if it was not done.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other, or the contract lacks a status, field or code you need.
- You think you need a change outside your paths (the runner, a repository, `problem.go`, a migration, a dependency, a configuration key, the contract).
- A prerequisite task is not merged, or the code differs from "What exists" (the probe's judgment order, `validateCheck`'s name, `NewServer`'s arguments).
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check` (and the integration-test command from `TESTING.md` if you touched code with integration tests; none is expected), commit in small steps (probe, then usecase, then handler and wiring), push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), which tests ran, dependency versions (none changed), and anything you were unsure about. Also list every judgment call this file did not settle.
