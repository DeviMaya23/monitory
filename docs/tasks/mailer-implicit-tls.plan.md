# Plan: mailer implicit TLS

Files: M = `backend/internal/adaptor/mailer/mailer.go` / `mailer_test.go`; S = `backend/internal/testutil/smtp_server.go` / `smtp_server_test.go`.

Prerequisites checked on the branch: Mailer/Config/New/SendEmail/ErrNotConfigured/ErrNotAccepted/heldConn, testutil.SMTPServer, go-mail v0.8.1 all exist.

## Reproduce first
- [x] Add TLS mode to the fake (S), add the `tls` send test and the authenticated one (M), run against unchanged `mailer.go`; record the failures here.
  - Only `Config.RootCAs` (unused) was added to `mailer.go` so the tests compile; behaviour was unchanged.
  - Before the fix, `TestSendEmail_ImplicitTLS/a_send_succeeds_well_within_the_attempt_timeout` failed after 0.20 s (the 200 ms attempt timeout) with `Received unexpected error: the SMTP server did not accept the message`. The same test with the default 2 s timeout, `.../the_send_used_TLS_on_one_connection`, failed after 2.00 s the same way, and so did the concurrent one.
  - `TestSendEmail_Authentication/over_tls_the_credentials_are_accepted` failed after 2.00 s (`AuthCommands()` was 0, "0" is not positive); the wrong-password variant also took 2.00 s and failed.
  - `TestSendEmail_ImplicitTLSModeMismatches/a_plain_server_on_a_tls_mailer_fails_promptly` failed because the send succeeded in plain text (`Expected error ... in chain but got nil`): the mailer spoke plain SMTP on a `tls` setting.
  - After the fix, all pass in a few milliseconds.

## Fake server (`smtp_server_test.go`)
- [x] TLS: trusting client completes handshake + conversation, message recorded — `TestSMTPServer_TLS...`
- [x] Client trusting nothing is refused at handshake, no message — same file
- [x] Plain-text client gets no readable `220`
- [x] `StallHandshake`: handshake never completes; server frees port and ends the connection at cleanup
- [x] Certificate names `127.0.0.1` and `localhost` (and `CertNames` override)
- [x] Existing plain-mode tests pass unchanged
- [x] `Handshakes()` counts only completed handshakes

## Mailer (`mailer_test.go`)
- [x] The bug: `tls` send with `RootCAs` = `Pool()` succeeds, one message, fast — `TestSendEmail_ImplicitTLS`
- [x] One connection and `Handshakes()` == 1
- [x] Verification on: untrusted cert (no RootCAs / other pool) and name mismatch -> `ErrNotAccepted`, fixed text, no address, no message
- [x] Plain server on `tls` mailer fails < 1 s; `TLS` server on `none` / `starttls` mailer -> `ErrNotAccepted`, no message
- [x] `StallHandshake` -> `ErrNotAccepted` at the attempt timeout (200 ms); cleanup does not hang
- [x] Cancel during stalled handshake -> `context.Canceled`, not `ErrNotAccepted`, within 2 s (timeout 10 s)
- [x] Authentication over TLS: right password accepted with `AuthCommands()` > 0; wrong password `ErrNotAccepted`, no message; refusal on unencrypted stays; comment above `TestSendEmail_Authentication` updated
- [x] Two concurrent `tls` sends under `-race`
- [x] Other modes unchanged; `TestNew_UnknownTLSMode` still passes
- [x] `RootCAs` unset keeps system roots (covered by the untrusted case)

## Implementation (`mailer.go`)
- [x] `Config.RootCAs`; `tls` mode dial = TCP, then TLS handshake under send ctx (ServerName Host, min TLS 1.2, verification on), returns `*tls.Conn`; `heldConn` keeps raw TCP; no `WithSSL()`, `WithTLSPolicy(TLSOpportunistic)`

## Repo-wide
- [x] `make check`: run, passed (after `npm ci` in `frontend/`; a fresh checkout had no eslint)
- [x] `make test-integration`: run, passed (Mailpit v1.33.1). `make` itself could not start its own Mailpit because ports 1025 and 8025 were held by another worktree's Mailpit container (`alert-dispatch-builder-mailpit-1`, left untouched), so I ran `go test -race -tags integration ./...` against that one. `TestMailpit_DeliversTheAlert` passed. One unrelated flake: `worker.TestScheduler_ContextWinsOverFiredTimer` failed once in that run and passed in `make check` and in 5 reruns; the worker package is not touched here.
- [x] `git diff` touches only the four allowed files plus this plan

## Judgment calls
- `Config.RootCAs` was added in the first mailer step, before the fix, only so the reproducing tests compile.
- The fake server's own handshake uses `context.Background()` (the linter forbids the context-less `Handshake`); closing the connection at server stop aborts it.
- The fake's certificate is its own CA (`IsCA`, `KeyUsageCertSign`) so one pool trusts it as a root.
- "Well under the attempt timeout" is asserted as under 150 ms with a 200 ms timeout.
- The "port is freed" check for `StallHandshake` runs after a nested subtest's cleanup, and by dialling the address and expecting refusal.
- Extra case beyond the criteria: an empty `x509.CertPool` also refuses.
- On a handshake failure the dial closes the raw connection itself and returns the handshake error; `SendEmail` wraps it as `ErrNotAccepted` like any failure.
- I did not run the verifier's mutation checks (the task assigns them to the verifier).
- `make test-integration` was replaced by the equivalent `go test` command against an already running Mailpit, because the ports were taken (see above).
