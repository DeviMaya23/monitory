# Verification report: alert dispatch

Branch: `verify/alert-dispatch` (built on the builder's `feat/alert-dispatch` at `cdfe854`; the verifier added only tests and this report).

**Result: no Blocking findings.** `make check` passes; the integration test passed; every mutation I ran fails at least one named test. Six non-blocking findings, none of which changes behavior.

## Commands run

| Command | Result |
|---|---|
| `make check` | run, passed. It first failed at `eslint: command not found` because the fresh checkout had no frontend dependencies; after `npm ci` in `frontend/` it passed (golangci-lint 0 issues, Go tests with `-race`, 331 frontend tests, builds, contract lint). `npm ci` changed no tracked file. |
| `make test-integration` | **could not start as written**: its `mailpit-up` step failed with `Bind for 127.0.0.1:1025 failed: port is already allocated`, because another session's container (`alert-dispatch-builder-mailpit-1`) already holds 1025 and 8025. I removed the container and network I had just created and left the other one alone. I then ran the target's second line, `go test -race -tags integration ./...`, against that Mailpit: **run, passed, Mailpit v1.33.1** (the version `/api/v1/info` reported). `TestMailpit_DeliversTheAlert` is the only integration test of this task. |
| `go test -race -count=5` on `worker`, `adaptor/mailer`, `testutil`, `usecase` | passed, no flake. |
| `go mod tidy -diff` | not clean (finding N1). |

## 1. Criteria

"Real?" = would the named test fail if the behavior were removed? "Mut." means I confirmed it by a mutation (section 4); "read" means by reading the test against the code.

### Decision and content (`usecase`)

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| 1 | Each row of the change table (FR-21, FR-22, FR-24, FR-25) | `TestRecordCheckResult_AlertDecision` (7 rows, spy asserted empty for the no-alert rows) | Yes. Mut. M1, M3 | Met |
| 2 | Alerts off: none; then on while unhealthy: none; later recovery alerts (FR-25) | `TestRecordCheckResult_AlertsOffThenOn` | Yes. Mut. M2 | Met |
| 3 | Empty list: no `Dispatch`; email + webhook: one `Dispatch`, list order (FR-21) | `TestRecordCheckResult_Targets` (empty case has a "list was read" baseline) | Yes (read: dropping the `len == 0` check dispatches an empty call) | Met |
| 4 | Alert is exactly the five fields; `ChangedAt` = clock = saved `LastStatusChangeAt`, non-default time (FR-23) | `TestRecordCheckResult_AlertContent` | Yes. Mut. M8 | Met |
| 5 | Message by status, default for empty/blank, 500 characters unchanged (FR-23) | `TestAlertMessage` (8 rows) | Yes. Mut. M7, M9 | Met |
| 6 | State saved before the hand-off | `TestRecordCheckResult_StateSavedBeforeDispatch` (spy copies the fake states at the call) | Yes (read: a `Dispatch` placed before `Update` would see the old status). No mutation: moving the call needs a restructure, not a one-line break | Met |
| 7 | Sequence cancelled after the save: `Find` and `List` get a live context, alert dispatched | `TestRecordCheckResult_CancelledAfterSave` (records `ctx.Err()` at each call; baseline that the context was cancelled) | Yes. Mut. M5 | Met |
| 8 | Update fails; deleted service; `Find`/`List` not found; `Find`/`List` other error wrapped | `TestRecordCheckResult_AlertErrors` (6 subtests; asserts `ErrorIs`, state saved, no `Find` call for a deleted service) | Yes (read) | Met |
| 9 | Inconsistent result: error, no `Dispatch` | `TestRecordCheckResult_InconsistentResultDoesNotDispatch` (baseline: consistent result alerts) | Yes (read) | Met |
| 10 | Restart: second usecase over the same states (FR-111, in part) | `TestRecordCheckResult_RestartUsesSavedStatusOnly` | Yes. Mut. M3, M4. It proves the rule has no memory, not that a real restart keeps the status (task says so) | Met |
| 11 | Existing tests pass with only setup changed | `check_result_test.go` diff | The diff touches only the constructor calls in the old tests (7 lines) and adds new tests | Met |

### Repository

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| 12 | `Find` returns the saved service, times in UTC | `TestServiceFind_ReturnsTheSavedService` (created with a UTC+7 zone) | Yes. Mut. M10 | Met |
| 13 | Unknown id and deleted id: `ErrNotFound`; writes nothing | `TestServiceFind_UnknownAndDeletedIDsAreNotFound` (baseline found; row counts before/after) | Yes. Mut. M11 | Met |

### Delivery loop (`worker`)

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| 14 | One `SendEmail` with the target's value; a failure is not retried (FR-85 in part) | `TestDispatch_EmailTargetIsSentOnceWithoutRetry` | Yes. Mut. M18 | Met |
| 15 | `Dispatch` returns while a send is blocked; the send has started, no clock (NFR-5) | `TestDispatch_ReturnsWhileASendIsBlocked` | Yes. Mut. M12 (fails by timeout, finding N3) | Met |
| 16 | First blocked, second failing, third delivered (FR-83) | `TestDispatch_OneTargetDoesNotStopOrDelayTheOthers`; I added `TestDispatch_FiveTargetsOneBlockedOneFailing` | Yes. Mut. M13 (timeout) | Met |
| 17 | Webhook: mailer not called, warn line with reason; mixed with email, email sent | `TestDispatch_WebhookTargetIsSkippedAndLogged` | Yes. Mut. M19 | Met |
| 18 | Log lines, fields, reasons; no address, URL, target name, service name or message | `TestDispatch_LogsOutcomesWithIdsOnly` | **Partly.** Mutation M16 (add the address to the failure line) passed: the secret address was only ever on a successful send, so the failure path was never checked for it. Fixed by `TestDispatch_FailureAndAbandonLogsNeverHoldTheAddress`, which now fails M16 and M17 | Met (after the added test) |
| 19 | `Close` cancels and waits (gate), logs `abandoned` with no reason; success after `Close` is `delivered`; second `Close` no-op; `Dispatch` after `Close` is dropped and logged | `TestClose_CancelsAndWaitsForSendsInProgress`, `TestClose_ASendThatSucceedsAfterCloseIsDelivered`, `TestClose_SecondCallAndDispatchAfterClose` | Yes. Mut. M14 (timeout), M15, M17b. The "waits" half is deterministic (gate released after a 100 ms real wait, as the task allows) | Met |
| 20 | `Dispatch` racing `Close` under `-race` | `TestDispatch_RacingCloseNeverSendsAfterCloseReturned` (50 rounds, 8 racers) | Yes. Mut. M15, M20 | Met |
| 21 | Two services at once keep their ids | `TestDispatch_ConcurrentServicesKeepTheirIDs` | Yes (read) | Met |

### Mailer

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| 22 | No host: `ErrNotConfigured`, exact text, no connection | `TestSendEmail_NotConfigured` (baseline: same server with a host is connected) | Yes. Mut. M29 | Met |
| 23 | Mode `none`: sender, recipient, subjects, four lines, trailing `\n`, text/plain UTF-8 (FR-23, FR-93) | `TestSendEmail_Content` | Yes. Mut. M21, M24 | Met |
| 24 | UTC, seconds dropped; UTC+7 shows UTC (FR-93) | `TestSendEmail_TimeIsUTCWithoutSeconds` | Yes. Mut. M22, M25 | Met |
| 25 | CR/LF in the name: space in subject and line 1; no injected header | `TestSendEmail_LineBreaksInTheNameCannotInjectAHeader` | Yes. Mut. M23, M30 | Met |
| 26 | Non-ASCII name and message intact | `TestSendEmail_NonASCIIArrivesIntact` | Yes (read: decoding is by the test, a broken charset fails the equality) | Met |
| 27 | Nothing but the four values; `ServiceID` nowhere | `TestSendEmail_HoldsOnlyTheFourValues` | Yes. Mut. M21 | Met |
| 28 | Malformed recipient: `ErrNotAccepted`, nothing reaches the server | `TestSendEmail_MalformedRecipient` | Yes. Mut. M26 | Met |
| 29 | Five failures give `ErrNotAccepted`, exact text, no address or cause text | `TestSendEmail_Failures` (5 rows, cause reachable by `Unwrap`) | Yes. Mut. M26 | Met |
| 30 | `ctx` cancelled during a delayed greeting: `context.Canceled`, not `ErrNotAccepted` | `TestSendEmail_ContextCancelledWhileTheGreetingIsDelayed` | Yes. Mut. M27, M28 | Met |
| 31 | Username and password: a server demanding them accepts; wrong password is rejected; empty username sends no AUTH | `TestSendEmail_Authentication` | The empty-username half is real (`AuthCommands()` zero, message arrives). The accepted and wrong-password halves **do not exist**: go-mail v0.8.1 will not authenticate on an unencrypted connection, so the test pins the refusal instead (no `AUTH` sent, `ErrNotAccepted`). The task allows this if the builder reports it, and the builder did (plan, judgment calls) | **Partly met** (carve-out of the task applies) |
| 32 | Unknown TLS value: `New` errors | `TestNew_UnknownTLSMode` (baseline: `none` accepted) | Yes (read) | Met |
| 33 | Two concurrent sends succeed under `-race` | `TestSendEmail_ConcurrentSends` | Yes (read) | Met |

### Fake SMTP server, Mailpit, wiring, repo-wide

| # | Criterion | Evidence | Real? | Status |
|---|---|---|---|---|
| 34 | Fake server records messages; each scripted behavior; frees its port; several connections | `TestSMTPServer_*` (9 tests, incl. `AdvertisesNothingExtra`, `RequiresAuth`, `FreesItsPortWhenTheTestEnds`) | Yes, and it is also exercised by every mailer test | Met |
| 35 | Mailpit test | `TestMailpit_DeliversTheAlert`: run, passed, Mailpit v1.33.1 | Depends only on the real Mailpit; no other criterion depends only on it | Met |
| 36 | Wiring: three constructors, shutdown order, idempotent closes | Read `cmd/server/main.go`: `serviceRepo` and `targetRepo` built once and shared by the check-result, service and target usecases; `mailer.New` error returned; `defer dispatcher.Close()` (l.123) precedes `defer scheduler.Close()` (l.128), both after the database's (l.87); explicit `scheduler.Close()` then `dispatcher.Close()` before the HTTP shutdown (l.178-179) | n/a (no test of `main`) | Met |
| 37 | `make check` | passed (see above) | | Met |
| 38 | `git diff go.mod go.sum`: go-mail `v0.8.1` only | One `require` line and two `go.sum` lines; `go` line and toolchain unchanged | | Met, but see N1 |
| 39 | Nothing outside allowed paths; no config key | `git diff --name-only` lists only the allowed files plus the plan; `.env.example`, `platform/config`, `migration` untouched | | Met |

What I cannot prove: the `starttls` and `tls` success paths, authentication on any mode, and delivery to a real provider (task, "Known gaps"). The Mailpit test covers mode `none` only.

## 2. Plan check

I read the plan only after steps 1 and 2.

- **Every criterion is in the plan**, and every item is ticked. No criterion is missing.
- **Test names in the plan are wrong for most items.** The tests exist and check the behavior, but under other names. Examples: the plan says `TestBuildAlert_Message` (actual `TestAlertMessage`), `TestRecordCheckResult_Errors` (actual `TestRecordCheckResult_AlertErrors`), `TestServiceRepository_Find` and `_Find_NotFound` (actual `TestServiceFind_ReturnsTheSavedService`, `TestServiceFind_UnknownAndDeletedIDsAreNotFound`), `TestDispatch_EmailOneAttempt`, `TestDispatch_ReturnsAtOnce`, `TestDispatch_TargetsIndependent`, `TestDispatch_Logs`, `TestDispatch_RacingClose`, `TestDispatch_ConcurrentServices`, and all the mailer names (`TestSendEmail_TimeUTC`, `_NameLineBreaks`, `_NonASCII`, `_NothingElse`, `_ContextCancelled`, `_Concurrent`, `TestNew_UnknownTLS`). Finding N6.
- **One tick overstates its test:** "no address/URL/name/service name/message in logs" is ticked, but the test did not cover the address on the failure path (criterion 18, mutation M16 passed). Now covered.
- **Plan matches the diff otherwise:** the merge of `main` (#16) is in the history and no handler file differs from `main`; the authentication substitution, the CR/LF-to-one-space-each rule, the exported default constants and the extra `testutil` helpers are all in the diff. "listed `// indirect` by `go get`" is true, and is what N1 is about.
- The plan says "run, passed (Mailpit v1.33.1)" for the integration test; I reproduced it (the ports were held by the builder's own container).

## 3. Rule checks

| Rule | Result |
|---|---|
| Dependencies (ROLES.md, STACK.md, task) | Only `github.com/wneessen/go-mail v0.8.1`, named in `STACK.md` ("Email"). No new indirect dependency. `go 1.27.4` unchanged, no `toolchain`. N1: marked `// indirect`. |
| Layering | `worker/alert_dispatcher.go` imports `domain` only; `adaptor/mailer` imports `domain` and go-mail only; `usecase` imports `domain` only (no `worker`, `adaptor`); `domain/alert.go` imports `time` only. Only `cmd/server` knows all. |
| Where the rules live | Change table (`alertFor`), defaults and `buildAlert` are only in `usecase/`. The dispatcher reads `alert.Status` only to log it and `target.Type` to choose email or skip. The mailer's layout decides nothing about sending. |
| Time | No `time.Now/Sleep/After/NewTimer` in `worker`, `mailer`, `usecase`, `repository`. The alert time is the usecase's clock `now`. The only hit is `time.After` in `testutil/smtp_server.go` (the fake's greeting delay; test support). |
| No stored change | No migration; the diff of `repository/service.go` is `Find` only; nothing writes `targets` or `service_states` beyond the existing update; `last_delivery_failed` is not written. |
| Goroutines | The dispatcher's one `go` statement is under `wg.Add(1)` guarded by the mutex and ends on `Close`; none in the usecase, handler or mailer (`context.AfterFunc` is used, as the task allows). |
| Logs | All log calls are in `alert_dispatcher.go`. Fields: `service_id`, `target_id`, `status`, and `reason` set to a constant or to the mailer's fixed text. The usecase and mailer log nothing. |
| Error text | `ErrNotConfigured` = `no SMTP account configured`, `ErrNotAccepted` = `the SMTP server did not accept the message`, both exact and tested; the cause is reachable only through `Unwrap`. |
| Order | `Dispatch` is called after `states.Update` returned, outside `apply`; `apply` only records `saved.Status` and calls the pure rule. |
| CONVENTIONS | Rule 8 (plain text) and rule 9/FR-23 (nothing but four values) hold. Rule 13 (state saved before the hand-off; one usecase decides) holds. Rule 11 (outbound mail only through `adaptor/mailer`) holds. Context with a deadline on the outbound call (`AttemptTimeout` over `ctx`) holds. No `//nolint`, golangci-lint 0 issues. |
| TESTING.md ("Test files", "Test imports") | No `_edge` or `_regress` files; usecase tests import neither `repository`, `worker` nor `adaptor`; `worker` tests import neither `repository` nor `adaptor`; `repository` tests import `domain`, `repository`, `testutil` only. |
| Frontend | Not touched. |

## 4. Mutation checks run

Each: break the source, run the package's tests (`-race`, 40 s timeout), confirm failure, revert (`git status` showed only my test files afterwards).

| ID | Mutation | Failed |
|---|---|---|
| M1 | `not_yet_checked` to healthy counts as a change | `TestRecordCheckResult_AlertDecision` |
| M2 | ignore `AlertsEnabled` | `TestRecordCheckResult_AlertsOffThenOn` |
| M3 | alert on unhealthy to unhealthy | `_AlertDecision`, `_AlertsOffThenOn`, `_RestartUsesSavedStatusOnly` |
| M4 | previous status not noted in `apply` | `TestAlertMessage`, `_AlertDecision`, `_AlertsOffThenOn`, `_RestartUsesSavedStatusOnly` |
| M5 | sequence's own context for `Find` and `List` | `TestRecordCheckResult_CancelledAfterSave` |
| M7 | the unhealthy message in a recovery | `TestAlertMessage` |
| M8 | `ChangedAt` is not the saved time | `TestRecordCheckResult_AlertContent` |
| M9 | whitespace-only message not defaulted | `TestAlertMessage` |
| M10 | `Find` returns local times | `TestServiceFind_ReturnsTheSavedService` |
| M11 | `Find` returns the raw error for no row | `TestServiceFind_UnknownAndDeletedIDsAreNotFound` |
| M12 | `Dispatch` waits for the sends | package timeout (hang), `worker` |
| M13 | deliveries run one after the other | package timeout (hang), `worker` |
| M14 | `Close` does not cancel | package timeout (hang), `worker` |
| M15 | `Close` returns without waiting | `TestClose_CancelsAndWaitsForSendsInProgress`, `_ASendThatSucceedsAfterCloseIsDelivered`, `TestDispatch_RacingCloseNeverSendsAfterCloseReturned` |
| M16 | the address added to the failure log | **passed at first**; now fails `TestDispatch_FailureAndAbandonLogsNeverHoldTheAddress` (added) |
| M17 | the address added to the abandoned log | same added test |
| M18 | one retry | `TestDispatch_EmailTargetIsSentOnceWithoutRetry` |
| M19 | webhook sent as email | `TestDispatch_WebhookTargetIsSkippedAndLogged` |
| M20 | no mutex in `Dispatch` | `TestDispatch_RacingCloseNeverSendsAfterCloseReturned` (data race) |
| M17b | abandoned counted as failed | `TestClose_CancelsAndWaitsForSendsInProgress` |
| M21 | the service id in the mail body | `TestSendEmail_Content`, `_HoldsOnlyTheFourValues`, and three more |
| M22 | no UTC conversion | `TestSendEmail_TimeIsUTCWithoutSeconds` |
| M23 | CR/LF kept in the subject | `TestSendEmail_LineBreaksInTheNameCannotInjectAHeader` |
| M24 | seconds shown | `_Content`, `_TimeIsUTCWithoutSeconds`, two more |
| M25 | (same as M22 for the UTC+7 row) | `_TimeIsUTCWithoutSeconds` |
| M26 | the cause's text added to the error text | `_MalformedRecipient`, `_Failures`, `_Authentication` |
| M27 | no `AfterFunc` close | `TestSendEmail_ContextCancelledWhileTheGreetingIsDelayed` |
| M28 | `ctx` error mapped to `ErrNotAccepted` | same test |
| M29 | `Host == ""` check removed | `TestSendEmail_NotConfigured` |
| M30 | CR/LF kept in the body's first line | `TestSendEmail_LineBreaksInTheNameCannotInjectAHeader` |

Of the task's list, all were run except "put the failure reason or URL into the email" (only the service id was injected; the alert has no field to carry a reason or URL, so it cannot reach the mail) and "`Dispatch` called inside `apply`" (checked by reading; a mechanical break needs a restructure).

## 5. Findings

### Blocking

None.

### Non-blocking

**N1. `go-mail` is listed `// indirect` in `go.mod` though `mailer.go` imports it.** Category: cosmetic. `go mod tidy -diff` moves it into the direct block. The task asked for `go get` and then `go mod tidy`; the plan records the `// indirect` as `go get`'s doing. Matters when: anyone next runs `go mod tidy` (an unrelated diff appears), or a CI tidy check is added. Reproduce: `cd backend && go mod tidy -diff`.

**N2. Authentication is never exercised, and `SMTP_TLS=none` with a username can never send.** Category: decision needed. go-mail v0.8.1 negotiates PLAIN and LOGIN only on an encrypted connection and the fake server has no TLS, so criterion 31's accepted and wrong-password halves do not exist; the same holds for the `starttls` and `tls` success paths. In `none` mode with `SMTP_USERNAME` set every send fails with the generic "did not accept the message" (pinned by `TestSendEmail_Authentication`). Matters when: the SMTP provider is chosen and `SMTP_USERNAME` is set. That is the Milestone 2 manual check in `docs/manual-checks.md`, which should be run with the real `starttls` or `tls` settings.

**N3. Three worker mutations fail by hanging, not by an assertion.** Category: test quality. Removing the cancel in `Close`, making `Dispatch` wait, or running deliveries in sequence leaves the test (or its `t.Cleanup(d.Close)`) blocked until the package timeout (10 minutes by default). They are caught, but a regression would stall CI before it fails. Matters when: one of these is broken in a later task (`alert-delivery-*` add retries and a timer to the same code). A per-test deadline around the blocking calls would make them fail fast.

**N4. The Mailpit test clears the mailbox of whichever Mailpit answers on `localhost:8025`.** Category: test quality. During this verification a Mailpit from another worktree's compose project held the ports, so `make test-integration` could not start its own and the test emptied that one. Matters when: two worktrees run integration or end-to-end tests at the same time (this repository is built by parallel sessions).

**N5. A failed or abandoned alert after the commit is only logged.** Category: report only. Known gap in the task file (FR-111, "An alert is lost"); the plan and backlog already say so. No trigger beyond the later outcome task.

**N6. The plan's test names do not match the tests.** Category: cosmetic. Most of the names in `docs/tasks/alert-dispatch.plan.md` do not exist; the tests do, under the names in section 1. Matters when: a reader uses the plan to find a test.

### Added by the verifier

Three tests, in the existing files, all passing:

- `worker/alert_dispatcher_test.go`: `TestDispatch_FailureAndAbandonLogsNeverHoldTheAddress` (closes the gap behind M16) and `TestDispatch_FiveTargetsOneBlockedOneFailing`.
- `adaptor/mailer/mailer_test.go`: `TestSendEmail_LimitsAndSMTPSpecialLines`: a 100-character ASCII name, a 100-character non-ASCII name, a 500-character message with a line break, and messages that contain a lone `.` line, start with a dot, or use CRLF. All arrive intact, so no bug was found there.

Other inputs tried, all by existing or added tests and all behaving: an unhealthy first check with alerts on and no targets (no dispatch), a recovery with a webhook target only (dispatcher skips and logs), the same service unhealthy twice (one alert), a UTC+7 alert time, SMTP not configured, a stop while a send is blocked, a restart (new usecase over saved states).

## 6. Docs or specs that no longer match

- **`STACK.md`**: record the adopted version, `github.com/wneessen/go-mail v0.8.1` (row "Email" names the library with no version). Mailpit v1.33.1 is the version the integration test ran against.
- **`TESTING.md`**: the "Test doubles" table places the alert sender's fake in `usecase/fakes_test.go`; this task, as its file decided, keeps its fakes in `usecase/check_result_fakes_test.go`. The same table lists `testutil/` as holding the stub target server and stub webhook receiver; it now also holds the in-process fake SMTP server (`testutil.NewSMTPServer`). The layer table says `worker/` tests use the fake clock; `AlertDispatcher` has no clock.
- **`docs/openapi.yaml`, `docs/requirements.md`**: nothing; no operation was implemented and no requirement text conflicts.
- **`docs/tasks/backlog.md`**: already has the "Left out of `alert-dispatch`" entry; N2 and N3 are not in it (the verifier does not edit the backlog; they are in this report with their triggers).
- **`docs/manual-checks.md`**: the Milestone 2 line (an email alert arrives through the production SMTP provider) is still correct, and N2 says to run it with the real TLS mode and credentials.
