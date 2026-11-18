# Verification report: http certificate options

Branch: `verify/http-certificate-options` (the builder's `feat/http-certificate-options` at `890cc9e`, plus three boundary rows added to `TestCertOptions_ExpiryDays`).

**Result: no Blocking findings.**

- `make check`: passed. The first run stopped at `lint-frontend` (`eslint: command not found`) because the checkout had no frontend dependencies. After `npm ci` in `frontend/` it passed: Go lint 0 issues, Go tests with `-race`, 641 frontend tests, build.
- `go test -race -count=5` on `adaptor/probe` and `worker`: passed, no flake.
- Integration tests: **not run**. `make test-integration` could not start its Mailpit container because host port 1025 is already allocated (most likely another session's Mailpit; I did not touch that process). I removed the containers and network my attempt created. The only integration-tagged tests are `adaptor/mailer/mailer_integration_test.go`, which this task does not touch. No criterion depends only on an integration test. `go test -race -tags integration` on `probe` and `worker` compiles and passes.
- Not provable here: behavior against real certificate authorities and real certificates, and a certificate that expires while a check is in progress.

## Criteria

"Real?" = would the named test fail if the behavior were removed? All answers are backed by a mutation run (see "Mutation checks") unless marked.

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| 1 | Untrusted cert: off is `certificate_problem`, on is healthy (FR-64) | `TestCertOptions_IgnoreErrors/untrusted_certificate` | Yes (killed by "ignore when off" and "verify when on") | Met |
| 2 | Name mismatch via `localhost`, roots set (FR-64) | `.../host_name_mismatch` | Yes | Met |
| 3 | Expired cert, fake clock past `NotAfter`: off is `certificate_problem`; on with expiry check off is healthy | `.../expired_certificate` | Yes. The real-clock-for-verification mutation fails it, so the first half does depend on the injected clock | Met |
| 4 | Redirects: plain to untrusted TLS, second hop untrusted | `.../redirect_from_plain_http`, `.../second_hop_is_untrusted`, `.../a_TLS_to_TLS_redirect_chain` | Yes (both clients forced to one setting fail them) | Met |
| 5 | Option on changes nothing else: 500 is `non_2xx_status`, headers on the redirected request, redirect limit | `.../a_500_is_still_non_2xx_status`, `.../saved_headers_go_on_the_redirected_request`, `.../the_redirect_limit_still_applies` | Mostly. They pass with the option on, so they pin the combination rather than a removed behavior; the other tests kill the mutations | Met |
| 6 | Concurrent checks, different settings, `-race` | `.../concurrent_checks_with_different_settings` | Yes (one-client mutations fail it) | Met |
| 7 | 13d23h/14 fails, exactly 14d/14 passes, 14d1h/15 fails, well over passes (FR-50) | `TestCertOptions_ExpiryDays` (run with ignore on and off) | Yes (round-up and `<=` mutations killed) | Met |
| 8 | Expired with check on and errors ignored: `certificate_problem` (FR-64) | `TestCertOptions_ExpiredCountsAsZero` | Yes ("skip expiry when option on" killed) | Met |
| 9 | Check off, 1 day left: healthy, also with errors verified (FR-34, FR-50) | `TestCertOptions_CheckOffIgnored` (with a baseline that fails with the check on) | Yes | Met |
| 10 | Untrusted + check on: off is chain failure, on with enough days is healthy | `TestCertOptions_UntrustedWithExpiryCheck` | Yes | Met |
| 11 | Expiry before body and status: 200 with non-matching rules, 500, matching rule | `TestCertOptions_ExpiryBeforeBodyAndStatus` (baselines show each case is judged otherwise with enough days) | Yes (both "after status" and "after body/rules" mutations killed) | Met |
| 12 | TLS to plain-HTTP redirect skips expiry (known gap, pinned) | `TestCertOptions_RedirectToPlainHTTPSkipsExpiry` | Yes | Met |
| 13 | Days counted from the injected clock | `TestCertOptions_UsesInjectedClock` | Yes (`time.Now` mutation killed) | Met |
| 14 | `CertMinDaysLeft` 0 with check on never fails | `TestCertOptions_ZeroMinNeverFails` | Yes. It is the only test that kills "expired = negative days" | Met |
| 15 | Runner: three fields mapped on every attempt | `TestRun_PassesCertificateOptions` | Yes | Met |
| 16 | Runner: off (nil or non-nil minimum) gives false and 0; on with nil gives 0, no panic | `TestRun_CertificateOptionsOffOrNilMinimum` | Yes | Met |
| 17 | Runner: `certificate_problem` retried then healthy; all fail recorded as `certificate_problem` (FR-51) | `TestRun_CertificateProblemRetried` | Partly real: it proves the runner's generic retry with this reason fed by a fake prober. The runner has no code specific to the reason, so it would also pass without any certificate work, which is the criterion's intent ("the existing retry rule shown with this reason") | Met |
| 18 | Existing probe/runner tests changed only in setup | `git diff b2a12c5 HEAD`: only the third constructor argument and the `clock` import changed in `http_test.go`; runner tests only added | n/a (diff reading) | Met |
| 19 | Wiring in `main.go` | Read: `probe.NewHTTPProber(cfg.Limits.MaxRedirects, cfg.Limits.ResponseBodyMaxBytes, clock.Real{})` | n/a (no test of `main`) | Met |
| 20 | Repo-wide: `make check`, no change outside allowed paths or to manifests | `git diff b2a12c5 HEAD --name-only` lists only allowed files plus the plan; `go.mod`, `go.sum`, `.env.example`, lint configuration and migrations unchanged | n/a | Met |

Requirement IDs: FR-34, FR-50, FR-64 are covered by rows 1 to 14 and are real. FR-61 (`certificate_problem` for a close expiry) by rows 7 to 11. FR-51 by row 17.

## Plan check

`docs/tasks/http-certificate-options.plan.md` was read after the table above.

- Every acceptance criterion appears in the plan. No criterion is missing.
- Every ticked item names a test that exists and checks the behavior.
- Differences between plan and diff: none. The plan says "existing tests untouched", but they were changed in the constructor argument only, which the task allows. The plan's judgment calls match the code: one `sync.Once` builds both clients, a TLS response with no peer certificate skips the check, days are clamped at 0, and the minimum is copied only when the check is on.
- The plan's integration line (not run, none applies) matches my finding.

## Rule checks

- **Layering:** `adaptor/probe` imports `domain`, `pkg/clock` and the standard library only. `worker/check_runner.go` imports `domain` and `pkg/clock` among project packages. OK.
- **Dependencies:** `go.mod` and `go.sum` unchanged, no version changed, nothing beyond the standard library.
- **Verification only off where asked:** `InsecureSkipVerify` appears once, in `newClient(skipVerify)` (`http.go:223`). It is set from a parameter, and only the second client passes `true`. The second client is returned only when `check.IgnoreCertificateErrors` is set. Nothing global or shared is toggled per check.
- **Two clients, one function:** they differ only in `skipVerify`. Both take `roots`, `Time: p.clock.Now`, TLS 1.2 and the same redirect policy.
- **Expiry check:** reads `PeerCertificates[0]` of the final response, uses `p.clock.Now()`, truncates to whole days, clamps an expired certificate to 0, and sits before the status and the body read. The response body is closed by the existing `defer`.
- **Time:** no `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` in `probe`; the runner's timer goes through the injected clock.
- **Logs:** the prober logs nothing.
- **Suppression:** no `nolint` directive added; lint configuration unchanged; lint reports 0 issues.
- **Tests:** new tests sit in the existing `http_test.go` and `check_runner_test.go`; no `_edge` or `_regress` files; real deadlines use the existing `longTimeout`; no `time.Sleep`.
- **Data scoping and transactions:** not applicable (no repository or usecase change).

## Mutation checks run

Each was applied to the source, `go test -race ./internal/adaptor/probe/ ./internal/worker/` run, and the source reverted. All were killed. The names after "killed by" are the first failing tests.

| Mutation | Killed by |
|---|---|
| Verify even when the option is on | `CheckOffIgnored`, `ExpiryBeforeBodyAndStatus` |
| Ignore errors when the option is off | `IgnoreErrors/*` including `concurrent_checks...` |
| One client for both settings (verifying) | `CheckOffIgnored`, `ExpiryBeforeBodyAndStatus` |
| One client for both settings (lenient) | `IgnoreErrors/*` |
| `time.Now` in the expiry check | `CheckOffIgnored`, `ExpiredCountsAsZero`, `ExpiryBeforeBodyAndStatus` |
| Real clock for chain verification (drop `Time`) | `IgnoreErrors/expired_certificate` |
| `<=` instead of `<` | `ExpiryDays/exactly_14_days...`, `ZeroMinNeverFails` |
| Round days up | `ExpiryDays/13_days_23_hours...`, `ExpiryDays/14_days_1_hour...` |
| Skip the expiry check when the option is on | `ExpiredCountsAsZero`, `ExpiryBeforeBodyAndStatus` |
| Check expiry only when the chain is trusted (same shape) | `ExpiredCountsAsZero`, `ExpiryBeforeBodyAndStatus` |
| Expiry after the status | `ExpiryBeforeBodyAndStatus/500` |
| Expiry after the body and rules | `ExpiryBeforeBodyAndStatus/a_matching_rule` |
| Expired counts as negative days | `ZeroMinNeverFails` (only this one) |
| Expiry applied to a plain-HTTP final response | `RedirectToPlainHTTPSkipsExpiry` |
| `could_not_connect` instead of `certificate_problem` for a close expiry | `ExpiredCountsAsZero`, `ExpiryDays`, others |
| Runner: minimum read from the wrong field | `PassesCertificateOptions`, `CertificateOptionsOffOrNilMinimum` |
| Runner: ignore flag, cert-check flag unmapped | `PassesCertificateOptions`, `CertificateOptionsOffOrNilMinimum` |
| Runner: minimum copied when the check is off | `CertificateOptionsOffOrNilMinimum/off_with_a_minimum` |

Not run: "use the insecure client for the first request only". It cannot be expressed: a check picks one client and `http.Client` follows redirects with it. Tests 4 and 5 cover the redirect path and fail under both single-client mutations.

## Exploratory cases tried

Beyond the task file's list, I added three rows to `TestCertOptions_ExpiryDays` (they pass against the unmodified source):

- 14 days minus one second, minimum 14: fails.
- Exactly 1 day, minimum 1: healthy.
- 1 day minus one second, minimum 1: fails.

I ran the probe and worker tests five times under `-race` with no failure. I did not run the built app against a live service; everything above is from tests against `httptest` receivers.

## Findings

### Blocking

None.

### Non-blocking

1. **Test quality: `TestRun_CertificateProblemRetried` cannot fail on certificate behavior.** The runner has no reason-specific logic, so the test duplicates the generic retry test with a different code. Category: test quality. Matters when: the runner starts treating some failure reasons differently (for example no retry for a certificate problem). Until then, report only.
2. **Latent bug, two reasons share one code.** An expired or untrusted certificate and a certificate too close to expiry are both `certificate_problem`, as the task's known gaps say. Category: decision needed. Matters when: the frontend task for the FR-61 wording is drafted and wants to show which one it was. The days left are not recorded either.
3. **Latent bug, only the final hop is checked and an `http` redirect skips the check.** Known gaps, pinned by `RedirectToPlainHTTPSkipsExpiry`. Category: decision needed. Matters when: a monitored HTTPS URL redirects to another host that holds the certificate the admin cares about. Report only.
4. **Latent bug, a TLS response with no peer certificate is treated as "does not apply".** The task is silent. In practice a TLS response always carries the leaf, so this is not reachable today. Category: latent bug. Matters when: the transport is changed in a way that drops `PeerCertificates` (the check would then pass silently). Report only.
5. **Test quality: "option on changes nothing else" tests (row 5) pass with the option on and have no off baseline.** Their value comes from the other tests killing client-mixing mutations. Category: test quality. Matters when: a refactor adds a third client or per-check transport options. Report only.
6. **Dependency of FR-104.** The test-before-saving task will build an `HTTPCheck` from form values and must set the three new fields. Category: decision needed. Matters when: that task is drafted.

## Docs or specs that no longer match

- `docs/tasks/http-probe.md` (lines 15 and 20) still says "the ignore certificate errors option is not built here" and, per this task's Prerequisite, that `InsecureSkipVerify` appears nowhere in `adaptor/probe`. FR-64 v0.15 and this task supersede that for the second client. It is a historical task record; mark it superseded if it is used as a reference.
- `STACK.md`: nothing to record. No dependency was added and no version changed (standard library `crypto/tls` only).
- `docs/openapi.yaml`, `docs/requirements.md`: no mismatch. `certificate_problem` and the two options already exist in the contract.
- `docs/tasks/backlog.md` line 28 (FR-34, FR-50, FR-64): the probe half is now done; the service-form half stays open.
