# Verification report: test-service-check API

Branch: `verify/test-service-check-api`. It was reset to the builder's `feat/test-service-check-api` (`b4f671f`) and carries two test commits on top. Verdict: **no Blocking findings**.

Verified with `make check` (passed, exit 0, after `npm ci` in `frontend/`), and by reading the diff, mutation checks, and a live run of the built binary.

## Criteria

"Real?" asks whether the named test would fail if the behavior were removed. Yes means I broke the behavior and the test failed (see "Mutation checks"). Where I found a gap, the row says so and what I did about it.

| # | Criterion | Test | Real? | Verdict |
|---|---|---|---|---|
| P1 | `TestHTTP` gives the same verdicts as `CheckHTTP` over one route table | `TestTestHTTP_SameVerdictAsCheckHTTP` (16 rows) | Yes for divergence (cert ignored in test mode and `tooLarge` ignored in test mode both killed). It cannot catch a change to the shared judge, which is by design: `TestCheckHTTP_JSONRules` catches that (killed) | Met (FR-104) |
| P2 | 2xx with body, no rules: status, whole body, not truncated; 404, 500, cert problem and rule match keep status and body | `TestTestHTTP_StatusAndBody` | Yes (body read only with rules: killed) | Met (FR-104, exception to FR-73) |
| P3 | Truncation boundary at 10 / 11 / empty | `TestTestHTTP_BodyLimit` | Yes (`>` to `>=` killed; no cut killed) | Met (FR-104) |
| P4 | No response gives nil status, empty body | `TestTestHTTP_NoResponse` (closed port, timeout before headers, too many redirects) | Yes (status set on the no-response path: killed) | Met |
| P5 | Stalled body, no rules: same verdict as `CheckHTTP`, status, partial body | `TestTestHTTP_StalledBodyWithoutRules` | Yes (read error judged without rules: killed) | Met (task, probe item 3) |
| P6 | Caller cancelled during that stalled body read: context error, empty outcome | `TestTestHTTP_CallerContext/cancelled during a stalled body` | **Was not real**: the cancel fired as soon as the server flushed, often before the client had the headers, so the error came from the request path and removing the body-path check survived. I added a 50 ms wait; the mutation is now killed | Met, test fixed (F2) |
| P7 | Caller context cancelled or already ended | `TestTestHTTP_CallerContext` (already cancelled, deadline passed, during request) | Yes (guard at the top, and the request-path classification) | Met |
| P8 | `CheckHTTP` tests pass unchanged; the stalled-2xx test "proves CheckHTTP does not read a body without rules" | `TestCheckHTTP_JSONBodyReadInsideTimeout` | **Not real for that claim**: with `CheckHTTP` reading the body always, the test still passed (a no-rules verdict ignores the read, so the result is the same). I added `TestCheckHTTP_NoRulesDoesNotReadStalledBody`; the mutation is now killed | Met, test added (F1) |
| U1 | Healthy HTTP: every field reaches the prober, three certificate fields on and off; status, body and flag returned | `TestTestServiceCheck_HTTPAttempt` | Yes (dropped `CertificateCheck`, `CertMinDaysLeft` and `IgnoreCertificateErrors` one by one: all killed) | Met (finding of `http-certificate-options`) |
| U2 | Trimming (URL, TCP host, header names and values, query names, rule fields) | `TestTestServiceCheck_Trims` | Yes (normalize call removed: killed) | Met |
| U3 | Default timeout and given timeout | `TestTestServiceCheck_Timeout` | Yes (literal 10 instead of the configured default: killed) | Met |
| U4 | TCP: one `CheckTCP`, no `TestHTTP`, no status or body | `TestTestServiceCheck_TCP` | Yes by assertions on both fakes' calls (not mutated) | Met |
| U5 | Failed attempt is a result, each code | `TestTestServiceCheck_FailureIsAResult` (7 codes, HTTP and TCP) | Yes (failure returned as error: killed) | Met (FR-61 in part) |
| U6 | No retry, no timer or wait | `TestTestServiceCheck_NoRetry` | Partly: asserts one call, no pending timer and an unmoved clock. A retry loop would add calls, so it would fail. Not mutated | Met |
| U7 | Duration 1234 ms, 1999 µs, 0 | `TestTestServiceCheck_Duration` | Yes (negative clamp removed: killed) | Met |
| U8 | Body made valid UTF-8 | `TestTestServiceCheck_BodyIsValidUTF8` | Yes (conversion removed: killed) | Met (NFR-7) |
| U9 | Validation matches a save, per rule, same order, prober not called; timeout 0 and over the maximum are `out_of_range`; boundaries accepted; other settings ignored; empty name fine | `TestTestServiceCheck_ValidationMatchesSave` (25 rows), `_TimeoutRange` (0, 1, 21, -5 refused; 2 and 20 accepted), `_OnlyTheTimeoutIsChecked` | Yes for the check rules and the timeout (range check removed: killed). "Ignore other settings" cannot fail as written: `ServiceTestInput` has no such fields, so it holds by the type; the handler test below covers the mapping | Met (FR-106) |
| U10 | Nothing can write | `newCheckTester` builds with two probers, clock, limits; reading check | Held by reading: no repository, recorder, dispatcher or scheduler in the file's imports or constructor | Met (FR-105) |
| U11 | Ended context: context's error, no result; probe error wrapped (`ErrorIs`) | `TestTestServiceCheck_Errors` | Partly, now yes: removing the "context wins" branch survived because the wrapped error still satisfies `ErrorIs`. I added a row where the probe returns its own error while the context is cancelled; the mutation is now killed | Met, test added (F3) |
| U12 | `validateSettings` gives the same errors for a save | existing `service_validation_test.go` | Passes unchanged (`make check`); the shared helper is exercised by both paths | Met |
| H1 | 200 healthy: `healthy`, `duration_ms`, `http_status`, `response_body`, no `failure_reason` | `TestTestServiceCheck_Healthy` | Yes (JSON compared whole; conformance to the contract) | Met |
| H2 | 200 failed: reason code, nested `http_status` only for `non_2xx_status`, `json_rule_field` only for `json_rule_matched`, top-level status and body, truncated flag | `TestTestServiceCheck_Failed` (4 rows) | Yes (nested status mapping removed: killed; flag removed: killed) | Met (FR-61) |
| H3 | TCP result has no status or body, flag false | `TestTestServiceCheck_TCPResultHasNoStatusOrBody` | Yes by whole-JSON compare | Met |
| H4 | Body returned unchanged as a JSON string, JSON content type | `TestTestServiceCheck_BodyIsReturnedAsText` | Yes (round trip of HTML, script, quotes, backslash) | Met (NFR-7) |
| H5 | Spy receives the mapped input; timeout only from `settings` | `TestToServiceTestInput` (7 rows) | Yes (timeout mapping removed: killed) | Met |
| H6 | 422 with every field; 500 with text hidden | `TestTestServiceCheck_Errors` | Yes (asserts the whole body and the absence of the secret text) | Met (FR-106) |
| H7 | Gate failures never reach the spy: 401, 403, 413, 415, 400 (no body, malformed JSON, malformed check) | `TestTestServiceCheck_RouterRules` | Yes: the spy is asserted empty, and the control row shows the same request does reach it | Met (NFR-8) |
| H8 | No log line on success; a 500 gets the router's line | `TestTestServiceCheck_LogsNothingOnSuccess` | Yes: the same capture shows a line for a 500 | Met |
| H9 | 204: empty `response_body` present, `http_status` present | `TestTestServiceCheck_EmptyBodyWithAStatus` | Yes (status gated on a non-empty body: killed) | Met |
| R1 | `make check` passes | ran | Passed on this branch (see below) | Met |
| R2 | Nothing outside the allowed paths changed | `git diff main...HEAD --stat` | All 16 files are in the allowed list or the plan file; no `go.mod`, `go.sum`, `.env.example`, `Makefile`, `docs/openapi.yaml` or `worker/**` change | Met |

