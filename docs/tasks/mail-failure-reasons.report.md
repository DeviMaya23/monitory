# Verifier report: mail-failure-reasons

**Branch:** `verify/mail-failure-reasons` (builder's work: `feat/mail-failure-reasons` at `3b35e00`, taken as the base)

**Result:** no Blocking findings. `make check` run, passed. Integration tests: **not run** (Docker is not available on this machine).

I changed tests only (see "Tests I added"). No source file changed.

## `make check`

Run, passed. The first run stopped at `eslint: command not found` because a fresh checkout has no `node_modules`; after `npm ci` in `frontend/` the whole run passed (golangci-lint 0 issues, Go tests with `-race`, 1045 frontend tests, builds, contract lint). Run again after my test additions: passed.

The mailer, worker, usecase, handler, domain and testutil packages were also run three times under `-race` (`-count=3`): all `ok`.

## Acceptance criteria

"Real?" = would the named test fail if the behavior were removed? "yes (M#)" refers to a mutation in "Mutation checks run".

| # | Criterion | Test | Real? | Verdict |
|---|---|---|---|---|
| 1 | `domain.FailureCause`: method, wrapped, `nil`, plain, outer wins | `domain` `TestFailureCause` (5 rows) | yes (M10) | met |
| 2 | Mailer: 15 scenario rows, each asserting cause, visible text, `ErrNotAccepted`, no address | `mailer` `TestSendEmail_Failures/<row>` | yes (M1, M2, M4, M8, M11–M13, M17) | met |
| 3 | The two `timed out` rows run 25 times under `-race` | `TestSendEmail_TimedOutIsStable` (25 loops × 2 cases; 100 ms timeout, the table's rows use 150 ms) | yes (M5: ignoring the deadline flag fails the greeting case) | met |
| 4 | Classifier unit tests, every listed row | `mailer` `TestClassify` | yes (M1, M2, M6, M7, M9, M11–M13) | met |
| 5 | Caller's context cancelled → context error, empty cause | `TestSendEmail_ContextCancelledWhileTheGreetingIsDelayed`, `TestSendEmail_ImplicitTLSStalledHandshake/a cancelled context ends it at once` | yes for the first (the cause assertion and `NotErrorIs(ErrNotAccepted)`); the builder had added the assertion to the first test only, I added it to the second | met |
| 6 | `ErrNotConfigured`: empty cause, text unchanged | `TestSendEmail_NotConfigured` | guard only: passes today because nothing sets a cause on it; fails if someone does | met |
| 7 | Every existing `err.Error()` assertion passes unchanged | `mailer_test.go` diff: `assert.Equal(t, notAcceptedText, err.Error())` kept; the only changed assertion line widens `NotContains` to the row's own recipient | n/a (checked by reading the diff) | met |
| 8 | Dispatcher: caused email logs `cause` and `reason` on the retried and the last line, no address | `worker` `TestSequence_LogsTheFailureCause` | yes (M14, M15) | met |
| 9 | No `cause` key for plain errors and webhooks | `TestSequence_FailFailSucceed`, `TestSequence_ZeroRetriesFailsAtOnce`, `TestSequence_LogsHoldIdsOnly` | yes (M16: always logging the key fails all three) | met |
| 10 | `abandoned`, `superseded`, `delivered` lines have no `cause` | `TestSequence_OtherLinesHaveNoCause` (abandoned, delivered); `TestSupersede_AttemptInProgress/a superseded failure with a cause logs no cause` (superseded, **added by me**) | yes (M17, M18) | met after my addition; the builder's tests did not cover `superseded` (see plan check) |
| 11 | Test alert usecase: cause set / empty for webhook, no-cause mailer, success, ended context | `usecase` `TestTestTarget_FailureCause` (5 subtests) | yes (M19, M20) | met |
| 12 | Handler: `cause` only when `delivered` is false and the cause is not empty; never the address, URL or reason; body unchanged | `handler` `TestTestTarget_LogsTheCauseOnlyOnAFailure` (3 rows), `TestTestTarget_FailedDeliveryWithACauseKeepsTheBodyShape`, the existing `…LogsOutcomeWithoutSecrets` and the pinned body test | yes for the log (M21, M22); the body tests are guards: the API response type has no cause field, so the body cannot change without a contract change | met |
| 13 | Fake server: `RejectSender` 550, `RejectData` 554, deliver nothing; defaults unchanged | `testutil` `TestSMTPServer_RejectsTheSender`, `TestSMTPServer_RejectsData`; the existing tests untouched | yes (M23, M24) | met |
| 14 | `make check` passes | run | n/a | met |
| 15 | Mailer integration test still passes if run | `TestMailpit_DeliversTheAlert` (`mailer_integration_test.go`, tag `integration`) | n/a | **not run** (see Integration tests) |
| 16 | Nothing outside the allowed paths changed | `git diff --name-only main...HEAD`: only the listed `backend/internal/**` files and `docs/tasks/mail-failure-reasons.plan.md`; `go.mod` and `go.sum` unchanged | n/a | met |

Requirement IDs: FR-85 and FR-107 (visible text unchanged) are pinned by criteria 2, 11, 12 (the text `the SMTP server did not accept the message` and `no SMTP account configured` are asserted in the mailer, usecase, handler body test). CONVENTIONS Logging (no address in a log line) is pinned by criteria 8 and 12 and by M15.

## Plan check (`mail-failure-reasons.plan.md`, read after the table)

- Every acceptance criterion appears in the plan. Nothing is missing.
- **Ticked item that overclaims:** "none on abandoned/superseded/delivered" was ticked, but no test checked `superseded`. I added one (criterion 10). Source was correct.
- **Wrong test name:** the plan says `TestAlertDispatcher_*`; the tests are `TestSequence_*` and `TestSupersede_*`. Cosmetic.
- **Ticked item that is half done:** "Caller's context cancelled … existing context tests" — only one of the two context tests got the assertion. Added (criterion 5).
- The 25-run check uses 100 ms where the table rows use 150 ms. Both are inside the 200 ms limit; not a problem.
- The plan's go-mail error table is vague for `CloseAtConnect` ("io.EOF-style errorString"). The row passes, so the classification is right; the type note is just loose.
- Differences between plan and diff: none otherwise. The five judgment calls in the plan match the code (`cause.go` is separate; `Timeout()` that is not a deadline error is `other`; `login needs TLS` decides on mode and error only; the table replaced the old rows; `FailureCauser` exported).

## Rule checks (by reading the diff)

- **Dependencies:** `go.mod`, `go.sum` unchanged; go-mail stays `v0.8.1`; no new import outside the standard library and packages already used (`crypto/tls`, `crypto/x509`, `net/textproto`, `os`, `io` are standard). `domain` imports only `errors`.
- **No text matching:** `cause.go` has no `strings` use; every decision is `errors.Is`, `errors.As` or a `switch` on a code or a `Reason`. No `strings.Contains` on an error anywhere in the diff.
- **Classification order** is as the task says: deadline, then TLS, `login needs TLS`, `login refused`, the three `SendError` reasons, then `could not connect`, then `other`.
- **Visible text unchanged in all four places:** `sentinel` still returns `reason.text`; the usecase still sets `FailureReason: err.Error()`; the handler still builds the body from `Delivered` and `FailureReason`; the dispatcher's `reason` field is still `err.Error()`.
- **Log lines:** the cause is a constant string from `cause.go` (or a test value); no wrapped error text reaches a log. Webhook paths untouched (`adaptor/webhook/**` not in the diff). `heldConn`, the dial and the TLS handling untouched; only `notAccepted`'s signature, its three callers and the `classify` call changed.
- **Layer boundaries (CONVENTIONS, ARCHITECTURE):** `worker` and `usecase` read the cause through `domain.FailureCause`, not the mailer. Only `handler` and `worker` log.
- **Test files:** no `_edge`/`_regress` files; the classifier tests are in `cause_test.go` as the task allows; new options have tests in `smtp_server_test.go`. No `time.Sleep` added. Real deadlines are at most 150 ms in the adaptor tests.
- **Frontend rules:** not applicable (no frontend change).

## Mutation checks run

Each was applied to the source, the named test run, then reverted with `git checkout`. All were restored (`git status` showed only my test files).

| # | Mutation | Result |
|---|---|---|
| M1 | `classify` returns `other` for everything | `TestClassify` and `TestSendEmail_Failures` fail |
| M2 | swap `sender refused` and `recipient refused` | `TestClassify` rows `mail from`, `rcpt to`, the joined-error row fail; the scenario table fails too |
| M3 | `notAccepted` loses the underlying error | `TestSendEmail_Failures` fails on "the cause stays reachable" in every row |
| M4 | `invalid address` replaced by `other` at the `From` call site | `TestSendEmail_Failures/a sender that is not an address` fails |
| M5 | the attempt-deadline flag always false | `TestSendEmail_Failures/the greeting is later…` and `TestSendEmail_TimedOutIsStable/the greeting is late` fail |
| M6 | `login needs TLS` ignores the TLS mode | `TestClassify` rows `no auth, tls` and `no auth, starttls` fail |
| M7 | drop code 538 from the login codes | `TestClassify/login 538` fails |
| M8 | `io.EOF` no longer counts as `could not connect` | `TestClassify/EOF` and `TestSendEmail_Failures/the server closes the connection at once` fail |
| M9 | the `isTimeout` guard removed | passed with the builder's tests (a gap); fails with my added row `a network timeout is not a lost connection` |
| M10 | `FailureCause` always returns `""` | `TestFailureCause` fails |
| M11 | TLS rule off | `TestClassify` TLS rows fail |
| M12 | `message refused` → `other` | `TestClassify` rows `data`, `data close` fail |
| M13 | `login refused` → `other` | `TestClassify` rows 530, 534, … fail |
| M14 | dispatcher drops the `cause` field | `TestSequence_LogsTheFailureCause` fails |
| M15 | dispatcher logs `errors.Unwrap(err).Error()` as the cause | `TestSequence_LogsTheFailureCause` fails (the address is in the output) |
| M16 | dispatcher logs `cause` even when empty | `TestSequence_FailFailSucceed`, `…ZeroRetriesFailsAtOnce`, `…LogsHoldIdsOnly` fail |
| M17 | `abandoned` line gets a `cause` | `TestSequence_OtherLinesHaveNoCause` fails |
| M18 | `superseded` line gets a `cause` | passes with the builder's tests; fails with my added subtest |
| M19 | usecase drops `FailureCause` | `TestTestTarget_FailureCause` fails |
| M20 | usecase sets a cause when the context ended | `TestTestTarget_FailureCause/a context ended during the send has none` fails |
| M21 | handler drops the `cause` field | `TestTestTarget_LogsTheCauseOnlyOnAFailure/a failure with a cause` fails |
| M22 | handler logs the cause on a delivery | `…/a delivery` fails |
| M23 | `RejectSender` made a no-op | `TestSMTPServer_RejectsTheSender` fails |
| M24 | `RejectData` made a no-op | `TestSMTPServer_RejectsData` fails |

Two attempts were invalid and are not counted: a first try of M5 whose pattern did not match, and first tries of M8 and M15 that did not compile (an unused import). I redid all three.

## Inputs tried beyond the task file

All passed; the useful ones are kept as rows in the existing tables (see "Tests I added").

- Recipient `a"b@example.com` → `invalid address`; text holds no address.
- Recipient `"a b"@example.com` (valid quoted local part) refused by the server → `recipient refused`.
- Host `no-such-host.invalid` → `could not connect` (the lookup error is a `*net.OpError`).
- Username equal to the address, wrong password over `tls` → `login refused`; text holds no address.
- Failure only on the last retry (plain error first, caused error last): the retried line has no `cause`, the last has one, the address is not in the output.
- Login code boundaries 529, 531, 533, 536, 537, 539 → `other`; 530, 534, 535, 538 → `login refused`.
- Bare `x509.UnknownAuthorityError`, `x509.HostnameError`, `tls.RecordHeaderError` → `TLS failed`.
- A `*net.OpError` wrapping a `Timeout()` error with the deadline flag false → `other`.
- Concurrent writes: 40 simultaneous sends through two shared mailers (one rejecting recipients, one rejecting senders) under `-race`: each returns its own cause, no race reported.

## Integration tests

- Command from `TESTING.md`: `make test-integration` (starts Mailpit with Docker).
- **Not run:** `docker info` fails here, so Mailpit cannot start. No database version was printed.
- Existing integration test touching this code: `TestMailpit_DeliversTheAlert` in `adaptor/mailer/mailer_integration_test.go`. It compiles with `-tags integration` (checked with `go test -tags integration -run XXX ./internal/adaptor/mailer/`). It is the only test of a real delivery through a real server; criterion 15 depends only on it. The task changes nothing on the success path of a send (only the value returned on failure), so the risk is low, but this has not been shown.
- The builder also reported "not run: Docker is not running". I did not take that as a result and tried myself.

## Tests I added (tests only, in existing test files)

- `mailer_test.go`: four rows in `TestSendEmail_Failures` (quote in the local part, quoted local part refused, unresolvable host, username equal to the address); `TestSendEmail_ConcurrentFailuresKeepTheirOwnCause`; `assert.Empty(FailureCause)` in the second context-cancel test.
- `cause_test.go`: login-code boundaries, bare x509/TLS errors, and the network-timeout row (new type `timeoutErr`).
- `alert_dispatcher_test.go`: `TestSequence_CauseOnTheLastAttemptOnly`; a subtest in `TestSupersede_AttemptInProgress` for the `superseded` line.

## Findings

### Blocking

None.

### Non-blocking

1. **Test quality: `superseded` line and `isTimeout` guard were unproven by the builder's tests.** Fixed by the tests above. Matters when: someone adds a field to those lines or removes the guard. Already closed here.
2. **Latent bug, report only: the deadline flag is read after the send returns.** A send that fails for a real reason (say `recipient refused`) at the instant the attempt deadline passes is logged `timed out`. Matters when: an SMTP provider answers within about a millisecond of `AttemptTimeout`. The task accepts this ("the log cause is a hint, not a proof").
3. **Cosmetic: two fields named `cause` on one type.** `sentinel` has `cause string` and embeds `*reason`, which has `cause error`. Both work (the outer shadows the inner), but a later edit that reads `e.cause` inside `sentinel` gets the string. Matters when: someone changes `sentinel` or `reason` and expects the error. Renaming one field would remove the trap.
4. **Test quality: the failure of `m.client(dial)` (`other`) has no test.** It cannot be triggered with a validated config. Report only.
5. **Test quality: the handler tests check absence with `assert.NotContains(out, "cause")` on the whole log output.** A different field containing that word would hide a missing key. Matters when: another field with "cause" in its name is added to this line.
6. **Cosmetic: plan names `TestAlertDispatcher_*`, tests are `TestSequence_*`.** Matters when: someone searches the plan for the tests.

## Docs or specs that no longer match

- `CONVENTIONS.md`, Logging: the "Logged" list says "alert delivery outcome per target id". Delivery lines now also hold a fixed failure cause. Suggest adding "a fixed failure cause (one of ten words, never the error text)" so the rule and the code agree. Not wrong, only incomplete.
- `docs/openapi.yaml`, `docs/requirements.md` (FR-85, FR-107): still true, no change needed. The visible reason did not change.
- `STACK.md`: no version adopted by this work; go-mail stays at `v0.8.1`, unpinned in the file as before.
- `docs/tasks/backlog.md`: nothing resolved or created. The `starttls` line still stands (a `starttls` failure is logged `other`, as the task says).
