# Verification report: webhook sender

Branch: `verify/webhook-sender` (cut from the builder's `feat/webhook-sender`, commit `8097221`). Task: `docs/tasks/webhook-sender.md`. Plan: `docs/tasks/webhook-sender.plan.md`.

**Result: no Blocking findings.** Two test-quality gaps found by mutation were fixed in the tests (no source changed).

## Commands run

| Command | Result |
|---|---|
| `make check` | Passed on the final tree (exit 0, `0 issues`, 557 frontend tests). Needed `npm ci` in `frontend/` first. One earlier run failed on a 5 s timeout in an untouched frontend test (see N4). |
| `make test-integration` | **Not run:** the Mailpit container could not start, because host port 1025 is held by another session's container (`alert-dispatch-builder-mailpit-1`). I did not stop it and removed my own failed containers. Nothing here depends on it: the only integration-tagged file is `adaptor/mailer/mailer_integration_test.go`, and the diff does not touch the mailer. No criterion of this task depends only on integration tests. |

## Criteria

"Real?" = would the named test fail if the behaviour were removed (confirmed by a mutation where marked **M**, otherwise by reading).

| # | Criterion | Test | Real? | Verdict |
|---|---|---|---|---|
| S1 | 200, 204, 299 nil; one POST, path, Content-Type, User-Agent (FR-90) | `TestSendWebhook_2xxIsDelivered` | Yes. **M**: 199/200 and 299/298 bounds killed | Met |
| S2 | Body has exactly four keys, no ServiceID in body or headers; unhealthy/healthy (FR-23) | `TestSendWebhook_BodyHasTheFourValuesOnly` | Yes. **M**: sending the service id killed (exact map equality) | Met |
| S3 | `changed_at` UTC, no fraction, `Z` (FR-93) | `TestSendWebhook_ChangedAtIsUTCWithoutFraction` | Yes. **M**: dropping `.UTC()` and rounding both killed | Met |
| S4 | Markup, quote, newline, non-ASCII round-trip as JSON (NFR-7) | `TestSendWebhook_TextIsJSONNeverInterpreted` | Partly: `encoding/json` does it by construction, so only a hand-built body would fail it. Fine, as the criterion is about the result | Met |
| S5 | Custom headers: canonical names, values as saved, 4,096-char value, one name keeps order, Content-Type and User-Agent replace, empty list (FR-92) | `TestSendWebhook_CustomHeaders` (I added a 20 × 4,096 row) | Yes. **M**: reversing order, no Content-Type replace, no User-Agent replace, refusing a tab all killed | Met |
| S6 | Invalid headers (empty name, space, colon, CR, LF, NUL; bad one second): `ErrInvalidHeader`, exact text, nothing sent (FR-92) | `TestSendWebhook_InvalidHeaderIsRefusedBeforeSending` | Yes. **M**: skipping the check and checking only the first header both killed | Met |
| S7 | 301/302/307/308 not followed, 300/404/500 `*StatusError`, exact text (FR-115, FR-85) | `TestSendWebhook_NonSuccessStatuses` | Yes. **M**: following redirects, 3xx delivered, 4xx delivered, status text changed all killed | Met |
| S8 | Cannot connect: closed port, closed without answer; exact text (FR-85) | `TestSendWebhook_CouldNotConnect` | Yes by reading (`ErrCouldNotConnect` is the default branch) | Met |
| S9 | Rejected certificate: `ErrCertificate`, exact text (FR-85) | `TestSendWebhook_CertificateRejected` | Yes. **M**: `InsecureSkipVerify` killed | Met |
| S10 | Timeout: `ErrTimedOut`, returns under 150 ms; inside-timeout delivered (FR-91) | `TestSendWebhook_Timeout` | Yes. **M**: hard-coded 10 s timeout killed | Met |
| S11 | Cancelled ctx gives `context.Canceled`, not `ErrTimedOut` | `TestSendWebhook_CancelledContext` | Yes. **M**: removing the ctx branch, dropping ctx from the request, and not nesting under ctx all killed | Met |
| S12 | No failure text holds URL, host, header, message or the Go error | `TestSendWebhook_FailureTextsHoldNoSecrets` (I added a user-info row) | Yes. **M**: appending the cause to the text killed | Met |
| S13 | `New` rejects zero and negative timeout | `TestNew_Timeout` | Yes. **M**: `<= 0` changed to `< 0` killed | Met |
| S14 | Two concurrent sends under `-race` succeed | `TestSendWebhook_Concurrent` | Weak: passes with any client that is safe to share, which is the point | Met |
| W1 | One `SendWebhook` call with Value, Headers in order, alert; mailer untouched; still one call after Close, also on failure (FR-85 in part) | `TestDispatch_WebhookTargetIsSentOnceWithoutRetry` | Yes. **M**: retry once, headers dropped, webhook branch calling `SendEmail` all killed | Met |
| W2 | `alert delivered` info, `alert delivery failed` warn with `reason`; ids only; no URL, header, name, service name, message | `TestDispatch_WebhookOutcomeLogs`, `TestDispatch_LogsOutcomesWithIdsOnly` | Yes. **M**: logging the URL and logging the headers both killed | Met |
| W3 | Unknown type: neither fake called, `alert not delivered` with `unknown target type` | `TestDispatch_UnknownTargetTypeIsNotSent` | Yes. **M**: removing the line killed | Met |
| W4 | Webhook and email in one list, neither blocks or fails the other (FR-83) | `TestDispatch_WebhookAndEmailDoNotAffectEachOther` | Yes (blocked webhook, failing email); the sequential-delivery mutation is covered by the email test of `alert-dispatch` | Met |
| W5 | `Dispatch` returns while a webhook send is blocked, send already started (NFR-5) | `TestDispatch_ReturnsWhileAWebhookSendIsBlocked` | Yes after my fix. **M**: `Dispatch` waiting killed, and fails in 5 s | Met (test fixed, see F1) |
| W6 | `Close` cancels a blocked send, returns after it, logs `abandoned` with no reason for any error; success after Close is `delivered` | `TestClose_WebhookSends` | Yes after my fix. **M**: webhook sent with `context.Background()`, and "abandoned only on `context.Canceled`", both killed | Met (test fixed, see F1) |
| W7 | The skip test is replaced; other tests change only their setup | diff of `alert_dispatcher_test.go` | The diff removes only the skip test and adds the second constructor argument; no assertion removed | Met |
| W8 | Two services at once keep their ids | `TestDispatch_ConcurrentWebhookServicesKeepTheirIDs` | Yes by reading (compares each call's url and each line's ids) | Met |
| M1 | Wiring: sender from `cfg.Limits.WebhookTimeoutSeconds`, error returns from `run`, dispatcher gets it, close order unchanged | read `cmd/server/main.go` | n/a | Met |
| R1 | `make check` passes | run | n/a | Met |
| R2 | No change to `go.mod`, `go.sum`, `.env.example`, nothing outside allowed paths | `git diff main...HEAD --name-only`: `main.go`, `sender.go`, `sender_test.go`, `alert_dispatcher.go`, `alert_dispatcher_test.go`, the plan | n/a | Met |

Requirement IDs: FR-90 S1, FR-23 S2/W2, FR-93 S3, FR-91 S10, FR-92 S5/S6, FR-115 S7, FR-85 S7–S10/W1, FR-83 W4, NFR-5 W5, NFR-7 S4. Each has a real test.

## Plan check

- Every criterion of the task file appears in the plan, including the wiring and repo-wide ones.
- Every ticked item has a test that exists and checks the behaviour, with the weaknesses in F1 below. The plan says its three mutation checks were run by hand; I did not rely on that.
- Plan versus diff: no difference. The plan lists its judgment calls, and all of them match the code: the first of two repeated custom `Content-Type` or `User-Agent` headers replaces the default and later ones are added; malformed URL and marshal failure map to `ErrCouldNotConnect`; the body is not drained before close.

## Rule checks

- **Layering:** `adaptor/webhook` imports `domain` and the standard library only. `worker` imports `domain` only. Only `cmd/server` knows both.
- **One client:** no `http.Get`, `DefaultClient` or second client in non-test code.
- **The client, by reading:** `Proxy` nil, keep-alives off, `CheckRedirect` returns `ErrUseLastResponse`, TLS 1.2 minimum, empty `TLSNextProto` map (no HTTP/2), response body closed and not read, deadline from `Config.Timeout` on top of `ctx`.
- **No hard-coded limit:** the timeout comes from `main.go` through `Config.Timeout`. There is no literal 10 s.
- **Body:** the payload struct has four fields; nothing else reaches the encoder.
- **Logs and errors:** the sender logs nothing. Every error text is the fixed text, or the status code in digits. The dispatcher logs ids plus `reason` (the error's text).
- **Time:** no `time.Now`, `Sleep`, `After` or `NewTimer` in non-test code. **Goroutines:** the sender starts none, and the dispatcher's goroutines are all in its wait group.
- **Dependencies:** none added; `go.mod` and `go.sum` unchanged. **Config keys:** none added.
- **Cannot be proved here:** delivery to a real receiver and a real CA-signed certificate. The app was not run live: no operation is served yet and the dispatcher has no caller that reaches a webhook target from the HTTP API, so there was nothing to drive.

## Mutation checks run

Each mutation was applied to the source, the package's tests were run with `-race`, then the source was restored. **Killed** = at least one named test failed. The full set was run; the list below is the part that matters most.

- **Killed:** follow redirects; 3xx delivered; 4xx delivered; 199 and 298 bounds; send the service id; drop the UTC conversion; round the fraction; skip the header check; check only the first header; refuse a tab; reverse values of a repeated name; custom Content-Type not replacing; custom User-Agent not replacing; timeout as a constant; cause in the error text; drop the request's ctx; not nesting under `ctx`; skip certificate verification; cancel reported as timeout; `New` accepting zero; wrong status text; log the URL; log a header; retry once; webhook target calling `SendEmail`; email target calling `SendWebhook`; `Dispatch` waiting; webhook sent with `context.Background()`; headers dropped; abandoned only on `context.Canceled`; unknown type silent.
- **Survived:** `Proxy` from the environment, keep-alives on, TLS 1.0 minimum. No test pins these client settings; see N1.
- Before my test fixes, two of the above (`Dispatch` waiting, webhook sent with `context.Background()`) failed only by hanging until the 10-minute package timeout; see F1.

## Findings

### Blocking

None.

### Fixed in the tests (no source change)

**F1 — the worker webhook tests failed by hanging, against the criterion "a deadline around every call that can block".** Two mutations ran until the package timeout: `Dispatch` waiting for the sends, and the send not receiving the dispatcher's context. `TestDispatch_ReturnsWhileAWebhookSendIsBlocked` called `Dispatch` inline, and `TestClose_WebhookSends` called `d.Close()` inline in one subtest and released its fakes only through the context. Fixed in `alert_dispatcher_test.go`: `Dispatch` runs in a goroutine with a 5 s deadline, the `Close` call has one, and a cleanup that runs before the dispatcher's own releases the blocked fakes. Both mutations now fail in about 5 s. The email tests of `alert-dispatch` have the same problem (already in the backlog), and I did not change them.

I also added three rows: 20 headers of 4,096 characters, user-info in the URL absent from every error text, and a context cancelled before the call.

### Non-blocking

**N1 — client settings are not pinned by a test.** Category: test quality. No test fails if `Proxy` reads the environment, keep-alives are turned on, or the TLS minimum is lowered; the first two cannot be seen through the stub receiver without extra machinery. Matters when: someone edits the transport and a proxy variable is set on the host (an alert would go through the proxy), or a stale connection is reused. Verified by reading only.

**N2 — a header the library controls is accepted and silently dropped or changed.** Category: UX. `Host`, `Content-Length` and `Transfer-Encoding` are accepted and the request still succeeded in my probe; leading and trailing spaces of a value are trimmed. This is a "known gap" in the task file. Matters when: an admin enters one of these names and expects it to reach the receiver. Report only.

**N3 — a custom `Content-Type` or `User-Agent` listed twice sends the first as the replacement and the second as an added value.** Category: decision needed (the task file leaves it open; the builder listed it as a judgment call). Matters when: an admin saves two `Content-Type` headers. Not reachable until the save accepts duplicates, which it does today (backlog, `targets-api`).

**N4 — a frontend test timed out once under load.** Category: test quality. `TargetDialog.test.tsx` "adds a header row…" took 5.1 s against a 5 s limit in one of four `make check` runs and passed on re-run alone and in the next full run. Not touched by this diff. Matters when: CI runs on a slow machine. Report only.

**N5 — Mailpit's fixed host port 1025 collides across worktrees.** Category: test quality. `make test-integration` cannot start while another session's Mailpit holds the port. Matters when: two builders or verifiers run the integration tests at once. Report only.

## Docs or specs that no longer match

- `docs/tasks/backlog.md` line 73 says `webhook-sender` "replaces its skip of a webhook target": it now has, so the line can be reworded when the user next triages the backlog.
- `docs/tasks/backlog.md` line 99 (the `alert-dispatch` worker mutations that hang) is still true for the email tests and now also describes what this task's tests did before F1; consider noting that the webhook tests are fixed.
- `docs/openapi.yaml`, `docs/requirements.md`, `STACK.md`, `ARCHITECTURE.md`: nothing out of date. No dependency or version was adopted (standard library only), so `STACK.md` needs no version entry.
