# Plan: alert dispatch

Branch: `feat/alert-dispatch`. Paths are under `backend/internal/` unless noted. Tests run with `-race`.

## Acceptance criteria

### Decision and content (`usecase/check_result_test.go`, `usecase/alert_test.go`)

- [x] Change table, every row, alerts on, one email target — `usecase/check_result.go`; `TestRecordCheckResult_AlertDecision` (table)
- [x] Alerts off: no dispatch; then on while unhealthy: none; later recovery alerts — `check_result.go`; `TestRecordCheckResult_AlertsOffThenOn`
- [x] Empty target list: no dispatch; email + webhook: one dispatch with both in order — `check_result.go`; `TestRecordCheckResult_Targets`
- [x] Alert is exactly the five fields, `ChangedAt` = fake clock = saved `LastStatusChangeAt` — `usecase/alert.go`; `TestRecordCheckResult_AlertContent`
- [x] Message by status, default for empty/whitespace, 500 chars unchanged — `usecase/alert.go`; `TestBuildAlert_Message` in `alert_test.go`
- [x] State saved before hand-off (spy reads states) — `check_result.go`; `TestRecordCheckResult_StateSavedBeforeDispatch`
- [x] Cancelled sequence after save: Find/List get a live ctx, alert dispatched — `check_result.go`; `TestRecordCheckResult_CancelledAfterSave`
- [x] Update fails / deleted service / Find or List ErrNotFound / other errors wrapped — `check_result.go`; `TestRecordCheckResult_Errors`
- [x] Inconsistent result: error, no dispatch — `check_result.go`; `TestRecordCheckResult_InconsistentNoDispatch`
- [x] Restart: second usecase over same states — `check_result.go`; `TestRecordCheckResult_RestartUsesSavedStatusOnly`
- [x] Existing tests keep their assertions, setup only — `check_result_test.go`

### Repository (`repository/service_test.go`, real SQLite)

- [x] `Find` returns saved service, UTC times — `repository/service.go`; `TestServiceRepository_Find`
- [x] Unknown id and after Delete: `ErrNotFound`, no write — `repository/service.go`; `TestServiceRepository_Find_NotFound`

### Delivery loop (`worker/alert_dispatcher_test.go`)

- [x] Email target: one call with Value and alert; failing send: still one call (no retry) — `worker/alert_dispatcher.go`; `TestDispatch_EmailOneAttempt`
- [x] Dispatch returns while send blocked; send already started (NFR-5) — `TestDispatch_ReturnsAtOnce`
- [x] Three targets, first blocked, second failing, third delivered (FR-83) — `TestDispatch_TargetsIndependent`
- [x] Webhook skipped with warn line; mixed with email, email sent — `TestDispatch_WebhookSkipped`
- [x] Log lines and fields; no address/URL/name/service name/message in logs — `TestDispatch_Logs`
- [x] `Close` cancels, waits (gate), logs abandoned; success after Close logs delivered; second Close no-op; Dispatch after Close dropped — `TestClose_*`
- [x] Dispatch racing Close under `-race` — `TestDispatch_RacingClose`
- [x] Two services at once keep their ids — `TestDispatch_ConcurrentServices`

### Mailer (`adaptor/mailer/mailer_test.go`, fake SMTP server)

- [x] No host: `ErrNotConfigured`, exact text, no connection — `TestSendEmail_NotConfigured`
- [x] Mode `none`: sender, recipient, subject, four body lines, trailing `\n` — `TestSendEmail_Content`
- [x] UTC time, seconds dropped, UTC+7 converted — `TestSendEmail_TimeUTC`
- [x] CR/LF in name replaced by a space, no injected header — `TestSendEmail_NameLineBreaks`
- [x] Non-ASCII intact — `TestSendEmail_NonASCII`
- [x] ServiceID appears nowhere — `TestSendEmail_NothingElse`
- [x] Malformed recipient: `ErrNotAccepted`, nothing reaches server — `TestSendEmail_MalformedRecipient`
- [x] Failures (reject RCPT, close at connect, nothing listening, greeting delay beyond timeout, starttls not offered): exact text, no leak — `TestSendEmail_Failures`
- [x] Ctx cancelled during greeting delay: `context.Canceled`, not `ErrNotAccepted` — `TestSendEmail_ContextCancelled`
- [x] Auth: an authenticated send cannot be tested (go-mail v0.8.1 negotiates PLAIN/LOGIN only on an encrypted connection; the fake server has no TLS). `TestSendEmail_Authentication` pins instead that a username over `none` is refused as `ErrNotAccepted` with no AUTH command sent, and that an empty username sends none. The authenticated send is **untested**.
- [x] Unknown TLS: `New` errors — `TestNew_UnknownTLS`
- [x] Two concurrent sends succeed — `TestSendEmail_Concurrent`

### Fake SMTP server (`testutil/smtp_server_test.go`)

- [x] Records message; each scripted behaviour works; stops and frees port; concurrent connections — `testutil/smtp_server.go`; `TestSMTPServer_*`

### Mailpit integration (`adaptor/mailer/mailer_integration_test.go`, tag `integration`)

- [x] Mail arrives in Mailpit with sender, recipient, subject, four lines — `TestMailpit_DeliversTheAlert`. Outcome: run, passed (Mailpit v1.33.1)

### Wiring (`cmd/server/main.go`)

- [x] Constructors, shutdown order, idempotent closes (no test of `main`; it compiles after merging `main`)

### Repo-wide

- [x] `make check` passes. Outcome: run, passed (after merging `main` with #16, the handler fix)
- [x] `git diff go.mod go.sum` shows only go-mail `v0.8.1` (listed `// indirect` by `go get`; go-mail has no further dependencies; `go` line unchanged)
- [x] Nothing outside the allowed paths changed; no configuration key added

## Integration tests

- `make test-integration`: run, passed (Mailpit v1.33.1)

## Judgment calls

- Merged `main` (#16) into the branch to get the handler fix for the new `api.Target` shape; no handler file was changed by this task.
- **Authentication test:** replaced, on the user's instruction, by one that checks the refusal (no `-NOENC` variants, which would send the password in clear). The authenticated send stays untested.
- A CR or LF in a service name becomes one space per character (CRLF gives two spaces).
- `usecase.DefaultUnhealthyMessage` and `DefaultRecoveryMessage` are exported constants; `buildAlert` is unexported and tested through `RecordCheckResult`.
- A target that is not an email is treated as a webhook (skipped and logged).
- The mailer's two errors carry the cause through `Unwrap`; `errors.Is` matches through an `Is` method on a wrapper.
- `testutil.SMTPServer` has `Addr()`, `Connections()` and `AuthCommands()` helpers beyond the task's list.
- The `SMTP_*` timeout is not a key; `AttemptTimeout` stays 10 s.
