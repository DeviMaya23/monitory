# Task: http certificate options

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

An HTTPS check now honours the two certificate options a service can save: the expiry check (fail when fewer than the chosen number of days remain on the certificate) and "ignore certificate errors" (accept an invalid, self-signed or expired certificate). Until now the probe always verifies the certificate against the system's roots, fails an invalid one as `certificate_problem` with no way to turn that off, and never looks at the expiry date. This is the last of three probe tasks (after `http-request-send` and `http-json-rules`). After it, a service with a self-signed certificate and "ignore certificate errors" on is healthy, and a service whose certificate has 9 days left with a minimum of 14 is unhealthy with the reason `certificate_problem`.

Requirements covered:

- FR-34: an HTTP(S) check can also check the expiry of the service's TLS certificate.
- FR-50: with the certificate check on, the check fails when fewer than the saved minimum number of days remain.
- FR-64: an invalid certificate (self-signed, expired or not matching the host) fails the check unless "ignore certificate errors" is on for that service; with it on, certificate errors on that service's connection are ignored, redirects included; the expiry check is separate: if it is on it still applies, and an already-expired certificate counts as 0 days left.
- FR-61, in part: a certificate that is too close to expiry is recorded as `certificate_problem` (FR-61 has one certificate reason).
- FR-51, in part: a failed certificate check is retried like any other failure (the runner's rule; shown by a test).

Out of scope:

- **Saving the options and the form's switches** (`createService`, `updateService`, the service form): the save-time validation exists (an `https` URL is required for both options; a minimum of at least 1 day); the form is a milestone 3 frontend task.
- **Sending the saved request** (`http-request-send`) and **JSON rules** (`http-json-rules`), which this task builds on.
- **The wording of the reason on screen** (the FR-61 row of the backlog): frontend.
- **Checking the certificate of an earlier redirect hop, intermediate certificates, revocation, or any other certificate property.**
- **Any change to the contract, the migrations or the configuration keys.**

## Prerequisite

`http-request-send` and `http-json-rules` are merged. The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `domain.HTTPCheck` with the fields those two tasks add (`QueryParams`, `Headers`, `BodyType`, `BodyContent`, `JSONRules`, `JSONRuleMode`); `adaptor/probe.HTTPProber` with `NewHTTPProber(maxRedirects, maxBodyBytes int)`, the request building, the body reading and the result order of `http-json-rules` (failure to get a response; then the rules; then the status; then invalid JSON); `worker.CheckRunner` mapping the service into the check by plain assignment.
- `domain.Service.CertCheck bool`, `CertMinDaysLeft *int`, `IgnoreCertErrs bool` (`domain/service.go`), saved by `createService`; `domain.FailureCertificateProblem`.
- `pkg/clock` (`clock.Clock`, `clock.Real`, `clock.Fake` with `NewFake(start)`, `Advance`).
- The prober's in-package test hook `roots *x509.CertPool` (the hook must feed both clients) and `testutil.TargetServer` with `testutil.TargetTLS()` and `Pool()` (the receiver's certificate is the `httptest` one, which names `127.0.0.1`, `example.com` and `::1` and expires in January 2084; a test reads its `NotAfter` from a response's `TLS.PeerCertificates[0]` got through `ts.Client()`, or with a `tls.Dial`, so `testutil` does not change).
- `docs/tasks/http-probe.md` said nothing turns verification off and checked that `InsecureSkipVerify` appears nowhere in `adaptor/probe`. FR-64 (v0.15) supersedes that for this task: the second client is the one place verification is skipped, and only for a service that asks for it.

## Role and ownership

Role: Backend.

You may change only:

- `backend/internal/domain/check.go` (the new fields of `HTTPCheck`)
- `backend/internal/adaptor/probe/http.go`, `http_test.go`
- `backend/internal/worker/check_runner.go`, `check_runner_test.go` (the mapping)
- `backend/cmd/server/main.go` (the one call that builds the prober)

You may not change anything else: not `backend/migration/**`, `backend/internal/api/**`, `backend/internal/handler/**`, the rest of `backend/internal/domain/**`, `backend/internal/usecase/**`, `backend/internal/repository/**`, `backend/internal/testutil/**`, `backend/internal/platform/config/**`, `pkg/**`, `.env.example`, `backend/go.mod`, `backend/go.sum`, the lint configuration, `Makefile`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/http-certificate-options.plan.md`). No configuration key is added or renamed.

Shared files this task touches, all owned by this task while it runs: `adaptor/probe/http.go` and its test, `domain/check.go`, `worker/check_runner.go` and its test, and `cmd/server/main.go` (its prober line; the delivery lane also edits other lines of `main.go`, and the user resolves a conflict there when merging). Tasks that may run at the same time: the delivery lane (`main.go` only in common) and frontend tasks. No other probe task runs beside it.

## Operations used

None. No operation of `docs/openapi.yaml` is implemented. The reason it produces is the contract's `certificate_problem`; the options are `HttpCheck.certificate_check` (`enabled`, `min_days_left`, at least 1) and `ignore_certificate_errors`, which `createService` already saves.

## Behavior

### What exists

The prober's one shared client verifies certificates against the system roots (or the test hook `roots`), with TLS 1.2 as the minimum, on the first request and on every redirect; any certificate error is `certificate_problem`. There is no expiry check and no setting that turns verification off. `createService` saves `cert_check_enabled`, `cert_min_days_left` and `ignore_cert_errors`, and rejects both options for a URL that is not `https` and a minimum below 1.

### The check

`domain.HTTPCheck` gains `CertificateCheck bool`, `CertMinDaysLeft int` and `IgnoreCertificateErrors bool`. `NewHTTPProber` takes a clock as a third argument: `NewHTTPProber(maxRedirects, maxBodyBytes int, clk clock.Clock)`; `main.go` passes `clock.Real{}` (and the arguments of `http-json-rules`); every caller (the probe tests) is updated. The runner fills the fields from the service: `CertificateCheck` from `CertCheck`, `IgnoreCertificateErrors` from `IgnoreCertErrs`, and `CertMinDaysLeft` from `*CertMinDaysLeft` when `CertCheck` is on and the pointer is not nil, otherwise 0.

**Ignore certificate errors.** The prober has two clients, built once on first use from one function and identical except for the TLS verification: the existing one, which verifies, and a second one for a check with `IgnoreCertificateErrors`, whose TLS configuration does not verify the certificate chain or the host name (TLS 1.2 still the minimum). Both take the test hook `roots` (the trusted roots), and both take the injected clock as the time chain verification uses (`tls.Config.Time` is the clock's `Now`), so that verification and the expiry check agree about "now"; with `clock.Real` in production this changes nothing. A check uses the second one for its first request and for every redirected request, and the redirect policy and every other rule of `http-request-send` apply to both. With it on, no certificate error is `certificate_problem`: an invalid, self-signed, expired or mismatched certificate is accepted. It does not turn off the expiry check, and the expiry check still sees the certificate.

**The expiry check.** With `CertificateCheck` on, after a response is in hand and before the body is read:

1. If the final response was not received over TLS (a redirect led to an `http` URL), the expiry check does not apply and the check goes on to the rules and the status as before.
2. Otherwise take the certificate the server presented for that connection (the first of the response's peer certificates, the leaf; the peer certificates are present also when verification is skipped). The response body is closed on this path as on every other. The days left are the whole days from the clock's `Now()` to the certificate's `NotAfter`: the duration divided by 24 hours, truncated toward zero; a certificate that has already expired has 0 days left. (A certificate with 13 days and 23 hours left has 13 days left.)
3. If the days left are fewer than `CertMinDaysLeft` (`days < min`): unhealthy, `certificate_problem`, nothing else. Exactly the minimum is fine.

The result order of one attempt is therefore: a failure to get a response (`timed_out`, `certificate_problem` for a chain or host that is rejected and not ignored, `too_many_redirects`, `could_not_connect`, the caller's context error); then the expiry check, whatever the status and without reading the body (a certificate that is too close to expiry is reported before a matching JSON rule or a non-2xx status: it is the connection's problem and is found first); then the rules, the status and the rest exactly as `http-json-rules` ordered them.

A failed certificate check is an ordinary failed attempt: the runner retries it up to the service's retry count (FR-51) and records the last result.

### Known gaps

- **Only the final response's certificate is checked** for expiry; a redirect hop with a certificate that is close to expiry is not.
- **A redirect to `http` skips the expiry check** silently, so a check can be healthy with the option on.
- **One reason covers both** a certificate that is rejected and one that is too close to expiry: `certificate_problem` (FR-61 lists one); the admin cannot tell them apart from the reason, and the days left are not shown.
- **Whole days, truncated:** a certificate with 14 days and 1 hour left and a minimum of 15 fails; one with exactly 15 days passes.
- **With errors ignored, the host name is not verified** at all, so a certificate for another host is accepted (FR-64 says certificate errors are ignored).
- **No lint rule fires** for turning verification off: `backend/.golangci.yml` does not enable gosec or nolintlint, so no suppression is needed and none should be added.
- **The clock is the prober's own** (the one given to the constructor): "now" for the days is read when the response is in hand, and the same clock is the time chain verification uses.

## Structure

By `ARCHITECTURE.md` ("Interfaces"; `adaptor/` holds no business rules: the expiry comparison is the protocol-level reading of a connection, and whether a service is unhealthy is decided by the usecase that records the result).

- `domain/check.go`: the three new fields of `HTTPCheck`.
- `adaptor/probe/http.go`: the second client, the choice by the check's setting, the expiry check and its place in the result order. Keep the two clients built from one function so they differ only in the TLS verification. `probe` imports `domain`, `pkg/clock` and the standard library only.
- `worker/check_runner.go`: the mapping. `cmd/server/main.go`: the third constructor argument.

No new package, interface, dependency or configuration.

## Dependencies

None. The standard library only (`crypto/tls`); `go.mod` and `go.sum` do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed. Probe tests use `testutil.TargetServer` with `testutil.TargetTLS()`, may use real deadlines of at most 200 ms (`TESTING.md`), and set "now" with `clock.Fake` (the receiver's certificate expires in 2084, so a fake clock set to a time a known number of days before its `NotAfter`, read from the server's certificate, gives a known number of days left); no `time.Sleep`. Run them with `-race`.

**Ignore certificate errors**

- A TLS receiver whose certificate is not trusted: with the option off the check is `certificate_problem` (the existing behavior); with it on the check is healthy (FR-64).
- A certificate for another host name (the receiver reached as `localhost`, its certificate naming `127.0.0.1`, with the test roots set): `certificate_problem` with the option off, healthy with it on (FR-64).
- An expired certificate (the test roots set, the fake clock after `NotAfter`, which is also the time chain verification uses) with the option off: `certificate_problem`; with the option on and the expiry check off: healthy (FR-64). The first half fails if verification used the real clock; the second fails if the option is not applied.
- Redirects: a plain-HTTP receiver that redirects to the untrusted TLS receiver is `certificate_problem` with the option off and healthy with it on; a chain whose second hop is the untrusted TLS receiver likewise (FR-64: redirects included).
- The option on does not change anything else: a `500` over the untrusted TLS receiver is `non_2xx_status`; the saved headers are sent on the redirected request as `http-request-send` requires; the redirect limit still fails as `too_many_redirects`.
- Two checks at the same time on one prober, one with the option on and one with it off, against the same untrusted receiver, under `-race`: the first is healthy and the second `certificate_problem`; neither client's setting leaks to the other.

**Expiry check**

- 13 days and 23 hours left with a minimum of 14: `certificate_problem`; exactly 14 days (336 hours) left with a minimum of 14: healthy; 14 days and 1 hour left with a minimum of 15: `certificate_problem`; well over the minimum: healthy (FR-50, whole days truncated).
- An expired certificate (any time after `NotAfter`) with the check on and errors ignored: `certificate_problem` (0 days left, minimum at least 1) (FR-64).
- With the check off, a certificate one day from expiry is healthy; with the option on but errors verified (the test roots set), the same (FR-34, FR-50).
- With the check on and the certificate not trusted and the option off: `certificate_problem` from the chain (no change); with the option on and the days enough: healthy.
- The expiry result comes before the body and the status: a certificate too close to expiry with a `200` and JSON rules whose body does not match is `certificate_problem`; with a `500` it is `certificate_problem` (not `non_2xx_status`); with a matching JSON rule it is `certificate_problem` (not `json_rule_matched`) (the order above).
- A redirect from the TLS receiver to a plain-HTTP receiver with the check on: the expiry check does not apply and the result is the status of the final response (the known gap, pinned).
- The days are counted from the injected clock: changing the fake clock's time changes the result for the same receiver.
- `CertMinDaysLeft` of 0 with the check on: nothing is too close (the saved minimum is at least 1; the zero value never fails a check).

**Runner (`worker/check_runner_test.go`)**

- A service with `CertCheck` on and `CertMinDaysLeft` 14 and the ignore flag on gives the prober an `HTTPCheck` with `CertificateCheck` true, `CertMinDaysLeft` 14 and `IgnoreCertificateErrors` true, for every attempt; a service with `CertCheck` off (and a nil or non-nil minimum) gives `CertificateCheck` false and `CertMinDaysLeft` 0; a service with `CertCheck` on and a nil minimum gives 0 (no panic).
- A `certificate_problem` first attempt followed by a healthy second one is recorded healthy, and one that fails every attempt is recorded as `certificate_problem` after the last (the existing retry rule, shown with this reason) (FR-51).
- The existing tests pass with only their setup changed; the whole-struct assertion still holds for a service with none of the options.

**Probe, existing tests**

- Every existing test of `http_test.go` passes with only its setup changed (the third constructor argument, a `clock.Real{}` or a fake clock); no assertion is changed or removed.

**Wiring (`cmd/server/main.go`, read by the verifier; there is no test of `main`)**

- `probe.NewHTTPProber` gets `cfg.Limits.MaxRedirects`, `cfg.Limits.ResponseBodyMaxBytes` and `clock.Real{}`.

**Repo-wide**

- `make check` passes (including the Go lint).
- `git diff` shows no change to `go.mod`, `go.sum`, `.env.example`, `platform/config`, the lint configuration, a migration or any file outside the allowed paths; no configuration key was added.

## Verifier checks

- **Layering, by reading imports:** `adaptor/probe` imports `domain`, `pkg/clock` and the standard library only; `worker/` imports `domain` and `pkg/clock` only.
- **Verification only off where asked:** by reading, the only place a TLS configuration skips verification is the second client, used only when the check's setting is on; the default client verifies as before; no global or shared setting is toggled per check.
- **The expiry check:** it reads the leaf of the final response's connection, uses the injected clock and not `time.Now`, truncates to whole days, treats an expired certificate as 0 days, and sits before the body read and the status judgment.
- **Time:** no `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` outside tests, `pkg/` and `cmd/`.
- **Logs:** the prober logs nothing; no certificate detail reaches a log.
- **No suppression:** no `nolint` directive was added and the lint configuration is unchanged; `bodyclose` is satisfied (the response body is closed on the expiry path).
- **Superseded rule:** the second client is the only place verification is skipped (`InsecureSkipVerify` appears once, under that setting); the old `http-probe` check that it appears nowhere is superseded for this one place by FR-64.
- **Mutation checks to run:** verify even when the option is on; ignore errors when it is off; use the insecure client for the first request only; share one client for both settings; use `time.Now`; verify the chain with the real clock instead of the injected one; round the days up or compare with `<=`; skip the expiry check when the option is on; check the expiry only when the chain is trusted; run the expiry check after the body or the status; count an expired certificate as negative days; apply the expiry check to a plain-HTTP final response; report `could_not_connect` instead of `certificate_problem` for a close expiry; read the minimum from the wrong field. Each must fail at least one named test.
- **Inputs to try:** a self-signed receiver with the option on and off; an expired certificate with and without the expiry check; 13 days 23 hours and exactly 14 days with a minimum of 14; a redirect from TLS to plain HTTP and from plain HTTP to TLS; a name mismatch; a `500` over TLS with a close expiry; two concurrent checks with different settings; the expiry check with a JSON rule that matches.
- **What the verifier cannot prove:** behavior against real certificate authorities and real certificates, and a certificate that expires while a check is in progress; say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a migration, a configuration key, a change to the lint configuration, or an edit to a spec file.
- `http-request-send` or `http-json-rules` is not merged, or a name this file takes from them is missing.
- The standard library cannot give the leaf certificate of the final response, or two clients that differ only in verification, without a design that shares state between concurrent checks.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