## Commands run

- `make check`: passed, exit 0 (golangci-lint 0 issues, backend tests with `-race`, frontend lint and tests, builds, contract lint). The builder's plan says one frontend test (`TargetDialog.test.tsx`) failed 3 of 3 full runs there; it passed in my run. See N3.
- Probe and usecase packages three times under `-race`: passed. Handler package three times under `-race`: passed (about 206 s).
- `make lint-backend` after my test edits: 0 issues.
- Integration tests: **not run**. The only integration-tagged file is `adaptor/mailer/mailer_integration_test.go` (Mailpit), which this task does not touch, and the Docker daemon is not running here. No criterion of this task depends on an integration test: all are unit tests against fakes, spies and in-process stub servers.

## Plan check (`test-service-check-api.plan.md`, read after the criteria)

- Every acceptance criterion has an item in the plan. Nothing is missing.
- Ticked items whose named test does not exist under that name (the behavior is tested under another name): `TestTestServiceCheck_BodyUTF8` (is `_BodyIsValidUTF8`), `TestTestServiceCheck_OtherSettingsIgnored` (is `_OnlyTheTimeoutIsChecked`), `newServiceTester` (is `newCheckTester`), and in the handler `_BodyIsText`, `_GateFailures`, `_NoLog` (are `_BodyIsReturnedAsText`, `_RouterRules`, `_LogsNothingOnSuccess`). `_TCP` and `_EmptyBody` match only as prefixes of the real names. See N1.
- Ticked items whose test does not check the behavior: three were weak (P6, P8 and U11 above); I strengthened them.
- The plan leaves "`make check`" unticked, with a note about the frontend test. It is green on my run.
- Differences between plan and diff: none in behavior. The judgment calls the plan lists match the code (`HTTPTestOutcome` embeds `CheckResult`; one U+FFFD per invalid byte; context error wins whatever the probe returned; body read for `TestHTTP` even when the certificate is too close).

