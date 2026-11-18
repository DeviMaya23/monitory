# Task: test target

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The admin can send a test alert to the notification target in the form, before saving it. `testTarget` validates the target as typed, sends one alert marked as a test, to that target only, through the same SMTP account or the same webhook client as a real alert, makes one attempt with no retries, and answers whether it was delivered and, if not, why. Nothing is saved: no status, no `last_delivery_failed`, no other target. The "Send test alert" row of the target dialog is the next task (`target-test-row`); this task is the server side.

Requirements covered:

- FR-107: a test alert goes only to the target in the request, through the same delivery as a real alert (SMTP for email; the URL and the custom headers for a webhook), makes one attempt with no retries, and the result says delivered or failed and, when failed, the reason (FR-85); the content says it is a test and carries the time in UTC (FR-93); a webhook test uses the same JSON body as FR-90.
- FR-108: a test alert changes no service's status, sends nothing to any other target and does not change the "last delivery failed" notice; when the settings in the request are invalid (FR-82, FR-89, FR-110), nothing is sent and the errors name the fields.
- FR-82, FR-89, FR-110, in part: the same validation as `createTarget` and `updateTarget` (the one function), so a test cannot succeed for a target that could not be saved.
- NFR-7: the service name and the test message reach the email and the JSON body as plain text.
- NFR-8: the operation requires the session and the CSRF token, as every gated operation (applied by the router; the criteria show it).

Out of scope:

- **The "Send test alert" row and its states in the dialog** (`docs/design/alerts.html`): `target-test-row`, a frontend task.
- **Retries, the delivery outcome and the notice** (FR-85, FR-86): `delivery-retry` and `delivery-outcome`; a test never goes through the dispatcher and never reports an outcome.
- **A duplicate check** (FR-88) and the alert-list limit (FR-19): they apply when a target is saved, not when one is tested; `testTarget` does not read the alert list.
- **A rate limit on test alerts:** none in the requirements; see "Known gaps".
- **A new configuration key, a new dependency, any change to the contract, a migration or the frontend.**

## Prerequisite

`webhook-sender`, `delivery-retry` and `delivery-outcome` are merged: the first gives the webhook sender this task reuses; the other two change `cmd/server/main.go` and `worker/alert_dispatcher.go`, which this task's wiring must be built on, not beside. The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `adaptor/webhook.Sender` with `SendWebhook(ctx, url string, headers []domain.NameValue, alert domain.Alert) error`, and the error values `ErrInvalidHeader`, `ErrCouldNotConnect`, `ErrCertificate`, `ErrTimedOut` and `*StatusError` with their texts (`webhook-sender`).
- `adaptor/mailer.Mailer` with `SendEmail(ctx, to string, alert domain.Alert) error`, `ErrNotConfigured` (`no SMTP account configured`) and `ErrNotAccepted` (`the SMTP server did not accept the message`), and its layout functions `subject` and `body` (`alert-dispatch`).
- `domain.Alert` and `domain.AlertStatus` (`unhealthy`, `healthy`) in `domain/alert.go`; `usecase.ValidateTargetInput`, `normalizeTargetInput` and `domain.TargetInput` (`targets-api`); `repository.ServiceRepository.Find(ctx, id)` returning `domain.ErrNotFound` for a missing service (`alert-dispatch`); `usecase.Clock`.
- The handler layer as `targets-api` left it: `handler.Server` with the field-per-dependency pattern and `handler.NewServer(settings, services, targets, auth, log, secureCookie)`; `toTargetInput` in `handler/target_mapping.go`; `unimplemented.TestTarget` (a stub answering 501) in `handler/stubs.go`; `api.TestTarget200JSONResponse`.

## Role and ownership

Role: Backend.

You may change only:

- `backend/internal/domain/alert.go` (the new status value), `backend/internal/domain/target_test_result.go` (new)
- `backend/internal/usecase/alert.go`, `alert_test.go` (the test message constant and the pure builder of the test alert), `backend/internal/usecase/target_tester.go`, `target_tester_test.go` (new)
- `backend/internal/adaptor/mailer/mailer.go`, `mailer_test.go` (the layout of a test alert)
- `backend/internal/adaptor/webhook/sender_test.go` (one case: the status `test` arrives as `test`; `sender.go` changes only if that case shows it must)
- `backend/internal/handler/server.go` (the new dependency field, interface and `NewServer` argument), `backend/internal/handler/target_tests.go`, `target_tests_test.go` (new), `backend/internal/handler/helpers_test.go` (the router helper and a spy for the new interface)
- `backend/cmd/server/main.go` (wiring)

You may not change anything else: not `backend/migration/**`, `backend/internal/api/**` (generated), `backend/internal/handler/stubs.go` (a method on `Server` shadows the stub), the rest of `backend/internal/domain/**`, the rest of `backend/internal/usecase/**`, `backend/internal/repository/**`, `backend/internal/worker/**`, `backend/internal/testutil/**`, `backend/internal/platform/config/**`, `pkg/**`, `.env.example`, `backend/go.mod`, `backend/go.sum`, `Makefile`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/test-target.plan.md`). No configuration key is added or renamed.

Shared files this task touches, all owned by this task while it runs: `cmd/server/main.go`, `handler/server.go`, `handler/helpers_test.go`, `adaptor/mailer/mailer.go`, `domain/alert.go`, `usecase/alert.go`. No other task runs in the backend beside it (the delivery chain is serial and this is its last task); `target-test-row` (frontend) waits for it.

## Operations used

From `docs/openapi.yaml`; types come from the generated `internal/api`, never hand-written.

| Operation | Method and path | Responses |
|---|---|---|
| `testTarget` | `POST /api/services/{serviceId}/target-tests` | 200 `TargetTestResult` (`delivered`, and `failure_reason` when it failed); 422 `validation_failed` with field errors; 404 `not_found`; and, from the router for every operation, 400 `malformed_request`, 401 `unauthenticated`, 403 `csrf_failed`, 413 `payload_too_large`, 415 `unsupported_media_type`, 500 `internal_error`. Required: the session and the `X-CSRF-Token` header. The body is `TargetInput` (`{ type: 'email', name?, address }` or `{ type: 'webhook', name?, url, headers? }`), as for `createTarget`. A completed test is 200 even when the delivery failed. |

The webhook body is the contract's `WebhookAlertPayload`, with `status` `test`.

## Behavior

### What exists

The mailer builds subject and body from a `domain.Alert` and knows two statuses (any status other than `healthy` reads as unhealthy). The webhook sender writes the alert's status string as `status` in the JSON body. `usecase.ValidateTargetInput(input, limits)` returns the field errors of `createTarget` and `updateTarget` for the input as normalized (`normalizeTargetInput` trims names, addresses, URLs and header rows). `handler.toTargetInput` maps the generated body type to `domain.TargetInput` and `handler` turns `domain.ValidationError` into `422` with the errors and `domain.ErrNotFound` into `404`. `testTarget` answers 501.

### The test alert

- `domain.AlertStatus` gains the value `test` (`domain.AlertTest`), the same string as the contract's payload value.
- The content, generated at the user's request for review (the user did not give wording; change it by editing this table):

| Part | Text |
|---|---|
| The message (webhook `message`, and the last line of the email) | `This is a test alert from Monitory. No service has changed status.` |
| Email subject | `Test alert for <service name>` |
| Email body, four lines, joined by `\n` with one `\n` at the end | `Service: <service name>` / `Status: Test` / `Time: YYYY-MM-DD HH:MM UTC` / the message above |
| Webhook body | the four contract keys: `service_name` (the service's name), `status` `test`, `changed_at` (the send time in UTC, RFC 3339 with seconds and a `Z`, as `webhook-sender` writes it), `message` (the message above) |

- The message is a constant in `usecase/alert.go` (`TestAlertMessage`), beside the two defaults, and a separate pure function there (`buildTestAlert(service, changedAt)`; `buildAlert` is not extended, because it picks the unhealthy message for any status but healthy) builds the test alert from the service and the time. The alert's `ServiceName` is the service's name as saved (read with `Find`), never a value from the request, so the request carries no service data. The rules about the layout stay as `alert-dispatch` fixed them: a carriage return or line feed in the name is replaced by one space in the subject and the first line; the time is UTC with the seconds dropped.
- The mailer's `subject` and `body` handle the new status: subject `Test alert for <name>`, status line `Status: Test`; unhealthy and healthy alerts read exactly as before (existing tests pass unchanged).

### The usecase (`usecase.TargetTestService`)

New, in `usecase/target_tester.go`. `NewTargetTestService(services, mail, webhooks, clock, limits)` takes: an exported interface that finds a service by id (`Find`; a new name, not `serviceFinder`: the unexported one in `check_result.go` stays as it is), an exported interface for the email send, an exported interface for the webhook send (each one method, one user: the signatures of `Mailer.SendEmail` and `Sender.SendWebhook`), the `usecase.Clock` and the `domain.TargetLimits` the other target usecase takes. It has no repository that can write, no dispatcher and no outcome recorder (FR-108, by construction).

`TestTarget(ctx, serviceID string, input domain.TargetInput) (domain.TargetTestResult, error)`, in this order:

1. **Validate** with the same function and limits as `createTarget` (`ValidateTargetInput`, after `normalizeTargetInput`). Any field error: return `domain.ValidationError` with every error (as `createTarget` does) and send nothing. The duplicate rule and the list limit are not checked.
2. **Find the service** with `Find`. `domain.ErrNotFound`: return it (the handler answers `404`). Any other error is returned wrapped with `%w`.
3. **Build the test alert** with the clock's `Now()` in UTC (see above).
4. **Send once,** with the request's context, no retry, no timer of its own (the mailer and the webhook sender have their own attempt deadlines): an email target calls the email send with the normalized address; a webhook target calls the webhook send with the normalized URL and the normalized headers (the rows as saved by `createTarget`, so what a test sends is what a real alert would send).
5. **The result:** no error: `domain.TargetTestResult{Delivered: true}`. An error while the request's context has ended: return that context error, nothing to answer. Any other error: `Delivered` false and `FailureReason` the error's text, which is one of the fixed reasons of the mailer and the webhook sender (`no SMTP account configured`, `the SMTP server did not accept the message`, `could not connect to the webhook`, `the webhook's certificate was rejected`, `the webhook did not answer in time`, `the webhook answered with status 503`, `a custom header is not valid`) and never holds an address or a URL.

