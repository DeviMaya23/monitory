# Verification report: mailer implicit TLS

Branch: `verify/mailer-implicit-tls` (started from `feat/mailer-implicit-tls` at `e69f167`; the verifier added only this report).

Result: **no Blocking findings.** Two Non-blocking findings.

`make check`: passed (the fresh checkout needed `npm ci` in `frontend/` first; without it `eslint` is missing).
Integration: **run, passed** (`TestMailpit_DeliversTheAlert`, Mailpit v1.33.1). `make test-integration` could not start its own Mailpit (port 1025 is held by another worktree's container, `alert-dispatch-builder-mailpit-1`, left untouched), so I ran `go test -race -tags integration -run Mailpit ./internal/adaptor/mailer/` against that one. That test clears the mailbox of whichever Mailpit answers (backlog item), so it cleared the sibling's mailbox. Only `TestMailpit_DeliversTheAlert` exists in the `integration` tag for this package; no criterion depends only on it (the `tls` path is covered by the in-process fake, not by Mailpit, which serves no TLS here).
Flake check: `-race -count=15` on `adaptor/mailer` and `testutil`: passed.

## 1. Acceptance criteria

"Real?" = would the named test fail if the behavior were removed (confirmed by the mutation in section 4 where noted).

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| F1 | Fake with `TLS`: trusting client handshakes, converses, message recorded | `TestSMTPServer_TLS/a_client_that_trusts_the_pool_completes_the_handshake_and_a_conversation` | Yes: asserts message, 1 connection, 1 handshake | Met |
| F2 | Client that trusts nothing is refused, no message | `.../a_client_that_trusts_nothing_is_refused_at_the_handshake` | Yes (message and `Handshakes()` asserted zero; a server without TLS would not refuse the dial) | Met |
| F3 | Plain-text client gets no readable `220` | `.../a_plain-text_client_gets_no_greeting_it_can_read` | Yes against a plain server (it would greet `220`) | Met |
| F4 | `StallHandshake`: never completes; server frees the port and ends the connection | `.../a_stalled_handshake_never_completes_and_the_server_frees_the_port_at_the_end` | Yes: a server that kept the connection would hang the nested cleanup; port is dialled after | Met |
| F5 | Certificate names `127.0.0.1` and `localhost`; `CertNames` overrides | `.../the_certificate_names_localhost_too`, `.../CertNames_replaces_the_default_names` | Yes (negative and positive name checks) | Met |
| F6 | Plain-mode tests unchanged | whole `smtp_server_test.go`, `TestSMTPServer_AdvertisesNothingExtra`; diff only adds | Yes | Met |
| M1 | The bug: `tls` send with `RootCAs`=pool succeeds, right message, well under the timeout (FR-81, FR-85) | `TestSendEmail_ImplicitTLS/a_send_succeeds_well_within_the_attempt_timeout` | Yes: fails at 0.20 s on "skip handshake" mutation (the original behavior) | Met |
| M2 | One connection, `Handshakes()` is 1 (FR-85) | `.../the_send_used_TLS_on_one_connection` | Yes: fails (2.00 s) on the same mutation | Met |
| M3 | Verification on: untrusted, other pool, name mismatch give `ErrNotAccepted`, fixed text, no address, no message | `TestSendEmail_ImplicitTLSVerifiesTheServer` (4 rows, one is an extra empty pool) | Yes: all four rows fail with `InsecureSkipVerify` | Met |
| M4 | Plain server on a `tls` mailer fails in under 1 s with `ErrNotAccepted` | `TestSendEmail_ImplicitTLSModeMismatches/a_plain_server_on_a_tls_mailer_fails_promptly` | Yes: on the original code the send succeeded in plain text and the test fails | Met |
| M5 | `TLS` server on `none` / `starttls` mailer: `ErrNotAccepted`, no message | `.../a_TLS_server_on_a_none_mailer`, `..._starttls_mailer` | Partly: unchanged by this fix; they pass on the original code too, as a guard on the other modes | Met |
| M6 | `StallHandshake` ends at the attempt timeout with `ErrNotAccepted`, cleanup does not hang | `TestSendEmail_ImplicitTLSStalledHandshake/ends_at_the_attempt_timeout` | Yes for the timeout. A handshake with no deadline would hang. | Met |
| M7 | Cancel during a stalled handshake returns `context.Canceled`, not `ErrNotAccepted`, within 2 s (timeout 10 s) | `.../a_cancelled_context_ends_it_at_once` | Partly: fails if nothing closes the connection (see mutation 9) but passes with the handshake's own `ctx` ignored, because `heldConn` closes the raw connection anyway (finding N1) | Met |
| M8 | Authentication over TLS: right password accepted with `AuthCommands()` > 0; wrong one refused with `AuthCommands()` > 0 and no message; unencrypted refusal stays; comment updated | `TestSendEmail_Authentication/over_tls_the_credentials_are_accepted`, `.../over_tls_a_wrong_password_is_refused`, existing `a_username_on_an_unencrypted_connection_is_refused...`; comment at `mailer_test.go:302` | Yes: fails when the connection is wrapped (not seen as encrypted) and when `WithSSL()` is passed back | Met |
| M9 | Two concurrent `tls` sends under `-race` each on its own connection | `.../two_concurrent_sends_each_use_their_own_connection` | Yes (2 connections, 2 handshakes, 2 messages). I also ran 50 concurrent sends in a scratch probe: 50 messages, 0 errors | Met |
| M10 | Other modes unchanged, no assertion changed or removed, `TestNew_UnknownTLSMode` holds | diff of `mailer_test.go` has additions and one comment change only | n/a | Met |
| M11 | `RootCAs` unset keeps the system roots | `TestSendEmail_ImplicitTLSVerifiesTheServer/no_RootCAs_keeps_the_system_roots` | Yes (fails with `InsecureSkipVerify`) | Met |
| R1 | `make check` passes; integration reported | see top | n/a | Met |
| R2 | No change to `go.mod`, `go.sum`, `.env.example`, `docker-compose.yml`, `Makefile`, `main.go`, `platform/config`, `mailer_integration_test.go`; no config key | `git diff main...HEAD --stat`: only the four allowed files and the plan | n/a | Met |

Requirement IDs: FR-81 and FR-85 (send over `tls`, the two fixed reasons, a failed handshake fails within the deadline and context end ends it) are met by M1 to M9. FR-85's "context ending ends a handshake" is satisfied by the behavior, but see N1 about which line is carrying it.

## 2. Plan check

I read the plan after sections 1. Every criterion above appears in it as a ticked item. All ticked items have a test that exists and checks the behavior.

- Differences between plan and diff: none found. The extra "empty pool" row is in the plan's judgment calls. The plan's note that `Config.RootCAs` was added first so the tests compile matches the history (`1ea961b`, `bbbc23e`).
- The plan records the reproduction (the fix commit's before-state): the `tls` send failed at 0.20 s, authentication variants at 2.00 s. My "skip handshake" mutation reproduced the same pattern (0.20 s, 2.00 s, 2.00 s).
- The plan says "plain server on a tls mailer" failed before the fix because the plain send succeeded; consistent with M4.
- The plan's integration claim (run via `go test` against another worktree's Mailpit) matches what I did.

## 3. Rule checks

- **Dependencies:** `go.mod`, `go.sum` unchanged; go-mail stays v0.8.1; only standard library added (`crypto/tls`, `crypto/x509`, and in testutil `crypto/ecdsa`, `elliptic`, `rand`, `pkix`, `io`, `math/big`).
- **Verification never off:** no `InsecureSkipVerify` or `VerifyPeerCertificate` in `mailer.go`; `RootCAs` only sets `tls.Config.RootCAs`; `ServerName` is `Host`; `MinVersion` TLS 1.2. The only `RootCAs` outside tests and the mailer is the unrelated probe's. `main.go` does not set `RootCAs`.
- **Layering and time:** `mailer.go` imports `domain`, go-mail and the standard library; no `time.Now`, `Sleep`, `After` or `NewTimer` (only `time.Duration`); no `go` statement; no timeout literal in the handshake.
- **Dial returns `*tls.Conn`** itself, not a wrapper; `WithSSL()` not passed in `tls` mode; policy is `TLSOpportunistic`; `heldConn` holds the raw connection.
- **No leak of the cause:** every failure goes through `notAccepted`; the `tls` rows assert the fixed text and absence of the address and of "certificate".
- **Config keys:** none added.
- **Conventions:** I found nothing in the diff that breaks `CONVENTIONS.md` (adaptor holds no business rules; no logging of addresses added).
- Not applicable: frontend, data scoping, transactions.

## 4. Mutation checks run

Each was applied to `mailer.go` alone, `go test -race ./internal/adaptor/mailer/` run, then reverted (`git checkout`).

| # | Mutation | Result |
|---|---|---|
| 1 | Skip the handshake (original behavior: plain dial, opportunistic policy) | Fails: M1, M2 (concurrent too), M4, M8 both rows |
| 2 | `InsecureSkipVerify: true` | Fails: all four rows of `ImplicitTLSVerifiesTheServer` |
| 3 | Wrong `ServerName` | Fails: M1, M2, M9, M8 both rows |
| 4 | `RootCAs` ignored (nil) | Fails: M1, M2, M9, M8 both rows |
| 5 | Wrap the `*tls.Conn` so it is not recognized as encrypted | Fails: both `over_tls_...` authentication tests |
| 6 | `WithSSL()` passed back in | Fails: both `over_tls_...` authentication tests |
| 7 | Handshake ignores `ctx` (`context.Background()`) | **Survives**: all tests pass (N1) |
| 8 | Hold the TLS connection instead of the raw one, and handshake ignores `ctx` | **Survives** (N1) |
| 9 | Hold nothing and handshake ignores `ctx` | Fails: the stalled-handshake tests hang and the package ends at the test timeout (I used `-timeout 20s`) |

## 5. Findings

### Blocking

None.

### Non-blocking

**N1. The handshake's own `ctx` is not what ends a cancelled handshake (test quality).** Mutations 7 and 8 survive: `heldConn.close` (started by `context.AfterFunc(sendCtx, held.close)`) closes the connection under the handshake whether the handshake got `ctx` or not, and closing a `*tls.Conn` mid-handshake closes the raw connection beneath it. So the task file's mutations "ignore ctx in the handshake" and "hold the TLS connection instead of the raw one" are redundant with each other, not caught individually; only removing both is. The behavior is correct and no test is wrong. Matters when: someone removes the `AfterFunc` or the held connection believing the handshake context alone is enough (it is enough too, so this would still work), or changes the handshake to a form without a context; at that point the cancel test still guards the outcome. Category: test quality.

**N2. The fake server's own handshake has no deadline other than closing (latent bug in a test helper).** `serve` calls `HandshakeContext(context.Background())`, so a client that connects and sends nothing holds a goroutine until the server closes at test end. Matters when: a future test leaves a TLS client half-open and the cleanup is slow to be noticed; today the nested cleanup in F4 shows the server does end it. Category: latent bug. Report only if no such test exists.

## 6. Tried beyond the task file

Run in a scratch test (not kept):

- Context cancelled before the send: returns `context.Canceled`.
- Host `localhost` (certificate names it): sends.
- TLS server that closes at connect: `ErrNotAccepted` in under 1 ms.
- 50 concurrent sends: 50 messages, 50 handshakes, no errors.
- Boundary of the deadline: stalled server at a 200 ms timeout returns at about 200 ms (M6 asserts at least 150 ms).

Not tried: an expired certificate (the fake cannot make one without a source change; it takes the same verification path as the untrusted case).

**What I cannot prove:** behavior against a real provider (Resend on port 465, Gmail) and a real certificate chain. The user runs the manual check with the real settings.

## 7. Docs or specs that no longer match

- `docs/openapi.yaml`, `docs/requirements.md`: none; no operation changed, and `tls` was already a documented option.
- `STACK.md`: no versions adopted or changed (go-mail v0.8.1 unchanged; standard library only). Nothing to record.
- `docs/tasks/backlog.md`, the `alert-dispatch` authentication line: it says `starttls` authentication stays untested and the `tls` path is covered; that is now true. The entry stays for `starttls`.
- `docs/manual-checks.md`, "At each milestone", Milestone 2: its email check can now use `SMTP_TLS=tls` as well as `starttls`; no wording is wrong.
- `deploy/README.md` and `.env.example` were not changed by this task and I found no statement in them that the work contradicts.
