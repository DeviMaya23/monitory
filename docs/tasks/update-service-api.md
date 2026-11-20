# Task: update-service API

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The admin can read one service with all its settings and edit it through the API: `getService` and `updateService` become real. An edit replaces every editable setting (including the type), keeps the service's state and its paused flag, runs no check at the moment of saving, and restarts the service's schedule so that the next check uses the new settings. The task also settles two open points of the scheduler: a service that was stopped and is started or restarted again never has two sequences running at once, and the scheduler does not look at `Paused`.

Requirements covered:

- FR-7: every editable setting of a service can be changed and is saved (one full-body test, and one test per group of settings).
- FR-12 and FR-74: an edit with invalid settings is rejected with the same field errors as `createService`, and nothing is saved.
- FR-20 and FR-65 (backend): `alerts_enabled` and the two messages are replaced by an edit; a message over 500 characters is rejected and nothing is saved. The Alerts group on the form is the frontend's.
- FR-39: `getService` returns every saved header value in full.
- FR-59: renaming to a name used by another service, ignoring case, is `409 service_name_taken`; keeping the own name, or changing only its letter case, is allowed.
- FR-66: the state is kept, including when the type changes; no check runs at saving; the schedule restarts so that the next check uses the new settings, at the time set out under "The next check".
- FR-27 and FR-68 (the saved flag only): `shown_on_public_view` is replaced by an edit.
- NFR-8: `getService` needs a session and `updateService` needs a session and the CSRF token (the policy router already enforces it; a test shows both operations sit behind it).

Out of scope:

- `pauseService`, `resumeService` (FR-75 to FR-79): `pause-resume-api`. This task only makes an edit leave a paused service paused and unscheduled.
- `testServiceCheck`: `test-service-check-api`.
- Anything under `frontend/`: the edit screen is `edit-service-screen`, drafted in another session.
- Running a check at saving, and any change to `CheckRunner`, the probe or `main.go`: `tcp-probe` changes those, in parallel.
- Showing the failure reason in words (FR-61), the public view hiding the request (FR-40) and its `404` rules: other tasks. `getService` only returns what `toAPIService` maps today.
- A second certificate failure code (backlog, needs a contract change).

## Prerequisite

- `scheduler-test-flake` is merged: both tasks change `worker/scheduler_test.go`, and this task adds tests to the file that task makes reliable. The builder checks that `TestStart_ReplacesRunningService` reads the second sequence's totals inside the sequence, not after `Start` returns; if not, stop and ask.
- `create-service-api`, `scheduler` and `list-and-delete-services-api` are merged (they are): `ServiceService`, `normalizeServiceInput`, `ValidateServiceInput`, the repository's `Find`, `worker.Scheduler`, `StartChecks`, `toAPIService` and the router's 501 stubs for `getService` and `updateService` exist.

## Role and ownership

Role: Backend.

