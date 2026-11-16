# Task: check sequence and state

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The app gains the two pieces that turn one service into a status: a runner that makes a check sequence (one attempt, then up to the retry count more, with the retry wait between them) and a usecase that saves the sequence's final result as the service's state (status, last check, last change, failure reason). Nothing calls either yet: the scheduler task adds the timers and wires them in, so no admin-visible behavior changes and a new service stays `not_yet_checked`.

Requirements covered:

- FR-51: an HTTP attempt that fails for any reason is retried, up to the service's retry count.
- FR-53: the wait between a failed attempt and the next is the service's retry interval.
- FR-54: a service becomes unhealthy only when the attempt and all its retries failed; a retry that succeeds ends the sequence healthy.
- FR-55: an unhealthy service becomes healthy after one successful sequence (one successful attempt).
- FR-61, in part: the failure code, and the status code or rule field that goes with it, are saved as the probe gave them.
- FR-70, in part: a result for a service that no longer exists changes nothing and re-creates nothing.
- NFR-1, in part: a saved state is there after the database is closed and opened again.
- FR-71, in part: cancelling the context stops a running attempt and a retry wait and saves no result.

Out of scope:

- Timers, the check interval, the first check on add (FR-67), running sequences for several services at once, `Stop`, the start-up rebuild and wiring (FR-10, FR-67, FR-71, FR-111, NFR-6). The `scheduler` task; this one is only what it will call. `cmd/server/main.go`, `worker/noop_scheduler.go` and `usecase/service.go` do not change.
- Deciding what a status change sends (FR-21 to FR-25) and the "no new alert after a restart" rule (FR-111). Milestone 2. The usecase here returns only an error; the alert task changes the signature when it needs the previous status.
- TCP services (FR-49, FR-52). There is no TCP probe until milestone 3, so the runner does nothing for a TCP service (see "Known gaps").
- The failure wording shown to the admin (the dashboard has it) and every operation. No handler, contract or screen is involved.
- Query parameters, headers, the body, JSON rules and the certificate options on an attempt (milestone 3, see `http-probe`): an attempt here sends the service's method and URL only.
- The FR-47 and FR-48 reasons `json_rule_matched` and `invalid_or_missing_json`: the probe does not produce them yet. The usecase saves whatever code and field it is given.
- Pausing (FR-75 to FR-79, milestone 3). A paused service is not started by the scheduler; neither piece here looks at `Paused`.

## Prerequisite

`http-probe` and `create-service-api` are merged (they are). The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `adaptor/probe.HTTPProber` with `CheckHTTP(ctx, domain.HTTPCheck) (domain.CheckResult, error)`, and `domain.HTTPCheck`, `domain.CheckResult`, `domain.CheckFailure`.
- `domain.ServiceState`, `domain.Status*`, `domain.Failure*`, `domain.ErrNotFound`, and the tables `services` and `service_states` (no migration is needed).
- `pkg/clock` with `Clock`, `Timer`, `Real` and `Fake`. `pkg/clock` already has `NewTimer`; it is not changed.

## Role and ownership

Role: Backend.

You may change only:

- `backend/internal/worker/check_runner.go`, `backend/internal/worker/check_runner_test.go` (new)
- `backend/internal/usecase/check_result.go`, `backend/internal/usecase/check_result_test.go` (new)
- `backend/internal/usecase/check_result_fakes_test.go` (new): the fake `ServiceStateRepository` for the tests above. It is a new file, and not `fakes_test.go`, because `list-and-delete-services-api` changes that file at the same time.
- `backend/internal/repository/service_state.go`, `backend/internal/repository/service_state_test.go` (new)

