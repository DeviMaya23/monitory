# Plan: mail-failure-reasons

Branch: feat/mail-failure-reasons

- [x] `domain.FailureCause` (nil, plain, wrapped, outer-wins) — `domain/failure_cause.go`, `failure_cause_test.go`; field `FailureCause` in `domain/target_test_result.go`
- [x] Fake server `RejectSender` / `RejectData` — `testutil/smtp_server.go`, tests in `smtp_server_test.go`
- [x] Mailer scenario table (15 rows: cause, visible text, `ErrNotAccepted`, no address) — `adaptor/mailer/mailer_test.go` (`TestSendEmail_Failures` rows)
- [x] Two `timed out` rows run 25x under -race — `mailer_test.go` `TestSendEmail_TimedOutIsStable`; outcome: run, 25 loops each, passed (also with -count=3)
- [x] Classifier unit tests — `adaptor/mailer/cause_test.go` (package `mailer`); classifier in `mailer.go` (or `cause.go` if > ~60 lines)
- [x] Caller's context cancelled → context error, empty cause — `mailer_test.go` existing context tests
- [x] `ErrNotConfigured`: empty cause, text unchanged — `mailer_test.go`
- [x] Existing `err.Error()` assertions unchanged — `mailer_test.go`
- [x] Dispatcher: `cause` on `alert delivery attempt failed` and `alert delivery failed`, no address — `worker/alert_dispatcher.go`, `TestAlertDispatcher_*` in `alert_dispatcher_test.go`
- [x] Dispatcher: no `cause` key for plain errors / webhook; none on abandoned/superseded/delivered — `alert_dispatcher_test.go`
- [x] Test alert usecase: `FailureCause` set/empty cases — `usecase/target_tester.go`, `target_tester_test.go`
- [x] Handler: `target test sent` has `cause` only when failed and set; body unchanged — `handler/target_tests.go`, `target_tests_test.go`
- [x] Fake server defaults unchanged — `smtp_server_test.go`
- [x] `make check` — outcome: run, passed (after `npm ci` in frontend)
- [x] `make test-integration` (mailer has Mailpit test) — outcome: not run: Docker is not running on this machine
- [x] Nothing outside allowed paths changed — `git diff --stat main`

## Go-mail error per scenario row

| Row | Cause | Error tree under the not-accepted error |
|---|---|---|
| nothing listens | could not connect | `*net.OpError` (dial) |
| `CloseAtConnect` | could not connect | `io.EOF`-style errorString, matched by `io.EOF`/`net.ErrClosed` |
| late greeting | timed out | `*net.OpError` wrapping `poll.DeadlineExceededError` |
| tls untrusted / other name | TLS failed | `*tls.CertificateVerificationError` (`x509.UnknownAuthorityError` / `HostnameError`) |
| tls vs plain server | TLS failed | `tls.RecordHeaderError` |
| starttls unsupported | other | untyped errorString |
| stalled handshake | timed out | `context.deadlineExceededError` |
| username with none | login needs TLS | `mail.ErrNoSupportedAuthDiscovered` |
| wrong password | login refused | `*textproto.Error` (535) |
| MAIL / RCPT / DATA refused | sender / recipient / message refused | `*mail.SendError` (inside `errors.Join`) with `ErrSMTPMailFrom` / `ErrSMTPRcptTo` / `ErrSMTPData` |
| bad addresses | invalid address | set at the call sites |

## Judgment calls

- The classifier lives in `cause.go` (over about 60 lines).
- A `net.Error` that reports `Timeout()` but is neither deadline error is `other`, not `could not connect` ("not a timeout" in the task).
- `login needs TLS` is decided by mode `none` and the error alone; the classifier has no username input.
- The 15 table rows replaced the rows of `TestSendEmail_Failures` (same assertions kept, cause added); the 25-run check is a separate test, `TestSendEmail_TimedOutIsStable`.
- `domain.FailureCauser` is exported.
- The integration test was not run because Docker is not running here.
