# Task: delivery retry

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

When a delivery to a notification target fails, the app now tries again: up to `ALERT_DELIVERY_RETRIES` more times (3 by default), waiting `ALERT_DELIVERY_RETRY_INTERVAL_SECONDS` (30 by default) between attempts, for email and webhook targets alike, each target on its own. A newer alert for the same service ends the older alert's retries. After it, an alert whose first attempt failed is sent again after the wait, and a service that changes status again while an earlier alert is still waiting does not get that stale alert sent a second time. The delivery outcome that is written to the database (the "last delivery failed" notice) is the next task; here the outcome is only logged.

Requirements covered:

- FR-85, in part: a failed delivery is retried up to the configured number of times, waiting the configured interval between attempts; neither number is hardcoded. (The causes of a failure are `alert-dispatch`'s and `webhook-sender`'s.)
- FR-85, the user's addition (see "The newer alert rule"): when a service's status changes again while an earlier alert for it is waiting to be retried, the earlier alert is not retried; an attempt already in progress finishes and counts only if it succeeds. The user adds the sentence to `docs/requirements.md` (FR-85, version v0.45); this task does not wait for that edit.
- FR-83: a target that is waiting to retry, or failing, does not delay or stop the others.
- NFR-5: the first attempt still starts at once; the wait applies only between attempts.
- FR-111, in part: an alert's retry sequence that is in progress when the app stops is lost, not resumed (`Close` ends it; nothing is stored; `docs/data-model.md`). FR-111's "starts over" is about check sequences, which `scheduler` covers.

Out of scope:

- **The delivery outcome and the "last delivery failed" notice** (FR-84, FR-86, `last_delivery_failed`, the dashboard and alert-list notice): `delivery-outcome`. Nothing here writes to the database; the final result of a sequence is logged only. The sequence's final outcome (delivered, failed after all attempts) is the value that task will report to a usecase, so it stays one clear point in the code.
- **`testTarget`** (FR-107, FR-108): `test-target`. A test alert makes one attempt with no retries and does not go through the dispatcher's retry loop.
- **Retries that stop when the target or service is deleted** (see "Known gaps").
- **A new configuration key, a new dependency, any change to the contract, a migration or the frontend.** `ALERT_DELIVERY_RETRIES` and `ALERT_DELIVERY_RETRY_INTERVAL_SECONDS` already exist.
- **Finer failure reasons**, and not retrying a failure that cannot change (see "Known gaps").

## Prerequisite

`webhook-sender` is merged. The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `worker.AlertDispatcher` as `webhook-sender` leaves it: `NewAlertDispatcher(mailer Mailer, webhooks WebhookSender, log *slog.Logger)`, the `Mailer` and `WebhookSender` interfaces, `Dispatch(alert, targets)`, `Close()`, the `deliver` method calling `SendEmail` or `SendWebhook` once per target and logging `alert delivered`, `alert delivery failed` (with `reason`) and `alert delivery abandoned`, and `alert not delivered` for an unknown target type; its test helper `newDispatcher` and the tests of `worker/alert_dispatcher_test.go`.
- `pkg/clock`: `clock.Clock` (`Now`, `NewTimer`), `clock.Real`, `clock.Fake` (`NewTimer`, `Advance`, `Pending`).
- `config.Limits.AlertDeliveryRetries` (key `ALERT_DELIVERY_RETRIES`, default 3, minimum 0) and `config.Limits.AlertDeliveryRetryIntervalSeconds` (key `ALERT_DELIVERY_RETRY_INTERVAL_SECONDS`, default 30, minimum 1), both in `.env.example` and unused so far.

## Role and ownership

Role: Backend.

You may change only:

- `backend/internal/worker/alert_dispatcher.go`, `alert_dispatcher_test.go`
- `backend/cmd/server/main.go` (wiring)

