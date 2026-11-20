# Task: pause and resume API

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The admin can pause and resume a service through the API: `pauseService` and `resumeService` become real. Pausing saves the flag, cancels a check or retry in progress and stops the schedule, and keeps the service's state. Resuming clears the flag and runs a check straight away. Pausing a paused service and resuming one that is not paused succeed and change nothing. A result that a sequence finishes in the instant of a pause is dropped: it changes no state and sends no alert.

Requirements covered:

- FR-75: a service can be paused and resumed; the answer is the service with `paused` as saved.
- FR-76: a paused service is not scheduled (pause stops it; an edit and a restart of the app leave it unscheduled, shown by tests of those paths), a check or retry in progress is cancelled, and a result finished in the instant of the pause changes nothing and sends no alert.
- FR-77, in part: the answer and `listServices` carry `paused`. Hiding a paused service from the public view is milestone 4 (`getPublicDashboard`).
- FR-78: a pause and a resume keep the state (status, times, failure reason) untouched.
- FR-79: a resume runs a check straight away.
- NFR-8: both operations need a session and the CSRF token (the policy router enforces it; a test shows both sit behind it).

Out of scope:

- The Pause and Resume buttons on the dashboard (`dashboard-pause-resume`, frontend).
- The public view hiding a paused service (FR-77's second half, milestone 4) and the `404`/rate rules of `getPublicDashboard`.
- Alert deliveries already handed to the dispatcher before the pause, and their retries (FR-85): FR-76 stops checks and the alerts that checks produce; delivery of an alert already in flight is not cancelled.
- A change to the scheduler (`worker/scheduler.go`): `update-service-api` built `Restart` and the `Stop` bookkeeping this task uses as they are.
- Everything under `frontend/`.

## Prerequisite

`update-service-api` is merged. The builder checks first that these exist on the default branch (with the names of the merged code), and stops to ask if any is missing (it never creates them):

- `worker.Scheduler.Restart(service, firstCheckAt)` and `usecase.Scheduler` with `Start`, `Stop`, `Restart`; `Restart` returns at once, runs its first sequence at `firstCheckAt` (at once when that is not after now), and orders itself after the previous goroutine of the id.
- `usecase.ServiceService` with `UpdateService`, `DeleteService` and the mutex that both hold around their write and scheduler call; `usecase.ServiceRepository` with `Get`; `repository.ServiceRepository` with `Get` and `Update` and the shared view query.
- `handler.ServiceService` with the methods of `update-service-api`, and `serviceSpy` in `handler/helpers_test.go`.
- `repository.ServiceStateRepository.Update` and `usecase.CheckResultService.RecordCheckResult` (merged long ago), `domain.ErrNotFound`.

## Role and ownership

Role: Backend.

You may change only: `backend/internal/usecase/service.go`, `service_repository.go`, `service_test.go`, `fakes_test.go`, `check_result.go`, `check_result_test.go`, `check_result_fakes_test.go`; `backend/internal/repository/service.go`, `service_test.go`, `service_state.go`, `service_state_test.go`; `backend/internal/domain/errors.go`; `backend/internal/handler/services.go`, `server.go`, `services_test.go`, `helpers_test.go`.

You may not change `backend/internal/worker/**`, `backend/cmd/server/main.go` (the wiring does not change: no new dependency), `backend/internal/handler/problem.go` (see "Behavior": the new sentinel never reaches the handler), `backend/internal/api/**` (generated), `backend/migration/**`, the rest of `domain/`, `backend/go.mod`, `backend/go.sum`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/pause-resume-api.plan.md`), `.env.example` or the `Makefile`. No configuration key is added.

Shared files this task touches, owned by this task while it runs: `usecase/service.go`, `usecase/service_repository.go`, `usecase/fakes_test.go`, `handler/server.go`, `handler/services.go`, `handler/helpers_test.go`, `repository/service.go`, `domain/errors.go`. They were just changed by `update-service-api`, which must be merged. `test-service-check-api` changes `handler/server.go`, `handler/helpers_test.go`, `usecase/fakes_test.go` and `domain/check.go` next and waits for this task too. Tasks that may run at the same time: the frontend group's tasks and `tcp-probe` (it changes `adaptor/probe`, `worker/check_runner.go`, `domain/check.go` and `main.go`: no file shared with this task).

## Operations used

From `docs/openapi.yaml`:

- `pauseService`: `POST /api/services/{serviceId}/pause`, no body. Responses used: 200 (`Service`), 401, 403, 404 (`not_found`), 500. A stub today.
- `resumeService`: `POST /api/services/{serviceId}/resume`, no body. Responses used: 200 (`Service`), 401, 403, 404 (`not_found`), 500. A stub today.

Neither lists a `409` or a `422`; none is added. The answer is the same `Service` shape as `getService` (`toAPIService`), with the state as saved and `paused` as saved by this call. An id that matches no service is `404 not_found`.

## Behavior

### What exists

- `domain.Service.Paused` is a saved column that nothing sets yet. `StartChecks` already skips paused services. `listServices` and `toAPIService` already return `paused`.
- `update-service-api`'s `UpdateService` leaves a paused service paused and does not call the scheduler for it. `DeleteService` and `UpdateService` hold one mutex around their repository write and their scheduler call.
- `CheckResultService.RecordCheckResult` calls `ServiceStateRepository.Update` (read the row, apply, write, one transaction), maps `domain.ErrNotFound` to "dropped, nothing changed", and then decides the alert from the previous status. `ServiceStateRepository.Update` never reads the `services` table.

### `pauseService`

1. Under the mutex `UpdateService` and `DeleteService` hold (the same field; pause and resume are serialized with them and with each other), call the repository's `SetPaused` with the id, `true` and the clock's time in UTC (the clock's `Now()` converted with `.UTC()`, as `RecordCheckResult` does).
2. The repository reads the service's `paused` flag in a write transaction. An id that matches no row is `domain.ErrNotFound` (`404 not_found`). If the flag is already true, nothing is written (not `updated_at` either) and `changed` is false. Otherwise it writes `paused = true` and `updated_at = the given time`, and `changed` is true. It then reads the service back, with its state, `target_count` and `alert_delivery_failed`, in the same transaction (the query `Get` uses), and returns that view and `changed`. It never writes `service_states`, `created_at` or any other column.
3. If `changed`, after the commit the usecase calls `Scheduler.Stop(id)` once, whatever has happened to the request's context meanwhile (the scheduler calls take no context, so a cancelled request still stops the schedule). If not, it calls nothing: pausing a paused service changes nothing.
4. The answer is 200 with the returned view. The handler logs one info line `service paused` with `service_id` and `service_name` (the view carries the name; nothing else is logged).

### `resumeService`

1. Under the same mutex, `SetPaused` with the id, `false` and the clock's time. The repository rules are those above with the flag reversed.
2. If `changed`, after the commit the usecase calls `Scheduler.Restart(service, now)` once, with the service as the repository returned it and the clock's time as `firstCheckAt`: the check runs at once, after any sequence of the id that is still ending. It never calls `Start` (it would wait in the request). If not `changed` (the service was not paused), it calls nothing: no check is run, no schedule is restarted.
3. The answer is 200 with the returned view; the state is what it was (the new check will change it). The handler logs one info line `service resumed` with `service_id` and `service_name`.

### The late result (decided by the user: drop it)

A sequence can finish in the instant after the pause is committed and before `Stop` reaches it. The result is dropped:

- `repository.ServiceStateRepository.Update`, in its transaction and before it calls `apply`, reads the `paused` flag of the service with that id from the `services` table. A service with no row there is `domain.ErrNotFound` (as for a missing state row). A paused service gets the new sentinel `domain.ErrServicePaused`, `apply` is not called and nothing is written.
- `domain.ErrServicePaused` is new in `domain/errors.go`: "the service is paused: a check result is not saved". It is returned only by the state repository and handled only in `RecordCheckResult`; it is not mapped to a status because it never reaches the handler.
- `RecordCheckResult` treats `ErrServicePaused` as it treats `ErrNotFound`: the result is dropped, the function returns nil, the state is unchanged and no alert is sent. A result for an unpaused service is recorded as before.
- The order of events that makes this sound: the pause commits the flag first, then calls `Stop`. A result written before the flag commits is a result of a check made before the pause and is saved; one written after is dropped.

### Known gaps

- A sequence cancelled by `Stop` that already holds its result drops it by the rule above, but the check it made has been made: a probe may have contacted the service just before the pause. Nothing can undo that.
- Alerts already handed to the dispatcher before the pause keep their delivery and retries (out of scope above).
- A resume of a service whose old sequence ignores its context runs its check only after that sequence ends (the `Restart` rule); the request does not wait.
- Pause and resume are not rate-limited, and each call logs one line even when it changes nothing.
- A service that is `not_yet_checked` and is paused loses its first sequence and stays `not_yet_checked` until resumed (FR-78 keeps the state).
- A race between a pause and a concurrent `deleteService` is covered by the shared mutex: the later of the two sees the other's result (`404` for a pause after the delete).

## Structure

By `ARCHITECTURE.md`: the usecase decides, the repository stores, the handler maps.

- `usecase/service.go`: new `PauseService(ctx, id)` and `ResumeService(ctx, id)`, both returning `domain.ServiceView`, both holding the shared mutex. They share one private helper for "set the flag, then act if it changed" rather than two copies.
- `usecase/service_repository.go`: new `SetPaused(ctx, id string, paused bool, at time.Time) (domain.ServiceView, bool, error)`; the comment names `domain.ErrNotFound` and the meaning of the bool.
- `repository/service.go`: `SetPaused`, reusing the view query of `Get` and the transaction helper style of `Create`. `repository/service_state.go`: the paused read in `Update`; its comment now names `ErrServicePaused`.
- `usecase/check_result.go`: the `ServiceStateRepository` comment names `ErrServicePaused`; `RecordCheckResult` handles it.
- `domain/errors.go`: `ErrServicePaused`.
- `handler/server.go`: `PauseService` and `ResumeService` added to `ServiceService`. `handler/services.go`: the two handlers, in the file's style (no stub edit; methods on `Server` shadow `stubs.go`).
- Tests: `usecase/fakes_test.go` (the fake repository's `SetPaused` with the same rules (it keeps the flag per service, returns the stored state, and calls `runtime.Gosched()` a few times between its write and its return so that a missing mutex shows up), recording into the shared events list, and the fake scheduler's existing `Stop` and `Restart`); `usecase/check_result_fakes_test.go` (the fake state repository gets a set of paused service ids, filled by the test, and answers `ErrServicePaused` for an id in it, without applying); `handler/helpers_test.go` (`serviceSpy` gains the two methods).

## Dependencies

None. No `go.mod` or `go.sum` change.

## Acceptance criteria

Use non-default ids and times; the clock is the fake. Repository tests use the in-memory database the other repository tests use. Concurrency tests run under `-race` with no `time.Sleep` (a fake whose methods call `runtime.Gosched()`, as the `update-service-api` tests do). None is an integration test.

**Repository (`repository/service_test.go`, `service_state_test.go`)**

- `SetPaused(true)` on an unpaused service: `changed` true, the view has `Paused` true and `updated_at` equal to the given time, and a `Get` afterwards agrees. The state row (status, times, failure fields) and every other column are as before.
- `SetPaused(true)` again: `changed` false, `updated_at` still the first time. `SetPaused(false)` on the paused row: `changed` true, `Paused` false, the state unchanged; again: `changed` false.
- An unknown id is `domain.ErrNotFound` for both values, and nothing is written.
- `ServiceStateRepository.Update` on a paused service: returns `domain.ErrServicePaused`, `apply` is not called, the state row is unchanged. The same call on an unpaused service writes (the baseline). On an id with no service row it returns `domain.ErrNotFound`. The existing `ServiceStateRepository` tests still pass unchanged: each seeds its state through `ServiceRepository.Create`, so a service row exists for every state row.

**Usecase (`usecase/service_test.go`, `check_result_test.go`)**

- `PauseService` on an unpaused service: the repository's `SetPaused` is called with `true` and the clock's time, then `Scheduler.Stop` is called exactly once with the id (the events list shows `set-paused` then `stop`); the returned view is the repository's, `Paused` true, with the state unchanged.
- `PauseService` when the repository answers `changed` false: no scheduler call at all; the view is returned.
- `ResumeService` when `changed` is true: `Restart` is called exactly once with the service as returned (not paused) and `firstCheckAt` exactly the clock's time; `Start` and `Stop` are never called (events: `set-paused`, `restart`).
- `ResumeService` when `changed` is false: no scheduler call.
- `ErrNotFound` and an unexpected repository error come back unchanged from both, with no scheduler call.
- Serialization: 50 rounds of one `PauseService` and one `ResumeService` for the same service started together, with the fake repository keeping the flag: after each round the last scheduler call agrees with the stored flag (`stop` last means paused, `restart` last means not paused), and the events never show a scheduler call of one operation between the write and the scheduler call of the other. 50 rounds of a resume with a concurrent `DeleteService`, and of a resume with a concurrent `UpdateService` of a service that a pause has just stopped: a `restart` never follows the `stop` of a delete, and the stored flag and the last scheduler call agree.
- A paused service is not scheduled by the paths that exist: `StartChecks` skips it and `UpdateService` leaves it unscheduled (one assertion each over a paused service, so FR-76 is shown for all three paths; these may be the existing tests extended with a paused case if they have none).
- `RecordCheckResult` for a service whose state repository answers `ErrServicePaused`: returns nil, the state is as before, no alert is dispatched, with a healthy and with an unhealthy result; the same call for an unpaused service saves the state and dispatches (the baseline). The existing `ErrNotFound` test still passes.

**Handler (`handler/services_test.go`)**

- Both operations: 200 with the mapped service (a paused view for pause, an unpaused one for resume); the spy receives the id; `404 not_found` for `ErrNotFound`; `500 internal_error` with the error text hidden for another error; one log line `service paused` / `service resumed` with `service_id` and `service_name` only.
- Gate failures never reach the spy: no session (401) and no CSRF token (403), for each operation.
- The 501 router test is not touched (it uses an operation still unbuilt).

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

- **By reading:** the scheduler is not changed; the usecase never calls `Start` for a resume; no scheduler call happens when the flag did not change; the repository's `SetPaused` writes only `paused` and `updated_at`; the state repository reads `paused` inside the same transaction as the write (checked by reading only: a test cannot interleave the two on the single connection; the database opens with `_txlock=immediate`, so the read and the write are one locked unit); `ErrServicePaused` is not in `problem.go`; no second copy of the pause and resume logic; the mutex field is the same one as `UpdateService`'s.
- **Mutation checks** (restore after each): call `Start` instead of `Restart` and see the resume test fail; call the scheduler when `changed` is false and see the no-op tests fail; drop the paused read in the state repository and see its test and the usecase test fail; make `RecordCheckResult` alert for a paused service and see the no-alert test fail; remove the mutex from pause and see the serialization test fail (report how many rounds failed); let `SetPaused` write `updated_at` when unchanged and see the repository test fail.
- **Inputs to try:** pause twice, resume twice, pause then edit then resume, pause a service with a running sequence blocked on its context, delete a paused service, an id with a space; by hand if wanted: run the app, add a service for a local server, pause it and see no more checks in the log (`check finished` stops), resume and see one at once; say if it was not done.
- **Run it:** the usecase and repository packages three times under `-race`; report failures.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other, or the contract lacks a status, field or code you need.
- You think you need a change outside your paths (the scheduler, `main.go`, the runner, a migration, a dependency, the contract).
- `update-service-api` is not merged, or the code differs from "What exists" (names of `Restart`, the mutex, `Get`).
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check` (and the integration-test command from `TESTING.md` if you touched code with integration tests; none is expected), commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), which tests ran, dependency versions (none changed), and anything you were unsure about. Also list every judgment call this file did not settle.
