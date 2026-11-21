# Task: mail failure causes in the log

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

When an email delivery fails, the log says why, in a few fixed words that never hold the address. Today the mailer returns only `the SMTP server did not accept the message` for every failure (a refused connection, a bad certificate, a wrong password, a refused recipient, a timeout) and drops the real cause on purpose, because go-mail's messages can hold the address (`CONVENTIONS.md`, Logging). So a misconfigured provider shows the same line in the log and in a test alert's `Failed: …` text, which hid the implicit-TLS bug found by hand (`mailer-implicit-tls`). After this task the mailer classifies a failure into one of a closed list of causes, the dispatcher logs the cause on its two failure lines, and a failed test alert logs it too. **The text the admin sees does not change.**

Decided by the user: finer fixed reasons, logged only; the reasons the board and the requirements show (FR-85, FR-107) stay the visible ones.

Requirements covered:

- FR-85, in part: the visible reason of a failed email delivery is still exactly `no SMTP account configured` or `the SMTP server did not accept the message`; tests pin both texts, in the mailer, the dispatcher, the test-alert usecase and the test-alert response.
- FR-107, in part: a failed test alert still answers 200 with `delivered: false` and the same `failure_reason` text; the cause is only in the log line.
- `CONVENTIONS.md`, Logging, as the rule this task must keep: no log line holds an email address, a URL, a header or the message. A test per log line shows it.

Out of scope:

- **Anything the admin sees.** No new text in the response, the board, an email or the form. A finer visible reason is a change of FR-85 and FR-107, which the user did not approve.
- **Webhook deliveries.** Their reasons are already specific (FR-85) and carry no cause. A webhook failure logs exactly the fields it logs today.
- **The `starttls` success path and authentication over `starttls`** (the other `alert-dispatch` backlog line). A `starttls` failure is logged as `other` (below); proving that path needs a fake that offers STARTTLS, which is not built.
- **Retry timing, the attempt timeout, the TLS handling, the mailer's configuration** and the order of checks in `SendEmail`. No behavior of a send changes, only what the returned error can say about itself.
- **A new configuration key**, a new dependency, a change of the go-mail version, and the contract.

## Prerequisite

`alert-dispatch`, `delivery-outcome`, `mailer-implicit-tls`, `test-target` (the test-alert operation) and `test-service-check-api` are merged. The last is not needed by the code; it is a prerequisite because `test-service-check-api` states that no task but the frontend's runs beside it, and both change tests in the `handler` and `usecase` packages. The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `adaptor/mailer.Mailer`, `Config`, `SendEmail`, `ErrNotConfigured`, `ErrNotAccepted`, the unexported `reason`, `sentinel` and `notAccepted` in `adaptor/mailer/mailer.go`, with the tests in `mailer_test.go` (package `mailer_test`: `newMailer`, `newTLSMailer`, `alertFor`, `TestSendEmail_Failures`, `TestSendEmail_Authentication`, `TestSendEmail_ImplicitTLSVerifiesTheServer`, `TestSendEmail_ImplicitTLSModeMismatches`).
- `testutil.SMTPServer` and `SMTPOptions` (`RejectRecipient`, `CloseAtConnect`, `GreetingDelay`, `Username`, `Password`, `TLS`, `StallHandshake`, `CertNames`) in `testutil/smtp_server.go`.
- `worker.AlertDispatcher.deliver` logging `alert delivery attempt failed` and `alert delivery failed` with a `reason` field (`worker/alert_dispatcher.go`), with `fakeMailer` and `secretAddress` in `alert_dispatcher_test.go`.
- `usecase` `TargetTester.TestTarget` returning `domain.TargetTestResult{FailureReason: err.Error()}` for a failed send (`usecase/target_tester.go`), and `handler.Server.TestTarget` logging `target test sent` (`handler/target_tests.go`).
- `domain.TargetTestResult` with `Delivered` and `FailureReason` (`domain/target_test_result.go`).

## Role and ownership

Role: Backend.

You may change only:

