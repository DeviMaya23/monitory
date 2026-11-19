# Task: mailer implicit TLS

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

`SMTP_TLS=tls` (implicit TLS, port 465) works. Today a send with `tls` against a real provider hangs for the whole 10-second attempt timeout and then fails with `the SMTP server did not accept the message`, while the same account on port 587 with `starttls` sends in about four seconds, and `curl` to port 465 works (found by hand against Resend). `tls` is a documented option in `.env.example` and in the requirements' list of deployment settings, and no test ever exercised it: the in-process fake SMTP server makes no TLS. After this task a `tls` send connects, completes the TLS handshake first, then speaks SMTP, within the attempt's deadline, and there is a test server and tests that prove it.

Requirements covered:

- FR-81, FR-85, in part: an email delivery over the configured SMTP account succeeds in all three modes the configuration allows (`starttls`, `tls`, `none`); the failures keep the two fixed reasons (`no SMTP account configured`, `the SMTP server did not accept the message`).
- FR-85, in part: a connection that cannot complete a TLS handshake fails within the attempt's deadline, and ending the context ends a handshake in progress (the dispatcher's `Close`, a client that leaves the test alert).

Out of scope:

- **The reasons.** The text shown for any failure is not changed here; showing or logging the real cause is a separate backlog item that needs the user's decision.
- **The `starttls` success path** (a fake server that offers STARTTLS), a Mailpit that serves TLS, and the production SMTP provider's own behavior. The manual check of milestone 2 covers the provider (`docs/manual-checks.md`).
- **A new configuration key, any change to `.env.example`, `docker-compose.yml`, the Makefile or CI**, a new dependency, or a change of the go-mail version (see "Stop and ask when").
- **Skipping certificate verification.** The mailer never skips it, and this task adds no way to.

## Prerequisite

`alert-dispatch` is merged (it is). The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `adaptor/mailer.Mailer`, `Config` (`Host`, `Port`, `TLS`, `Username`, `Password`, `From`, `AttemptTimeout`), `New`, `SendEmail`, `ErrNotConfigured`, `ErrNotAccepted`, and `heldConn` with its `dial` and `close`, in `backend/internal/adaptor/mailer/mailer.go`; the tests in `mailer_test.go` (package `mailer_test`) with its helpers (`newMailer`, `alertFor`, and the rest) and `mailer_integration_test.go` (build tag `integration`).
- `testutil.SMTPServer`, `SMTPOptions`, `NewSMTPServer`, `Messages`, `Connections`, `AuthCommands`, `Addr` in `backend/internal/testutil/smtp_server.go`, and its tests in `smtp_server_test.go`.
- `github.com/wneessen/go-mail` v0.8.1 in `backend/go.mod`.
- The in-process fake serves plain SMTP only (`EHLO`/`HELO`, `MAIL FROM`, `RCPT TO`, `DATA`, `RSET`, `NOOP`, `QUIT`, and `AUTH PLAIN` when a username is set).

## Role and ownership

Role: Backend.

You may change only:

- `backend/internal/adaptor/mailer/mailer.go`, `mailer_test.go`
- `backend/internal/testutil/smtp_server.go`, `smtp_server_test.go`

You may not change anything else: not `backend/cmd/server/main.go`, `backend/internal/platform/config/**`, `backend/internal/worker/**`, `backend/internal/usecase/**`, `backend/internal/domain/**`, `backend/internal/handler/**`, `mailer_integration_test.go`, `.env.example`, `docker-compose.yml`, `Makefile`, `backend/go.mod`, `backend/go.sum`, `frontend/**`, `e2e/**`, `docs/**` (except your own plan file, `docs/tasks/mailer-implicit-tls.plan.md`). No configuration key is added or renamed.

Shared files this task touches, all owned by this task while it runs: `adaptor/mailer/mailer.go` and its test, `testutil/smtp_server.go` and its test. No other backend task is open. Tasks that may run at the same time: frontend and end-to-end tasks.

## Operations used

None. No operation of `docs/openapi.yaml` is implemented and no request is served; the app's behavior over HTTP is unchanged.

## Behavior

### What exists, and the suspected cause

`Mailer.SendEmail` builds one message and sends it through go-mail on a connection made for the call. `Mailer.client` passes go-mail a custom dial function (`heldConn.dial`) in every mode, so that the end of the send's context can close the connection and wake a blocked read. For `tls` it also passes go-mail's `WithSSL()` option.

