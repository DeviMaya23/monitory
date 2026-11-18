# Plan: http certificate options

Prerequisites checked on the branch: `HTTPCheck` JSON fields, `NewHTTPProber(maxRedirects, maxBodyBytes)`, `Service.CertCheck/CertMinDaysLeft/IgnoreCertErrs`, `pkg/clock`, `roots` hook and `testutil.TargetTLS` all exist.

Files: `backend/internal/adaptor/probe/http.go` + `http_test.go` (P), `backend/internal/worker/check_runner.go` + `check_runner_test.go` (R), `domain/check.go`, `cmd/server/main.go`.

## Ignore certificate errors (P)
- [x] Untrusted receiver: off = certificate_problem, on = healthy — `TestCertOptions_IgnoreErrors/untrusted`
- [x] Host name mismatch — `.../host_name_mismatch`
- [x] Expired certificate, fake clock drives chain verification — `.../expired_certificate`
- [x] Redirects (http→TLS, second hop) — `.../redirect_from_plain_http`, `.../second_hop_is_untrusted`, `.../a_TLS_to_TLS_redirect_chain`
- [x] Option on changes nothing else (500, headers on redirect, redirect limit) — `.../a_500_is_still_non_2xx_status`, `.../saved_headers_go_on_the_redirected_request`, `.../the_redirect_limit_still_applies`
- [x] Concurrent checks, different settings, `-race` — `.../concurrent_checks_with_different_settings`

## Expiry check (P)
- [x] Whole days truncated (13d23h/14, 14d/14, 14d1h/15, well over) — `TestCertOptions_ExpiryDays`
- [x] Expired + errors ignored = certificate_problem — `TestCertOptions_ExpiredCountsAsZero`
- [x] Check off / option on with errors verified: one day left healthy — `TestCertOptions_CheckOffIgnored`
- [x] Untrusted: off = chain failure; on with enough days = healthy — `TestCertOptions_UntrustedWithExpiryCheck`
- [x] Expiry before body/status (200 no match, 500, matching rule) — `TestCertOptions_ExpiryBeforeBodyAndStatus`
- [x] TLS → plain HTTP redirect skips expiry — `TestCertOptions_RedirectToPlainHTTPSkipsExpiry`
- [x] Days counted from injected clock — `TestCertOptions_UsesInjectedClock`
- [x] Min 0 never fails — `TestCertOptions_ZeroMinNeverFails`

## Runner (R)
- [x] Mapping of the three fields, every attempt — `TestRun_PassesCertificateOptions`
- [x] Off / nil minimum gives 0 — `TestRun_CertificateOptionsOffOrNilMinimum`
- [x] certificate_problem retried then healthy; all fail recorded — `TestRun_CertificateProblemRetried`
- [x] Existing tests pass, setup only changed — existing tests untouched

## Existing probe tests
- [x] Only the constructor argument changed — `http_test.go`

## Wiring
- [x] `main.go` passes `cfg.Limits.MaxRedirects`, `cfg.Limits.ResponseBodyMaxBytes`, `clock.Real{}`

## Repo-wide
- [x] `make check` passes
- [x] No change outside allowed paths

## Integration tests
- `make test-integration`: not run: no integration test applies (the probe and worker have none; the task says none applies)


`make check`: passed (needed `npm ci` in `frontend/` first).

## Judgment calls
- Both clients are built together in one `sync.Once` (the task said "built once on first use"); the lenient client is simply unused for verifying checks.
- `certificateTooClose` treats a TLS response with no peer certificates as "does not apply" rather than failing.
- Days are `int(duration / 24h)` clamped at 0, so an expired certificate counts as 0 and, with a minimum of at least 1, fails.
- `CertMinDaysLeft` is only copied when `CertCheck` is on, as the task says; the runner test also pins "off with a minimum" and "on with no minimum".
- Probe tests read `NotAfter` via `ts.Client()` rather than changing `testutil`.
- Existing `http_test.go` tests changed only by the added constructor argument and the `clock` import.