## Rule checks (by reading the diff)

- **ROLES / STACK dependencies:** no `go.mod` or `go.sum` change; imports are the standard library and in-repo packages; no version adopted.
- **Layers:** `service_tester.go` imports `context`, `fmt`, `time`, `unicode/utf8` and `domain` only: no repository, recorder, dispatcher, scheduler or adaptor. Its constructor takes two probers, a clock and the limits. The handler maps and holds no rules. The adaptor holds no rule beyond the judgment `CheckHTTP` already had.
- **Shared, not copied:** `attempt` is the one request, judgment and classification behind `CheckHTTP` and `TestHTTP`; `judge` and `classifyOutcome` are shared; `normalizeServiceInput`, `validateCheck` and `validateTimeout` (one helper, also used by `validateSettings`) are called, not copied; `toAPIFailureReason` is called by `toAPIState` and by the test mapping.
- **`CheckHTTP` unchanged for a check without rules:** the read is guarded by `forTest || (hasRules && !certProblem)`, which is false for `CheckHTTP` without rules; confirmed by the new test (F1).
- **Body limit:** `p.maxBodyBytes`; no literal 64 KB or 65536 in the diff.
- **No new configuration key**; the handler adds no status or field the contract lacks (200, 400, 401, 403, 413, 415, 422, 500 only).
- **Logging:** no logger is used in the new code; the live run's log held no URL, header or body. The usecase's error text is the fixed text `run the check test:` followed by the probe's error.
- **Data scoping and transactions:** not applicable (no repository, no transaction).
- **Gate:** the operation is covered by `TestTestServiceCheck_RouterRules` (401 without a session, 403 without the token); confirmed live.
- **Test files:** all tests are in the existing files for their code; no `_edge` or `_regress` file.

## Mutation checks run (each reverted; `git status` clean afterwards)

Killed: drop `CertificateCheck`; drop `CertMinDaysLeft`; drop `IgnoreCertificateErrors`; read body only with rules; `>` to `>=` at the truncation boundary; no cut at the limit; skip the trim; failed attempt returned as an error; invalid-UTF-8 conversion removed; duration clamp removed; timeout default as a literal; timeout range check removed; handler timeout mapping removed; truncated flag removed; non-2xx status in the reason removed; status shown only for a non-empty body; `TestHTTP` ignores the certificate verdict; `TestHTTP` ignores `tooLarge`; judge reorders status before rules (killed by `TestCheckHTTP_JSONRules`, not by the table); read error judged without rules; status set when no response arrived.

Survived at first, now killed by tests I added or fixed: `CheckHTTP` reads the body always (F1); the usecase ignores "context ended wins over the probe's error" (F3); body-read cancellation check removed in `TestHTTP` (F2).

Not mutated: "ignore other settings" (cannot be mutated without changing the input type, see U9).

## Live run

Built `cmd/server` and ran it with a temporary database on `127.0.0.1`, `REQUIRE_HTTPS=false`, against a local Python target server (plain and TLS with a self-signed certificate). Signed in with `curl` and called `POST /api/service-tests`:

