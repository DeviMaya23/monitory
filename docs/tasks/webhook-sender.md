# Task: webhook sender

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

When a service's status changes and an alert is due, the app now delivers it to every webhook target on the alert list as well as every email target: one HTTP `POST` with the four values of the alert as a JSON body and the target's custom headers, one attempt, no redirect followed, a response awaited for the configured time. This replaces the skip `alert-dispatch` left in `worker.AlertDispatcher`. After it, a service that goes unhealthy with a webhook target on its list sends the request, and one that recovers sends the recovery request. Retries and the "last delivery failed" outcome are the next tasks (see "Out of scope").

Requirements covered:

- FR-90: a webhook delivery is an HTTP `POST` with a JSON body carrying the same content as the email alert.
- FR-23, in part: the body has the service name, the new status, the time of the change and the message, and nothing else of the service; the alert's service id never reaches it.
- FR-93: the time in the body is in UTC and says so (`Z`).
- FR-91: the sender waits up to the configured time (`WEBHOOK_TIMEOUT_SECONDS`, default 10 seconds, an existing key) for the response; no response in that time is a failed delivery.
- FR-92, in part: the target's custom headers are sent (names in the form the HTTP library writes, values as saved, the values of one name in the order given); a header with a name or value that is not valid on the wire is refused before anything is sent (by the user's decision: the delivery fails, nothing is rejected on save).
- FR-115: a redirect is not followed; it counts as a non-2xx response and fails the delivery.
- FR-85, in part: a webhook delivery fails when the monitor cannot connect, when the receiver's certificate is rejected, on a timeout, or on a non-2xx response. One attempt only; the retries are a later task.
- FR-83: a failed or slow webhook delivery does not stop or delay the other targets (the dispatcher's own rule, now also shown for a webhook).
- NFR-5: the first webhook attempt starts at once on the hand-off, as for email (no wait and no timer).
- NFR-7: a name or message the admin typed reaches the body as JSON text, never interpreted.

Out of scope:

- **Retries** (FR-85, the 3 attempts and the 30 s, `ALERT_DELIVERY_RETRIES`, `ALERT_DELIVERY_RETRY_INTERVAL_SECONDS`): `delivery-retry`. The two keys stay unused here.
- **The delivery outcome and the "last delivery failed" notice** (FR-86, FR-84, `last_delivery_failed`): `delivery-outcome`. Nothing here writes to the database; the outcome is only logged.
- **`testTarget`** (FR-107, FR-108) and the `test` status of the payload: `test-target`, which reuses this sender. The payload's `status` is `unhealthy` or `healthy` here.
- **Rejecting a header with CR or LF on save**: left in the backlog (the `targets-api` line); needs the user's approval of a new rule.
- **A new configuration key**, a new dependency, any change to `docs/openapi.yaml` or the migrations.
- **A frontend change.**

## Prerequisite

`alert-dispatch` and `target-form-dialog` are merged (they are). The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `worker.AlertDispatcher` with `Dispatch(alert, targets)`, `Close()`, the `worker.Mailer` interface and the `deliver` method that skips a webhook target (`worker/alert_dispatcher.go`), and its test `TestDispatch_WebhookTargetIsSkippedAndLogged`.
- `domain.Alert` and `domain.AlertStatus` (`domain/alert.go`); `domain.Target` with `Type`, `Value` (the URL for a webhook) and `Headers []domain.NameValue` (`domain/target.go`, `domain/service.go`).
- `adaptor/webhook` as a package with a `doc.go` only; `adaptor/mailer` (`ErrNotConfigured`, `ErrNotAccepted`, the `reason` type) as the model for sentinel errors.
- `config.Limits.WebhookTimeoutSeconds` (key `WEBHOOK_TIMEOUT_SECONDS`, default 10, minimum 1) in `platform/config`, in `.env.example`.
- `testutil.TargetServer` (scripted status, body, delay, redirect and close-without-answer; optional TLS with `testutil.TargetTLS()`; records method, path, headers and body of every request, `Requests()`, `RequestsTo(path)`, `Arrived(path)`), used as the stub webhook receiver. `testutil` is not changed.

## Role and ownership

Role: Backend.

You may change only:

- `backend/internal/adaptor/webhook/sender.go`, `sender_test.go` (new; `doc.go` stays)
- `backend/internal/worker/alert_dispatcher.go`, `alert_dispatcher_test.go` (the webhook branch, the interface, the constructor and the tests below)
- `backend/cmd/server/main.go` (wiring)

You may not change anything else: not `backend/migration/**`, `backend/internal/api/**`, `backend/internal/handler/**`, `backend/internal/domain/**`, `backend/internal/usecase/**`, `backend/internal/repository/**`, `backend/internal/testutil/**`, `backend/internal/platform/config/**`, `.env.example`, `backend/go.mod`, `backend/go.sum` (no dependency changes), `Makefile`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/webhook-sender.plan.md`). No configuration key is added or renamed.

Shared files this task touches, all owned by this task while it runs: `worker/alert_dispatcher.go` and its test, `cmd/server/main.go`. The tasks `delivery-retry`, `delivery-outcome` and `test-target` change the same files and wait for this one. Tasks that may run at the same time: `service-form-alerts` and `target-delivery-notice` (frontend only).

## Operations used

None are implemented and no operation of `docs/openapi.yaml` is served. The contract's `receiveAlert` (`webhooks.alertDelivery`) is the request this task sends: a `POST` with a JSON body of the contract's `WebhookAlertPayload` (`service_name`, `status`, `changed_at` as a `date-time`, `message`); a `2XX` answer is delivered and anything else (the contract's `default`) is a failed attempt. `status` is `unhealthy` or `healthy` here (the contract's `test` is for `test-target`).

## Behavior

### What exists

`worker.AlertDispatcher` starts one goroutine per target; an email target calls `Mailer.SendEmail(ctx, to, alert)` once, and a webhook target is skipped: it logs the warn line `alert not delivered` with the reason `webhook delivery is not built yet`. The dispatcher's outcome logging for email is: no error, `alert delivered` (info); an error while the dispatcher's context has ended, `alert delivery abandoned` (warn, no reason); any other error, `alert delivery failed` (warn, `reason` = the error's text). Every line has `service_id`, `target_id` and `status` and never an address, URL, name or message. `Close()` cancels the context and waits for every goroutine. `cmd/server/main.go` builds the mailer and `worker.NewAlertDispatcher(mail, log)`; `cfg.Limits.WebhookTimeoutSeconds` is read nowhere yet.

### The sender (`adaptor/webhook.Sender`)

`New(Config) (*Sender, error)`; `Config` is the sender's own struct (it does not import `platform/config`) with one field, `Timeout time.Duration`. A `Timeout` of zero or less is an error from `New` (the configuration already refuses less than 1 second, so this is a guard).

`SendWebhook(ctx context.Context, url string, headers []domain.NameValue, alert domain.Alert) error` makes one attempt. The order:

1. **Headers are checked first,** before any network use, in the order given. A header is not valid when its name is empty or holds a character that is not an HTTP token character (letters, digits and ``!#$%&'*+-.^_`|~``), or when its value holds a byte below `0x20` other than the horizontal tab, or `0x7f`. Any invalid header returns `ErrInvalidHeader` at once and nothing is sent, even when the bad one is not the first. (The standard library would refuse the same headers on its own; the check is here so that the reason is this task's.)
2. **The body** is a JSON object with exactly four keys: `service_name` (the alert's `ServiceName`), `status` (`unhealthy` or `healthy`, the alert's `Status`), `changed_at` (the alert's `ChangedAt` converted to UTC and written in RFC 3339 with seconds and no fraction, for example `2026-11-18T14:05:00Z`; fractions of a second are dropped, not rounded) and `message`. The alert's `ServiceID` is not in it. The text is encoded by `encoding/json`, so a name or message with markup, quotes, line breaks or non-ASCII characters is a JSON string and nothing else (NFR-7).
3. **The request** is a `POST` to `url` with that body, under a deadline of `Timeout` on top of `ctx` (the deadline covers connecting, sending and waiting for the response headers). Headers: `Content-Type: application/json` and `User-Agent: Monitory` first, then the target's custom headers, each added with `Header.Add`, so the value is as saved and the name is written in the library's canonical form (`x-api-key` goes out as `X-Api-Key`; names are case-insensitive on the wire). HTTP headers are a map: the order of headers with different names is not kept and is not promised; the values of two custom headers with one name are both sent, in the order given. When a custom header is named `Content-Type` or `User-Agent` (compared ignoring case), it replaces the default of that name instead of adding a second. `User-Agent: Monitory` is the same value the check prober sends. The protocol is HTTP/1.1 (the client is built with its own transport and TLS settings, so HTTP/2 is not negotiated).
4. **The client** uses no proxy, no keep-alive and no cookie jar, TLS 1.2 or newer with the system's trusted roots, and does not follow a redirect: the first response is the answer. A private or loopback address is allowed (requirements section 6). The response body is not read: it is closed as soon as the status is known. Nothing the receiver sends back reaches the alert, a log line or an error text.
5. **The outcome,** by the first rule that applies:
   - a response with status 200 to 299 inclusive: `nil`;
   - `ctx` ended before a response was in hand (the dispatcher's `Close`): the context's error, so the caller can tell a stop from a failure;
   - the attempt deadline passed: `ErrTimedOut`;
   - a certificate problem (the receiver's certificate is rejected: an unknown authority, an invalid or expired certificate, a host name that does not match; the same errors `adaptor/probe/http.go`'s `isCertificateError` tests): `ErrCertificate`;
   - any other failure to get a response (connection refused, a name that does not resolve, the connection closed without an answer, a malformed URL): `ErrCouldNotConnect`;
   - any other status (every 1xx that arrives as a final answer, 3xx including a redirect, 4xx, 5xx): a `StatusError` carrying the status code.

The failure texts, by the user's decision:

| Failure | Error | Text, exactly |
|---|---|---|
| a header that is not valid | `ErrInvalidHeader` | `a custom header is not valid` |
| cannot connect | `ErrCouldNotConnect` | `could not connect to the webhook` |
| certificate rejected | `ErrCertificate` | `the webhook's certificate was rejected` |
| no answer in time | `ErrTimedOut` | `the webhook did not answer in time` |
| any other status, a redirect included | `*StatusError` | `the webhook answered with status 503` (the code of the answer, in digits) |

The apostrophe in `webhook's` is the plain `'`. The four sentinels satisfy `errors.Is`; the status error is read with `errors.As`: its type is `webhook.StatusError`, a struct with one exported field `Code int`, returned as `*StatusError`. For `ErrTimedOut` the cause is the deadline error, so `errors.Is(err, context.DeadlineExceeded)` also holds. Every error's text is only the reason: never the URL, a host, a header name or value, the message or the cause's text (a Go network error holds the URL and the address). The cause stays reachable through `errors.Unwrap` for the four sentinels' tests and debugging; nothing logs it. The sender writes no `go` statement and logs nothing (`CONVENTIONS.md`, Logging).

### The delivery loop (`worker.AlertDispatcher`)

- `worker` defines the second interface it needs, beside `Mailer`: `WebhookSender` with `SendWebhook(ctx context.Context, url string, headers []domain.NameValue, alert domain.Alert) error`. Its documentation says the text of a returned error is the reason, is logged as it is, and must hold no URL, header or message. `adaptor/webhook.Sender` satisfies it without importing `worker`.
- The constructor becomes `NewAlertDispatcher(mailer Mailer, webhooks WebhookSender, log *slog.Logger)`; its call sites (`main.go`, and the two in `alert_dispatcher_test.go`: the `newDispatcher` helper and `TestDispatch_RacingCloseNeverSendsAfterCloseReturned`) are updated. The test helper builds a fake webhook sender that succeeds by default, so the existing tests that include a webhook target (for example `TestDispatch_LogsOutcomesWithIdsOnly`) keep their number of log lines.
- A target whose type is neither `email` nor `webhook` (the enum makes it unreachable) is not sent: one `alert not delivered` warn line with the reason `unknown target type` and the usual three fields.
- A webhook target's goroutine makes one call, `SendWebhook(d.ctx, target.Value, target.Headers, alert)`, no retry, and logs the outcome exactly as the email branch does: no error is `alert delivered` (info); an error while the dispatcher's context has ended, whatever the error, is `alert delivery abandoned` (warn, no reason); any other error is `alert delivery failed` (warn, `reason` = the error's text). The skip, its reason `webhook delivery is not built yet` and the line `alert not delivered` are removed.
- Every line still has `service_id`, `target_id` and `status` and none ever has the address, the webhook URL, a header name or value, the target name, the service name or the message.
- Everything else (the goroutine per target, `Close`, the mutex, the `alert dropped` line) is unchanged.

### Wiring (`cmd/server/main.go`)

Build the sender with `webhook.New(webhook.Config{Timeout: time.Duration(cfg.Limits.WebhookTimeoutSeconds) * time.Second})` (an error stops the start, like every other start error), before the dispatcher, and pass it to `worker.NewAlertDispatcher(mail, sender, log)`. Nothing else changes: the order of the closes stays as `alert-dispatch` made it.

### Known gaps

- **No retry and no failure notice:** a failed webhook is logged once and forgotten, as an email is; `last_delivery_failed` is never set. The next tasks add both.
- **A header the HTTP library controls has no effect.** The library sets `Host`, `Content-Length`, `Transfer-Encoding` and `Trailer` itself and ignores a custom header with one of those names, which is accepted on save and silently not sent; a custom `User-Agent` with an empty value removes the header; leading and trailing spaces of a value are dropped when the library writes it. Not changed here.
- **Credentials in the URL are sent.** For `https://user:pass@host/` the library adds `Authorization: Basic …` unless a custom `Authorization` header exists, which then wins. Not changed here; the URL is never logged.
- **Header order and name case are not kept** (see "The sender", step 3).
- **No check of the body's limits.** The contract caps `service_name` at 100 and `message` at 500; both are validated when the service is saved, and the sender sends what the alert holds.
- **A copy of the certificate check.** `adaptor/webhook` carries its own small function for the certificate errors, as `adaptor/probe` has one; adaptors do not import each other. A third user would justify a shared place.
- **A header with CR or LF, or two with one name, is still saved** (backlog, `targets-api`); here it fails the delivery (CR or LF) or is sent twice (one name).
- **Delivered means a 2xx answer.** Whether the receiver acts on it is not known to the app.
- **The reason is one of five texts.** A refused connection, a name that does not resolve and a connection closed early all read `could not connect to the webhook`.
- **A slow body is not waited for:** the deadline covers the response headers; the body is not read.
- **The first attempt of a webhook may be slower to start than an email's by one DNS lookup;** the 10 seconds of NFR-5 are the budget, nothing here times it.

## Structure

By `ARCHITECTURE.md` ("Background work", "Interfaces"). Names marked "new" are fixed by this file; others (unexported helpers, test doubles) are the builder's choice.

- `adaptor/webhook/sender.go` (new): `Sender`, `Config`, `New`, `SendWebhook`, `ErrInvalidHeader`, `ErrCouldNotConnect`, `ErrCertificate`, `ErrTimedOut`, `StatusError`. It imports `domain` (for `domain.Alert` and `domain.NameValue`) and the standard library only; follow the `reason` sentinel pattern of `adaptor/mailer/mailer.go` so that the error text and the `errors.Is` check do not depend on the cause. The client is built once and reused (safe for concurrent use).
- `worker/alert_dispatcher.go`: the `WebhookSender` interface, the constructor, the webhook branch of `deliver`. It still imports `domain` only.
- `cmd/server/main.go`: the sender and the constructor call.
- Test doubles in `worker/alert_dispatcher_test.go`: a fake `WebhookSender` that records calls (url, headers, alert), signals on a channel and can block on its context or return a scripted error, built the same way as the existing fake mailer.

The rules stay where `ARCHITECTURE.md` puts them: whether and what to send is `usecase/`'s (`alert-dispatch`); the sender holds the protocol (the request's layout), no decision about whether to send.

## Dependencies

None. The standard library only (`net/http`, `encoding/json`, `crypto/tls`, `crypto/x509`); `go.mod` and `go.sum` do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed. Sender tests use `testutil.TargetServer` as the receiver and may use real deadlines of at most 200 ms (`TESTING.md`); worker tests wait on channels and never `time.Sleep`, and put a deadline around every call that can block, so that a regression fails fast. Run them with `-race`.

**Sender (`adaptor/webhook/sender_test.go`)**

- A 200 answer returns nil; so do 204 and 299 (FR-90). The receiver saw exactly one request: method `POST`, the path given, `Content-Type: application/json`, `User-Agent: Monitory`.
- The body, decoded as JSON, has exactly the keys `service_name`, `status`, `changed_at` and `message` with the alert's values, and a distinctive `ServiceID` of the test appears nowhere in the body or the headers (FR-23). `status` is `unhealthy` for an unhealthy alert and `healthy` for a recovery.
- `changed_at` for an alert at `2026-11-18T14:05:59.9Z` reads `2026-11-18T14:05:59Z`; for the same instant written in a UTC+7 zone it reads the same string with `Z`; a fraction is dropped (FR-93).
- A name and a message holding `<b>x</b>`, a double quote, a line break and non-ASCII characters decode back to the same text, and the raw body is valid JSON (NFR-7).
- Custom headers: two headers with different names arrive with their values as saved (a lower-case name arrives in its canonical form, and no order across names is asserted); a header value of 4,096 characters arrives whole; two headers with one name both arrive, their values in the order given; a custom `Content-Type` replaces the default (the receiver saw one value, the custom one); a custom `User-Agent` does the same; an empty header list sends only the two defaults (FR-92).
- Invalid headers: a name that is empty, one with a space, one with a colon, a value with CR, a value with LF, a value with a NUL byte: each returns `ErrInvalidHeader` with the text exactly `a custom header is not valid`, and the receiver saw no request, including when the bad header is the second of two (FR-92).
- Statuses: 300-class answers 301, 302, 307 and 308 with a `Location` to another path of the same receiver return a `*StatusError` with that code and are not followed: the receiver saw one request and the other path was never asked (FR-115); 404 and 500 return a `*StatusError` with that code; 300 returns one; 199 cannot be scripted and is not tested. The text is exactly `the webhook answered with status 302` (and the matching one for each code).
- Cannot connect: a port nothing listens on (the test opens a listener and closes it to get one) returns `ErrCouldNotConnect`, and so does a receiver that closes the connection without answering; the text is exactly `could not connect to the webhook`.
- Certificate: a TLS receiver whose certificate the default roots reject (`testutil.TargetTLS()`) returns `ErrCertificate`, text exactly `the webhook's certificate was rejected` (FR-85).
- Timeout: a receiver whose answer is delayed beyond a short `Timeout` set in the test returns `ErrTimedOut` (text exactly `the webhook did not answer in time`), and the call returns well before the answer would have come (a timeout of 50 ms against a delay of 200 ms, the call returns in under 150 ms); an answer that arrives inside the timeout is delivered (FR-91).
- A `ctx` cancelled while the receiver is delaying its answer: the returned error satisfies `errors.Is(err, context.Canceled)` and is not `ErrTimedOut`.
- Every failure's text holds none of: the URL, the host and port, a header name or value, the message, the Go error's own text (read from the returned error's `Error()` for each failure above).
- `New` with a zero or negative `Timeout` returns an error; with a positive one it does not.
- Two concurrent `SendWebhook` calls to one `Sender` under `-race` both succeed.

**Delivery loop (`worker/alert_dispatcher_test.go`; a fake `Mailer`, a fake `WebhookSender`, a `slog` handler writing to a buffer)**

- A webhook target: one `SendWebhook` call with the target's `Value`, its `Headers` in order, and the alert as given; the mailer is not called; after `Close` returns there is still exactly one call, also when the delivery failed, so there is no retry (FR-85 in part).
- A success logs one `alert delivered` info line; a failure one `alert delivery failed` warn line whose `reason` is the error's text; each line has `service_id`, `target_id` and `status`; across all lines of the tests the buffer never holds the URL, a header name or value, the target name, the service name or the message (FR-23's neighbour rule, `CONVENTIONS.md`, Logging).
- A target of an unknown type: neither fake is called and one `alert not delivered` warn line with the reason `unknown target type` is logged.
- A webhook target and an email target in one list: both are sent. With the webhook blocked, the email is still delivered; with the email failing, the webhook is still delivered (FR-83).
- `Dispatch` returns while a webhook send is blocked, and that send has started by then with no clock involved (NFR-5).
- `Close` while a webhook send is blocked: its context is cancelled, `Close` returns only after the send has returned, and the line logged is `alert delivery abandoned` with no `reason`, whether the fake returned `context.Canceled` or any other error. A send that returns no error after `Close` ran logs `alert delivered`.
- Replaced on purpose: `TestDispatch_WebhookTargetIsSkippedAndLogged` (the skip and its `webhook delivery is not built yet` line) is replaced by the first criterion above. Every other test of `alert_dispatcher_test.go` passes with only its setup changed (the constructor takes the second argument); no assertion is changed or removed.
- Two alerts for different services dispatched at once under `-race`, each with a webhook target, keep their own service ids in their calls and log lines.

**Wiring (`cmd/server/main.go`, read by the verifier; there is no test of `main`)**

- The sender is built from `cfg.Limits.WebhookTimeoutSeconds` converted to seconds, an error from `New` returns from `run`, and the dispatcher gets it. The closes are in the order `alert-dispatch` left.

**Repo-wide**

- `make check` passes.
- `git diff` shows no change to `go.mod`, `go.sum`, `.env.example` or any file outside the allowed paths; no configuration key was added.

## Verifier checks

- **Layering, by reading imports:** `adaptor/webhook` imports `domain` and the standard library only (no `worker`, `usecase`, `repository`, another adaptor, `platform/config`); `worker/` still imports `domain` only; only `cmd/server` knows both.
- **One client:** `adaptor/webhook` is the only place that makes a request to an admin-supplied webhook URL (`STACK.md`); no `http.Get`, `http.DefaultClient` or a second client elsewhere.
- **The client:** by reading, no proxy (`Proxy` nil), keep-alive off, no redirect followed (`CheckRedirect` returns `http.ErrUseLastResponse` or equivalent), TLS 1.2 minimum, the response body closed and not read, the deadline from `Config.Timeout` on top of the caller's `ctx`.
- **No hardcoded limit:** the timeout comes from the configuration key through `main.go`; there is no literal 10 seconds in the sender or the dispatcher.
- **The body:** exactly four keys; the id, URL, headers or any other service data cannot reach it by reading the encoder's input.
- **Logs and errors:** read every log call in `worker/alert_dispatcher.go` and every error text in `adaptor/webhook/sender.go`: no URL, host, header, name or message reaches a field or a text; the sender logs nothing; the exact texts are as in the table.
- **Time:** no `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` outside tests, `pkg/` and `cmd/` (the `Config.Timeout` deadline uses the context package).
- **Goroutines:** the sender starts none; the dispatcher's goroutines are still all counted in its wait group.
- **Mutation checks to run:** follow redirects; treat 3xx as delivered; treat 4xx as delivered; send the service id; drop the UTC conversion; skip the header check; reverse the values of two headers with one name; let a custom header never replace `Content-Type`; read the timeout as a constant; put the URL into an error text; log the URL or a header; retry once on failure; call `SendWebhook` for an email target or `SendEmail` for a webhook; make `Dispatch` wait for the sends; drop the `ctx` from the request. Each must fail at least one named test.
- **Inputs to try:** a webhook-only list with an unhealthy alert and with a recovery; a URL with a query string and a user-info part (neither appears in a log line or an error text); a receiver answering 301 to a reachable URL (not asked), 204, 500 and with the connection closed; a self-signed TLS receiver; a header value with a tab (valid) and with CR (refused); 20 headers of 4,096 characters; a stop while a send is blocked; two webhook targets with one slow.
- **What the verifier cannot prove:** delivery to a real receiver and a real CA-signed certificate; say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a migration, a configuration key, or an edit to a spec file; in particular if the standard library cannot give the behavior above without one.
- `testutil.TargetServer` cannot script a case named above and the case cannot be tested without changing it.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
