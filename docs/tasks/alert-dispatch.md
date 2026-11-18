# Task: alert dispatch

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

When a service's status changes, the app now decides whether an alert is due, builds it, and delivers it by email to every email target on the service's alert list, each on its own, with one attempt. This is the first half of the check-to-alert chain, the product's highest-risk path: the status rule already saves the new status; this task adds the decision, the content, the delivery loop and the SMTP sender. After it, a service that goes unhealthy with alerts on and an email target on its list sends a mail to that address, and one that recovers sends a recovery mail. Webhook targets, retries and the "last delivery failed" notice are the next tasks (see "Out of scope").

Requirements covered:

- FR-21: a change from healthy to unhealthy, with alerts on, hands one alert for every target on the list to delivery.
- FR-22: a change from unhealthy to healthy, with alerts on, does the same with the recovery message.
- FR-23, in part: an alert has the service name, the new status, the time of the change and the message (the admin's, or the default); nothing else of the service reaches it. The email carries exactly these.
- FR-24: a first check that finds the service unhealthy is a change and alerts; a healthy first check sends nothing.
- FR-25: alerts turned on for a service that is already unhealthy send nothing; the next change alerts.
- FR-83: a failed or slow delivery to one target does not stop or delay the others.
- FR-85, in part: an email delivery fails with the reason `no SMTP account configured` when no SMTP host is configured, and when the SMTP server does not accept the message. One attempt only; the retries are a later task.
- FR-93: the time in the email is in UTC and says so.
- FR-111, in part: the decision reads only the saved status, so a service saved as unhealthy that is still unhealthy at its first check after a start sends nothing, and a change found at that check alerts as usual. The test shows that the rule keeps no memory of its own (a second usecase over the same saved states); that the status survives a restart is `check-sequence-and-state`'s criterion (NFR-1).
- NFR-5: the first delivery attempt starts at once on the hand-off, with no wait and no timer in between. Before the hand-off there are only the two short reads of steps 4 and 6.

Out of scope:

- **The webhook sender** (FR-90, FR-91, FR-92, FR-115): a later task (`alert-delivery-*`). Here a webhook target is skipped and the skip is logged (see "The delivery loop").
- **Retries** (FR-85, the 3 attempts and the 30 s): a later task. The configuration keys `ALERT_DELIVERY_RETRIES` and `ALERT_DELIVERY_RETRY_INTERVAL_SECONDS` already exist and stay unused here.
- **The delivery outcome and the "last delivery failed" notice** (FR-86, `alert_delivery_failed`, `last_delivery_failed`): a later task. Nothing in this task writes `targets.last_delivery_failed`. The outcome is only logged.
- **FR-84** (a failed delivery does not change the status): nothing in this task can change a status after the alert is handed off, but no test in this file proves it; it is claimed by the later outcome task, which is the one that could break it.
- **`testTarget`** (FR-107, FR-108): a later task; it will reuse the mailer's send and add a `test` status and its wording.
- **The service form's alert fields** (FR-20, FR-65 on the screen): a later frontend task. The columns `alerts_enabled`, `unhealthy_message` and `recovery_message` already exist and `createService` already saves them.
- **A log line per check outcome with the failure reason** (backlog, "Left out of `scheduler`"): the alert decision does not need it; it stays in the backlog.
- **Paused services** (FR-76) and **TCP services** (no TCP probe yet): no result arrives for either, so nothing here looks at them.
- **A new configuration key**, including an SMTP timeout (see "Known gaps").

## Prerequisite

`check-sequence-and-state`, `scheduler`, `create-service-api` and `targets-api` are merged (they are). The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `usecase.CheckResultService` with `RecordCheckResult(ctx, serviceID string, result domain.CheckResult) error`, its status rule `applyCheckResult`, and `worker.CheckRunner`, which calls it through the `worker.CheckRecorder` interface.
- `repository.ServiceRepository`, `repository.TargetRepository.List`, `domain.Service` (with `AlertsEnabled`, `UnhealthyMessage`, `RecoveryMessage`), `domain.Target` (with `Type`, `Value`), `domain.ErrNotFound`.
- The package `adaptor/mailer` (a `doc.go` only), `config.SMTP` and the `SMTP_*` keys in `.env.example`.
- `testutil` (`NewDB`) and `pkg/clock` with `Fake`.

## Role and ownership

Role: Backend.

You may change only:

- `backend/internal/domain/alert.go` (new)
- `backend/internal/usecase/check_result.go`, `check_result_test.go` (changed), `check_result_fakes_test.go` (changed: the fakes below), `alert.go`, `alert_test.go` (new)
- `backend/internal/repository/service.go`, `service_test.go` (one new method and its tests)
- `backend/internal/worker/alert_dispatcher.go`, `alert_dispatcher_test.go` (new)
- `backend/internal/adaptor/mailer/mailer.go`, `mailer_test.go`, `mailer_integration_test.go` (new; `doc.go` stays)
- `backend/internal/testutil/smtp_server.go`, `smtp_server_test.go` (new: the fake SMTP server)
- `backend/cmd/server/main.go` (wiring)
- `backend/go.mod`, `backend/go.sum` (the one dependency)

You may not change anything else: not `backend/migration/**`, `backend/internal/api/**`, `backend/internal/handler/**`, the rest of `backend/internal/domain/**`, `backend/internal/platform/config/**`, `.env.example`, `Makefile`, `docker-compose.yml`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/alert-dispatch.plan.md`). No configuration key is added or renamed.

Shared files this task touches, all owned by this task while it runs: `cmd/server/main.go`, `go.mod`, `go.sum`, `repository/service.go`, `usecase/check_result_fakes_test.go`. Tasks that may run at the same time: `alert-list-screen`, `portal-into-app` (frontend only; `target-form-dialog` waits for them). The later `alert-delivery-*` tasks, `test-target` and `getService` wait for this one: they build on `worker.AlertDispatcher`, the mailer and `repository.ServiceRepository`.

## Operations used

None. No operation of `docs/openapi.yaml` is implemented and no HTTP request is served or made. The contract's `receiveAlert` (the webhook request) is not sent here. `domain.Alert` carries the same four values as the contract's `WebhookAlertPayload` (`service_name`, `status`, `changed_at`, `message`) so the webhook task can map it without a change here.

## Behavior

### What exists

- `usecase.CheckResultService.RecordCheckResult` saves the new state through `ServiceStateRepository.Update(ctx, id, apply)` using the pure status rule `applyCheckResult(saved, result, now)`; the clock's `now` (UTC) is the saved `LastStatusChangeAt` when the status changes. A result for a deleted service is dropped (nil). It does not look at alerts yet.
- `worker.CheckRunner` calls `RecordCheckResult` through its own interface `CheckRecorder`; the scheduler logs an error the runner returns.
- `cmd/server/main.go` builds the runner and the scheduler; `cfg.SMTP` (`Host`, `Port`, `TLS` one of `starttls`, `tls`, `none`, `Username`, `Password`, `From`) is read and only used for the `smtp_configured` log field. The configuration already refuses a start with `SMTP_HOST` set and `SMTP_FROM` empty.
- `usecase.TargetRepository.List(ctx, serviceID)` (in `repository.TargetRepository`) returns the service's targets by when they were added, then id; `domain.ErrNotFound` for a service that does not exist, an empty list for none.
- There is no way yet to read one service by id: `ServiceRepository` has `Create`, `List` (with state) and `Delete`.

### When an alert is due (`usecase.CheckResultService`)

`RecordCheckResult` keeps its signature, so `worker.CheckRecorder` and the runner do not change. It gains three dependencies, each an inline interface in `check_result.go` (one or two methods, one user) satisfied by an existing or new repository, and the clock it already has: a service finder (`Find`, see "The repository"), a target lister (`List`, as above) and an alert dispatcher (`Dispatch(alert domain.Alert, targets []domain.Target)`). The constructor becomes `NewCheckResultService(states, services, targets, dispatcher, clock)` (the finder, the lister and the dispatcher inserted after `states`); its existing callers (`main.go`, the seven calls in `check_result_test.go`) are updated to it. The existing tests pass an empty fake finder (it answers `ErrNotFound`, so no alert follows), an empty fake lister and a spy dispatcher; they are not weakened.

The order:

1. The existing consistency check and the existing state update, unchanged. The update's `apply` closure also notes the status the row had (`saved.Status`), so the usecase knows the previous status after the write. (The repository calls `apply` once per `Update`; the fake does the same.)
2. A result for a service that is gone (`ErrNotFound` from the update) is dropped: return nil, no alert. Any other update error is returned unchanged, no alert.
3. **The change rule**, on the previous and the new status (the new one is `unhealthy` for a failed result, `healthy` for a healthy one):

| Previous | New | Alert |
|---|---|---|
| `not_yet_checked` | `unhealthy` | unhealthy alert (FR-24) |
| `healthy` | `unhealthy` | unhealthy alert (FR-21) |
| `unhealthy` | `healthy` | recovery alert (FR-22) |
| `not_yet_checked` | `healthy` | none (FR-24) |
| `healthy` | `healthy` | none |
| `unhealthy` | `unhealthy` | none, whatever the failure reason (FR-25, FR-111) |

   No alert: return nil now.
4. **After the new state is committed** (never inside the update), read the service with `Find`. The reads of steps 4 and 6 use a context that keeps the sequence's values but is not cancelled when the sequence's is (`context.WithoutCancel`), by the user's decision: an edit, pause or delete that cancels the sequence after the status is saved must not drop the alert for that saved change. `ErrNotFound` (deleted since): return nil, no alert. Other errors: return them wrapped with `%w` (the state is saved and the alert is lost; the scheduler logs the error unless that sequence was cancelled meanwhile, so a query failure on a cancelled sequence is silent: see "Known gaps").
5. `AlertsEnabled` false: return nil, no alert. The flag is the one on the row read in step 4, which is how FR-20 and FR-25 work: turning alerts on later changes nothing already decided, and a status that stays unhealthy never alerts.
6. List the targets with `List`. `ErrNotFound`: return nil. Other errors: return them wrapped with `%w` (same reason as step 4). An empty list: return nil, nothing is dispatched.
7. Build the alert and call `Dispatch` once with it and all the targets, in list order, whatever their type. `Dispatch` returns nothing and does not block; the usecase returns nil.

### The alert (`domain.Alert`, built in `usecase/alert.go`)

`domain.Alert` is a plain struct with exactly: `ServiceID` (used only for the log, never sent), `ServiceName`, `Status` (type `domain.AlertStatus`, values `unhealthy` and `healthy`, the strings of the contract's payload), `ChangedAt time.Time` and `Message`. `ChangedAt` is the clock's `now` of step 1 in UTC, the same instant that was saved as `LastStatusChangeAt`. The name is the service's name as saved. The message is the service's `UnhealthyMessage` for an unhealthy alert and its `RecoveryMessage` for a recovery, and when that text is empty or only whitespace the default for that status. Nothing else of the service (URL, headers, rules, failure reason, state) is in the alert (FR-23).

The wording, decided by the user:

| Status | Default message |
|---|---|
| unhealthy | `The service failed its check.` |
| healthy | `The service is healthy again.` |

The two defaults are constants in `usecase/alert.go`. An admin's message is used as saved (up to 500 characters, FR-65, already validated on save), not shortened or changed.

### The delivery loop (`worker.AlertDispatcher`)

Built with a mailer and a `*slog.Logger`; owns one context and a wait group for every goroutine it starts. It has no clock: this task has no timer (the retry task adds one).

`Dispatch(alert, targets)` returns at once, without waiting for any delivery. For each target it starts one goroutine (an owned one: counted in the wait group, with the dispatcher's context), so a slow target does not hold up another (FR-83, NFR-5). The most that run together is `MAX_SERVICES` times `MAX_TARGETS_PER_SERVICE` (250 with the defaults); there is no pool.

What a target's goroutine does:

- **Email target:** one call to `Mailer.SendEmail(ctx, to, alert)` with the target's `Value` as `to`, one attempt, no retry. After it returns: no error is `alert delivered` (the server accepted it, even if `Close` ran meanwhile); an error while the dispatcher's context has ended (the app is stopping, see `Close`), whatever the error, is `alert delivery abandoned` with no reason, and the alert is lost (FR-111); any other error is `alert delivery failed` with the error's text as the `reason`.
- **Webhook target:** nothing is sent. Log `alert not delivered` with the `reason` `webhook delivery is not built yet`, level warn.
- Every log line has `service_id`, `target_id` and `status` (`unhealthy` or `healthy`), and none ever has the email address, the webhook URL, the target name, the service name or the message (`CONVENTIONS.md`, Logging). Delivered is info, the others warn.

`worker` defines the one interface it needs, beside the dispatcher: `Mailer` with `SendEmail(ctx context.Context, to string, alert domain.Alert) error`. Its documentation says the text of a returned error is the reason, is logged as it is, and must hold no address. `adaptor/mailer.Mailer` satisfies it without importing `worker`. The usecase's `Dispatch` interface is satisfied by `*AlertDispatcher` the same way.

`Close()` stops accepting alerts, cancels the context and returns after every started goroutine has ended; a second call is safe. The "closed" flag and the wait group's `Add` are guarded by one mutex shared by `Dispatch` and `Close`, so a `Dispatch` racing a `Close` either starts all its goroutines before `Close` waits or starts none. `Close` releases the mutex before it waits on the wait group, so a `Dispatch` during the wait returns at once and starts nothing. A `Dispatch` after `Close` starts nothing and logs one warn line `alert dropped` with the `reason` `the app is stopping` (and `service_id`, `status`). Nothing is written to the database by the dispatcher.

### The mailer (`adaptor/mailer.Mailer`)

`New(Config) (*Mailer, error)`. `Config` is the mailer's own struct (it does not import `platform/config`): `Host`, `Port`, `TLS` (`starttls`, `tls` or `none`), `Username`, `Password`, `From`, and `AttemptTimeout time.Duration` (zero means 10 seconds). An unknown `TLS` value is an error from `New` (the configuration already refuses one, so this is a guard).

`SendEmail(ctx, to, alert)`:

1. **No host configured:** return the error `ErrNotConfigured` at once, without touching the network. Its text is exactly `no SMTP account configured`.
2. **Otherwise** one message through go-mail, on a new connection made for this call and closed after it (no pool, no goroutine of its own), under a deadline of `AttemptTimeout` on top of `ctx`: `From` the configured sender, `To` the target's address, the subject and the plain-text body below, content type `text/plain` in UTF-8. TLS by the mode: `starttls` mandatory STARTTLS, `tls` an implicit TLS connection, `none` no encryption. With a non-empty `Username` the connection authenticates with the username and password (the method go-mail negotiates); with an empty one it does not authenticate.
3. **Any other failure** (a message go-mail cannot build, such as a malformed address; cannot connect; TLS or STARTTLS failure; authentication; any refusal by the server; the attempt timeout) returns `ErrNotAccepted`, whose text is exactly `the SMTP server did not accept the message`. If `ctx` itself ended first (the dispatcher's `Close`), the context's error is returned instead, so the caller can tell a stop from a refusal.
4. **Cancelling `ctx` must end a send in progress,** including a wait for the server's greeting, not only a deadline. The mailer uses go-mail's context-taking send; if go-mail ends a pending read only at a deadline, the mailer ends it with `context.AfterFunc` closing the connection. The mailer writes no `go` statement of its own.

Both returned errors are satisfied by `errors.Is(err, mailer.ErrNotConfigured)` and `errors.Is(err, mailer.ErrNotAccepted)`. The error's text is only the reason, never the cause's text, because go-mail's messages can hold the address. The cause stays reachable through `errors.Unwrap` for tests and debugging; nothing logs it.

**The email** (the user's wording):

- Subject: `<name> is unhealthy` for an unhealthy alert, `<name> is healthy again` for a recovery.
- Body, four plain-text lines in this order, joined by `\n` with one `\n` at the end:
  1. `Service: <name>`
  2. `Status: Unhealthy` or `Status: Healthy`
  3. `Time: YYYY-MM-DD HH:MM UTC` (24-hour, the alert's `ChangedAt` converted to UTC, seconds dropped, not rounded; for example `Time: 2026-11-18 14:05 UTC`) (FR-93)
  4. the message
- A carriage return or line feed in the service name is replaced by one space, in the subject and in line 1, so the name cannot break the header or the layout. The message goes in line 4 as it is (it may hold line breaks).
- Nothing else is in the mail: no service id, URL, header, failure reason or link. On the wire the SMTP library may turn `\n` into `\r\n`; tests compare after turning `\r\n` back into `\n`.

### Wiring (`cmd/server/main.go`)

Build the mailer from `cfg.SMTP` (an error from `New` stops the start, like every other start error), the dispatcher from the mailer and the logger, and the check-result usecase from the three dependencies; the finder and the lister are the existing `ServiceRepository` and `TargetRepository` the services and targets usecases already use (one instance of each, shared: the builder hoists their construction above the check-result usecase, where `main.go` now builds them later). The mailer and the dispatcher are built before the scheduler's deferred close is registered. Shutdown order: the scheduler closes first (no new results), then the dispatcher (in-flight attempts are cancelled and waited for), then the HTTP server shuts down, then the database closes. Both deferred and explicit closes may run; each `Close` is safe twice. The deferred closes are registered so that they run in that order on an early return too: `defer dispatcher.Close()` is written before `defer scheduler.Close()` (deferred calls run last in, first out), and both after the database's. The existing `smtp_configured` log field stays.

### The repository

`ServiceRepository.Find(ctx, id string) (domain.Service, error)`: the `services` row as saved (all columns, no state), times in UTC; an id with no row returns `domain.ErrNotFound`; no write. It is named `Find`, and is used through the inline interface above, not added to `usecase.ServiceRepository`, because the later `getService` task owns the name `Get` (a service with its state) and the shared interface file.

### Known gaps

- **Webhook targets are skipped,** only logged. Until the webhook task, an alert list with only webhook targets alerts nobody.
- **No retry and no failure notice.** A refused mail is logged once and forgotten; `last_delivery_failed` is never set, so the dashboard shows nothing. The next tasks add both.
- **An alert is lost** when the app stops or crashes between the committed state change and the delivery, and for an attempt cancelled by `Close` (FR-111, `docs/data-model.md`). Not recovered, by design.
- **Alert settings are read after the commit.** A service edit (alerts switched off, a new message) that lands between the state write and step 4 applies to that alert.
- **A query failure after the commit is logged only if the sequence is still live.** With the reads detached from cancellation, a cancelled sequence can no longer drop an alert by cancellation, but a database error in step 4 or 6 on a sequence that was cancelled meanwhile returns an error the scheduler does not log (`scheduler.go` returns on a cancelled context before logging). Rare, and not changed here.
- **The attempt timeout is a default of 10 seconds,** a field of the mailer's own `Config` that `main.go` does not set, because no configuration key may be added without the user's approval. It can become a key later.
- **One connection per mail.** No pooling and no reuse; fine at five targets per service.
- **The `starttls` and `tls` modes are not tested in-process:** the fake server would need a certificate the mailer trusts, and the mailer has no option to skip verification, on purpose. Only a mandatory-STARTTLS refusal is tested (a server that does not offer it). The user checks both modes against the real SMTP provider by hand, once it is chosen (backlog decision).
- **Reasons are two.** A refused connection, a rejected recipient and a timeout all show as `the SMTP server did not accept the message`; finer reasons can come with the retry task.
- **Delivered means the server accepted it.** Whether the mail reaches the inbox is not known to the app.

## Structure

By `ARCHITECTURE.md` ("Background work", "Interfaces"). Names marked "new" are fixed by this file; others (constructors, unexported helpers, test doubles) are the builder's choice.

- `domain/alert.go` (new): `domain.Alert` and `domain.AlertStatus` with its two values. No logic.
- `usecase/alert.go` (new): the two default-message constants and the pure function that builds a `domain.Alert` from a service, a status and a time. `usecase/check_result.go` keeps the decision (steps 1 to 7) and the three inline interfaces.
- `repository/service.go`: `Find`.
- `worker/alert_dispatcher.go` (new): `worker.AlertDispatcher` with `Dispatch` and `Close`, and the `Mailer` interface. It imports `domain` only (not `usecase`, `repository` or `adaptor`).
- `adaptor/mailer/mailer.go` (new): `Mailer`, `Config`, `New`, `SendEmail`, `ErrNotConfigured`, `ErrNotAccepted`. It imports `domain` (for `domain.Alert`) and go-mail only.
- `testutil/smtp_server.go` (new): the in-process fake SMTP server described under the tests. Shared test helper; this task owns it.
- Fakes in `usecase/check_result_fakes_test.go` (not `fakes_test.go`, which other tasks change, as `check-sequence-and-state` also decided): a fake finder and a fake lister, under names that do not collide with `fakeServices` and `fakeTargets` there (both hold data by service id, can be told to return an error, and record `ctx.Err()` as it was at the moment of each call), a spy dispatcher (records each call, and lets a test read the fake states at the moment of the call), and an optional hook on the existing `fakeStates.Update` that receives the context it was given and runs after the change is applied (the "cancelled after the save" test cancels there); `fakeStates` behaves as before when no hook is set.

The rules stay where `ARCHITECTURE.md` puts them: the change rule and the alert content are only in `usecase/`; `worker/` holds no status or content rule; the mailer holds the email layout (its format, not a business rule) and no decision about whether to send.

## Dependencies

One: `github.com/wneessen/go-mail`, named in `STACK.md` ("Email"). Resolved at drafting time: `v0.8.1` (published 2026-07-09, requires Go 1.25.0; `go.mod` says `go 1.27.4`). It is pinned because `v0.8.2` was published about nine days before this file was written, under the two-week rule. Command, run in `backend/`:

`go get github.com/wneessen/go-mail@v0.8.1` and then `go mod tidy`.

`git diff go.mod go.sum` shows the new requirement and its own indirect dependencies and nothing else; the builder reports the final list. The user records the adopted version in `STACK.md` after merging.

The builder reads go-mail's documentation for `v0.8.1` for the option and method names; this file names none, so none is guessed.

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed. Worker and usecase tests use `clock.Fake` where time matters (the usecase tests a non-default fake time) and never `time.Sleep`; the dispatcher tests wait on channels. Run them with `-race`. The mailer tests use the in-process fake SMTP server, with real, short deadlines.

**Decision and content (`usecase/check_result_test.go`, `alert_test.go`; fake states, finder, lister, spy dispatcher, `clock.Fake`)**

- Each row of the change table, as a table test with alerts on and one email target: `not_yet_checked` to unhealthy gives one unhealthy alert (FR-24); `healthy` to unhealthy gives one (FR-21); `unhealthy` to healthy gives one recovery alert (FR-22); `not_yet_checked` to healthy, `healthy` to healthy, and `unhealthy` to unhealthy (also with a different failure reason) give none, and the spy is not called (FR-24, FR-25).
- Alerts off at the change: no `Dispatch`. Then, with alerts turned on and the service still unhealthy, another unhealthy result sends none, and a later healthy result sends the recovery alert (FR-25).
- An empty target list: no `Dispatch`. A target list with an email and a webhook target: one `Dispatch` with both, in list order (FR-21).
- The alert is exactly `domain.Alert{ServiceID, ServiceName, Status, ChangedAt, Message}` by struct equality, with `ChangedAt` equal to the fake clock's time (a non-default one) and to the saved `LastStatusChangeAt`; a struct with any other field filled would fail the equality (FR-23).
- Message by status: with both `UnhealthyMessage` and `RecoveryMessage` set to different text, the unhealthy alert has the first and the recovery the second; with each empty, or only spaces, the alert has the exact default text above; a 500-character message passes unchanged (FR-23).
- The state is saved before the hand-off: the spy reads the fake states when `Dispatch` is called and finds the new status (the architecture's order).
- A sequence cancelled after the save: the fake states' update cancels the `ctx` it was given, once it has applied the change. `Find` and `List` are then still called with a context that is not cancelled, and the alert is dispatched (the user's decision; reading with the cancelled `ctx` would fail this test).
- A state update that fails: the error is returned unchanged, no `Dispatch`. A result for a deleted service (the update says `ErrNotFound`): nil, no `Dispatch`, no `Find` call. `Find` or `List` saying `ErrNotFound`: nil, no `Dispatch`. `Find` or `List` failing with another error: returned wrapped (`errors.Is`), the state is saved, no `Dispatch`.
- An inconsistent result (healthy with a failure, or the reverse): an error, no `Dispatch` (existing behavior, now also checked for the alert).
- Restart (FR-111, in part): a second `CheckResultService` over the same fake states, with the saved status `unhealthy` and an unhealthy result, sends none; with `unhealthy` and a healthy result it sends the recovery alert; with `healthy` and an unhealthy result it sends the unhealthy alert. This proves the rule uses only the saved status; it does not prove that a real restart keeps the status.
- The existing tests of `check_result_test.go` pass with only their setup changed (the constructor call and the extra fakes it needs); no assertion is changed or removed.

**Repository (`repository/service_test.go`, real SQLite through `testutil.NewDB`)**

- `Find` returns the saved service by id, including `Name`, `AlertsEnabled`, `UnhealthyMessage` and `RecoveryMessage` as stored, with `CreatedAt` and `UpdatedAt` in UTC; the service is made with `ServiceRepository.Create`.
- An id with no row returns `domain.ErrNotFound`; after `Delete` the same id returns it, and `Find` writes nothing.

**Delivery loop (`worker/alert_dispatcher_test.go`; a fake `Mailer` that records calls, signals on a channel and can block on its context or return a scripted error; a `slog` handler writing to a buffer)**

- An email target: one `SendEmail` call with the target's `Value` and the alert as given. Delivery fails with an error: still exactly one call after `Close` returns, so there is no retry (FR-85 in part).
- `Dispatch` returns while a send is blocked, and the blocked send has started by then with no clock involved (NFR-5).
- Three email targets, the first blocked and the second failing: the third is still delivered, and the second's failure and the first's block do not stop the others (FR-83).
- A webhook target: the mailer is not called, and one `alert not delivered` warn line with the reason `webhook delivery is not built yet` is logged. Mixed with an email target, the email is still sent.
- The log: a success has an `alert delivered` info line, a failure an `alert delivery failed` warn line whose `reason` is the error's text; every line has `service_id`, `target_id` and `status`; across all lines of the tests the buffer never holds the email address, the webhook URL, the target name, the service name or the message.
- `Close` while a send is blocked: the send's context is cancelled, `Close` does not return before the blocked send has returned: the fake mailer, once its context is cancelled, holds its return on a gate the test releases only after it has seen `Close` still running (for example `Close` called in its own goroutine, a short real wait, then the gate opens); the fake sets a flag as it returns, and the test reads it right after `Close` returns, for every started send. If this cannot be made deterministic, the builder reports the "waits" half as weakly tested, and the line logged is `alert delivery abandoned` with no `reason`, whether the fake returned `context.Canceled` or `ErrNotAccepted`-like text. A send that returns no error after `Close` ran logs `alert delivered`. A second `Close` does nothing. A `Dispatch` after `Close` starts nothing, the mailer is not called, and one `alert dropped` warn line with the reason `the app is stopping` is logged.
- `Dispatch` calls racing one `Close`, repeated under `-race`: no data race, no panic, no send started after `Close` returned, and every started send has returned when `Close` does.
- Two alerts for different services dispatched at once under `-race` keep their own service ids in their calls and log lines.

**Mailer (`adaptor/mailer/mailer_test.go`, with `testutil`'s fake SMTP server)**

- With no host: `SendEmail` returns `ErrNotConfigured` (by `errors.Is`) with the text exactly `no SMTP account configured`, and no connection is made (the fake server, started and unused, saw none).
- Every subject and body check below decodes what the server received first (the header encoding and the body's transfer encoding, which go-mail picks, for example quoted-printable with soft line breaks), then compares after turning `\r\n` into `\n`. Raw wire text is never compared.
- A mail to a server in mode `none`: the server received one message from the configured sender to the target's address, the subject `API is unhealthy` for an unhealthy alert and `API is healthy again` for a recovery, and the body, decoded as above, exactly the four lines in order: `Service: API`, `Status: Unhealthy` (`Status: Healthy` for a recovery), `Time: 2026-11-18 14:05 UTC`, the message, ending with one `\n` (FR-23, FR-93).
- The time line is in UTC and drops seconds: an alert at `14:05:59` in UTC shows `14:05`; an alert whose `ChangedAt` is in a UTC+7 zone (the same instant) shows the UTC time (FR-93).
- A service name with a CR and an LF in it: the subject and the first line have a space in their place and the message has the right number of headers and body lines (no injected header).
- A non-ASCII name and message arrive intact (read back after decoding what the server received) in subject and body.
- The mail holds nothing but the four values: the alert's `ServiceID` (a distinctive value in the test) appears nowhere in the decoded subject, body or headers received (FR-23).
- A malformed recipient address returns `ErrNotAccepted` with the same text and no message reaches the server.
- Failures return `ErrNotAccepted` (by `errors.Is`) with the text exactly `the SMTP server did not accept the message`, and the text holds neither the address nor the cause's text: a server that rejects the recipient; a server that closes the connection at once; a port nothing listens on; a server whose greeting is delayed beyond `AttemptTimeout` (a short value set in the test); mode `starttls` against a server that does not offer STARTTLS (FR-85 in part).
- A `ctx` cancelled while the server is delaying its greeting: the returned error satisfies `errors.Is(err, context.Canceled)` and not `ErrNotAccepted`.
- A configured username and password: the fake server that demands them accepts the mail; with a wrong password it rejects and the result is `ErrNotAccepted`. With an empty username the server sees no authentication command. If go-mail will not authenticate on an unencrypted connection, the builder says so in the report and lists the authenticated send as untested; it does not skip verification to make it pass.
- An unknown `TLS` value: `New` returns an error.
- Two concurrent `SendEmail` calls to one `Mailer` under `-race` both succeed.

**Fake SMTP server (`testutil/smtp_server_test.go`)**

- The fake accepts a plain connection and a message from a minimal client and records the sender, the recipients and the data; each scripted behavior (reject the recipient with a 5xx code, close at connect, delay the greeting, require a username and password) does what its option says; it stops and frees its port at the end of the test. It makes no TLS. Its command set is `EHLO` and `HELO`, `MAIL FROM` (any parameters accepted and ignored; it advertises no `SIZE`, `8BITMIME` or `STARTTLS`), `RCPT TO`, `DATA` (with dot-unstuffing, ended by a line holding only a dot), `RSET`, `NOOP` and `QUIT`; `AUTH PLAIN` is advertised and accepted only in the require-auth mode. It serves several connections at the same time and records every message under a lock.

**Mailpit integration test (`adaptor/mailer/mailer_integration_test.go`, build tag `integration`; written, and run only if Docker is available; `make test-integration`)**

- A mail sent through Mailpit (SMTP on `localhost:1025`, mode `none`, the compose service) arrives: Mailpit's API (`http://localhost:8025`) lists one message with the sender, the recipient, the subject and the four body lines of the mailer test. The test clears Mailpit's mailbox before it sends and uses a recipient address of its own.

**Wiring (`cmd/server/main.go`, read by the verifier; there is no test of `main`)**

- The three constructors, the shutdown order and the idempotent closes are as in "Wiring".

**Repo-wide**

- `make check` passes.
- `git diff go.mod go.sum` shows only the go-mail requirement and its indirect dependencies, at `v0.8.1`.
- Nothing outside the allowed paths changed; no configuration key was added.

## Verifier checks

- **Layering, by reading imports:** `worker/` imports neither `repository/`, `adaptor/` nor `usecase/`; `adaptor/mailer` imports `domain` and go-mail only; `usecase/` imports neither `worker/` nor `adaptor/`; `domain/alert.go` imports nothing of the app; only `cmd/server` knows all of them.
- **Where the rules live:** the change table, the default messages and the content of an alert are only in `usecase/`; `worker/alert_dispatcher.go` reads no status except to log it; the mailer's layout does not decide whether to send.
- **Time:** no `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` outside tests, `pkg/` and `cmd/`; the alert time is the usecase's clock `now`.
- **No stored change:** `git diff` shows no migration and no write to `targets` or `service_states` beyond the existing state update; `last_delivery_failed` is not written.
- **Goroutines:** every goroutine of the dispatcher is counted in its wait group and ends on `Close`; none is started from the usecase or the handler; the mailer writes no `go` statement of its own.
- **Logs:** read every log call in `worker/alert_dispatcher.go`: no address, URL, name, message or error text from go-mail reaches a field; the usecase and the mailer log nothing.
- **Error text:** `ErrNotConfigured` and `ErrNotAccepted` texts are exactly as given; `err.Error()` of a wrapped cause is never shown.
- **Order:** `Dispatch` is called after `states.Update` returned and never inside its `apply`.
- **Mutation checks to run:** treat `not_yet_checked` to healthy as a change; ignore `AlertsEnabled`; alert on `unhealthy` to `unhealthy`; send the unhealthy message in a recovery; read the previous status after the update instead of inside it (so a status change is never seen); make `Dispatch` wait for the sends; let a failed target return before the next target starts; stop cancelling in `Close`; make `Close` return without waiting; use the sequence's own context for `Find` and `List`; put the failure reason, the service URL or the service id into the email; drop the UTC conversion; log the address. Each must fail at least one named test.
- **Inputs to try:** an unhealthy first check with alerts on and no targets; a recovery with a webhook target only; five targets with one blocked and one failing; a service name of 100 characters and of non-ASCII characters; a message of 500 characters with a line break; an alert at a UTC+7 time; SMTP not configured; a stop while a send is blocked; the same service recorded twice unhealthy in a row; a restart (a new usecase over saved states).
- **What the verifier cannot prove:** the `starttls` and `tls` success paths and delivery to a real provider (see "Known gaps"); say so in the report, and say whether the Mailpit test ran.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency beyond go-mail, a migration, a configuration key, or an edit to a spec file. In particular, if `go get` at `v0.8.1` needs a Go version newer than `go.mod` says, or the mailer cannot be built without a new configuration key.
- `RecordCheckResult` cannot learn the previous status without changing `ServiceStateRepository` or `worker.CheckRecorder`.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check` and `make test-integration` (it needs Docker for Mailpit), commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), whether the Mailpit test ran (and Mailpit's version if it did), the go-mail version adopted, and anything you were unsure about. Also list every judgment call this file did not settle.