In go-mail v0.8.1, `client.go` around lines 1201 to 1208 chooses go-mail's own TLS dialer only when **no** custom dial function is set. With one set, `WithSSL()` does not wrap the connection: `heldConn.dial` returns a plain TCP connection to a port that expects a TLS handshake first, so the server waits for the client's hello and the client waits for the server's greeting, until the attempt deadline. `WithSSL()` also makes go-mail skip its whole `tls()` step (around lines 1858 to 1890, which only runs when `useSSL` is false), and that step is the only place that marks a connection as encrypted for the authentication that follows: with `WithSSL()` and a custom dial function, `isEncrypted` stays false (`client.go` 1200 to 1210), and `authTypeAutoDiscover` then offers only SCRAM, NTLM and CRAM-MD5, never PLAIN or LOGIN (around lines 1592 to 1606). So even a connection that completed its handshake would not authenticate with the PLAIN or LOGIN that providers such as Resend and Gmail offer on port 465. This is the suspected cause and **the builder confirms it by reproducing before changing anything** (see "Reproduce first"); if the cause is different, the builder stops and reports (see "Stop and ask when").

### Reproduce first

1. Add the TLS mode to the fake server (below) and a test that sends through it in `tls` mode with an `AttemptTimeout` of 200 ms (`TESTING.md` caps real deadlines in adaptor tests at 200 ms). Run it against the unchanged mailer: it must fail by the attempt timeout. Record the failure in the plan: this is the bug. Then add the authenticated variant and run it too against the unchanged mailer.
2. Only then change `mailer.go`.

### The fix

In `tls` mode the connection the mailer gives go-mail is a TLS connection: the dial function dials TCP as before, then runs the TLS client handshake on it under the send's context before returning it, with this configuration: the server name is the configured `Host`, the minimum version is TLS 1.2, the trusted roots are the system's (or `Config.RootCAs` when set, see below), and certificate verification is on. The dial function returns the `*tls.Conn` itself, not a wrapper of it, so that go-mail's SMTP client recognizes it as a TLS connection. In this mode the mailer does **not** pass `WithSSL()` (which, with a custom dial function, only turns go-mail's own TLS handling off) and passes `WithTLSPolicy(mail.TLSOpportunistic)` instead: go-mail then does not start STARTTLS when the server does not offer it (a server inside an implicit TLS session does not), reads the connection's TLS state, treats the connection as encrypted, and so lets authentication use PLAIN and LOGIN. This is the intended mechanism; the builder confirms by test that the authenticated send of the criteria below succeeds, and if go-mail does not behave as described the builder stops and reports (see "Stop and ask when"). In `starttls` and `none` modes nothing changes.

