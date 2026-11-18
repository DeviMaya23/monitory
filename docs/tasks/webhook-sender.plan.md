# Plan: webhook sender

Branch: `feat/webhook-sender`. Prerequisites checked on the branch (cut from `main`): `worker.AlertDispatcher`, `Mailer`, `deliver`, `TestDispatch_WebhookTargetIsSkippedAndLogged`, `domain.Alert`, `domain.Target`, `domain.NameValue`, `adaptor/webhook/doc.go`, `config.Limits.WebhookTimeoutSeconds`, `testutil.TargetServer` all exist.

Integration tests: none apply (no Mailpit-tagged code touched). Outcome: not run: no integration test covers the changed code.

## Sender (`backend/internal/adaptor/webhook/sender.go`, `sender_test.go`)

- [ ] 200, 204, 299 return nil; one POST, path, Content-Type, User-Agent — `TestSendWebhook_2xxIsDelivered`
- [ ] Body has exactly four keys, no ServiceID anywhere; status unhealthy/healthy — `TestSendWebhook_BodyHasTheFourValuesOnly`
- [ ] `changed_at` in UTC, no fraction, `Z` — `TestSendWebhook_ChangedAtIsUTCWithoutFraction`
- [ ] Markup, quote, newline, non-ASCII round-trip as JSON text — `TestSendWebhook_TextIsJSONNeverInterpreted`
- [ ] Custom headers: canonical names, 4096-char value, repeated name order, Content-Type and User-Agent replace defaults, empty list — `TestSendWebhook_CustomHeaders`
- [ ] Invalid headers (empty name, space, colon, CR, LF, NUL; bad one second) → `ErrInvalidHeader`, nothing sent — `TestSendWebhook_InvalidHeaderIsRefusedBeforeSending`
- [ ] 301/302/307/308 not followed, 404/500/300 → `*StatusError`, exact text — `TestSendWebhook_NonSuccessStatuses`
- [ ] Cannot connect (closed port, closed without answer) → `ErrCouldNotConnect` — `TestSendWebhook_CouldNotConnect`
- [ ] Rejected certificate → `ErrCertificate` — `TestSendWebhook_CertificateRejected`
- [ ] Timeout → `ErrTimedOut` fast; inside timeout delivered — `TestSendWebhook_Timeout`
- [ ] Cancelled ctx → `context.Canceled`, not `ErrTimedOut` — `TestSendWebhook_CancelledContext`
- [ ] No failure text holds URL, host, header, message or cause text — `TestSendWebhook_FailureTextsHoldNoSecrets`
- [ ] `New` rejects zero/negative timeout — `TestNew_Timeout`
- [ ] Concurrent sends under `-race` — `TestSendWebhook_Concurrent`

## Delivery loop (`backend/internal/worker/alert_dispatcher.go`, `alert_dispatcher_test.go`)

- [ ] One call with Value, Headers in order, alert; mailer untouched; still one call after Close on failure — `TestDispatch_WebhookTargetIsSentOnceWithoutRetry` (replaces the skip test)
- [ ] Delivered info / failed warn with reason; ids only; no secrets — `TestDispatch_WebhookOutcomeLogs`, `TestDispatch_LogsOutcomesWithIdsOnly`
- [ ] Unknown target type → `alert not delivered`, `unknown target type` — `TestDispatch_UnknownTargetTypeIsNotSent`
- [ ] Webhook + email: each independent of the other's block/failure — `TestDispatch_WebhookAndEmailDoNotAffectEachOther`
- [ ] `Dispatch` returns while webhook send blocked, send started — `TestDispatch_ReturnsWhileAWebhookSendIsBlocked`
- [ ] `Close` cancels a blocked webhook send, abandoned with no reason for any error; success after Close is delivered — `TestClose_WebhookSends`
- [ ] Existing tests keep their assertions, setup only changed — all other tests in the file
- [ ] Concurrent services keep ids for webhooks — `TestDispatch_ConcurrentWebhookServicesKeepTheirIDs`

## Wiring (`backend/cmd/server/main.go`)

- [ ] Sender built from `cfg.Limits.WebhookTimeoutSeconds`, error returns from `run`, passed to dispatcher; close order unchanged — read by the verifier

## Repo-wide

- [ ] `make check` passes
- [ ] No change to go.mod, go.sum, .env.example or files outside the allowed paths