You may not change anything else: not `backend/migration/**`, `backend/internal/api/**`, `backend/internal/handler/**`, `backend/internal/domain/**`, `backend/internal/usecase/**`, `backend/internal/repository/**`, `backend/internal/adaptor/**`, `backend/internal/testutil/**`, `backend/internal/platform/config/**`, `pkg/**`, `.env.example`, `backend/go.mod`, `backend/go.sum`, `Makefile`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/delivery-retry.plan.md`). No configuration key is added or renamed.

Shared files this task touches, all owned by this task while it runs: `worker/alert_dispatcher.go` and its test, `cmd/server/main.go`. `delivery-outcome` changes the same files and waits for this one. `test-target` also changes `main.go` (not the dispatcher) and may run beside this one; the user resolves a conflict there when merging. Tasks that may run at the same time: `test-target` (backend, `main.go` only in common); `service-form-alerts` and `target-delivery-notice` (frontend only).

## Operations used

None. No operation of `docs/openapi.yaml` is implemented and no request is served.

## Behavior

### What exists

After `webhook-sender`, `AlertDispatcher.Dispatch(alert, targets)` takes its mutex, and unless the dispatcher is closed starts one owned goroutine per target (counted in a wait group, with the dispatcher's context); that goroutine makes one attempt (`SendEmail` or `SendWebhook`) and logs the outcome. There is no retry, no clock and no timer. `Close()` marks the dispatcher closed, cancels the context and waits for every goroutine.

### The sequence

`NewAlertDispatcher` gains two arguments: `NewAlertDispatcher(mailer Mailer, webhooks WebhookSender, clk clock.Clock, retry RetryPolicy, log *slog.Logger)` (the parameter is not named `clock`, so that it does not shadow the package). `RetryPolicy` is a struct in `worker` with `Retries int` and `Interval time.Duration`. `main.go` fills it from `cfg.Limits.AlertDeliveryRetries` and `cfg.Limits.AlertDeliveryRetryIntervalSeconds` (seconds converted to a duration) and passes `clock.Real{}`. The dispatcher does not validate them: the configuration guarantees `Retries` of at least 0 and an interval of at least one second.

Each target's goroutine runs one **sequence**:

1. Attempt number 1 starts at once (as before) and is always made, even when a newer alert for the service was handed off before the goroutine began: only the waiting and the later attempts are stopped by a newer alert. The attempt is the one call of `SendEmail` or `SendWebhook`, with the dispatcher's context.
2. On success (no error): log `alert delivered` (info, with `attempts` = the number of the attempt) and end. A success counts even if the alert was superseded or the dispatcher was closed meanwhile (an error-free return after `Close` ran is `alert delivered`, as before).
3. On failure, the first rule that applies:
   1. The dispatcher's context has ended (`Close` ran), whatever the error: log `alert delivery abandoned` (warn, no `reason`) and end.
   2. The attempts are used up (`attempt` is `1 + Retries`): log `alert delivery failed` (warn, with `reason` = the last error's text and `attempts` = the number of attempts made) and end. This is the sequence's final failure.
   3. The alert has been superseded (see below): log `alert delivery superseded` (warn, with `attempts` = the number of attempts made, no `reason`) and end, without waiting.
   4. Otherwise log `alert delivery attempt failed` (warn, with `attempt` = the number of the attempt that failed and `reason` = its error's text) and wait `Interval` on a timer from the injected clock, then make the next attempt. The timer is created before the log line, so a line seen means the timer exists.
4. **The wait ends at once** when any of these happens, and the timer is stopped: the dispatcher's context ends (`Close`): log `alert delivery abandoned` and end; the alert is superseded: log `alert delivery superseded` and end; the timer fires: make the next attempt. The wait never outlasts a `Close`. When the wait ends by the timer, the sequence first checks again, in this order and whatever else was ready at the same moment: the dispatcher's context (`abandoned`), then superseded (`superseded`); only if neither holds does it make the next attempt. Go chooses at random between ready channels, so the re-check is what keeps a stale alert from being sent after a newer one was handed off.
5. When `Retries` is 0 there is no wait and no timer: a failure is the final failure.
6. A target of an unknown type does not enter the sequence: it gets the single `alert not delivered` line `webhook-sender` fixed. The `alert delivery abandoned` line carries neither `attempts` nor `reason`, as before.

**What a sequence reports.** A sequence ends as exactly one of: delivered, failed (all attempts made and failed), superseded, or abandoned. For `delivery-outcome`, only delivered and failed are outcomes; a superseded or abandoned sequence is neither, and changes nothing about `last_delivery_failed` (the user's rule, FR-85 v0.45). That task reports delivered and failed from the one point in the code where those lines are logged.

The total of attempts for one target is therefore at most `1 + Retries`, with `Interval` between the end of one and the start of the next. Nothing about the sequence is stored; a restart loses it (FR-111).

Every line of a sequence has `service_id`, `target_id` and `status` (`unhealthy` or `healthy`) as before, plus the fields named above (`attempt` or `attempts`, `reason`), and none ever has the address, the webhook URL, a header name or value, the target name, the service name or the message. The reasons are the texts `alert-dispatch` and `webhook-sender` fixed; this task adds none.

### The newer alert rule

By the user's decision: a newer alert for the same service ends the older alert's retries.

- "Newer" means a later call of `Dispatch` for the same `alert.ServiceID`, whatever the status or the targets. `Dispatch` calls for different services never affect each other.
- The dispatcher keeps, in memory only and under the mutex `Dispatch` and `Close` already share, one record per service id for the latest alert. A `Dispatch` for a service replaces the record, which marks every sequence started by the earlier `Dispatch` of that service as superseded and wakes any that is waiting (step 4). The sequences of the new `Dispatch` carry the new record.
- An attempt already in progress when the newer alert arrives is **not cancelled and not shortened**: its context is the dispatcher's, not the sequence's. When it returns: a success is `alert delivered` and counts; a failure goes through the rules of step 3, so with retries left it ends as `alert delivery superseded` and makes no wait and no further attempt; if it was the last attempt it is the final failure (`alert delivery failed`), because all the attempts were made.
- A sequence that has ended (delivered or failed) is unaffected and logs nothing when a newer alert arrives.
- The record of a service is replaced, never removed. The map is bounded by the number of services that ever alerted.
- `Close` ends everything regardless, as `alert-dispatch` decided; a `Dispatch` after `Close` still starts nothing and logs `alert dropped`.

### Wiring (`cmd/server/main.go`)

Pass `clock.Real{}` and the `RetryPolicy` to `worker.NewAlertDispatcher`. Nothing else changes; the order of the closes stays as `alert-dispatch` left it.

### Known gaps

- **A deleted service or target still gets its retries.** The dispatcher is not told about a deletion. The retry goes to an address that was removed; when `delivery-outcome` writes the outcome it finds no row and drops it. By the user's decision, not changed here.
- **Every failure is retried,** including `no SMTP account configured` (FR-85 lists it as a failure) and a custom header that is not valid, which cannot succeed on a retry. Simple and uniform; not changed here.
- **An older attempt in progress may deliver an outdated alert** after a newer one was handed off, and may do so after the newer one. By the user's decision (an attempt in progress is left alone).
- **Nothing is reported to the database yet.** The final result is only a log line until `delivery-outcome`; `last_delivery_failed` is never set.
- **A retry sequence is lost on stop or crash** (FR-111, `docs/data-model.md`); an alert whose retries were pending is not recovered.
- **The longest sequence** is `Retries` waits plus `1 + Retries` attempts of up to the webhook or SMTP timeout each; with the defaults about 90 seconds of waiting. Nothing times the whole.
- **One goroutine waits per target** (at most `MAX_SERVICES` times `MAX_TARGETS_PER_SERVICE`, 250 with the defaults); there is no pool, as before.
- **The requirements text** (FR-85, the newer-alert sentence) is the user's edit to make; until then the verifier lists it under "Docs or specs that no longer match".

## Structure

By `ARCHITECTURE.md` ("Background work", "Interfaces"). Names marked "new" are fixed by this file; others (unexported helpers, test doubles) are the builder's choice.

- `worker/alert_dispatcher.go`: `RetryPolicy` (new, with `Retries` and `Interval`), the new constructor arguments, the sequence in place of the single attempt, and the per-service record of the latest alert. `worker` imports `domain` and `pkg/clock` only (no `usecase`, `repository`, `adaptor`). The wait uses the injected clock's `NewTimer`; no `time.Sleep`, `time.After` or `time.NewTimer` (`ARCHITECTURE.md`, "Time").
- `cmd/server/main.go`: the two new arguments.
- Test doubles in `worker/alert_dispatcher_test.go`: the existing fake mailer and fake webhook sender, extended so that a test can script a result per call number (fail, fail, succeed) and read the context each call received; `newDispatcher` takes a `clock.Fake` and a `RetryPolicy`, with a default of zero retries so that the existing tests keep their behavior.

The rules stay where `ARCHITECTURE.md` puts them: `worker/` owns timing, cancellation and retries; whether an alert is due and what it says are `usecase/`'s.

## Dependencies

None. `go.mod` and `go.sum` do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed. Worker tests use `clock.Fake` for every wait, never `time.Sleep`, and put a deadline (a couple of seconds of real time) around every wait on a channel or a lock, so that a regression fails by assertion within the deadline and does not hang until the package timeout (finding N3 of `docs/tasks/alert-dispatch.report.md`). A test that must see a timer exist waits for `clock.Pending()` to reach the number of timers it expects (one per waiting target, so a test with two waiting targets expects 2) by yielding in a loop (`runtime.Gosched`) under that deadline. Run them with `-race`.

**The sequence**

- Success at once: one call, `clock.Pending()` is 0, and one `alert delivered` info line with `attempts` 1; no `alert delivery attempt failed` line (FR-85, NFR-5).
- Fail, fail, succeed with `Retries` 3 and `Interval` 7 s: one call at once; the second only after the clock has advanced by exactly 7 s (an advance of 7 s minus 1 ns leaves one call); the third after another 7 s; then `alert delivered` with `attempts` 3 and two `alert delivery attempt failed` lines with `attempt` 1 and 2 and the reason of each; no `alert delivery failed` line; no fourth call however far the clock advances (FR-85).
- Always failing with `Retries` 3: exactly 4 calls, at 0, 7, 14 and 21 s; then one `alert delivery failed` warn line with the last reason and `attempts` 4; no fifth call after a long advance; three `alert delivery attempt failed` lines before it (FR-85).
- The interval comes from the policy: the same test with `Interval` 45 s waits 45 s, not 7 and not 30 (not hardcoded).
- `Retries` 0: one call, no timer (`Pending()` is 0), and the failure is `alert delivery failed` at once with `attempts` 1.
- The same sequence for a webhook target and for an email target (each through its own fake); a list with both runs both sequences.
- Independence: with two targets, one failing and waiting, the other is delivered at once and the waiting one is not delayed by it; two failing targets retry on the same clock tick without one holding the other (FR-83).
- Every line of a sequence, over every test, never holds the address, the webhook URL, a header name or value, the target name, the service name or the message; each has `service_id`, `target_id` and `status`.

**`Close`**

- `Close` while a sequence is waiting: the line is `alert delivery abandoned` with no `reason`; the timer is stopped (`Pending()` is 0); `Close` returns promptly; advancing the clock afterwards makes no further call.
- `Close` while an attempt is blocked: the attempt's context is cancelled, `Close` returns only after it returned, and the line is `alert delivery abandoned`, whatever error the fake returned (unchanged from `alert-dispatch`). A success that returns after `Close` ran is `alert delivered` with its `attempts`.
- A second `Close`, and a `Dispatch` after `Close` (no call, one `alert dropped` line), are unchanged.

**The newer alert rule**

- A sequence of service S waits after a failed first attempt; a second `Dispatch` for S arrives: the waiting sequence logs `alert delivery superseded` with its own `status` and `attempts` 1 without any advance of the clock; its timer is stopped; no further call for it however far the clock advances; the new alert's own targets are sent and retried normally (the rule is "newer alert", not "different status": the second `Dispatch` has the same status in one case and the opposite in another).
- A waiting sequence of another service T is not affected by a `Dispatch` for S: it still retries on schedule.
- An attempt in progress when the newer alert arrives (the fake blocks it): its context is not cancelled (the fake reads `ctx.Err()` as nil); when released with a success the line is `alert delivered` and it counts; when released with a failure and retries left the line is `alert delivery superseded` with no wait and no timer and no further call; when released with a failure on the last attempt the line is `alert delivery failed`.
- Attempt 1 is always made: a `Dispatch` for S immediately followed by a second one for S (the first goroutine not yet started) still makes the first alert's attempt 1 for each of its targets; if it fails, the line is `alert delivery superseded` with `attempts` 1 and no timer.
- The wake-up re-check: when the timer has fired and a newer alert has also been handed off before the sequence runs again, no attempt N+1 is made and the line is `alert delivery superseded`; when the timer has fired and `Close` has also run, the line is `alert delivery abandoned` and no attempt is made. Both are shown by a fake clock `Advance` and the newer `Dispatch` (or `Close`) in the order the test chooses, with the sequence held at the point after the wake-up (a hook or a gate in the test's own fake) so that both are ready; where the test cannot hold that point, the verifier confirms the re-check by reading and by the mutation "skip the re-check".
- A sequence that has already ended logs nothing when a newer alert arrives (no `superseded` line for a delivered or failed one).
- Two `Dispatch` calls for one service in a row supersede the first one's sequences and not the second's.

**Races**

- `Dispatch` calls for one service and for several services, with `Close`, repeated under `-race`: no data race, no panic, every started goroutine has ended when `Close` returns, no call starts after `Close` returned.

**Replaced and changed on purpose**

- `TestDispatch_EmailTargetIsSentOnceWithoutRetry` (`alert_dispatcher_test.go`, an email delivery that fails is called once, no retry) and the test `webhook-sender` adds for "a failing webhook is still called exactly once after `Close` returns" (the builder finds it by that behavior) describe the old rule. Both are rewritten to run with `Retries` 0, where "one call, no retry" still holds, and the sequence criteria above add the cases with retries. `TestDispatch_RacingCloseNeverSendsAfterCloseReturned` also calls the constructor and changes only its setup. Every other test of `alert_dispatcher_test.go` passes with only its setup changed (the constructor takes the clock and the policy, defaulting to zero retries); no assertion is changed or removed.
- The three mutations the `alert-dispatch` report found to fail by hanging (no cancel in `Close`, `Dispatch` waiting for the sends, sequential deliveries) must now fail an assertion within the deadline, in the tests of this file. To get there the builder may add deadlines to the blocking waits of the existing tests and make the `newDispatcher` cleanup call `Close` under a deadline that fails the test; adding a deadline is not loosening an assertion.

**Wiring (`cmd/server/main.go`, read by the verifier; there is no test of `main`)**

- The policy is built from `cfg.Limits.AlertDeliveryRetries` and `cfg.Limits.AlertDeliveryRetryIntervalSeconds` converted to a duration, and `clock.Real{}` is passed. The closes are in the order `alert-dispatch` left.

**Repo-wide**

- `make check` passes.
- `git diff` shows no change to `go.mod`, `go.sum`, `.env.example`, `platform/config` or any file outside the allowed paths; no configuration key was added.

## Verifier checks

- **Layering, by reading imports:** `worker/` imports `domain` and `pkg/clock` only; no `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` outside tests, `pkg/` and `cmd/`.
- **No hardcoded numbers:** there is no literal 3 or 30 (or 90) in `worker/alert_dispatcher.go`; the attempts and the interval come from `RetryPolicy`.
- **One goroutine per target,** all counted in the wait group, none started by a timer callback; every wait selects on the timer, the dispatcher's context and the supersede signal; the timer is stopped on every exit from a wait.
- **The supersede record** is read and replaced only under the mutex `Dispatch` and `Close` share; the in-flight attempt uses the dispatcher's context, not a per-sequence one.
- **Logs:** read every log call in `worker/alert_dispatcher.go`: only the ids, the status, the attempt numbers and the error's text reach a field; no address, URL, header, name or message.
- **No stored change:** `git diff` shows no migration, no repository call and no write to `targets`; `last_delivery_failed` is not written.
- **Mutation checks to run:** skip the re-check after the timer fires; skip attempt 1 for a superseded sequence; retry one time too many or too few; skip the wait; use a fixed 30 s; retry after `Close`; do not stop the timer on `Close`; keep waiting after a newer alert; cancel the attempt in progress when a newer alert arrives; supersede across services; let the last attempt's failure be `superseded`; log the address or URL in an attempt line; make `Dispatch` wait for the sequences; run the targets one after the other. Each must fail at least one named test.
- **Inputs to try:** `Retries` 0 and 3; `Interval` 1 s and 45 s; a webhook and an email target failing together; a newer alert while waiting, while an attempt is blocked, and after the sequence ended; the same service alerting twice in a row; a stop in each of the three places (first attempt, wait, later attempt); two services alerting at once with one failing.
- **What the verifier cannot prove:** timing against the real clock and a real receiver; say so in the report. List the FR-85 sentence under "Docs or specs that no longer match" if the user has not added it.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a migration, a configuration key, or an edit to a spec file.
- `webhook-sender` is not merged, or a name this file takes from it is missing.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for, or the wait cannot be made to end at once on a newer alert without a change to `pkg/clock`.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