- `backend/internal/domain/target_test_result.go`, and two new files `backend/internal/domain/failure_cause.go` and `failure_cause_test.go`.
- `backend/internal/adaptor/mailer/mailer.go` and `mailer_test.go`, and two new files: `cause_test.go` (package `mailer`, the classifier's unit tests) and, if the classifier passes about 60 lines, `cause.go`.
- `backend/internal/testutil/smtp_server.go` and `smtp_server_test.go` (two new options, below).
- `backend/internal/worker/alert_dispatcher.go` and `alert_dispatcher_test.go`.
- `backend/internal/usecase/target_tester.go` and `target_tester_test.go`.
- `backend/internal/handler/target_tests.go` and `target_tests_test.go`.

You may not change anything else: not `handler/helpers_test.go` (the `testerSpy` there already lets a test set `result`), not `handler/router.go`, `handler/server.go`, `cmd/server/main.go`, `platform/config/**`, `backend/internal/adaptor/webhook/**`, `backend/internal/adaptor/probe/**`, migrations, `docs/openapi.yaml`, `backend/internal/api/**`, `.env.example`, `Makefile`, `backend/go.mod`, `backend/go.sum`, `frontend/**`, `e2e/**`, or `docs/**` (except your own plan file, `docs/tasks/mail-failure-reasons.plan.md`). No configuration key is added.

Shared files this task touches, owned by this task while it runs: everything in the lists above. Tasks that may run at the same time: `worker-test-hardening` (it changes `worker/scheduler_test.go`, `worker/check_runner.go`, `adaptor/probe/tcp.go` and `repository/service_state_test.go`; none of the files above), `backend-test-hardening` if drafted (it must not be run together with this one while it changes `testutil` or the mailbox helpers of the Mailpit test; see its file), and the frontend group's tasks.

## Operations used

None changes. `testTarget` (`POST /services/{serviceId}/notification-targets/test`) is served as it is: its request, its 200 body (`delivered`, `failure_reason`), and every status code are unchanged, and the cause is not part of it. `docs/openapi.yaml` lists no field for a cause, so none is added.

## Behavior

### 1. The causes

A **cause** is one of these ten fixed strings. They are lower case, contain no variable part, and are the only values ever logged as a cause.

| Cause | When |
|---|---|
| `could not connect` | The connection to the SMTP host was not made or was closed under the mailer: nothing listening, a name that does not resolve, a connection closed at once (`io.EOF`), a `*net.OpError` or `net.ErrClosed` that is not a timeout. |
| `TLS failed` | A TLS handshake of implicit TLS (`tls`) failed: a certificate that is not trusted or does not match the host (`*tls.CertificateVerificationError`; `x509.UnknownAuthorityError` and `x509.HostnameError` too, in case go-mail returns them bare), or a server that does not speak TLS (`tls.RecordHeaderError`). A `starttls` server that does not offer STARTTLS is **not** in this row: go-mail reports it as an untyped error, which is `other` (see "Known gaps"). |
| `login needs TLS` | `SMTP_TLS=none`, a username is configured, and go-mail found no authentication method it will use on an unencrypted connection: `errors.Is(err, mail.ErrNoSupportedAuthDiscovered)`. Over `tls` or `starttls` the same error is `other`. Go-mail does not refuse credentials outright: on an unencrypted connection it offers only SCRAM, NTLM and CRAM-MD5, and a server that offers one of those would be authenticated. |
| `login refused` | A `*textproto.Error` with code 530, 534, 535 or 538 (the codes of a refused authentication), found with `errors.As` in the error tree. Any other `*textproto.Error` (a refused greeting, EHLO or STARTTLS, for example) is `other`. |
| `sender refused` | The server refused `MAIL FROM`. |
| `recipient refused` | The server refused `RCPT TO`. |
| `message refused` | The server refused the message after it was offered (`DATA`, its end, or writing its content). |
| `invalid address` | The mailer could not build the message because the sender or the recipient address is not a valid address; nothing was dialled. Decided at the two call sites in `SendEmail` (`msg.From`, `msg.To`), not by the classifier: go-mail's error there is a plain untyped one. |
| `timed out` | The attempt ended at the attempt timeout (`Config.AttemptTimeout`): a deadline error anywhere in the tree, or the attempt's deadline had passed when the send returned. |
| `other` | Any other failure that is not one the caller's context ended: every untyped go-mail error, `*mail.SendError` with a reason this table does not list (`ErrSMTPReset`, which happens after the message was delivered, `ErrGetSender`, `ErrGetRcpts`, `ErrConnCheck`, `ErrNoUnencoded`, `ErrAmbiguous`), and the failure of `m.client(dial)`. |

**The classifier** is one function of three inputs: the error go-mail returned, the configured TLS mode, and whether the attempt's own deadline had passed when the send returned (`sendCtx.Err() != nil` while the caller's `ctx.Err()` is nil). It is needed because the end of the attempt closes the connection (`context.AfterFunc(sendCtx, held.close)`) and go-mail may then report `net.ErrClosed` instead of a deadline error; only the context tells the two apart. No behavior of a send changes: the same calls are made, in the same order, and the same error is returned; only the cause carried by it is new.

