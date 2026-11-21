# Plan: mail-failure-reasons

Branch: feat/mail-failure-reasons

- [ ] `domain.FailureCause` (nil, plain, wrapped, outer-wins) — `domain/failure_cause.go`, `failure_cause_test.go`; field `FailureCause` in `domain/target_test_result.go`
- [ ] Fake server `RejectSender` / `RejectData` — `testutil/smtp_server.go`, tests in `smtp_server_test.go`
- [ ] Mailer scenario table (15 rows: cause, visible text, `ErrNotAccepted`, no address) — `adaptor/mailer/mailer_test.go` (`TestSendEmail_Failures` rows)
- [ ] Two `timed out` rows run 25x under -race — `mailer_test.go`; outcome: (pending)
- [ ] Classifier unit tests — `adaptor/mailer/cause_test.go` (package `mailer`); classifier in `mailer.go` (or `cause.go` if > ~60 lines)
- [ ] Caller's context cancelled → context error, empty cause — `mailer_test.go` existing context tests
- [ ] `ErrNotConfigured`: empty cause, text unchanged — `mailer_test.go`
- [ ] Existing `err.Error()` assertions unchanged — `mailer_test.go`
- [ ] Dispatcher: `cause` on `alert delivery attempt failed` and `alert delivery failed`, no address — `worker/alert_dispatcher.go`, `TestAlertDispatcher_*` in `alert_dispatcher_test.go`
- [ ] Dispatcher: no `cause` key for plain errors / webhook; none on abandoned/superseded/delivered — `alert_dispatcher_test.go`
- [ ] Test alert usecase: `FailureCause` set/empty cases — `usecase/target_tester.go`, `target_tester_test.go`
- [ ] Handler: `target test sent` has `cause` only when failed and set; body unchanged — `handler/target_tests.go`, `target_tests_test.go`
- [ ] Fake server defaults unchanged — `smtp_server_test.go`
- [ ] `make check` — outcome: (pending)
- [ ] `make test-integration` (mailer has Mailpit test) — outcome: (pending)
- [ ] Nothing outside allowed paths changed — `git diff --stat main`