- **Cancellation.** `heldConn` keeps the **raw** TCP connection, so that closing it when the send's context ends aborts a handshake in progress as well as a read. The returned TLS connection wraps the same raw connection, and closing either ends both. The mailer still writes no `go` statement of its own (`context.AfterFunc` and the handshake's context are enough).
- **Deadline.** The handshake runs under the same deadline as the rest of the send (`AttemptTimeout` on top of `ctx`); it has no timeout of its own and no literal limit.
- **Failures.** A handshake that fails (an untrusted or expired certificate, a host name that does not match, a server that speaks plain SMTP on that port, a server that never answers, a closed connection) returns `ErrNotAccepted`, with the text `the SMTP server did not accept the message` and no cause in the text; if `ctx` itself ended first the context's error is returned instead, as for every other failure.
- **A trust hook for tests.** `Config` gains one optional field, `RootCAs *x509.CertPool`: the roots that verify the server's certificate; nil means the system's. `main.go` does not set it (so production uses the system's roots and no configuration key is added), and it is not a way to skip verification: a certificate that the pool does not trust is refused. It is the only change to `Config`.
- **No other behavior changes:** the message, the headers, authentication (go-mail's auto-discovery, with credentials only over a connection it recognizes as encrypted, which in `tls` mode now includes PLAIN and LOGIN), the one connection per send and its close, the two reasons.

### The fake server (`testutil.SMTPServer`)

`SMTPOptions` gains:

- `TLS bool`: the server speaks **implicit TLS**: every accepted connection runs a TLS server handshake before the greeting, with a certificate the server makes for the test (a self-signed ECDSA P-256 certificate valid for `127.0.0.1` and `localhost`, valid from a minute ago for an hour, generated with the standard library when the server starts). The commands after the handshake are the same as in the plain mode.
- `StallHandshake bool` (only with `TLS`): the server accepts the TCP connection and never answers the handshake: it reads and discards what arrives and sends nothing, until the connection or the server closes.
- `CertNames []string` (only with `TLS`): the names the server's certificate is valid for, DNS names or IP addresses; the default, when empty, is `127.0.0.1` and `localhost`. A test sets it to a name that does not include the address the mailer dials, to make a name mismatch.

`SMTPServer` gains `Pool() *x509.CertPool`, which trusts the server's certificate (and so is what a test passes as `Config.RootCAs`), and `Handshakes() int`, the number of TLS handshakes the server completed. `Connections()`, `Messages()` and `AuthCommands()` count as before; a connection that never completes the handshake counts as a connection, adds nothing to `Handshakes()` and records no message. The plain mode and its options are unchanged (`TestSMTPServer_AdvertisesNothingExtra` still holds), the type's documentation no longer says it makes no TLS but that it makes TLS only with `TLS`, and it advertises no STARTTLS in either mode.

When `TLS` and a `Username` are both set, `AUTH PLAIN` is advertised and accepted as in the plain mode (go-mail authenticates with PLAIN only over a connection it recognizes as encrypted, so this is the first server on which an authenticated send can succeed).

### Known gaps

- **`starttls` success and its refusal paths with a certificate** are not tested here (only the existing refusal against a server that offers no STARTTLS). The backlog's authentication line stays for `starttls`.
- **A real provider** is not exercised by any test; the manual check does it.
- **No trust hook for the fake in `starttls`:** `RootCAs` works in every mode, but nothing tests it with `starttls`.
- **The opportunistic policy would try STARTTLS inside the TLS session** if a server advertised it there, which fails. Providers do not advertise STARTTLS inside an implicit TLS session, and the fake never does; the mode is not tested against a server that does.
- **The reason stays generic.** An admin whose `tls` setup fails still sees only `the SMTP server did not accept the message` and no cause in the log (a separate backlog item).
- **`localhost` and `127.0.0.1` in the test certificate:** a test reaches the fake as `127.0.0.1`; the name check is shown with a deliberate mismatch.

## Structure

By `ARCHITECTURE.md` ("Interfaces"; `adaptor/` holds no business rules). Names marked "new" are fixed by this file; the rest is the builder's choice.

- `adaptor/mailer/mailer.go`: the TLS dial for `tls` mode inside `heldConn` (or a helper it uses), and `Config.RootCAs` (new). It imports `domain`, go-mail and the standard library only.
- `testutil/smtp_server.go`: `SMTPOptions.TLS` and `StallHandshake` (new), `SMTPServer.Pool()` (new), the certificate made at start. Standard library only.
- `mailer_test.go` and `smtp_server_test.go`: the tests below. A helper in `mailer_test.go` that builds a mailer for the TLS server sets `TLS` to `tls`, the server's host and port, and `RootCAs` to `Pool()`.

No new package, dependency or configuration key.

## Dependencies

None. The standard library (`crypto/tls`, `crypto/x509`, `crypto/ecdsa` and friends) and the go-mail version already pinned; `go.mod` and `go.sum` do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed. The mailer tests use the fake server with real, short deadlines (`TESTING.md`: at most 200 ms for a timeout case in an adaptor test; where the attempt timeout must elapse use a short `AttemptTimeout` such as 300 ms); no `time.Sleep`. Run them with `-race`.

**Fake server (`testutil/smtp_server_test.go`)**

- With `TLS`, a client that trusts `Pool()` completes a handshake and a plain SMTP conversation and the message is recorded; a client that trusts nothing is refused at the handshake and no message is recorded; a plain-text client gets no greeting it can read (its read fails or returns garbage, not `220`); with `StallHandshake` a client's handshake never completes until the client gives up, and the server frees the port and ends the connection at the end of the test; the certificate names `127.0.0.1` and `localhost`; the existing tests of the plain mode pass unchanged.

**Mailer (`mailer_test.go`, the fake in `TLS` mode)**

- **The bug:** a send in `tls` mode with `RootCAs` set to the server's pool succeeds, the server recorded one message from the configured sender to the address with the subject and four-line body of the other tests, in well under the attempt timeout; this test fails by the timeout on the unfixed code (reproduced first and recorded in the plan) (FR-81, FR-85).
- The send used TLS: the server saw one connection and `Handshakes()` is 1 (FR-85).
- Verification is on: a server whose certificate the pool does not trust (no `RootCAs`, or a pool of another certificate) gives `ErrNotAccepted` with the text `the SMTP server did not accept the message`, no message recorded, and the text holds neither the address nor the cause's text; a certificate that does not name the host (the server started with `CertNames` set to a name that is not `127.0.0.1`, the mailer dialling `127.0.0.1` with the right pool) gives the same.
- A plain-text server on a `tls` mailer fails promptly with `ErrNotAccepted` (with an `AttemptTimeout` of 2 seconds, the call returns in under 1 second: the TLS client rejects the plain greeting at once); a `TLS` server on a `none` or `starttls` mailer gives `ErrNotAccepted` and records no message (the plain client waits for a greeting that does not come, so this case ends at the attempt timeout: use 200 ms).
- A server that never completes the handshake (`StallHandshake`) gives `ErrNotAccepted` at the attempt timeout (a 200 ms `AttemptTimeout`; the test asserts the error and that the call took at least most of the timeout, not a tight upper bound), and the server's cleanup at the end of the test does not hang (the connection was closed).
- A `ctx` cancelled while the handshake is stalled (the test waits until the server counts the connection, then cancels) returns `errors.Is(err, context.Canceled)` and not `ErrNotAccepted`, within 2 seconds, with the attempt timeout set to 10 seconds so that a return at the timeout would be seen.
- Authentication over TLS: with a username and password set and a server that demands them, the mail is accepted and `AuthCommands()` is greater than zero (this test fails on a mailer that returns a handshaken connection but does not mark it encrypted: go-mail then offers no PLAIN); with a wrong password the result is `ErrNotAccepted`, `AuthCommands()` is greater than zero and no message is recorded; the existing refusal on an unencrypted connection stays. The comment above `TestSendEmail_Authentication` (it says an authenticated send that succeeds cannot be tested) is updated to say it can, over `tls`.
- Two concurrent sends in `tls` mode to one mailer under `-race` both succeed, each on its own connection.
- The other modes are unchanged: every existing mailer test passes with only its setup changed (if any), and no assertion is changed or removed; `TestNew_UnknownTLSMode` still refuses an unknown mode.
- `RootCAs` unset keeps the system roots: a `tls` send to the fake whose certificate is not in the system roots fails verification (the case above), which shows the default is not "trust everything".

**Repo-wide**

- `make check` passes, and `make test-integration` is run when Docker is available (the Mailpit test is unchanged and still passes), reported as "run, passed", "run, failed" or "not run" with the reason.
- `git diff` shows no change to `go.mod`, `go.sum`, `.env.example`, `docker-compose.yml`, `Makefile`, `main.go`, `platform/config`, `mailer_integration_test.go` or any file outside the allowed paths; no configuration key was added.

## Verifier checks

- **The bug is real and fixed:** run the new `tls` send test and the authenticated one against the code before the fix (revert `mailer.go` in a scratch worktree) and see them fail by the timeout; run them after and see them pass in a few milliseconds.
- **Verification is never off:** read `mailer.go`: there is no `InsecureSkipVerify`, no custom `VerifyPeerCertificate` that accepts everything, and `RootCAs` only sets the trusted roots; `main.go` does not set it.
- **Layering and time:** `adaptor/mailer` imports `domain`, go-mail and the standard library only; no `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` outside tests; the mailer writes no `go` statement (`context.AfterFunc` only); the handshake has no timeout literal.
- **Cancellation:** the held connection is the raw TCP one; closing it ends the handshake; the test for a cancelled handshake fails if `heldConn` holds only the TLS connection or none.
- **The dial returns the `*tls.Conn` itself:** by reading, not a wrapper; `WithSSL()` is not passed in `tls` mode; the TLS policy there is opportunistic.
- **No leak of the cause:** the error text of every failure is one of the two fixed texts.
- **Mutation checks to run:** skip the handshake (the original behavior); skip verification; use the wrong server name; hold the TLS connection instead of the raw one; ignore `ctx` in the handshake; make `RootCAs` ignored; wrap the TLS connection (so it is not recognized as encrypted); pass `WithSSL()` back in. Each must fail at least one named test.
- **Inputs to try:** a `tls` send to a plain server, to a stalled server, to a server with an untrusted certificate and with a name mismatch; a cancel during the handshake; an authenticated send with the right and a wrong password; two concurrent sends; the three modes in turn against their servers.
- **What the verifier cannot prove:** behavior against a real provider (Resend on port 465, Gmail) and a real certificate chain; say so in the report. The user runs the manual check with the real settings.

## Stop and ask when

- The contract, a requirement, or this file conflict with each other.
- The reproduction shows a different cause than the one suspected above: report what the test shows (where it hangs) and stop; do not guess a second fix.
- The fix needs go-mail to change (a different version, a patch or a copy of its code), or go-mail does not treat the returned `*tls.Conn` as encrypted with the opportunistic policy (no PLAIN or LOGIN is offered, or it tries STARTTLS inside the session): stop and report what you found; do not change `go.mod`.
- You think you need a change outside your paths, a dependency, a configuration key, a skip of certificate verification, or an edit to a spec file.
- A convention in `CONVENTIONS.md` or `TESTING.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check` and `make test-integration` (it needs Docker for Mailpit), commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, the failing test before the fix and its message, what changed, requirement IDs covered (with the test that shows each), whether the Mailpit test ran, dependency versions (none changed), and anything you were unsure about. Also list every judgment call this file did not settle.