- 200 `ok`, 204 (empty body present, status 204), 404 (`non_2xx_status` with 404, body `nope`), JSON rule match (`json_rule_matched` with the field, status and body kept).
- Body of exactly 65536 bytes: whole, not truncated. 65537 bytes: 65536 bytes, truncated true. A redirect chain of two ending on a 70000-byte body: truncated at 65536. A chain of five: `too_many_redirects`, no status or body.
- Binary body (all 256 byte values, four times): 200, 2048 bytes back (invalid bytes replaced). HTML with a `<script>`: returned as text unchanged.
- Closed port: `could_not_connect`. TCP with `"  127.0.0.1  "`: healthy. TCP closed: `could_not_connect`.
- Self-signed HTTPS: `certificate_problem`, no status; with ignore on: healthy; with ignore on and 400 days required: `certificate_problem` with status and body (the certificate is valid about 365 days); with 30 days: healthy.
- Timeout 1 against a 3 s route: `timed_out` after 1000 ms. Timeout 60: accepted. Timeout 0 and 61: 422 `out_of_range` on `settings.timeout_seconds`, "The timeout is 1 to 60 seconds." Retry count 99 and interval 1 alongside: ignored, test runs.
- Invalid URL, missing check and unknown type: 422 with the save's fields and messages.
- No session: 401. Session without the token: 403.
- 12 concurrent tests of the redirect-to-large-body route: all 12 healthy, 65536 bytes, truncated.
- `listServices` read before and after the tests (with one saved service the runner had already checked): identical. The app's log contained no URL, header or body.

## Findings

### Blocking

None.

### Non-blocking

**F1. No test showed that `CheckHTTP` stays free of a body read for a check without rules.** Category: test quality. Fixed here: `TestCheckHTTP_NoRulesDoesNotReadStalledBody` (the caller cancels 50 ms after the headers; a probe that read the body would return the context error). Matters when: not any more; recorded because the task named the old test as the proof and it was not.

**F2. The builder's "cancelled during a stalled body" subtest raced.** Category: test quality. Fixed here (50 ms wait after the server flushes, 20 runs under `-race` passed; the mutation is killed). Matters when: not any more.

**F3. "An ended context wins over the probe's own error" was not tested.** Category: test quality. Fixed here (new row in `TestTestServiceCheck_Errors`; mutation killed). Matters when: not any more.

**N1. The plan's test names differ from the real ones in 6 items.** Category: test quality (the record, not the code). Matters when: someone searches the repository for a name in the plan.

**N2. A body of invalid UTF-8 comes back up to three times the limit.** Category: latent bug. One U+FFFD (3 bytes) replaces each invalid byte, so with the default limit a 65536-byte binary body returned a 196608-byte `response_body` in the live run (`response_body_truncated` false). The contract sets no `maxLength` on `response_body`, and the task's judgment call settles "one per byte", so this is not a violation. Matters when: the frontend or a proxy limits the size of an API response, or the limit is raised well above 64 KB.

**N3. A frontend test (`TargetDialog.test.tsx`, "adds a header row and focuses its name...", FR-92) timed out in the builder's full runs.** Category: test quality. It passed in my `make check`. No frontend file is changed here. Matters when: it fails on the merge's CI run or on the next frontend task. Report only otherwise.

**N4. `TestTestServiceCheck_OnlyTheTimeoutIsChecked` cannot fail by construction** (the input type carries no interval or retry fields). Category: test quality. Matters when: the input type gains those fields. Report only; the handler test covers that they are not mapped.

## Docs or specs that no longer match

- `docs/openapi.yaml`: the `testServiceCheck` description and the `response_body` and `response_body_truncated` descriptions say "64 KB". The limit is `RESPONSE_BODY_MAX_BYTES` (default 65536), and the same wording is in FR-73 and FR-104. It matches only at the default. `docs/openapi.yaml` and `requirements.md` were not changed.
- `docs/openapi.yaml`, `FR-106` in `docs/requirements.md`: "invalid settings" is read here as the check and the timeout (the user's decision in the task file); the other settings are not validated by a test. The wording of FR-106 does not say so.
- `docs/openapi.yaml` (`response_body`): says nothing about invalid bytes being replaced with U+FFFD; the usecase now does it.
- `docs/tasks/backlog.md` line 25: the "Test result area" row for `testServiceCheck` is still left to `service-test-panel`; no change needed until that task is drafted.
- `STACK.md`: no version adopted, nothing to update.
- `docs/tasks/test-service-check-api.plan.md`: the test names listed in N1.
