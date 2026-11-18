# Plan: http certificate options

Prerequisites checked on the branch: `HTTPCheck` JSON fields, `NewHTTPProber(maxRedirects, maxBodyBytes)`, `Service.CertCheck/CertMinDaysLeft/IgnoreCertErrs`, `pkg/clock`, `roots` hook and `testutil.TargetTLS` all exist.

Files: `backend/internal/adaptor/probe/http.go` + `http_test.go` (P), `backend/internal/worker/check_runner.go` + `check_runner_test.go` (R), `domain/check.go`, `cmd/server/main.go`.

## Ignore certificate errors (P)
- [ ] Untrusted receiver: off = certificate_problem, on = healthy — `TestCertOptions_IgnoreErrors/untrusted`
- [ ] Host name mismatch — `.../hostname_mismatch`
- [ ] Expired certificate, fake clock drives chain verification — `.../expired`
- [ ] Redirects (http→TLS, second hop) — `.../redirect_first_hop`, `.../redirect_second_hop`
- [ ] Option on changes nothing else (500, headers on redirect, redirect limit) — `.../still_non_2xx`, `.../headers_on_redirect`, `.../redirect_limit`
- [ ] Concurrent checks, different settings, `-race` — `.../concurrent`

## Expiry check (P)
- [ ] Whole days truncated (13d23h/14, 14d/14, 14d1h/15, well over) — `TestCertOptions_ExpiryDays`
- [ ] Expired + errors ignored = certificate_problem — `TestCertOptions_ExpiredCountsAsZero`
- [ ] Check off / option on with errors verified: one day left healthy — `TestCertOptions_CheckOffIgnored`
- [ ] Untrusted: off = chain failure; on with enough days = healthy — `TestCertOptions_UntrustedWithExpiryCheck`
- [ ] Expiry before body/status (200 no match, 500, matching rule) — `TestCertOptions_ExpiryBeforeBodyAndStatus`
- [ ] TLS → plain HTTP redirect skips expiry — `TestCertOptions_RedirectToPlainHTTPSkipsExpiry`
- [ ] Days counted from injected clock — `TestCertOptions_UsesInjectedClock`
- [ ] Min 0 never fails — `TestCertOptions_ZeroMinNeverFails`

## Runner (R)
- [ ] Mapping of the three fields, every attempt — `TestRun_PassesCertificateOptions`
- [ ] Off / nil minimum gives 0 — `TestRun_CertificateOptionsOffOrNilMinimum`
- [ ] certificate_problem retried then healthy; all fail recorded — `TestRun_CertificateProblemRetried`
- [ ] Existing tests pass, setup only changed — existing tests untouched

## Existing probe tests
- [ ] Only the constructor argument changed — `http_test.go`

## Wiring
- [ ] `main.go` passes `cfg.Limits.MaxRedirects`, `cfg.Limits.ResponseBodyMaxBytes`, `clock.Real{}`

## Repo-wide
- [ ] `make check` passes
- [ ] No change outside allowed paths

## Integration tests
- `make test-integration`: not run yet (this task touches no code with integration tests: probe and worker have none)

