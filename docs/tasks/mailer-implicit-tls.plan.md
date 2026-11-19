# Plan: mailer implicit TLS

Files: M = `backend/internal/adaptor/mailer/mailer.go` / `mailer_test.go`; S = `backend/internal/testutil/smtp_server.go` / `smtp_server_test.go`.

Prerequisites checked on the branch: Mailer/Config/New/SendEmail/ErrNotConfigured/ErrNotAccepted/heldConn, testutil.SMTPServer, go-mail v0.8.1 all exist.

## Reproduce first
- [ ] Add TLS mode to the fake (S), add the `tls` send test and the authenticated one (M), run against unchanged `mailer.go`; record the failures here.

## Fake server (`smtp_server_test.go`)
- [ ] TLS: trusting client completes handshake + conversation, message recorded — `TestSMTPServer_TLS...`
- [ ] Client trusting nothing is refused at handshake, no message — same file
- [ ] Plain-text client gets no readable `220`
- [ ] `StallHandshake`: handshake never completes; server frees port and ends the connection at cleanup
- [ ] Certificate names `127.0.0.1` and `localhost` (and `CertNames` override)
- [ ] Existing plain-mode tests pass unchanged
- [ ] `Handshakes()` counts only completed handshakes

## Mailer (`mailer_test.go`)
- [ ] The bug: `tls` send with `RootCAs` = `Pool()` succeeds, one message, fast — `TestSendEmail_ImplicitTLS`
- [ ] One connection and `Handshakes()` == 1
- [ ] Verification on: untrusted cert (no RootCAs / other pool) and name mismatch -> `ErrNotAccepted`, fixed text, no address, no message
- [ ] Plain server on `tls` mailer fails < 1 s; `TLS` server on `none` / `starttls` mailer -> `ErrNotAccepted`, no message
- [ ] `StallHandshake` -> `ErrNotAccepted` at the attempt timeout (200 ms); cleanup does not hang
- [ ] Cancel during stalled handshake -> `context.Canceled`, not `ErrNotAccepted`, within 2 s (timeout 10 s)
- [ ] Authentication over TLS: right password accepted with `AuthCommands()` > 0; wrong password `ErrNotAccepted`, no message; refusal on unencrypted stays; comment above `TestSendEmail_Authentication` updated
- [ ] Two concurrent `tls` sends under `-race`
- [ ] Other modes unchanged; `TestNew_UnknownTLSMode` still passes
- [ ] `RootCAs` unset keeps system roots (covered by the untrusted case)

## Implementation (`mailer.go`)
- [ ] `Config.RootCAs`; `tls` mode dial = TCP, then TLS handshake under send ctx (ServerName Host, min TLS 1.2, verification on), returns `*tls.Conn`; `heldConn` keeps raw TCP; no `WithSSL()`, `WithTLSPolicy(TLSOpportunistic)`

## Repo-wide
- [ ] `make check`: not yet run
- [ ] `make test-integration`: not yet run
- [ ] `git diff` touches only the four allowed files plus this plan

## Judgment calls
(filled at the end)
