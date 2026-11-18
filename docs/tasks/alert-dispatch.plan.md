# Plan: alert dispatch

Branch: `feat/alert-dispatch`. Paths are under `backend/internal/` unless noted. Tests run with `-race`.

## Acceptance criteria

### Decision and content (`usecase/check_result_test.go`, `usecase/alert_test.go`)

- [ ] Change table, every row, alerts on, one email target — `usecase/check_result.go`; `TestRecordCheckResult_AlertDecision` (table)
- [ ] Alerts off: no dispatch; then on while unhealthy: none; later recovery alerts — `check_result.go`; `TestRecordCheckResult_AlertsOffThenOn`
- [ ] Empty target list: no dispatch; email + webhook: one dispatch with both in order — `check_result.go`; `TestRecordCheckResult_Targets`
- [ ] Alert is exactly the five fields, `ChangedAt` = fake clock = saved `LastStatusChangeAt` — `usecase/alert.go`; `TestRecordCheckResult_AlertContent`
- [ ] Message by status, default for empty/whitespace, 500 chars unchanged — `usecase/alert.go`; `TestBuildAlert_Message` in `alert_test.go`
- [ ] State saved before hand-off (spy reads states) — `check_result.go`; `TestRecordCheckResult_StateSavedBeforeDispatch`
- [ ] Cancelled sequence after save: Find/List get a live ctx, alert dispatched — `check_result.go`; `TestRecordCheckResult_CancelledAfterSave`
- [ ] Update fails / deleted service / Find or List ErrNotFound / other errors wrapped — `check_result.go`; `TestRecordCheckResult_Errors`
- [ ] Inconsistent result: error, no dispatch — `check_result.go`; `TestRecordCheckResult_InconsistentNoDispatch`
- [ ] Restart: second usecase over same states — `check_result.go`; `TestRecordCheckResult_RestartUsesSavedStatusOnly`
- [ ] Existing tests keep their assertions, setup only — `check_result_test.go`

### Repository (`repository/service_test.go`, real SQLite)

- [ ] `Find` returns saved service, UTC times — `repository/service.go`; `TestServiceRepository_Find`
- [ ] Unknown id and after Delete: `ErrNotFound`, no write — `repository/service.go`; `TestServiceRepository_Find_NotFound`

### Delivery loop (`worker/alert_dispatcher_test.go`)

- [ ] Email target: one call with Value and alert; failing send: still one call (no retry) — `worker/alert_dispatcher.go`; `TestDispatch_EmailOneAttempt`
- [ ] Dispatch returns while send blocked; send already started (NFR-5) — `TestDispatch_ReturnsAtOnce`
- [ ] Three targets, first blocked, second failing, third delivered (FR-83) — `TestDispatch_TargetsIndependent`
- [ ] Webhook skipped with warn line; mixed with email, email sent — `TestDispatch_WebhookSkipped`
- [ ] Log lines and fields; no address/URL/name/service name/message in logs — `TestDispatch_Logs`
- [ ] `Close` cancels, waits (gate), logs abandoned; success after Close logs delivered; second Close no-op; Dispatch after Close dropped — `TestClose_*`
- [ ] Dispatch racing Close under `-race` — `TestDispatch_RacingClose`
- [ ] Two services at once keep their ids — `TestDispatch_ConcurrentServices`

### Mailer (`adaptor/mailer/mailer_test.go`, fake SMTP server)

- [ ] No host: `ErrNotConfigured`, exact text, no connection — `TestSendEmail_NotConfigured`
- [ ] Mode `none`: sender, recipient, subject, four body lines, trailing `\n` — `TestSendEmail_Content`
- [ ] UTC time, seconds dropped, UTC+7 converted — `TestSendEmail_TimeUTC`
- [ ] CR/LF in name replaced by a space, no injected header — `TestSendEmail_NameLineBreaks`
- [ ] Non-ASCII intact — `TestSendEmail_NonASCII`
- [ ] ServiceID appears nowhere — `TestSendEmail_NothingElse`
- [ ] Malformed recipient: `ErrNotAccepted`, nothing reaches server — `TestSendEmail_MalformedRecipient`
- [ ] Failures (reject RCPT, close at connect, nothing listening, greeting delay beyond timeout, starttls not offered): exact text, no leak — `TestSendEmail_Failures`
- [ ] Ctx cancelled during greeting delay: `context.Canceled`, not `ErrNotAccepted` — `TestSendEmail_ContextCancelled`
- [ ] Auth: right password accepted, wrong rejected, empty username sends no AUTH — `TestSendEmail_Auth`
- [ ] Unknown TLS: `New` errors — `TestNew_UnknownTLS`
- [ ] Two concurrent sends succeed — `TestSendEmail_Concurrent`

### Fake SMTP server (`testutil/smtp_server_test.go`)

- [ ] Records message; each scripted behaviour works; stops and frees port; concurrent connections — `testutil/smtp_server.go`; `TestSMTPServer_*`

### Mailpit integration (`adaptor/mailer/mailer_integration_test.go`, tag `integration`)

- [ ] Mail arrives in Mailpit with sender, recipient, subject, four lines — `TestMailpit_Delivery`. Outcome: _pending_

### Wiring (`cmd/server/main.go`)

- [ ] Constructors, shutdown order, idempotent closes

### Repo-wide

- [ ] `make check` passes. Outcome: _pending_
- [ ] `git diff go.mod go.sum` shows only go-mail `v0.8.1` and its indirect dependencies
- [ ] Nothing outside the allowed paths changed; no configuration key added

## Integration tests

- `make test-integration`: _pending_

## Judgment calls

_To be filled at the end._
