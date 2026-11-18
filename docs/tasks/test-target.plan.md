# Plan: test target

Branch: `feat/test-target`. Tick an item when its test passes.

## Usecase (`usecase/target_tester_test.go`, `usecase/alert_test.go`)

- [x] Email input: one email send with the trimmed address and the exact test alert; no webhook send; `Delivered: true` — `target_tester_test.go` `TestTestTarget_Email`
- [x] Webhook input: one webhook send with trimmed URL and trimmed headers in order, same alert; no email send — `TestTestTarget_Webhook`
- [x] Failed delivery gives the error text as `FailureReason` (not an error): `no SMTP account configured` and each webhook reason — `TestTestTarget_FailedDelivery`
- [x] Alert name is the service's saved name, not the request's `name` — `TestTestTarget_NameIsTheServices`
- [x] Invalid input: same field errors as `createTarget`, nothing sent, `Find` not called — `TestTestTarget_InvalidInput`
- [x] `alerts_enabled` false still sends — `TestTestTarget_AlertsOffStillSends`
- [x] Unknown service returns `ErrNotFound`, other `Find` error wrapped, nothing sent — `TestTestTarget_FindErrors`
- [x] Ended context returns the context error, not a result — `TestTestTarget_ContextEnded`
- [x] Nothing saved or written (read by verifier): constructor takes finder, two senders, clock, limits only
- [x] NFR-7: markup and quote in the name are unchanged; message holds no markup — `alert_test.go` `TestBuildTestAlert_PlainText`
- [x] Message constant exact; builder deterministic, no other field filled — `alert_test.go` `TestBuildTestAlert`
- [x] Default messages and existing alert tests unchanged — existing `alert_test.go`

## Mailer (`adaptor/mailer/mailer_test.go`, fake SMTP server)

- [x] Test alert: subject `Test alert for API`, four-line body — `TestSendEmail_TestAlert`
- [x] Markup and quote in the name arrive unchanged — `TestSendEmail_TestAlertNameIsPlainText`
- [x] CR and LF in the name become spaces — `TestSendEmail_TestAlertNameOneLine`
- [x] Existing unhealthy and healthy cases unchanged — existing tests

## Sender (`adaptor/webhook/sender_test.go`)

- [x] Status `test` arrives as `test` with the other three keys; markup and quote round trip — `TestSendWebhook_TestStatus`

## Handler (`handler/target_tests_test.go`)

- [x] Email body: 200 `{"delivered":true}`, no `failure_reason`; spy got service id and input — `TestTestTarget_Email`
- [x] Webhook body with headers mapped in order — `TestTestTarget_WebhookHeaders`
- [x] `Delivered: false` and reason: 200 with that reason — `TestTestTarget_Failed`
- [x] ValidationError 422 (two fields, in order), ErrNotFound 404, other error 500, all conform — `TestTestTarget_Errors`
- [x] No session 401, no CSRF 403, 413, 415, 400; spy not called — `TestTestTarget_RouterRules`
- [x] Log: one `target test sent` line with `service_id`, `type`, `delivered`; no address, URL, header or reason — `TestTestTarget_Log`
- [x] Route no longer 501 — covered by the 200 test
- [x] Gate test lists the operation (existing `router_test.go` iterates all operations)

## Wiring and repo-wide

- [x] `main.go` builds `NewTargetTestService(serviceRepo, mail, sender, clock.Real{}, targetLimits(cfg.Limits))` and passes it to `NewServer` (read by verifier)
- [x] `make check` — run, passed
- [x] `make test-integration` (mailer.go has an integration test) — not run: ports 1025 and 8025 are held by another worktree's Mailpit (`alert-dispatch-builder-mailpit-1`); the test clears the whole mailbox through the API, so I neither ran it against that container nor stopped it. The fake-SMTP mailer tests ran in `make check`
- [x] Rebased onto the default branch before push — done, main had nothing new
- [x] No change to go.mod, go.sum, .env.example, config, migrations, stubs.go, generated API

## Judgment calls

- `buildTestAlert` is unexported and `alert_test.go` is an external test package, so its tests reach it through `TargetTestService.TestTarget` (`TestBuildTestAlert`, `TestBuildTestAlert_NameIsPlainText`). I did not add an `export_test.go` (outside my paths).
- The three usecase interfaces are named `ServiceFinder`, `TestEmailSender` and `TestWebhookSender`. A failed `Find` is wrapped as `find the service to test: %w`.
- A validation failure is checked before anything else, including a canceled context; a canceled context is only returned after a send fails.
- The "invalid input" usecase test compares the field errors with what `TargetService.CreateTarget` returns (same limits), and a limits test checks each limit at its edge with the non-default test limits.
- The handler logs the input's `type` string as received, after validation succeeded in the usecase, so it is always `email` or `webhook`.
- No case in the existing router gate test needed adding: it iterates every operation in the contract, so `testTarget` is already covered there.
- Installed frontend dependencies (`npm ci` in `frontend/`) so `make check` could run; no tracked file changed.