You may change `backend/internal/usecase/service.go`, `service_repository.go`, `service_test.go` and `fakes_test.go`; `backend/internal/repository/service.go` and `service_test.go`; `backend/internal/handler/services.go`, `server.go`, `services_test.go`, `helpers_test.go` and `router_test.go`; `backend/internal/worker/scheduler.go` and `scheduler_test.go`. You may not change `backend/migration/**` (the tables exist; no migration is needed), `backend/internal/api/**` (generated), `backend/internal/domain/**`, `backend/internal/handler/problem.go` (`ErrNotFound`, `ErrServiceNameTaken` and the validation error already map to their codes), `backend/cmd/server/main.go` (`worker.Scheduler` gains a method and still satisfies the usecase's interface, so the wiring does not change), the check runner and its test, `backend/internal/adaptor/**`, `backend/go.mod`, `backend/go.sum`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/update-service-api.plan.md`), `.env.example` or the `Makefile`. No configuration key is added.

Shared files this task touches, all owned by this task while it runs: `usecase/service.go`, `usecase/service_repository.go`, `usecase/fakes_test.go`, `handler/server.go` (the `ServiceService` interface), `handler/services.go`, `handler/helpers_test.go`, `worker/scheduler.go` and `worker/scheduler_test.go`. `pause-resume-api` and `test-service-check-api` change several of them next and wait for this task to merge. Tasks that may run at the same time: `tcp-probe` (it changes `adaptor/probe`, `worker/check_runner.go` and its test, and `cmd/server/main.go`, none of which this task touches; its file says it leaves the files above alone) and the frontend group's tasks.

## Operations used

From `docs/openapi.yaml`:

- `getService`: `GET /api/services/{serviceId}`. Responses used: 200 (`Service`), 401, 404 (`not_found`), 500. A stub today.
- `updateService`: `PUT /api/services/{serviceId}`, body `ServiceInput`. Responses used: 200 (`Service`), 400, 401, 403, 404 (`not_found`), 409 (`service_name_taken` only), 413, 415, 422, 500. A stub today.

Request and response types are the generated ones in `internal/api`; the mapping functions `toServiceInput` and `toAPIService` in `handler/service_mapping.go` are used as they are. The `serviceId` path parameter is any string; one that matches no service is `404 not_found`. `id`, `paused`, `state`, `target_count` and `alert_delivery_failed` are read-only: a request body cannot set them (the generated input type has no such fields, so a body that carries them has them ignored).

## Behavior

### What exists

- `usecase.ServiceService` has `CreateService`, `ListServices`, `DeleteService` and `StartChecks`. `CreateService` normalizes the input (`normalizeServiceInput`), validates it (`ValidateServiceInput`), builds the row (`buildService`: a new id, the timestamps, defaults for the omitted settings and flags, and the columns that the type does not keep left empty or set to their defaults), writes it, then calls `Scheduler.Start`.
- `usecase.ServiceRepository` has `Create`, `List` and `Delete`. `repository.ServiceRepository` also has `Find` (the service without its state), used by `TargetTester`. The list query joins the state and computes `target_count` and `alert_delivery_failed`.
- `usecase.Scheduler` has `Start` and `Stop`. `worker.Scheduler.Start` runs the first sequence at once. `Stop` removes the entry without waiting. Only `StartChecks` skips paused services; `Start` itself does not look at `Paused`.
- `handler.ServiceService` has the three methods the handlers use; `serviceSpy` in `handler/helpers_test.go` implements it. `handler/router_test.go` has `TestRouter_UnimplementedOperationAnswers501`, which asks for `GET /api/services/a-service` and expects 501.

### `getService`

1. Read the service with its state, `target_count` and `alert_delivery_failed`, exactly as the list returns one service. A service that does not exist is `domain.ErrNotFound`, answered `404 not_found`.
2. Answer 200 with `toAPIService`, the same shape and mapping as an item of `listServices` and as the `201` of `createService`. Header values are returned in full (FR-39).

### `updateService`

Order of checks: the router's gates (401, 403, 413, 415, malformed body 400) come first, as for `createService`. Then the input is normalized and validated, with no read of the database: a rejected body is `422 validation_failed` with the same fields, codes and messages as `createService`, whether or not the id exists. Then the write: an id that matches no service is `404 not_found`; a name used by another service, ignoring case, is `409 service_name_taken`. Nothing is saved in any failure, and the scheduler is not called.

1. **Replace.** The body replaces every editable setting, exactly as `createService` would have built it from the same body: omitted `settings` values become the configured defaults, omitted `alerts_enabled` becomes true, omitted `shown_on_public_view` becomes false, omitted messages become empty, an omitted or empty list becomes an empty list, and the columns that the new type does not keep are cleared (a service changed from HTTP to TCP has no method, URL, query parameters, headers, body, rules, certificate settings; one changed from TCP to HTTP has no host and port). A body of the other type's fields is dropped, as on create. The name is trimmed and its lower-case key recomputed. This mapping is shared with `createService` (see "Structure"), not copied.
2. **What an edit keeps.** The id, `created_at`, `paused`, the whole state row (`status`, `last_checked_at`, `last_status_change_at`, the failure fields: untouched even when the type changes, FR-66) and the alert list. `updated_at` is set to the clock's time. An edit does not read `paused` from the body.
3. **The write** is one transaction in the repository: update the row, then read it back with its state and the two computed values, and return that view. A duplicate-name failure of the unique index is `domain.ErrServiceNameTaken` (decided the way `Create` decides it); a row that matched nothing, including one deleted a moment earlier, is `domain.ErrNotFound`. Renaming a service to the same name, or to the same name in other letter case, is not a clash with itself.
4. **The answer** is 200 with the view the write returned (`toAPIService`): the new settings, the unchanged state, `paused` as stored.
5. **The schedule.** The write and the scheduler call of one edit run under one mutex held by `ServiceService` (a field of the struct, not a new shared component), so two edits of the same or of different services never interleave a write with another edit's `Restart`: the schedule always matches the last write (decided by the user). `DeleteService` takes the same mutex around its repository delete and its `Stop` (decided by the user), so a `Restart` can never come after a delete's `Stop` and leave a schedule for a deleted service; an edit after the delete is `ErrNotFound`. The mutex is released when `UpdateService` returns; `Restart` does not block (below), so no edit holds it for long. After the write has committed, and only if the stored service is not paused, the usecase calls `Scheduler.Restart` once with the saved service and the time of the next check (below). If the stored service is paused, the scheduler is not called: a paused service has no schedule and stays without one. `Start` is never called by an edit.
6. The handler logs one info line `service updated` with `service_id` and `service_name`, like `service added` (`CONVENTIONS.md`, Logging). No setting, URL or header is logged.

### The next check (FR-66, decided by the user: keep the old rhythm)

The usecase computes the time passed to `Restart`, from the state the write returned and its own clock: let `next` be the state's `last_checked_at` plus the new check interval in seconds. If the state has no `last_checked_at`, or `next` is not after now, the time is now plus the new check interval; otherwise it is `next`. So an edit never runs a check at saving, and never schedules one for a time that has passed. At exactly `last_checked_at` plus the interval equal to now, the time is now plus the interval (a boundary: one second earlier it is `next`). A `last_checked_at` in the future (a clock set back) gives `next` in the future, later than one interval from now; that is accepted and not corrected.

### `worker.Scheduler.Restart` and the `Stop` then `Start` rule

The usecase's `Scheduler` interface gains `Restart(service domain.Service, firstCheckAt time.Time)`. It is new; the interface's existing methods and the placeholder fakes' behavior stay.

- **`Restart(service, firstCheckAt)`** returns at once; it never waits for the old goroutine, so an edit is never held up by a sequence (decided by the user). Under `mu` only (it never takes `startMu`, so it never blocks behind a `Start` that is waiting) it takes the id's current entry (a running goroutine, or one that `Stop` cancelled and that has not ended yet), cancels it, and installs a new entry and goroutine in the same critical section, so a `Stop` cannot hide the old goroutine between a read and the install. The new goroutine first waits for the previous goroutine of that id to end (a wait that ignores its own context: only the end of the previous goroutine ends it), and only then does anything else. A goroutine closes its `done` channel only after that wait, so a chain of restarts is ordered and two sequences of one id never overlap. Then it checks its context (a `Stop` or `Close` meanwhile ends it, and nothing runs). Then its first sequence runs at `firstCheckAt`, not at once: it waits on a clock timer for the time left, selecting on its context (a `Stop` or `Close` ends it, the timer is stopped, nothing runs). If `firstCheckAt` is not after the current time when the goroutine gets there (equal, in the past, or the old sequence took longer), the first sequence runs at once with no timer, and the schedule then counts from the time that sequence started, not from `firstCheckAt` (the existing overrun rule: no catch-up, no burst). After the first sequence the loop is the existing one: the next is scheduled for `firstCheckAt` plus the interval (start to start, so a late sequence does not shift later ones), with no catch-up. After `Close`, `Restart` does nothing. A service with a check interval of zero or less is not started: the same `service not scheduled` error log as `Start`, and a running entry for that id is left untouched. If no entry exists for the id, `Restart` just starts one. A sequence function must not call `Restart` for its own service.
- **`Start`** is unchanged in behavior: first sequence at once, and it still waits in the caller for an old goroutine of the id (running, stopped, or still waiting in a `Restart` chain: it waits on the id's entry's `done`, which closes only at the very end). A `Restart` can install a newer entry while a `Start` waits, so after each wait `Start` takes `mu`, looks at the id again, and if an entry is there cancels it and waits again; it installs its own entry in the same `mu` hold in which it found none.
- **`Stop`** still does not wait. But the goroutine it cancelled stays known to the scheduler until it has ended, so that a later `Start` or `Restart` for the same id waits for it. Two sequences of one id never overlap, whatever the order of `Stop`, `Start` and `Restart`. Once a stopped goroutine has ended and the id is not started again, nothing about it remains in the scheduler (no leak for deleted services): the goroutine removes its own bookkeeping, checking that the record is still its own so that it never removes a newer entry, before it closes its `done` channel. That cleanup takes the mutex that guards the map, so the comment on `Scheduler` that no goroutine takes it is updated. `Close` still returns only when every goroutine, stopped or not, has ended. The mechanism is the builder's choice.
- **Comments:** the comment on `startMu` says it serializes `Start` calls only; the comment on `mu` no longer says that no goroutine takes it, and still says nothing blocks while it is held.
- **`Paused`:** the scheduler does not read it, now or later; the usecase decides which services are started or restarted (`StartChecks` skips paused ones, `UpdateService` does not call it for a paused one, `pause-resume-api` stops and starts). This is stated in the doc comments of `Start`, `Restart` and the `usecase.Scheduler` interface.
- **Sequences cancelled by an edit** end through their context. The runner saves nothing for a cancelled sequence; the instant between its last check and the save is the known gap below.

### Known gaps

- A sequence that ignores its context delays the new schedule (the new goroutine waits for it), not the request. Every sequence ends through its context and the probe has its own deadline, so the delay is bounded in practice; `Close` waits for it as it does today.
- A result that is already being recorded in the instant the edit cancels the sequence can still be saved, with the old settings' outcome. It is a state of the service, which an edit keeps anyway. The runner is not changed here.
- Every edit pushes the next check back: saving twice in a row moves the check to a later time each time, while the last check is older than the interval. By the user's decision (the old rhythm), an edit never checks at once.
- A service never checked (`not_yet_checked`) that is edited before its first check has finished loses that first sequence (it is cancelled) and gets its first check one new interval after the save, because `last_checked_at` is empty.
- An edit and a delete of one service are serialized by the mutex (an edit after the delete is `ErrNotFound`; an edit before it is followed by the delete's `Stop`). An edit against a pause is the later task's to decide.
- `getService` is not rate-limited or cached; nothing in the contract asks for it.
- The 501 test uses `getPublicDashboard`, the last operation to be built; the milestone 4 task that builds it rewrites that test again.
- `pause-resume-api` takes the same mutex for pause and resume; that task decides it.

## Structure

By `ARCHITECTURE.md` ("Background work", the usecase and repository layers). Names marked "new" are fixed by this file; the rest is the builder's choice.

- `usecase/service.go`: new `GetService(ctx, id)` and `UpdateService(ctx, id, input)`, both returning `domain.ServiceView`, and the edit mutex field on `ServiceService` (its zero value is usable, so `NewServiceService`'s signature does not change). `buildService` is split so that create and update share the mapping from input to row: the shared part is a function from the input, an id and a time to the row; `CreateService` calls it with a new id and the clock's time, `UpdateService` with the path id and the clock's time. `created_at` and `paused` in the row `UpdateService` builds are ignored by the repository's `Update`, so the usecase reads nothing before the write. `normalizeServiceInput` stays private to `package usecase`; `UpdateService` and the test-service usecase of a later task call it as it is, and no new shared place is made (the user's decision).
- `usecase/service_repository.go`: new methods on the interface: `Get(ctx, id)` returning the view, and `Update(ctx, service)` returning the view; their doc comments name `domain.ErrNotFound` and `domain.ErrServiceNameTaken`.
- `repository/service.go`: new `Get` and `Update`. `Get` reuses the list query's text, not a second copy: the constant is split into the select part and the `ORDER BY` part (the list adds the order, `Get` adds a condition on the id). `Update` writes, by explicit column list, every editable column (name, name key, check type, all HTTP and TCP columns, the four timing columns, `alerts_enabled`, both messages, `shown_on_public_view`, `updated_at`) so that false, zero, empty and NULL values are written, and never `id`, `created_at`, `paused` or anything of `service_states`. The query for `Get` and the read-back inside `Update` give the same result.
- `usecase/service.go` (`Scheduler` interface): new `Restart(service domain.Service, firstCheckAt time.Time)`.
- `worker/scheduler.go`: `Restart`, and the `Stop` bookkeeping above. Imports stay `domain`, `pkg/clock` and the standard library.
- `handler/server.go`: `GetService` and `UpdateService` added to `ServiceService`. `handler/services.go`: the two handler methods, in the file's style (no stub edit needed: methods on `Server` shadow `stubs.go`).
- Tests: `usecase/fakes_test.go` (the fake repository's `Get` and `Update` with the same name and not-found rules, recording into the shared events list; the fake scheduler's `Restart`, recording the service and the time). The fake repository keeps a state per service (seedable, for `last_checked_at`), `Update` returns the stored row's `Paused` and state, not the input's, `Update` after a `Delete` returns `domain.ErrNotFound`, and its `Update` and `Delete` call `runtime.Gosched()` a few times before they return, so that a missing mutex shows up, `handler/helpers_test.go` (`serviceSpy` gains the two methods).

## Dependencies

None. No `go.mod` or `go.sum` change.

## Acceptance criteria

Worker tests use `clock.Fake` and the wrapper already in `scheduler_test.go`, never `time.Sleep`, and run under `-race`. A duration is tested at the exact value and one second less (`TESTING.md`), with non-default intervals. Repository tests use the in-memory database the other repository tests use. Mark nothing as an integration test; none is needed.

**Scheduler (`worker/scheduler_test.go`)**

- `Restart` with a future time: no sequence runs at once; after `Advance` of that wait minus one second there is still none; after one more second there is one, and its recorded time is exactly `firstCheckAt`; the next runs one interval after `firstCheckAt`, not after the edit (start to start).
- `Restart` with a time that is not after now (equal to now, and in the past, far back too): the sequence runs at once and no timer is made; the second sequence is one interval after the first started, with no burst of missed ones.
- `Restart` for an id whose sequence is running and does not return until the test releases it (after its context is cancelled): `Restart` returns at once while the old sequence is still running (`returnsWithin`); the old context was cancelled; the new goroutine runs nothing until the old sequence has returned; after the release and an `Advance` to `firstCheckAt`, the new first sequence runs, `maxRunning` is 1, and the new interval is used.
- Two `Restart` calls in a row for one id while the first sequence is still held: the clock is advanced past the later `firstCheckAt`, then the old sequence is released; the later goroutine runs, the middle one never runs a sequence, and `maxRunning` is 1 (the advance makes an overlapping goroutine show).
- `Restart` then `Start` for one id while the first sequence is held: `Start` returns only after the held sequence and the restarted goroutine have ended, nothing overlaps (`maxRunning` 1), and the new sequence starts at once.
- `Restart` while a `Start` for the same id is waiting for a held sequence: `Restart` returns at once; after the release exactly one goroutine runs sequences for the id (`maxRunning` 1); and `Close` returns with every goroutine ended (no untracked goroutine).
- `Restart` for an id waiting on a timer: the old timer is stopped, only the new one fires.
- `Restart` for an unknown id starts it (first sequence at `firstCheckAt`).
- `Stop` during the wait for a restarted service's first check: nothing runs afterwards and the timer is stopped.
- **Stop then Start, same id (the backlog finding):** a first sequence that blocks until released after its context is cancelled; `Stop`, then `Start`: the new sequence does not start until the old one has returned (`maxRunning` stays 1, and the test fails if `Stop` forgot the goroutine). The same with `Stop` then `Restart`.
- After a `Stop` whose goroutine has ended and no further start, no entry or stopped goroutine remains. The test takes the entry's `done` channel (under the mutex) before `Stop`, waits on it with the `guard` bound, and only then reads the scheduler's bookkeeping as `TestStart_ConcurrentSameID` reads `entries`; the cleanup happens before `done` closes, so the read is not early.
- `Close` returns only after a goroutine that `Stop` cancelled has ended.
- `Close` while a restarted goroutine waits for an old sequence that is released only after `Close` has cancelled it: `Close` returns after both have ended, the restarted goroutine ran no sequence, no goroutine remains. And `Close` while a `Start` waits for a stopped goroutine does the same (the shape of `TestClose_WhileStartWaits`).
- `Restart` with a check interval of zero and of minus one: nothing runs, one error log `service not scheduled`, a running entry for the id is untouched.
- Two `Restart` calls for one id from two goroutines under `-race`, then `Close`: every started goroutine has ended, and no two sequences overlapped.
- The existing scheduler tests pass unchanged in meaning.

**Repository (`repository/service_test.go`)**

- `Get` returns the service with its state, `target_count` and `alert_delivery_failed` (a service with two targets, one with a failed delivery), equal to the same service in `List`; times are UTC. An unknown id is `domain.ErrNotFound`.
- `Update` of an HTTP service with every field set returns the view with the new values, and a `Get` afterwards returns the same.
- `Update` HTTP to TCP: the HTTP columns are empty or defaults (method and URL NULL, lists empty, body type none, content empty, rule mode any, certificate off, its days NULL), host and port set; TCP to HTTP clears host and port.
- `Update` writes false and empty values: `alerts_enabled` true to false, `shown_on_public_view` true to false, a message set then emptied, a header list emptied.
- `Update` leaves `id`, `created_at`, `paused` (a row made paused by a direct write in the test), and the state row (a state with a status, times and a failure code, compared before and after) as they were, and sets `updated_at`. This test changes the type from HTTP to TCP in the same call, so the state is shown kept across a type change (FR-66).
- A name clash with another row, ignoring case, is `domain.ErrServiceNameTaken` and the row is unchanged; the own name in other letter case is saved; an unknown id is `domain.ErrNotFound`.

**Usecase (`usecase/service_test.go`)**

- `GetService` returns the repository's view; an unknown id and a repository error come back unchanged (`ErrorIs`).
- `UpdateService` with a full body: the repository's `Update` gets the row `createService` would have built from the same body, with the path id (the test compares with a literal expected row, as `TestCreateService_SavesEverythingGiven` does: the tests are in `package usecase_test` and cannot call the private builder; no `export_test.go`); the view comes back. One test per group of settings, each changing only that group on a seeded service and checking the row passed to `Update`: name and flags (`alerts_enabled`, `shown_on_public_view`, both messages); the HTTP request (method, URL, query parameters, headers, body type and content); JSON rules with their mode, and the certificate options; the four timing settings; the TCP host and port; the type change in both directions (FR-7, FR-33).
- Normalization: a name, URL, host, header name and header value with surrounding spaces are saved trimmed, as on create (FR-59 key computed from the trimmed name).
- Rejected input (empty name, a name over 100 characters, a message of 501 characters and one of 500 passes, an interval out of range, a worst-case check time over the interval, a bad URL): `domain.ValidationError` with the same fields as create, the repository's `Update` not called, the scheduler not called, for an id that exists and for one that does not.
- Defaults on replace: a body without `settings`, `alerts_enabled` and `shown_on_public_view` saves the configured defaults, true and false.
- Repository sentinels (`ErrNotFound`, `ErrServiceNameTaken`) and an unexpected error come back unchanged, and the scheduler is not called.
- Unpaused: `Restart` is called exactly once, after the write (the shared events list shows `update` then `restart`), with the service as saved and never `Start`.
- Paused (the repository's returned row has `Paused`): the write happens, and the scheduler is not called at all.
- Next-check time, with the fake clock: no `last_checked_at` gives now plus the interval; `last_checked_at` plus the new interval after now gives that time (one second before the boundary); exactly equal to now gives now plus the interval; before now gives now plus the interval; the interval used is the new one, not the old; a `last_checked_at` in the future gives that time plus the new interval (clock skew, not corrected).
- "No check at saving" (FR-66): `UpdateService` never calls `Start`, and the time given to `Restart` is after now in every case above; the usecase has no check runner, so no check can run from it. The kept state on a type change is proven by the repository test (see above), where it can fail.
- Edits are serialized: 50 rounds of two concurrent `UpdateService` calls for one service, under `-race`, no sleep; in every round the events list alternates `update, restart, update, restart`, never `update, update`. (A missing mutex makes some rounds fail; the verifier reports how many.)
- An edit and a delete are serialized: 50 rounds of one `UpdateService` and one `DeleteService` for the same service started together; in every round no `restart` comes after the `stop` of the delete, and an update that ran after the delete returned `ErrNotFound` and called nothing.

**Handler (`handler/services_test.go`, `router_test.go`)**

- `getService`: 200 with the mapped service (an HTTP view with headers whose values come back in full, and a TCP view), the same mapping as list and create; `404 not_found` for `ErrNotFound`; `500 internal_error` hiding the error text for another error; without a session 401 and the spy is not reached.
- `updateService`: 200 with the mapped service and the spy sees the mapped `ServiceInput` and the path id; the errors map to their codes: `ErrNotFound` 404 `not_found`, `ErrServiceNameTaken` 409 `service_name_taken`, a validation error 422 with every field, another error 500 with its text hidden; one log line `service updated` with `service_id` and `service_name` and nothing else of the body.
- Gate failures never reach the spy for `updateService`: no session (401), no CSRF token (403), a body over the limit (413), a content type that is not JSON (415), a malformed body (400).
- `TestRouter_UnimplementedOperationAnswers501` is rewritten to use an operation still unbuilt after this task (`GET /api/public/dashboard`, `getPublicDashboard`), with the same expectations; the old request for `getService` is replaced, because `getService` now has an implementation. The test's meaning, an unimplemented operation answers `501 not_implemented`, is unchanged.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

- **By reading:** no copy of `buildService`'s mapping (one function builds the row for create and update); no `Start` call in `UpdateService`; `Restart` is not called for a paused service; `worker/scheduler.go` does not read `Paused` (its doc comments may say that it does not); the repository's `Update` has an explicit column list and no `paused`, `created_at`, `id` or state column in it; `Get` and the list share the query text; the handler adds no rule and no status the contract lacks (409 only `service_name_taken`); the log line has no URL, header or body.
- **Mutation checks** (restore after each): make `Stop` forget the goroutine (remove it at once) and see the stop-then-start test fail; call `Start` instead of `Restart` in the usecase and see the schedule and event-order tests fail; let `Update` write `paused` and see the repository test fail; drop the clearing of the HTTP columns on a type change and see the repository and usecase tests fail; skip the not-after-now fallback and see the boundary test fail; remove the edit mutex and see the serialization test fail; make `Restart` wait in the caller and see the returns-at-once test fail; make `Restart` take `startMu` and see the restart-while-`Start`-waits test fail; close `done` before the wait for the previous goroutine and see the chain tests fail; remove the cleanup of the stopped bookkeeping and see the leak test fail; let `DeleteService` skip the mutex and see the delete test fail; swap the validation and the write order and see the "nothing saved on 422" test fail.
- **Inputs to try:** a PUT with a body that carries `id`, `paused`, `state`; the same name in other letter case; a name that clashes only after trimming; the maximum number of header rows and JSON rules (the limits of `createService`); a PUT to an id with a space or a very long id; a PUT for a deleted service; two PUTs at once for one service under `-race` (no overlap of sequences, the schedule and the database agree on the last write, no panic).
- **Run it:** `-race -count` many times on the new scheduler tests, and the whole worker package three times; report failures. The file was made reliable by `scheduler-test-flake`; a new flaky test here is a finding.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other, or the contract lacks a status, field or code you need.
- You think you need a change outside your paths (`domain/`, `main.go`, the runner, a migration, a dependency, the contract, an `export_test.go`).
- `scheduler-test-flake` is not merged, or the code differs from "What exists".
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check` (and the integration-test command from `TESTING.md` if you touched code with integration tests; none is expected), commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), which tests ran, dependency versions (none changed), and anything you were unsure about. Also list every judgment call this file did not settle.
