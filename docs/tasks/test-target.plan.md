# Plan: test target

Branch: `feat/test-target`. Tick an item when its test passes.

## Usecase (`usecase/target_tester_test.go`, `usecase/alert_test.go`)

- [ ] Email input: one email send with the trimmed address and the exact test alert; no webhook send; `Delivered: true` — `target_tester_test.go` `TestTestTarget_Email`
- [ ] Webhook input: one webhook send with trimmed URL and trimmed headers in order, same alert; no email send — `TestTestTarget_Webhook`
- [ ] Failed delivery gives the error text as `FailureReason` (not an error): `no SMTP account configured` and each webhook reason — `TestTestTarget_FailedDelivery`
- [ ] Alert name is the service's saved name, not the request's `name` — `TestTestTarget_NameIsTheServices`
- [ ] Invalid input: same field errors as `createTarget`, nothing sent, `Find` not called — `TestTestTarget_InvalidInput`
- [ ] `alerts_enabled` false still sends — `TestTestTarget_AlertsOffStillSends`
- [ ] Unknown service returns `ErrNotFound`, other `Find` error wrapped, nothing sent — `TestTestTarget_FindErrors`
- [ ] Ended context returns the context error, not a result — `TestTestTarget_ContextEnded`
- [ ] Nothing saved or written (read by verifier): constructor takes finder, two senders, clock, limits only
- [ ] NFR-7: markup and quote in the name are unchanged; message holds no markup — `alert_test.go` `TestBuildTestAlert_PlainText`
- [ ] Message constant exact; builder deterministic, no other field filled — `alert_test.go` `TestBuildTestAlert`
- [ ] Default messages and existing alert tests unchanged — existing `alert_test.go`

## Mailer (`adaptor/mailer/mailer_test.go`, fake SMTP server)

- [ ] Test alert: subject `Test alert for API`, four-line body — `TestSendEmail_TestAlert`
- [ ] Markup and quote in the name arrive unchanged — `TestSendEmail_TestAlertNameIsPlainText`
- [ ] CR and LF in the name become spaces — `TestSendEmail_TestAlertNameOneLine`
- [ ] Existing unhealthy and healthy cases unchanged — existing tests

## Sender (`adaptor/webhook/sender_test.go`)

- [ ] Status `test` arrives as `test` with the other three keys; markup and quote round trip — `TestSendWebhook_TestStatus`

## Handler (`handler/target_tests_test.go`)

- [ ] Email body: 200 `{"delivered":true}`, no `failure_reason`; spy got service id and input — `TestTestTarget_Email`
- [ ] Webhook body with headers mapped in order — `TestTestTarget_WebhookHeaders`
- [ ] `Delivered: false` and reason: 200 with that reason — `TestTestTarget_Failed`
- [ ] ValidationError 422 (two fields, in order), ErrNotFound 404, other error 500, all conform — `TestTestTarget_Errors`
- [ ] No session 401, no CSRF 403, 413, 415, 400; spy not called — `TestTestTarget_RouterRules`
- [ ] Log: one `target test sent` line with `service_id`, `type`, `delivered`; no address, URL, header or reason — `TestTestTarget_Log`
- [ ] Route no longer 501 — covered by the 200 test
- [ ] Gate test lists the operation (existing `router_test.go` iterates all operations)

## Wiring and repo-wide

- [ ] `main.go` builds `NewTargetTestService(serviceRepo, mail, sender, clock.Real{}, targetLimits(cfg.Limits))` and passes it to `NewServer` (read by verifier)
- [ ] `make check` — not run yet
- [ ] `make test-integration` (mailer.go has an integration test) — not run yet
- [ ] Rebased onto the default branch before push — not done yet
- [ ] No change to go.mod, go.sum, .env.example, config, migrations, stubs.go, generated API

## Judgment calls

(filled at the end)
