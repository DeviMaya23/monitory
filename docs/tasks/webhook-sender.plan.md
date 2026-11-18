# Plan: webhook sender

Branch: `feat/webhook-sender`. Prerequisites checked on the branch (cut from `main`): `worker.AlertDispatcher`, `Mailer`, `deliver`, `TestDispatch_WebhookTargetIsSkippedAndLogged`, `domain.Alert`, `domain.Target`, `domain.NameValue`, `adaptor/webhook/doc.go`, `config.Limits.WebhookTimeoutSeconds`, `testutil.TargetServer` all exist.

Integration tests: none apply (no Mailpit-tagged code touched). Outcome: not run: no integration test covers the changed code (`adaptor/mailer` and its Mailpit tests are untouched).

## Sender (`backend/internal/adaptor/webhook/sender.go`, `sender_test.go`)

- [x] 200, 204, 299 return nil; one POST, path, Content-Type, User-Agent — `TestSendWebhook_2xxIsDelivered`
- [x] Body has exactly four keys, no ServiceID anywhere; status unhealthy/healthy — `TestSendWebhook_BodyHasTheFourValuesOnly`
- [x] `changed_at` in UTC, no fraction, `Z` — `TestSendWebhook_ChangedAtIsUTCWithoutFraction`
- [x] Markup, quote, newline, non-ASCII round-trip as JSON text — `TestSendWebhook_TextIsJSONNeverInterpreted`
- [x] Custom headers: canonical names, 4096-char value, repeated name order, Content-Type and User-Agent replace defaults, empty list — `TestSendWebhook_CustomHeaders`
- [x] Invalid headers (empty name, space, colon, CR, LF, NUL; bad one second) → `ErrInvalidHeader`, nothing sent — `TestSendWebhook_InvalidHeaderIsRefusedBeforeSending`
- [x] 301/302/307/308 not followed, 404/500/300 → `*StatusError`, exact text — `TestSendWebhook_NonSuccessStatuses`
- [x] Cannot connect (closed port, closed without answer) → `ErrCouldNotConnect` — `TestSendWebhook_CouldNotConnect`
- [x] Rejected certificate → `ErrCertificate` — `TestSendWebhook_CertificateRejected`
- [x] Timeout → `ErrTimedOut` fast; inside timeout delivered — `TestSendWebhook_Timeout`
- [x] Cancelled ctx → `context.Canceled`, not `ErrTimedOut` — `TestSendWebhook_CancelledContext`
- [x] No failure text holds URL, host, header, message or cause text — `TestSendWebhook_FailureTextsHoldNoSecrets`
- [x] `New` rejects zero/negative timeout — `TestNew_Timeout`
- [x] Concurrent sends under `-race` — `TestSendWebhook_Concurrent`

## Delivery loop (`backend/internal/worker/alert_dispatcher.go`, `alert_dispatcher_test.go`)

- [x] One call with Value, Headers in order, alert; mailer untouched; still one call after Close on failure — `TestDispatch_WebhookTargetIsSentOnceWithoutRetry` (replaces the skip test)
- [x] Delivered info / failed warn with reason; ids only; no secrets — `TestDispatch_WebhookOutcomeLogs`, `TestDispatch_LogsOutcomesWithIdsOnly`
- [x] Unknown target type → `alert not delivered`, `unknown target type` — `TestDispatch_UnknownTargetTypeIsNotSent`
- [x] Webhook + email: each independent of the other's block/failure — `TestDispatch_WebhookAndEmailDoNotAffectEachOther`
- [x] `Dispatch` returns while webhook send blocked, send started — `TestDispatch_ReturnsWhileAWebhookSendIsBlocked`
- [x] `Close` cancels a blocked webhook send, abandoned with no reason for any error; success after Close is delivered — `TestClose_WebhookSends`
- [x] Existing tests keep their assertions, setup only changed — all other tests in the file
- [x] Concurrent services keep ids for webhooks — `TestDispatch_ConcurrentWebhookServicesKeepTheirIDs`

## Wiring (`backend/cmd/server/main.go`)

- [x] Sender built from `cfg.Limits.WebhookTimeoutSeconds`, error returns from `run`, passed to dispatcher; close order unchanged — read by the verifier

## Repo-wide

- [x] `make check` passes (run, exit 0; needed `npm ci` in `frontend/` first)
- [x] No change to go.mod, go.sum, .env.example or files outside the allowed paths

## Integration tests

`make test-integration`: not run: this task changes no code that has integration tests (the sender is tested against in-process stubs; the mailer is untouched).

## Judgment calls

- `TestDispatch_LogsOutcomesWithIdsOnly` and the other existing tests are unchanged apart from setup: `newDispatcher` now supplies a succeeding fake webhook sender; a new `newDispatcherWith` takes a scripted one.
- The "no secrets in error text" test also forbids the substrings `Post`/`dial tcp` for non-status failures, to catch the Go error's own text leaking.
- A malformed URL, and a marshal failure (unreachable in practice), map to `ErrCouldNotConnect`, as the task lists a malformed URL there.
- When a custom `Content-Type` or `User-Agent` appears twice, the first replaces the default and later ones are added (the task only says "replaces the default").
- A header name is canonicalised once (`http.CanonicalHeaderKey`) before `Add`; `Header.Add` does this itself, so the visible behaviour is the task's.
- The response is not drained before close; keep-alive is off so nothing is reused.
- An alert time is formatted with the fixed layout `2006-01-02T15:04:05Z` after `.UTC()`, so the fraction is dropped, never rounded.
- Mutation checks run by hand (redirects followed, UTC dropped, 4xx as delivered): each failed a named test.