`domain.TargetTestResult` is a plain struct in `domain/target_test_result.go` with `Delivered bool` and `FailureReason string` (empty when delivered).

### The handler

`handler/target_tests.go` (new): the method `TestTarget` on `*Server` (it shadows the stub in `stubs.go`, which is not edited). `handler.Server` gets one new field and `handler.NewServer` one new argument, placed right after `targets` (`NewServer(settings, services, targets, tester, auth, log, secureCookie)`), of a new exported interface `TargetTester` in `handler/server.go` with `TestTarget(ctx, serviceID string, input domain.TargetInput) (domain.TargetTestResult, error)`, as `server.go`'s own comment says to add a dependency.

- A missing body: `errMalformedRequest` as for `createTarget` (the router already answers `400`, `413` and `415`).
- `toTargetInput` maps the body; its error is returned as it is for `createTarget`.
- The usecase's `domain.ValidationError` and `domain.ErrNotFound` take the existing mapping: `422 validation_failed` with the field errors in the order given, and `404 not_found`; nothing is added to `handler/problem.go`.
- 200 with `api.TestTarget200JSONResponse{Delivered: …}`; `failure_reason` is present, with the text, only when the delivery failed, and absent when it was delivered.
- One info log line on a completed test: `target test sent` with `service_id`, `type` (`email` or `webhook`) and `delivered`; never the address, URL, headers, name or the reason's text beyond that (`CONVENTIONS.md`, Logging: only `handler/` logs).