The classification order, first match wins: `timed out` (the attempt's deadline had passed, or the error is `context.DeadlineExceeded` or `os.ErrDeadlineExceeded`), then the typed causes (`TLS failed`, `login needs TLS`, `login refused`, `sender refused` for `*mail.SendError` with `ErrSMTPMailFrom`, `recipient refused` for `ErrSMTPRcptTo`, `message refused` for `ErrSMTPData`, `ErrSMTPDataClose` and `ErrWriteContent`), then `could not connect`, then `other`. Each check searches the whole error tree (go-mail joins a close error with the send error with `errors.Join`): the first rule in this order that matches anywhere in the tree decides, whatever its position in the tree. The builder finds which go-mail v0.8.1 error each test scenario below produces and writes the classifier from those, by type or error value, **never by matching text of a message** (a message can hold the address). The scenario table under "Acceptance criteria" is the specification: each row gives one failure and its cause.

- A failure that ended because the caller's context ended is not classified: `SendEmail` still returns the context's error, as today, and `FailureCause` of it is empty.
- `ErrNotConfigured` has no cause: the visible text already says it.

### 2. Where a cause lives

- **`domain.FailureCause(err error) string`** (new, `domain/failure_cause.go`): returns the cause of an error, or `""`. An error has a cause if it, or an error it wraps (found with `errors.As`), has the method `FailureCause() string`; the first one found wins. For `nil`, or an error with no such method, it returns `""`. The interface is unexported in the package or exported as `domain.FailureCauser`; the builder's choice. It exists so that `worker` and `usecase` read a cause without importing the mailer (`ARCHITECTURE.md`: they do not import adaptors).
- **The mailer's not-accepted error** (the existing `sentinel` returned by `notAccepted`) gets a method `FailureCause() string` returning its cause. `notAccepted` takes the cause as well as the underlying error: the two address call sites pass `invalid address`; the client-construction failure passes `other` (nothing was dialled: the deadline flag is false), and the send failure passes the classifier's result. The error's text is unchanged (`the SMTP server did not accept the message`), `errors.Is(err, ErrNotAccepted)` still holds, and the underlying error stays reachable through `Unwrap`, as `TestSendEmail_Failures` asserts today.
- **`domain.TargetTestResult`** gets a field `FailureCause string`, set only for a failed delivery that has a cause. It is not mapped into the API response.

### 3. What is logged

- **Dispatcher** (`worker/alert_dispatcher.go`): the lines `alert delivery attempt failed` (a failed attempt that will be retried) and `alert delivery failed` (the last attempt) gain a field `cause` holding `domain.FailureCause(err)` **when it is not empty**. Every other field, the message and the order of the checks in `deliver` stay as they are. No other line changes. A webhook failure has no cause, so its lines are exactly as today, with no `cause` field. A line for a send ended by the dispatcher's own context (`alert delivery abandoned`) stays as it is.
- **Test alert** (`usecase/target_tester.go` and `handler/target_tests.go`): when the send fails and the context has not ended, the usecase sets `FailureCause` of its result to `domain.FailureCause(err)` (empty for a webhook). The handler's `target test sent` line gains a field `cause` **only when `delivered` is false and the cause is not empty**; its other fields (`service_id`, `type`, `delivered`) stay. The response body is built from `Delivered` and `FailureReason` only, as today.
- The word is the cause only: no address, no host name, no port, no username, no message text, no wrapped error text. The two existing "no address in the log" tests (`secretAddress` in the dispatcher tests) keep passing and are extended: the line also has the cause.

### 4. Two new options in the fake SMTP server (`testutil/smtp_server.go`)

To produce the `sender refused` and `message refused` rows: `RejectSender bool` (answers every `MAIL FROM` with a `550`) and `RejectData bool` (accepts `MAIL FROM` and `RCPT TO`, answers `DATA` with a `554` and does not read a body). Each follows the existing option's style (comment, field, handling in the command loop) and has a test in `smtp_server_test.go`. Neither is combined with `Username` in a test; with both set, the server's existing demand for authentication comes first, as today. Nothing else in the server changes; the existing options and their tests are untouched.

### Known gaps

- The cause is logged by the dispatcher and the test alert only. A failure of an email sent any other way does not exist today.
- `login needs TLS` and `login refused` are proved on the `none` and `tls` modes only. A `starttls` login is untested for the reason given under "Out of scope".
- go-mail returns some failures as untyped errors, which the task does not match by text, so they are `other`: `starttls` against a server that does not offer STARTTLS, `server does not support SMTP AUTH`, and a bare `*textproto.Error` outside the four login codes (a refused greeting, EHLO or STARTTLS). Decided by the user: accept `other` for these and leave the `starttls`-unsupported row out of the table.
- `other` is the honest answer for an error the classifier does not know. A new go-mail version can change an error type; the scenario table in the tests is what notices it.
- go-mail's `*mail.SendError` has no `Unwrap`, so the rules cannot see an error inside it: after the greeting, a connection error or a deadline that beats the deadline flag can read as `sender refused`, `recipient refused` or `message refused`, and a 530 inside such a stage is not `login refused`. A 530 at the greeting or at a refused STARTTLS, which the rules do see, is `login refused`. No row covers these; the log cause is a hint, not a proof.
- `ErrSMTPReset` means the message was already delivered; the mailer still returns it as a failure today (so the dispatcher may retry). This task does not change that; its cause is `other`.
- A rejection by the server of one of several recipients is not a case: the mailer sends to one address.

## Structure

- `domain/failure_cause.go`: `FailureCause`. `domain/target_test_result.go`: the new field.
- `adaptor/mailer/mailer.go`: the cause constants (unexported strings or an unexported type; the strings are the values in the table above, exactly), one `classify` function from the underlying error, the TLS mode and the deadline flag to a cause (section 1), the method on `sentinel`, `notAccepted(cause, err)` with its call sites. Keep the classifier in `mailer.go` unless it passes about 60 lines; then a second file in the same package, `cause.go`.
- `worker/alert_dispatcher.go`: a small helper that returns the attributes of a failure line (`reason`, and `cause` when set), used by the two lines, so the rule is written once.
- `usecase/target_tester.go`, `handler/target_tests.go`: the two small edits above.

## Dependencies

None. No `go.mod` or `go.sum` change.

## Acceptance criteria

All run under `-race`; none is an integration test; no `time.Sleep`; real deadlines in adaptor tests are at most 200 ms (`TESTING.md`).

**`domain.FailureCause`**

- An error with the method returns its cause; a wrapped one (`fmt.Errorf("x: %w", err)`) returns it too; `nil` and a plain `errors.New` return `""`; with two causes in a chain the outer one is returned.

**Mailer: one test row per scenario, each asserting the cause with `domain.FailureCause(err)`, the visible text, `errors.Is(err, ErrNotAccepted)` and that the text does not contain the address**

| Scenario (fake server and config) | Cause |
|---|---|
| nothing listens on the port | `could not connect` |
| the server closes the connection at once (`CloseAtConnect`) | `could not connect` |
| the greeting is later than the attempt timeout (`GreetingDelay`, 150 ms timeout) | `timed out` |
| `tls`, the server's certificate is not trusted (no `RootCAs`) | `TLS failed` |
| `tls`, the certificate is for another name (`CertNames`) | `TLS failed` |
| `tls` against a plain server | `TLS failed` |
| `starttls` against a server that does not offer it | `other` |
| a stalled handshake (`StallHandshake`) at the attempt timeout | `timed out` |
| a username with `none` | `login needs TLS` |
| `tls`, a wrong password | `login refused` |
| the server rejects `MAIL FROM` (`RejectSender`) | `sender refused` |
| the server rejects the recipient (`RejectRecipient`) | `recipient refused` |
| the server rejects `DATA` (`RejectData`) | `message refused` |
| a recipient that is not an address | `invalid address` |
| a `Config.From` that is not an address | `invalid address` |

- A scenario the builder finds produces a different go-mail error than the table's cause says is reported before the classifier is bent to fit; see "Stop and ask when".
- The two `timed out` rows are run 25 times each under `-race` with no failure (the plan records it): the error of a send that ends at its deadline varies between a deadline error and `net.ErrClosed`, and both must give `timed out`.
- Classifier unit tests from inside the package, each a row: `context.DeadlineExceeded` and `os.ErrDeadlineExceeded` give `timed out`; `net.ErrClosed` (wrapped in a `*net.OpError`) gives `timed out` when the attempt's deadline had passed and `could not connect` when it had not; `io.EOF` gives `could not connect`; `*textproto.Error` with code 530, 534, 535 and 538 give `login refused`, and with 554 gives `other`; `mail.ErrNoSupportedAuthDiscovered` gives `login needs TLS` for mode `none` and `other` for `tls` and `starttls`; `*mail.SendError` with `ErrSMTPMailFrom`, `ErrSMTPRcptTo`, `ErrSMTPData`, `ErrSMTPDataClose` and `ErrWriteContent` give `sender refused`, `recipient refused`, `message refused` (three times); with `ErrSMTPReset`, `ErrGetSender`, `ErrGetRcpts`, `ErrConnCheck`, `ErrNoUnencoded` and `ErrAmbiguous` give `other`; an unknown error made by the test gives `other`; an error tree that joins a close error (`net.ErrClosed`) with a `*mail.SendError` for the recipient gives `recipient refused`.
- When the caller's context is cancelled during a send, `SendEmail` returns the context's error and `domain.FailureCause` of it is `""` (the existing context tests gain the assertion).
- `ErrNotConfigured`: `FailureCause` is `""`, and the text is unchanged.
- Every existing assertion on `err.Error()` in `mailer_test.go` still passes unchanged.

**Dispatcher**

- A failing email (a `fakeMailer` that returns a mailer-style error with a cause: its text is the visible reason, it has a `FailureCause` method, and it wraps an underlying error whose own text holds `secretAddress`, as go-mail's can) logs `alert delivery attempt failed` for each retried attempt and `alert delivery failed` for the last, each with `cause=<the cause>` and `reason=<the visible text>`; the lines carry no address (`secretAddress` is not in the output).
- An error with no cause (an email that returns a plain error, and a webhook failure) logs the same fields as before and **no `cause` key** (the existing tests of these lines stay as they are and gain the assertion that the key is absent).
- `alert delivery abandoned`, `alert delivery superseded` and `alert delivered` lines have no `cause`.

**Test alert**

- `TestTarget` for an email whose send fails with a cause returns `FailureReason` equal to the visible text and `FailureCause` equal to the cause; a webhook failure and a mailer with no cause return an empty `FailureCause`; a successful send and a context ended during the send return neither.
- The handler logs `target test sent` with `cause` when `delivered` is false and the cause is not empty (a `testerSpy` result with `FailureCause`), logs no `cause` key when the cause is empty or the delivery succeeded, and the line never holds the address, URL or reason text. The response body of a failed test is byte-for-byte what it was (`{"delivered":false,"failure_reason":"no SMTP account configured"}` stays pinned, with a second case that has a cause and the same body shape).

**Fake server**

- `RejectSender` answers `MAIL FROM` with 550 and delivers nothing; `RejectData` answers `DATA` with 554 and delivers nothing; neither changes the default behavior (the existing tests of the server pass unchanged).

**Repo-wide**

- `make check` passes; the mailer's integration test (`make test-integration`, Mailpit) still passes if it is run, and the builder reports "run" or "not run".
- Nothing outside the allowed paths changed.

## Verifier checks

- **By reading:** the visible text of every mail failure is unchanged in all four places; the classifier decides by error type or value and never by the text of a message (`strings.Contains` on an error is a finding); no log line gets anything but the fixed cause; the webhook paths are untouched; `heldConn`, the dial and the TLS handling are untouched; `domain` imports nothing new.
- **Mutation checks** (restore after each): make `classify` return `other` for everything, and see the scenario table fail; swap two causes (`sender refused` and `recipient refused`) and see the table fail; remove the `cause` field from the dispatcher's final line and see its test fail; remove the `cause` field from the handler's line and see its test fail; in the dispatcher, log the text of the wrapped underlying error (`errors.Unwrap(err).Error()`) as the cause, and see the no-address test fail; make `notAccepted` lose the underlying error and see the existing cause-reachable assertion fail.
- **Inputs to try:** an address with a quote or a space in the local part; a host that does not resolve (`no-such-host.invalid`); a username that is the address itself; a failed send in the last retry only.
- **Run it:** the mailer, worker, usecase and handler packages three times under `-race`; report failures.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- A scenario of the table cannot be told from another by an error type or value (for example two stages give the same go-mail error): do not match text and do not merge causes quietly; report which rows collide and what the errors are.
- You think you need a change outside your paths (the contract, `main.go`, a migration, a dependency, the go-mail version), or a configuration key.
- The merged code differs from "Prerequisite" (a renamed helper, a changed log line).
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check` (and the integration-test command from `TESTING.md` if you touched code with integration tests; the mailer has one), commit in small steps (the domain function and the field, the fake server options, the mailer, the dispatcher, the test alert), push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), the go-mail error each table row produced (type and value), which tests ran, dependency versions (none changed), and anything you were unsure about. Also list every judgment call this file did not settle.
