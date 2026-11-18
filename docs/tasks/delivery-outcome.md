# Task: delivery outcome

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

When all delivery attempts to a target fail, the target is marked "last delivery failed", and the mark stays until a later delivery to that target succeeds. Until now the alert dispatcher only logged each result; this task makes it report every final outcome (delivered, or failed after the last attempt) to a usecase, which writes `targets.last_delivery_failed`. The dashboard notice (`alert_delivery_failed` in `listServices`) and the alert list's notice (`last_delivery_failed` in `listTargets`) already read that column, so after this task they light up. The status of the service is never touched (FR-84). This is the last piece of the check-to-alert chain: down, alert, retries, outcome.

Requirements covered:

- FR-86: after all attempts to a target fail, the target's `last_delivery_failed` becomes true; it stays true until a later delivery to that target succeeds, which makes it false; the target keeps receiving later alerts (the dispatcher already sends to every target on every alert). By the user's decision, editing the target does not clear it.
- FR-84: a failed delivery does not change the service's status: the outcome write touches `targets.last_delivery_failed` and nothing else.
- FR-85, in part: the outcome is decided by the dispatcher's final result (all attempts made and failed). A sequence stopped by a newer alert or by the app stopping is neither a success nor a failure and writes nothing (the user's rule, FR-85 v0.45).
- FR-111, in part: an outcome that was not written because the app stopped is lost, not recovered; nothing is stored beyond the column.

Out of scope:

- **`testTarget`** (FR-107, FR-108): `test-target`. A test alert never reports an outcome and never touches `last_delivery_failed`.
- **The notices themselves** (the dashboard row, the alert list row): built (`ServiceRow.tsx`, `target-delivery-notice`). No frontend change.
- **Clearing the mark on edit, on delete of other targets, or by the admin:** by the user's decision only a successful delivery clears it.
- **Ordering of two sequences for one target** (see "Known gaps"), and **retrying a failed write**.
- **A log line per check outcome** (the backlog's `scheduler` finding): it belongs to the runner, not to alert delivery; it stays in the backlog.
- **A new configuration key, a new dependency, any change to the contract or a migration:** the column and `Target.last_delivery_failed` exist.

## Prerequisite

`webhook-sender` and `delivery-retry` are merged. The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `worker.AlertDispatcher` as `delivery-retry` leaves it: `NewAlertDispatcher(mailer Mailer, webhooks WebhookSender, clk clock.Clock, retry RetryPolicy, log *slog.Logger)`, the sequence per target with its final outcomes (delivered; failed after the last attempt), the superseded and abandoned endings, and its test helper `newDispatcher` and tests in `worker/alert_dispatcher_test.go`.
- `repository.TargetRepository` (`List`, `Create`, `Update`, `Delete`) in `repository/target.go`, `domain.Target.LastDeliveryFailed` (column `last_delivery_failed`, default 0), `domain.ErrNotFound`.
- The column `targets.last_delivery_failed` (migrations of the foundation) and the query in `repository/service.go` that computes `alert_delivery_failed` for `listServices`.
- `cmd/server/main.go` builds `targetRepo` and passes it to the check-result usecase.

## Role and ownership

Role: Backend.

You may change only:

- `backend/internal/repository/target.go`, `target_test.go` (one new method and its tests)
- `backend/internal/usecase/delivery_outcome.go`, `delivery_outcome_test.go` (new)
- `backend/internal/worker/alert_dispatcher.go`, `alert_dispatcher_test.go` (the interface, the constructor, the report and the tests below)
- `backend/cmd/server/main.go` (wiring)

You may not change anything else: not `backend/migration/**`, `backend/internal/api/**`, `backend/internal/handler/**`, `backend/internal/domain/**`, the rest of `backend/internal/usecase/**` (in particular not `target_repository.go` or `fakes_test.go`), the rest of `backend/internal/repository/**`, `backend/internal/adaptor/**`, `backend/internal/testutil/**`, `backend/internal/platform/config/**`, `pkg/**`, `.env.example`, `backend/go.mod`, `backend/go.sum`, `Makefile`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/delivery-outcome.plan.md`). No configuration key is added or renamed.

Shared files this task touches, all owned by this task while it runs: `worker/alert_dispatcher.go` and its test, `cmd/server/main.go`, `repository/target.go` and its test. `test-target` also changes `main.go` (it adds the test usecase and a `NewServer` argument, not the dispatcher's constructor call) and may run beside this one; the user resolves a conflict there when merging. Tasks that may run at the same time: `test-target` (backend, `main.go` only in common); `select-test-flake` (frontend only).

## Operations used

None are implemented. `listServices` and `listTargets` already return `alert_delivery_failed` and `last_delivery_failed` from the column this task writes; their code and the contract do not change.

## Behavior

### What exists

The dispatcher runs one sequence per target and logs its end: `alert delivered` (with `attempts`), `alert delivery failed` (all attempts made and failed, with `reason` and `attempts`), `alert delivery superseded` and `alert delivery abandoned`. Nothing is written to the database by it. `repository.TargetRepository.Update` keeps `last_delivery_failed` (its `Select` lists the columns it writes without it). `domain.Target` says only the delivery-outcome usecase writes it. `docs/data-model.md`: "Editing a target, its contact included, keeps the value."

### The report (`worker.AlertDispatcher`)

- `worker` defines the interface it needs beside `Mailer` and `WebhookSender`: `OutcomeRecorder` with `RecordDeliveryOutcome(ctx context.Context, serviceID, targetID string, delivered bool) error`. `usecase.DeliveryOutcomeService` satisfies it without `worker` importing `usecase`.
- The constructor gains the argument: `NewAlertDispatcher(mailer Mailer, webhooks WebhookSender, clk clock.Clock, retry RetryPolicy, outcomes OutcomeRecorder, log *slog.Logger)`. Its call sites (`main.go`, the helper and the direct call in `alert_dispatcher_test.go`) are updated; the test helper builds a recorder fake that succeeds by default.
- A sequence reports exactly its two real endings, once, at the point where it logs them:
  - **Delivered** (a success on any attempt, also one that returns after a newer alert was handed off or after `Close` ran): `RecordDeliveryOutcome(ctx, alert.ServiceID, target.ID, true)`.
  - **Failed** (the last attempt failed: the `alert delivery failed` ending): `RecordDeliveryOutcome(ctx, alert.ServiceID, target.ID, false)`.
  - **Superseded, abandoned, an unknown target type and an alert dropped after `Close`:** nothing is reported.
- The call is made after the attempt's result is logged, from the sequence's own goroutine (counted in the wait group), never under the dispatcher's mutex, so a slow write does not hold up `Dispatch`, `Close` or another target. `Close` waits for a write in progress.
- The context of the call is the dispatcher's context without its cancellation (`context.WithoutCancel`), so that an outcome decided just before or just after `Close` is still written. The task adds no deadline of its own: a write is already bounded by the database layer's busy timeout of five seconds (`platform/database`), and a literal limit in `worker` would break `CONVENTIONS.md` rule 6. The dispatcher closes before the database does, and waits for the goroutines, so the connection is still open for the write.
- If the call returns an error: one warn line `alert outcome not saved` with `service_id`, `target_id` and `status` (the alert's), and `delivered` (`true` or `false`); no `reason`, because the error's text comes from the database. The delivery's own log line is unchanged and nothing retries the write.
- Every line still has `service_id`, `target_id` and `status` and never the address, the URL, a header, the target name, the service name or the message.

### The usecase (`usecase.DeliveryOutcomeService`)

`NewDeliveryOutcomeService(targets)` takes an exported interface `DeliveryFlagWriter` (new, defined in `usecase/delivery_outcome.go`; one method, one user) with `SetDeliveryFailed(ctx, serviceID, targetID string, failed bool) error`, satisfied by `repository.TargetRepository`. It does not use `usecase.TargetRepository`, whose file this task does not change.

`RecordDeliveryOutcome(ctx, serviceID, targetID, delivered)`:

- `delivered` true calls `SetDeliveryFailed(ctx, serviceID, targetID, false)`; false calls it with `true`. That is the whole rule (FR-86): a final failure sets the mark, a success clears it, nothing else does.
- `domain.ErrNotFound` (the target or its service was deleted since the alert was handed off) is dropped: return nil.
- Any other error is returned wrapped with `%w`.
- The usecase has no other dependency: it cannot read or write a service, its state or any other table (FR-84, by construction).

### The repository (`repository.TargetRepository.SetDeliveryFailed`)

`SetDeliveryFailed(ctx, serviceID, targetID string, failed bool) error`: one `UPDATE` of `targets` setting only `last_delivery_failed`, filtered by id and service id (`WHERE id = ? AND service_id = ?`). It does not write `updated_at`, `name`, `value`, `headers` or any other column, and writes nothing to any other table. No row matched is `domain.ErrNotFound` (a target that is not there, or belongs to another service). Setting the value it already has is not an error. It is not inside a transaction with a read.

### Wiring (`cmd/server/main.go`)

Build `usecase.NewDeliveryOutcomeService(targetRepo)` with the one shared `targetRepo`, and pass it to `worker.NewAlertDispatcher` as the recorder. The order of the closes does not change.

### Known gaps

- **A failed write is only logged.** The mark can then be stale (set when it should be clear, or the reverse) until the next outcome for that target.
- **Two sequences for one target are not ordered.** An older sequence that finishes after a newer one (it made all its attempts and failed, while the newer delivered) writes `failed` over the newer `delivered`; the mark then stays until the next success. Rare, and not changed here.
- **A superseded or abandoned sequence writes nothing** (the user's rule): a target whose alert was stopped keeps whatever mark it had. An alert lost to a stop (FR-111) leaves no mark.
- **A deleted target's outcome is dropped** (`ErrNotFound`), with no log line.
- **Editing a target keeps the mark** (the user's decision, `docs/data-model.md`): an admin who fixes a wrong address still sees "last delivery failed" until the next alert to it succeeds.
- **A write that hangs holds `Close`** for as long as the database layer lets it (the busy timeout, five seconds); the task adds no deadline.

## Structure

By `ARCHITECTURE.md` ("Background work": the delivery loop reports each final outcome to a usecase; "Rules live in `usecase/`"). Names marked "new" are fixed by this file; others (unexported helpers, test doubles) are the builder's choice.

- `repository/target.go`: `SetDeliveryFailed` (new method).
- `usecase/delivery_outcome.go` (new): `DeliveryOutcomeService`, `NewDeliveryOutcomeService`, `RecordDeliveryOutcome`, the `DeliveryFlagWriter` interface. It imports `domain` and the standard library only.
- `worker/alert_dispatcher.go`: the `OutcomeRecorder` interface, the constructor argument, the report, the line `alert outcome not saved`, the write timeout constant. `worker` still imports `domain` and `pkg/clock` only.
- `cmd/server/main.go`: the usecase and the argument.
- Test doubles: a fake recorder in `worker/alert_dispatcher_test.go` (records calls with the ids and `delivered`, and the context it received; can block or return an error); a fake of the one-method repository interface in `usecase/delivery_outcome_test.go` (its own file, not the shared `fakes_test.go`).

The rule stays where `ARCHITECTURE.md` puts it: whether an outcome sets or clears the mark is only in `usecase/`; `worker/` decides only which endings are real outcomes and reports them; the repository writes one column.

## Dependencies

None. `go.mod` and `go.sum` do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed. Usecase and worker tests use fakes; repository tests use a real SQLite file through `testutil.NewDB`. Worker tests use `clock.Fake`, never `time.Sleep`, put a deadline around every blocking wait, and run with `-race`.

**Repository (`repository/target_test.go`)**

- `SetDeliveryFailed(…, true)` makes `List` return the target with `LastDeliveryFailed` true; `(…, false)` makes it false again; setting the same value twice is no error (FR-86).
- Only that column changes: after `SetDeliveryFailed`, the row's `name`, `type`, `value`, `value_key`, `headers`, `created_at` and `updated_at` are exactly as they were, and the service's row and its state row (`service_states`) are unchanged (FR-84).
- Other targets of the same service keep their own value: marking one leaves the second unmarked, and clearing one leaves a second marked target marked.
- An id with no row, and a target id given with another service's id, return `domain.ErrNotFound` and change nothing; a deleted target returns it too.
- `Update` after `SetDeliveryFailed(…, true)` keeps the mark (the editing rule); the existing tests of that rule (`repository/target_test.go`, `usecase/target_test.go`) pass unchanged.
- Through `ServiceRepository.List` (real SQLite): `AlertDeliveryFailed` is true when any target of the service is marked, stays true while a second marked target remains after one is cleared, and is false when none is marked (the existing query, now fed by this write).

**Usecase (`usecase/delivery_outcome_test.go`)**

- `RecordDeliveryOutcome(…, true)` calls `SetDeliveryFailed` once with the two ids and `failed` false; `(…, false)` calls it once with `failed` true (FR-86).
- `ErrNotFound` from the repository: nil returned. Any other error: returned, wrapped (`errors.Is`).
- No other method of the repository exists on `DeliveryFlagWriter` (one method), shown by the fake having only that method.

**Delivery loop (`worker/alert_dispatcher_test.go`; the recorder fake, the existing mailer and webhook fakes, `clock.Fake`)**

- Success on the first attempt: one report with the alert's service id, the target's id and `delivered` true; none before the attempt returns (FR-86).
- Fail, fail, succeed: exactly one report, `delivered` true, after the third attempt; none after the first and second failures.
- Always failing with `Retries` 3: no report after attempts 1 to 3; after the fourth failed attempt exactly one report with `delivered` false (FR-86); none after a long advance of the clock.
- `Retries` 0 and a failing delivery: one report with `delivered` false at once.
- Superseded: a sequence stopped by a newer alert reports nothing; a success that returns after the newer alert was handed off reports `delivered` true; a last attempt that fails after it reports `delivered` false (the endings of `delivery-retry`).
- Abandoned: `Close` during a wait, and `Close` during an attempt that returns an error, report nothing. A success that returns after `Close` ran reports `delivered` true, the recorder receives a context that is not cancelled, and `Close` does not return before the recorder call has returned.
- An email target and a webhook target both report. A target of an unknown type and a `Dispatch` after `Close` report nothing.
- A blocked recorder does not hold up `Dispatch` (it returns), another target's delivery, or `Dispatch` for another service; `Close` waits for it.
- A recorder that returns an error: one `alert outcome not saved` warn line with `service_id`, `target_id`, `status` and `delivered`, no `reason`; the delivery's own line is as before; no second call; no panic.
- Across all lines of every test, none holds the address, the URL, a header name or value, the target name, the service name or the message.
- `Dispatch` calls for several services racing `Close` under `-race`: no data race, every goroutine, recorder calls included, has ended when `Close` returns.

**Replaced and changed on purpose**

- Every existing test of `alert_dispatcher_test.go` passes with only its setup changed (the constructor takes a recorder, a no-op fake by default); no assertion is changed or removed.

**Wiring (`cmd/server/main.go`, read by the verifier; there is no test of `main`)**

- The recorder is built from the shared `targetRepo` and passed to the dispatcher; the closes are in the order `alert-dispatch` left.

**Repo-wide**

- `make check` passes.
- `git diff` shows no change to a migration, `go.mod`, `go.sum`, `.env.example`, `platform/config`, the handler or any file outside the allowed paths; no configuration key was added.

## Verifier checks

- **Layering, by reading imports:** `usecase/delivery_outcome.go` imports `domain` and the standard library only; `worker/` imports `domain` and `pkg/clock` only, no `usecase` or `repository`; `repository/` imports no `usecase` or `worker`; only `cmd/server` knows all of them.
- **Where the rule lives:** "success clears, final failure sets" is only in `usecase/delivery_outcome.go`; `worker/` only chooses which endings are reported.
- **One column:** the `UPDATE` in `SetDeliveryFailed` names only `last_delivery_failed`; `Update` still does not write it; no other code writes the column (grep for `last_delivery_failed` and `LastDeliveryFailed` in non-test code).
- **FR-84 by construction:** the usecase and the repository method read and write nothing of `services` or `service_states`; the dispatcher still has no status logic.
- **Goroutines and locks:** the report runs inside the sequence's own counted goroutine, never under the mutex; no `go` statement was added; the context is `WithoutCancel` of the dispatcher's, not its cancellable context, and no timeout or deadline literal was added.
- **Logs:** read every log call in `worker/alert_dispatcher.go`: ids, status, attempt numbers, `delivered` and fixed texts only; no database error text.
- **Time:** no `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` outside tests, `pkg/` and `cmd/`.
- **Mutation checks to run:** report on a superseded sequence; report on an abandoned one; report `delivered` true on a final failure (or the reverse); report after each failed attempt instead of the last; report before the last attempt's result; clear the mark on `Update`; write `updated_at` or another column in `SetDeliveryFailed`; drop the `service_id` from the filter; treat `ErrNotFound` as an error; use the dispatcher's cancellable context for the write; call the recorder under the mutex; log the database error. Each must fail at least one named test.
- **Inputs to try:** a webhook-only list that always fails (the mark is set after the last attempt, `alert_delivery_failed` true for the service); then a later success (cleared); two marked targets with one cleared; an email target with no SMTP account (final failure, marked); a stop at each point of a sequence; a deleted target's outcome; a failing database write; an edit of a marked target (still marked).
- **What the verifier cannot prove:** the dashboard and alert list showing the notice live (the frontend reads the column; the end-to-end journeys of the milestone prove it); say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, `docs/data-model.md` or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a migration, a configuration key, or an edit to a spec file; in particular a change to `usecase/target_repository.go` or `fakes_test.go`.
- `webhook-sender` or `delivery-retry` is not merged, or a name this file takes from them is missing.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