### Wiring (`cmd/server/main.go`)

Build `usecase.NewTargetTestService(serviceRepo, mail, sender, clock.Real{}, targetLimits(cfg.Limits))` with the one shared `serviceRepo`, the mailer and the webhook sender already built for the dispatcher (the same instances: "the same delivery as a real alert"), and pass it to `handler.NewServer` as the new argument. Nothing else changes; the order of the closes does not.

### Decisions the file settles

- **A test is sent whether or not the service's alerts are on.** `alerts_enabled` decides whether status changes send alerts (FR-20); a test checks that the target works and reads no service setting but the name. FR-107 says nothing of the flag.
- **The reason is the error's text.** The senders' contract (documented on `worker.Mailer` and `worker.WebhookSender`) is that a returned error's text is the reason and holds no address or URL; the usecase passes it through as `FailureReason` without a list of its own.

### Known gaps

- **No rate limit.** Each press of "Send test alert" sends one email or one request; an admin who presses it repeatedly sends repeatedly. The requirements ask for none.
- **The test goes to a target the admin typed** and can be sent to any address or URL the validation accepts, including private ones (requirements section 6).
- **A webhook header with CR or LF is refused at send** (`webhook-sender`): the test answers `delivered` false, reason `a custom header is not valid`, and that is where the admin learns of it before saving (the backlog's `targets-api` line stays open).
- **`Time:` of the email drops the seconds,** as for a real alert; the webhook body keeps them.
- **The test text is generated,** not drawn on the board: `docs/design/README.md` can list it under additions if the user wants it recorded.
- **A client that disconnects mid-test** cancels the attempt; the usecase returns the context error, which the existing error handler answers as a 500 and logs as an unexpected error. The noise is accepted; the reply has nowhere to go.
- **An adaptor error whose text is not a reason** would be shown to the admin as `failure_reason`; the adaptors' contract (above) is what prevents it.

## Structure

By `ARCHITECTURE.md` ("Interfaces", "Package placement"). Names marked "new" are fixed by this file; others (the other interface names, unexported helpers, test doubles) are the builder's choice, provided every interface is exported (`ARCHITECTURE.md`) and no name collides with one that exists.

- `domain/alert.go`: `AlertTest`. `domain/target_test_result.go` (new): `TargetTestResult`.
- `usecase/alert.go`: `TestAlertMessage` and the pure builder of the test alert. `usecase/target_tester.go` (new): `TargetTestService`, `NewTargetTestService`, `TestTarget`, the three small exported interfaces.
- `adaptor/mailer/mailer.go`: the layout for the test status only.
- `handler/server.go`: `TargetTester` and the new field and argument. `handler/target_tests.go` (new): `TestTarget`.
- `cmd/server/main.go`: the usecase and the argument.
- Test doubles: fakes of the three usecase interfaces (a recording email sender and webhook sender returning a scripted error, a finder returning a service or `ErrNotFound`) in `usecase/target_tester_test.go`; a `TargetTester` spy in `handler/helpers_test.go` that records the service id and input and returns a canned result or error; `newRouter` takes the spy through its options, defaulting to one that returns a delivered result.

The rules stay where `ARCHITECTURE.md` puts them: what to validate, the content of the test alert and what the result is are `usecase/`'s; the mailer holds the email layout; the handler maps and logs.

## Dependencies

None. `go.mod` and `go.sum` do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed, except those marked as read by the verifier (the construction, wiring and `git diff` ones). Usecase tests use fakes and the fake clock; handler tests use the router helper and validate responses against `docs/openapi.yaml` as the existing handler tests do; mailer tests use the fake SMTP server; no `time.Sleep`. Run them with `-race`.

**Usecase (`usecase/target_tester_test.go`, `alert_test.go`)**

- An email input with a valid address: the email send is called once with the address (trimmed) and an alert equal, by struct equality, to `{ServiceID, ServiceName (the service's name from Find), Status: test, ChangedAt: the fake clock's time in UTC, Message: TestAlertMessage}`; the webhook send is not called; the result is `Delivered: true` (FR-107).
- A webhook input with a URL and two headers: the webhook send is called once with the trimmed URL and the headers in order, trimmed, and the same alert; the email send is not called; `Delivered: true` (FR-107).
- A failed delivery: a send returning an error with any text gives `FailureReason` equal to that text; with the email send returning `ErrNotConfigured`'s text, the result is `Delivered: false` and `FailureReason` exactly `no SMTP account configured`; with each of the webhook reasons above, `FailureReason` is that exact text; the result is not an error (a completed test is a result) (FR-107).
- The name in the alert is the service's saved name even when the request's input has a different `name` (the target's own name is never the service name).
- Invalid input: an empty address, a malformed address, an address over the limit, a URL not starting with `http://` or `https://`, a URL over the limit, a header row with an empty name, too many header rows, a name over 50 characters, a missing or unknown type: each returns `domain.ValidationError` with the same field errors `createTarget` returns for that input (the same function), neither send is called and `Find` is not called (FR-108, FR-82, FR-89, FR-110).
- A service with `alerts_enabled` false: the test is still sent and the result is as for a service with alerts on.
- A service that does not exist: `Find` says `ErrNotFound`: the error is returned, neither send is called. Another `Find` error is returned wrapped (`errors.Is`), nothing is sent.
- The request's context ended before or during the send: that context error is returned, not a result.
- Read by the verifier: nothing is saved or written: the service has no dependency but the finder, the two senders and the clock (shown by the constructor's parameter types and by the fakes having no write method) (FR-108).
- NFR-7: a service name holding `<b>x</b>` and a double quote gives a test alert whose name is that text, unchanged; the message constant holds no markup.
- The test message constant is exactly `This is a test alert from Monitory. No service has changed status.`; the builder of the test alert gives the same alert for the same inputs and no other field is filled.
- The default messages and the existing alert tests pass unchanged.

**Mailer (`adaptor/mailer/mailer_test.go`, with the fake SMTP server)**

- An alert with status `test` and the name `API` at `2026-11-18 14:05` UTC: the server received the subject exactly `Test alert for API` and the decoded body exactly the four lines `Service: API`, `Status: Test`, `Time: 2026-11-18 14:05 UTC` and `This is a test alert from Monitory. No service has changed status.`, ending with one `\n` (FR-107, FR-93).
- A name holding `<b>x</b>` and a double quote in a test alert arrives in the subject and the first body line as that text, unchanged (NFR-7).
- A name with a CR and an LF in a test alert becomes spaces in the subject and the first line, as for a real alert.
- The existing unhealthy and healthy cases pass unchanged.

**Sender (`adaptor/webhook/sender_test.go`)**

- An alert with status `test` arrives at the receiver with `status` `test` and the other three keys, decoded from the body (FR-107); a name with markup and a double quote decodes back to the same text (NFR-7).

**Handler (`handler/target_tests_test.go`; the `TargetTester` spy; responses validated against the contract)**

- A signed-in request with the CSRF token and an email body: 200, `{"delivered": true}` with no `failure_reason`; the spy got the service id from the path and the input mapped as `createTarget` maps it.
- A webhook body with headers: the spy got the url and the headers as rows, in order.
- A spy returning `Delivered: false` and a reason: 200, `delivered` false and `failure_reason` exactly that text.
- The spy returning `domain.ValidationError` with two fields: 422 `validation_failed` with both errors in order; returning `domain.ErrNotFound`: 404 `not_found`; returning another error: 500 `internal_error`. Each response validates against the contract.
- No session: 401 `unauthenticated` and the spy is not called; a session without the CSRF header: 403 `csrf_failed` and the spy is not called (NFR-8); a body over the router's limit, a non-JSON content type and a missing body give the router's 413, 415 and 400 and the spy is not called.
- The log: a completed test logs one `target test sent` line with `service_id`, `type` and `delivered`; across the tests the log output never holds the address, the URL, a header or the reason's text.
- The route no longer answers 501.

**Wiring (`cmd/server/main.go`, read by the verifier; there is no test of `main`)**

- The test usecase is built from `serviceRepo`, the same mailer and webhook sender as the dispatcher, the real clock and the target limits, and is passed to `handler.NewServer`.

**Repo-wide**

- `make check` passes.
- `git diff` shows no change to `go.mod`, `go.sum`, `.env.example`, `platform/config`, a migration, `stubs.go`, the generated API or any file outside the allowed paths; no configuration key was added.

## Verifier checks

- **Layering, by reading imports:** `usecase/target_tester.go` imports `domain` and the standard library only; `handler/` imports no `adaptor`, `repository` or `worker` (it keeps its existing imports: `internal/api`, `domain`, echo and `handler/middleware`); only `cmd/server` knows the mailer and the sender and the usecase together.
- **FR-108 by construction:** `NewTargetTestService`'s parameters have no repository with a write method, no dispatcher and no outcome recorder; `git grep` finds no call of `SetDeliveryFailed`, `Dispatch` or `RecordDeliveryOutcome` in the new code.
- **One validation:** the test calls `ValidateTargetInput` and `normalizeTargetInput`, not a copy.
- **Same delivery:** `main.go` passes the instances built for the dispatcher; no second mailer or webhook client is built.
- **Logs and errors:** read every log call in `handler/target_tests.go`: only the ids, the type and `delivered`; `FailureReason` is the error's text of an adaptor error and never an address or a URL; no `err.Error()` of a database or network error is shown.
- **Time:** no `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` outside tests, `pkg/` and `cmd/`; the alert time is the usecase's clock.
- **Mutation checks to run:** send the test through the dispatcher or with a retry; validate with a copy that skips a rule; skip validation; call `Find` before validating; use the request's `name` as the service name; drop `status: test` (send `unhealthy`); label the email as unhealthy; drop the UTC conversion; answer 200 with `delivered` true when the send failed; return the error instead of a result on a failed send; write `last_delivery_failed` or a status; log the address or the reason text; answer 404 for a validation failure or the reverse. Each must fail at least one named test.
- **Inputs to try:** an email target with no SMTP account configured (failed, `no SMTP account configured`, which matches the board's "Failed: no SMTP account configured"); an unreachable address; a webhook to a 500, a redirect and a closed port; a webhook with a header with CR or LF; a service that does not exist; an empty and a 50-character and a 51-character name; a 2,049-character URL; a body with the type missing; a client that disconnects mid-send.
- **What the verifier cannot prove:** delivery to a real SMTP provider or a real webhook, and the dialog showing the result (the next task, then the milestone's end-to-end journeys); say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a migration, a configuration key, a change to `handler/stubs.go` or the generated API, or an edit to a spec file.
- `webhook-sender`, `delivery-retry` or `delivery-outcome` is not merged, or a name this file takes from them is missing.
- The webhook sender or the mailer cannot give the result this file describes without a change that is not listed (for example, the sender writes a fixed status in the body).
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check` and, because `mailer.go` has an integration test, `make test-integration` (it needs Docker for Mailpit), and report "run, passed", "run, failed" or "not run" with the reason; commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. Also list every judgment call this file did not settle.