You may not change anything else: not `backend/go.mod` or `go.sum`, `backend/migration/**`, `backend/internal/api/**`, `backend/internal/adaptor/**`, `backend/internal/domain/**`, `backend/cmd/**`, `backend/pkg/**`, `backend/internal/handler/**`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/check-sequence-and-state.plan.md`), `.env.example` or the `Makefile`. No configuration key is added.

Shared files: none are changed. Tasks that may run at the same time: `list-and-delete-services-api` (backend, in verification; it changes `repository/service.go`, `usecase/service.go`, `usecase/fakes_test.go`, `worker/noop_scheduler.go`, `handler/**` and `cmd/server/main.go`, none of which this task touches) and `dashboard-screen` (frontend only). The `scheduler` task waits for this one and for `list-and-delete-services-api`.

## Operations used

None. No operation of `docs/openapi.yaml` is implemented and nothing is returned over HTTP. The saved columns map onto the contract's `ServiceState` and `FailureReason` (`last_failure_reason.code`, `http_status`, `rule_field`) and are read later by `listServices`.

## Behavior

### What exists

- `domain.ServiceState` (table `service_states`, one row per service, created with the service by `ServiceRepository.Create`): `ServiceID`, `Status`, `LastCheckedAt`, `LastStatusChangeAt`, `FailureCode`, `FailureHTTPStatus`, `FailureJSONRuleField`. The database allows a `failure_code` only when `status` is `unhealthy`.
- `domain.Service` has `CheckType`, `HTTPMethod` and `HTTPURL` (pointers; set for an HTTP service), `TimeoutSeconds`, `RetryCount`, `RetryIntervalSeconds` and `ID`.
- `domain.CheckResult{Healthy, Failure}`; `Failure` is nil exactly when `Healthy`.
- `usecase.Clock` (`Now`) and `pkg/clock.Clock` (`Now`, `NewTimer`) with `clock.Fake`.

### The runner (`worker.CheckRunner`)

Built once with a prober, a recorder and a `clock.Clock`; safe for concurrent use (it holds no per-sequence state). Its one method takes a context and a `domain.Service` and runs one sequence for it. `worker` defines both interfaces it needs, beside the runner: the prober with `CheckHTTP(ctx, domain.HTTPCheck) (domain.CheckResult, error)` and the recorder with `RecordCheckResult(ctx, serviceID string, result domain.CheckResult) error`. `adaptor/probe.HTTPProber` satisfies the first and the usecase below the second, without importing `worker`.

The sequence:

1. **TCP service:** nothing is probed, nothing is recorded, the method returns nil.
2. **HTTP service with a nil method or a nil URL** (the database does not allow it): the method returns an error and probes and records nothing.
3. **Attempt number 1:** call the prober with `HTTPCheck{Method, URL, Timeout}` where the method and URL are the service's and the timeout is `TimeoutSeconds` seconds. The runner adds no deadline of its own: the probe owns the timeout.
4. **A healthy result:** the sequence ends. The result is recorded at once (no further attempts, no wait).
5. **A failed result with attempts left:** wait exactly `RetryIntervalSeconds` seconds on a `clock.Clock` timer, then make the next attempt (step 3). Attempts are at most `1 + RetryCount`. With `RetryCount` 0 there is no wait and no retry.
6. **A failed result with no attempts left:** the sequence ends. The result of the last attempt is recorded (its failure code is the one saved, even if an earlier attempt failed for another reason).
7. **Cancellation:** if the context ends during an attempt (the prober returns the context's error), during a wait (the timer is stopped), or after the last result is in hand but before it is recorded (the runner checks `ctx.Err()` first), the method returns the context's error and records nothing. A result that arrives after the cancel is never recorded.
8. **Any other error from the prober** (the probe returns only context errors, so this is a guard): the method returns that error and records nothing.
9. **An error from the recorder:** returned as it is, with no retry of the recording. The scheduler decides what to log.

Defaults the file settles, each tested:

- When the context has ended and the retry timer has fired at the same moment, the context wins: the runner checks `ctx.Err()` after the wait and returns it before making another attempt.
- A negative `RetryCount` is treated as 0. `TimeoutSeconds` is passed on as it is, even if zero or negative (the probe turns it into `timed_out`); the runner does not validate it.
- The errors of steps 2 and 8 are plain errors with a message of the builder's choice; there is no sentinel and nothing maps them.

Boundaries: a wait of `RetryIntervalSeconds` less one second does not start the next attempt; the full interval does. A sequence with `RetryCount` of 2 whose three attempts all fail makes exactly three attempts, two waits, and one record. A sequence whose second attempt is healthy makes two attempts, one wait, and records the healthy result.

### The usecase (`usecase.CheckResultService`)

Built with a `ServiceStateRepository` and a `usecase.Clock`. Its method `RecordCheckResult(ctx, serviceID string, result domain.CheckResult) error`:

1. A result that breaks the rule of `domain.CheckResult` (healthy with a `Failure`, or not healthy with none) returns a plain error (message of the builder's choice, no sentinel) and writes nothing. Nothing else is checked: an empty service id goes to the repository and comes back `ErrNotFound` (dropped); an unknown or empty failure code is saved as given, and the database's constraint error is returned unchanged.
2. Let `now` be the clock's time in UTC. Ask the repository to update the service's state row with the rule below, applied to the row as it is in the database. The read and the write are one repository call (see "The repository").
3. If the repository answers `domain.ErrNotFound` (the service was deleted meanwhile), the result is dropped: the method returns nil. Any other repository error is returned unchanged.

The rule, given the saved state and the result:

| Result | `Status` | `LastCheckedAt` | `LastStatusChangeAt` | Failure columns |
|---|---|---|---|---|
| healthy | `healthy` | `now` | `now` if the saved status was not `healthy`, otherwise unchanged | all three null |
| failed | `unhealthy` | `now` | `now` if the saved status was not `unhealthy`, otherwise unchanged | code from the result; HTTP status set only for `non_2xx_status` and only if the result carries one; rule field set only for `json_rule_matched` and only if the result carries one; the others null |

Consequences, each a criterion: the first result of a new service sets `LastStatusChangeAt` (from `not_yet_checked`); an unhealthy service that fails again, even for another reason, keeps its change time and takes the new reason; a healthy service that stays healthy keeps its change time and moves only `LastCheckedAt`; the status never becomes `not_yet_checked` again.

### The repository (`repository.ServiceStateRepository`)

One method, `Update(ctx, serviceID string, apply func(domain.ServiceState) domain.ServiceState) error`, in one write transaction by the same pattern as `ServiceRepository.Create`: read the row by `service_id`, call `apply` with it, write the returned row. It only updates:

- No row for the id: it returns `domain.ErrNotFound`, writes nothing and creates nothing.
- Every mutable column is written, including a column set back to null. (A GORM update from a struct skips zero values; the test below fails if a failure column is not cleared after a recovery.)
- Times are stored and read back in UTC.
- The primary key is never changed, whatever `apply` returns.

The usecase defines the `ServiceStateRepository` interface inline in `check_result.go` (one method, one user).

### Known gaps

- A TCP service stays `not_yet_checked` until the TCP probe task (milestone 3). The runner skips it. The scheduler task starts no timer for one either.
- A sequence in progress when the app stops is lost and starts over (FR-111); nothing is stored about attempts.
- `LastCheckedAt` is the time the result is recorded, which is when the sequence finished. Nothing records when it started.
- An alert is not sent for a status change (milestone 2). The usecase gives the alert task nothing yet.

## Structure

By `ARCHITECTURE.md` ("Background work"): the worker owns timing, waiting, cancellation and retries; the usecase owns what a result does to a status. Names marked "new" are fixed by this file; others (constructors, unexported helpers, test doubles) are the builder's choice.

- `worker/check_runner.go` (new): `worker.CheckRunner`, its two interfaces (`Prober`, `CheckRecorder`, new names) and its method that runs a sequence. It takes `clock.Clock` from `pkg/clock`. It imports no `repository` and no `adaptor`.
- `usecase/check_result.go` (new): `usecase.CheckResultService` with `RecordCheckResult`, and the inline `ServiceStateRepository`. The status rule is a pure function in this file so the table above is tested without a repository.
- `repository/service_state.go` (new): `repository.ServiceStateRepository` on `*gorm.DB`.
- No change to `domain/`: `ServiceState` already has every field.

## Dependencies

None. No `go.mod` or `go.sum` change.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. Worker and usecase tests use `clock.Fake`, never `time.Sleep` or a real timer, and test a duration by advancing the clock by exactly that duration and by one second less (`TESTING.md`). No integration test (build tag `integration`) is needed.

Two helpers the runner tests need, because `clock.Fake.Pending()` cannot see a timer that has already fired: a thin wrapper around `clock.Fake` that counts `NewTimer` calls and signals on a channel each time one is created (so a test waits for "the runner is now waiting" without sleeping, then asserts the probe call count, calls `Advance`, and waits on the fake prober's next-call signal); and a fake prober that signals each call on a channel and can block on its context. "Creates no timer" means that count is 0.

**Runner (`worker/check_runner_test.go`, with a fake prober and a fake recorder that log events into one list)**

- A healthy first attempt records one healthy result, makes one attempt, creates no timer, and the probe got the service's method, URL and `TimeoutSeconds` as a duration (FR-54).
- With `RetryCount` 2, all three attempts failing: exactly three probe calls, a wait of exactly the retry interval before each retry (a non-default interval, so a literal fails), and one record with the third attempt's failure; the event list shows attempt, wait, attempt, wait, attempt, record (FR-51, FR-53, FR-54).
- The third attempt's failure code differs from the first's: the recorded code is the third's (FR-54).
- A retry that succeeds ends the sequence: first fails, second is healthy gives two attempts, one wait, one healthy record and no third attempt (FR-54).
- `RetryCount` 0 and a failed attempt: one attempt, no wait, one failed record (FR-51).
- The next attempt does not start after the interval less one second and does start after the full interval, with the sequence blocked on the fake clock (FR-53).
- Cancelling during a wait: the method returns `context.Canceled`, the timer is stopped, no further attempt, nothing recorded (FR-71).
- Cancelling during an attempt (the fake prober blocks on its context and returns its error): the method returns the context's error and nothing is recorded (FR-71).
- A context cancelled after the final result is returned by the prober and before the recorder is called: nothing is recorded (FR-71).
- A deadline instead of a cancel gives the same: `context.DeadlineExceeded`, nothing recorded.
- The context ended and the timer already fired when the wait is read: the second attempt is not made and nothing is recorded. A negative `RetryCount` makes one attempt and no wait.
- A TCP service: nil returned, no probe call, no record, no timer. An HTTP service with a nil URL, and one with a nil method: an error, no probe call, no record.
- A prober that returns a non-context error: that error is returned, nothing recorded. A recorder error is returned unchanged and not retried (the recorder is called once).
- Two sequences for different services run at the same time on one runner without sharing results (the records carry their own service ids), under `-race`.

**Status rule and usecase (`usecase/check_result_test.go`, with a fake `ServiceStateRepository` that holds states by id and applies `apply`, and `clock.Fake`)**

- `not_yet_checked` and a healthy result: `healthy`, `LastCheckedAt` and `LastStatusChangeAt` both the fake clock's time, no failure columns (FR-55).
- `not_yet_checked` and a failed result: `unhealthy`, both times set, the failure code saved (FR-54).
- `healthy` and a healthy result later: `LastCheckedAt` moves to the new time, `LastStatusChangeAt` keeps its old time (FR-55).
- `healthy` and a failed result: `unhealthy`, change time is the new time (FR-54).
- `unhealthy` and a healthy result: `healthy`, change time is the new time, and all three failure columns are cleared (FR-55).
- `unhealthy` and a failed result for another reason: `LastStatusChangeAt` unchanged, `LastCheckedAt` moved, the failure code is the new one, and the HTTP status of the old reason is gone.
- `non_2xx_status` with status 503 saves 503 and a null rule field; `json_rule_matched` with field `$.status` saves the field and a null HTTP status; `timed_out` carrying a stray HTTP status saves it null (FR-61).
- `non_2xx_status` with no status saves a null HTTP status.
- A healthy result carrying a `Failure`, and an unhealthy one with none: an error, and the fake holds the state it had before.
- The repository answering `domain.ErrNotFound` makes the method return nil and the fake unchanged; another error is returned unchanged with `require.ErrorIs` (FR-70).
- The time comes from the clock (a non-default fake time), never from the result or the real time.

**Repository (`repository/service_state_test.go`, real SQLite through `testutil.NewDB`; the service and its state row are made with `ServiceRepository.Create` or the test's own insert)**

- `Update` writes every column: status, both times, and the three failure columns, read back with the test's own query, times equal in UTC (FR-61).
- After an unhealthy state with all three failure columns set, an `Update` that returns a healthy state leaves the three columns null in the database (FR-55).
- `apply` receives the row as it is in the database, including after an earlier `Update` (two updates in a row see each other).
- An id with no row returns `domain.ErrNotFound`, `apply` is not called, and the `service_states` table still has only the rows it had (FR-70).
- Deleting the service by the test's own statement removes the state row (the cascade), and an `Update` for it then returns `domain.ErrNotFound` and creates no row (FR-70).
- An `apply` that returns a zero `ServiceState` (empty status) is refused by the database's constraint: an error, and the previous row unchanged.
- An `apply` that changes `ServiceID` does not move or create a row: the row for the original id is the one written.
- The database refusing the state (an `apply` returning `healthy` with a failure code, which the constraint forbids) returns an error and leaves the previous row unchanged.
- The state survives closing and reopening the same file (`testutil.CloseDB`, `testutil.OpenDB`) (NFR-1).

**Repo-wide**

- `make check` passes.
- `git diff go.mod go.sum` is empty.
- Nothing outside the allowed paths changed.

## Verifier checks

- **Layering, by reading imports:** `worker/` imports neither `repository/` nor `adaptor/`; `usecase/` imports neither `worker/` nor `pkg/clock` outside tests; `repository/` imports no `usecase/`; no test in `usecase/` imports `repository/` or `worker/`.
- **Time, by reading the diff:** no `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` outside tests and `pkg/`; the retry wait goes through `clock.Clock`'s timer; a stopped timer is always stopped on every exit path of the wait.
- **No literal timing:** the retry wait comes from `RetryIntervalSeconds`, the attempt count from `RetryCount`, the probe timeout from `TimeoutSeconds`; the tests use non-default values.
- **Where the rule lives:** the status table is only in `usecase/`; `worker/check_runner.go` does not read or compare a status, and `repository/service_state.go` contains no rule, only read, call `apply`, write.
- **Never inserts:** `repository/service_state.go` has no insert or upsert path; `Update` for a missing row is `ErrNotFound`.
- **Mutation checks to run:** change the retry wait to the interval minus one second; remove the `ctx.Err()` check before recording; record the first failure instead of the last; keep an old change time on a real change; stop clearing a failure column on recovery (use `Select("*")` or a map in the update); let `Update` create a missing row. Each must fail at least one named test.
- **Inputs to try:** `RetryCount` 0 and the maximum (5) from `.env.example`; a retry interval of 1 second and of 300; a cancel at each of the three points of step 7; a state that goes unhealthy to unhealthy to healthy to healthy; a result for a deleted service; two sequences at once.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a migration, or an edit to a spec file. In particular, if the repository update needs a change to a migration or to `domain.ServiceState`, or if `pkg/clock` cannot do what the runner needs.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), that no integration test applies, and anything you were unsure about. Also list every judgment call this file did not settle.
