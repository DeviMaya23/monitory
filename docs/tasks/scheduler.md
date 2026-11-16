# Task: scheduler

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

Services are checked in the background. A service added through `createService` is checked at once and then at its check interval; every saved service that is not paused is checked again when the app starts; deleting a service stops its checks. After this task a new service moves from `not_yet_checked` to `healthy` or `unhealthy` on the dashboard, with no change to any screen or operation. That the wired app does this (FR-112, and the wiring half of FR-67 and FR-111) is shown only by the builder's run by hand, not by a test (see "Known gaps").

The task adds the scheduler (one goroutine per service, on the clock), replaces the do-nothing placeholder with it, and wires the check runner, the probe and the state-saving usecase into the app.

Requirements covered:

- FR-10: each service is checked at its own check interval.
- FR-67: a service added is checked straight after it is saved.
- FR-71: deleting a service stops its timer, a running attempt and a retry wait, and no result is saved for it afterwards.
- FR-111: at start-up, checks resume straight away for every service that is not paused.
- NFR-6: a check starts at its scheduled time, whatever the other services are doing.

Out of scope:

- Pause, resume and edit (FR-66, FR-75 to FR-79, milestone 3). The scheduler already replaces a running service when `Start` is called for it again and ignores `Stop` for an unknown id, so those tasks need no change here, but nothing here calls them.
- Sending alerts for a status change, and the rule that a restart sends no new alert for a service that stays unhealthy (FR-21 to FR-25, FR-111's second half). Milestone 2.
- TCP checks. The runner does nothing for a TCP service, so one stays `not_yet_checked` (backlog, milestone 3). The scheduler does not look at the check type.
- Query parameters, headers, body, JSON rules and certificate options on an attempt (milestone 3).
- A log line for each check outcome (`CONVENTIONS.md`, Logging). The runner returns no result to log. It is on the backlog.
- A wiring test in `cmd/server`: `main.go` has no test today and `run` is one function (see "Known gaps").
- The check runner, the probe, the state usecase and repository themselves. `check-sequence-and-state` and `http-probe` built them; they are used as they are.
- Everything under `frontend/`.

## Prerequisite

`check-sequence-and-state` is merged. The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `worker.CheckRunner` with one method that runs a check sequence for a `domain.Service` and has the signature `func(ctx context.Context, service domain.Service) error` (the earlier file fixes that shape and the type names, not the method's name), a constructor for it, `usecase.CheckResultService` with a constructor and `RecordCheckResult`, and `repository.ServiceStateRepository` with a constructor. Constructor and method names are those of the merged code.
- `adaptor/probe.HTTPProber` with `NewHTTPProber(maxRedirects int)` and `CheckHTTP` (from `http-probe`, merged).
- `usecase.Scheduler` with `Start(domain.Service)` and `Stop(serviceID string)`, `ServiceService.ListServices`, `ServiceService.DeleteService`, `worker.NoopScheduler` (from `list-and-delete-services-api`, merged).
- `config.Limits.MaxRedirects`.

If the runner's method does not have the signature above, stop and ask; do not change the runner.

## Role and ownership

Role: Backend.

You may change only:

- `backend/internal/worker/scheduler.go`, `backend/internal/worker/scheduler_test.go` (new)
- `backend/internal/worker/noop_scheduler.go` (delete)
- `backend/internal/usecase/service.go` and `backend/internal/usecase/service_test.go` (the new method below)
- `backend/internal/usecase/fakes_test.go` (what the new method's tests need)
- `backend/cmd/server/main.go` (wiring)

You may not change anything else: not `backend/go.mod` or `go.sum`, `backend/migration/**`, `backend/internal/api/**`, `backend/internal/domain/**`, `backend/internal/handler/**`, `backend/internal/repository/**`, `backend/internal/adaptor/**`, the runner and check-result files from `check-sequence-and-state`, `backend/pkg/**`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/scheduler.plan.md`), `.env.example` or the `Makefile`. No configuration key is added.

Shared files this task touches, all owned by this task while it runs: `backend/cmd/server/main.go`, `backend/internal/usecase/service.go`, `backend/internal/usecase/fakes_test.go`. Tasks that may run at the same time: `dashboard-screen` fixes (frontend only). No other backend task runs beside this one.

## Operations used

None. No operation of `docs/openapi.yaml` is added or changed. `createService` and `deleteService` already call the scheduler seam; their handler and usecase tests keep passing with the real scheduler behind the same interface.

## Behavior

### What exists

- `usecase.Scheduler` (`Start`, `Stop`), called by `ServiceService.CreateService` after the transaction commits and by `DeleteService` after the delete commits.
- `worker.NoopScheduler`, used only in `main.go`.
- `domain.Service` has `ID`, `CheckIntervalSeconds` and `Paused`.
- `ServiceService.ListServices(ctx)` returns every service with its state.
- `main.go`'s `run` builds everything, starts the HTTP server in a goroutine, and on SIGINT or SIGTERM calls `e.Shutdown` with a 10-second timeout. The database is closed by a `defer` made earlier in `run`.
- `pkg/clock` has `Clock` (`Now`, `NewTimer`), `Real` and `Fake`.

### The scheduler (`worker.Scheduler`)

It satisfies `usecase.Scheduler`. It is built with a sequence function (type `SequenceFunc`, new: `func(ctx context.Context, service domain.Service) error`, which `main.go` fills with the runner's method), a `clock.Clock` and a `*slog.Logger`. It holds one entry per started service id: a cancel function and a channel that closes when that service's goroutine has ended. A mutex guards the map.

**Start(service):**

1. After `Close`, it does nothing.
2. A service with `CheckIntervalSeconds` of zero or less is not started (the limits forbid it; a zero interval would loop without pause). It logs `service not scheduled` at error level with `service_id` and `reason` `invalid check interval`, and returns.
3. If an entry for the id exists (an earlier `Start`), that entry's context is cancelled and `Start` waits for its goroutine to end, so the old and the new sequence of one service never run at the same time. The wait happens outside the mutex that guards the map (the goroutines never take it), under a second mutex that only serializes `Start` calls. After the wait, `Start` checks again whether `Close` has been called and, if so, does nothing; otherwise it replaces the entry. (Step 2 comes first: a refused `Start` leaves a running entry for that id untouched.)
4. A goroutine starts for the service with a context made for it (cancellable, derived from `context.Background()`; the scheduler owns it) and the service as given. It does not read the database.

**The loop of one service:** a copy of the service as given at `Start`, and one sequence at a time.

1. Let `scheduledAt` be `clock.Now()`. Run the sequence function with the service's context now (the first check is at once: FR-67, FR-111).
2. When the function returns: if the service's context has ended, the goroutine ends and logs nothing. Any other error is logged at error level, `check sequence failed`, with `service_id` and `error` (the error's text), and the loop goes on.
3. The next sequence is scheduled for `scheduledAt + CheckIntervalSeconds seconds` (start to start). If that time is not after the current time (the sequence overran, or returned exactly at it), the next sequence starts at once, no timer is created, and there is no catch-up for the missed ones. Otherwise wait for it on a `clock.Clock` timer, `select`ing on the service's context; on cancel the timer is stopped and the goroutine ends. If the context has ended and the timer has fired together, the context wins: after every wait, and before every sequence, the goroutine checks the context and ends if it has ended. Then go back to step 1 with `scheduledAt` set to the time the sequence was scheduled for (not to the time the wait ended).

One sequence per service at a time: a service's next sequence never starts before the previous one has returned. Services do not share anything but the map: a slow or blocked service never delays another (NFR-6). There is no limit on how many run at once beyond the number of services (at most `MAX_SERVICES`).

**Stop(serviceID):** cancels that entry's context and removes it. It does not wait. An unknown id, or any call after `Close`, does nothing. `Stop` is called after the delete has committed. A sequence still running for the service sees its context end and saves nothing (the runner checks the context before recording); a result that slips through in the instant before the cancel finds no row, because the delete has committed, and is dropped by the state usecase.

**Close():** stops accepting `Start`, cancels every entry, and returns after every goroutine has ended. Calling it twice is safe.

### The usecase (`ServiceService.StartChecks`)

`StartChecks(ctx) error` lists the services (`ListServices`, so with the ordering the repository gives) and calls `Scheduler.Start` once for each service whose `Paused` is false, with the service as read. A paused service is not started (FR-76, FR-111). A list error is returned unchanged and nothing is started. It is the only place that decides which saved services run at start-up.

### Wiring (`cmd/server/main.go`)

- Build the prober (`NewHTTPProber` with `cfg.Limits.MaxRedirects`), the state repository, the check-result usecase and the runner, all with `clock.Real{}` where a clock is wanted, then the scheduler with the runner's method as its sequence function and `slog` logger `log`. Pass the scheduler to `NewServiceService` in place of `worker.NoopScheduler{}`.
- Right after the services usecase is built, `defer` the scheduler's `Close`, so that on every way out of `run` it runs before the database is closed (the database's `defer` is registered earlier, and deferred calls run last-first).
- Call `StartChecks` before the HTTP server's goroutine starts, with the context `run` has at that point (`context.Background()` is fine; it is a short read). If it returns an error, `run` returns it and the app does not start.
- On SIGINT or SIGTERM, close the scheduler (cancel and wait) **before** `e.Shutdown`, so no sequence is writing while requests drain; the deferred `Close` then does nothing. `main.go` contains no rule: it passes the pieces together.
- Delete `worker/noop_scheduler.go` and every use of `NoopScheduler`.

### Known gaps

- There is no automated test of `main.go`'s wiring. The builder runs the app once by hand against a local server and reports the result (see "Handing back"); the milestone's end-to-end suite will cover it.
- A sequence running when the app stops is lost; at the next start it starts over (FR-111).
- The log has no line per check outcome. The result is saved and visible on the dashboard; the log line comes later (backlog).
- A TCP service gets a goroutine and a timer, and every sequence of it does nothing until the TCP probe exists.
- A sequence function must not call `Start` for its own id: `Start` would wait for the goroutine that called it. `Stop` and `Close` are safe to call from inside a sequence (`Close` from inside would wait for itself, so it is not).
- `Close` has no time limit. A sequence ends when its context does (the probe has its own deadline), so shutdown is bounded in practice, but a sequence function that ignored its context would hold shutdown up.
- At start-up every service's first sequence starts at the same instant (at most `MAX_SERVICES`). That is the design; there is no stagger.
- `Stop` is only ever called after a delete today. A later task that calls it for another reason (pause) must not rely on `Stop` alone to keep a result that is already being recorded from being saved; that task decides.

## Structure

By `ARCHITECTURE.md` ("Background work"): `worker/` owns timing and cancellation; the usecase decides which saved services start. Names marked "new" are fixed by this file; others are the builder's choice.

- `worker/scheduler.go` (new): `worker.Scheduler`, `SequenceFunc`, its constructor, `Start`, `Stop`, `Close`. Imports `domain`, `pkg/clock` and the standard library only; no `usecase`, no `repository`, no `adaptor`.
- `usecase/service.go`: the new method `StartChecks` on `ServiceService`. The `Scheduler` interface stays as it is.
- `usecase/fakes_test.go`: only if the `StartChecks` tests need something it lacks (the fake repository's `List` and the fake scheduler's recording of starts already exist). The `started` log line in `main.go` stays.
- `cmd/server/main.go`: wiring as above, nothing else.

## Dependencies

None. No `go.mod` or `go.sum` change.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. Worker tests use `clock.Fake`, never `time.Sleep` or a real timer, a fake sequence function (a counter and a log of `(service id, time)`, signalling each call on a channel, able to block on its context), and `-race`. Test a duration by advancing the clock by exactly that duration and by one second less (`TESTING.md`). Use non-default intervals so a literal fails. No integration test.

Test mechanics, because `clock.Fake.Pending()` cannot see a timer that has already fired and `Stop` does not wait: write in `scheduler_test.go` a thin wrapper around `clock.Fake` that counts `NewTimer` calls and signals on a channel each time one is created, so a test waits for "the goroutine is now waiting" without sleeping; and a fake sequence function that signals each call on a channel and can block on its context. "Still one call" is asserted after `Advance` by waiting for that signal where a call is expected and by a following `Close` (after which the call count is final) where none is. Do not depend on test helpers of another file; write what you need here. The test that a service's goroutine ended without `Close` uses the fake's returned-calls counter.

**Scheduler (`worker/scheduler_test.go`)**

- `Start` runs the sequence at once, with the service as given, without advancing the clock (FR-67, FR-111).
- With an interval of 45 seconds and a sequence that returns at once: after `Advance(44s)` there is still one call; after one more second there are two, and the second was at 45 s; after 45 s more there are three (FR-10).
- Two services with intervals of 30 and 90 seconds run at their own rates in one test: after 90 s the first has been called 4 times and the second twice (FR-10).
- A sequence that takes longer than the interval: the next one starts at once after it returns and a second one never starts while the first is running (a counter of concurrent calls never exceeds 1); the following sequence is scheduled one interval after the late one began, with no burst of missed ones (FR-10).
- A blocked sequence for service A does not stop service B from starting its sequence at B's scheduled time, which is exactly when the clock reaches it (NFR-6).
- A sequence that returns an error: logged as `check sequence failed` with `service_id` and `error`, and the next sequence is still scheduled and runs (the log is captured in a buffer).
- A sequence that returns because its context was cancelled logs nothing and starts no timer.
- `Stop` during the wait: no further sequence runs after `Advance` past the interval, and the timer is stopped (FR-71).
- `Stop` during a running sequence: the sequence's context is cancelled, the goroutine ends, no further sequence is scheduled (FR-71).
- `Stop` for an unknown id, twice for the same id, and after `Close`: no panic and no effect.
- `Start` for an id already started, with a first sequence blocked on its context: `Start` returns only after the old sequence has returned (the fake's returned-calls counter proves it), the old sequence's context was cancelled, the new sequence starts at once and never overlaps the old (the concurrent-calls counter for that id never exceeds 1); from then on only one goroutine runs for that id (one call per interval, not two); the restart uses the new service's interval.
- Two `Start` calls for the same id from two goroutines at once, under `-race`: exactly one entry is left running, and after `Close` every started goroutine has ended.
- `Close` called while a `Start` is waiting for an old goroutine: `Close` returns, the waiting `Start` then starts nothing, and no goroutine remains.
- `Start` with `CheckIntervalSeconds` 0, and with a negative value: no sequence runs, one `service not scheduled` log with the reason, and no timer is created; when the id was already running, that entry keeps running at its old interval.
- A sequence that returns exactly at its next scheduled time, and one that returns later: the next starts at once and no timer is created.
- The context ended and the timer fired together: no further sequence runs.
- `Close` cancels a running sequence and a waiting service, returns only after both goroutines have ended, and a second `Close` returns at once. `Start` after `Close` runs nothing. No goroutine remains: the fake sequence function counts the calls that have started and the calls that have returned, and the two are equal after `Close` (no leak-detection library may be added).
- Many services (50) started and then closed under `-race` leave no running sequence.

**Usecase (`usecase/service_test.go`)**

- `StartChecks` starts every service that is not paused, once each, with the service as listed, and starts no paused one; with the fake repository holding three services, one paused, two are started in the order listed (FR-111; the "not started at start-up" half of FR-76 only, since pausing itself is milestone 3).
- With no services, nothing is started and no error is returned.
- A list error is returned unchanged (`require.ErrorIs`) and nothing is started.
- Existing `CreateService` and `DeleteService` criteria still pass unchanged: `Start` after the commit and `Stop` after the delete.

**Repo-wide**

- `make check` passes.
- `git diff go.mod go.sum` is empty.
- `grep -r NoopScheduler backend` finds nothing.
- Nothing outside the allowed paths changed.

## Verifier checks

- **Time, by reading the diff:** no `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` outside tests, `pkg/` and `cmd/`; every wait is a `clock.Clock` timer and every exit path of a wait stops it.
- **Goroutine ownership, by reading `worker/scheduler.go`:** every goroutine has its context and a done channel; `Close` waits on all of them; nothing starts a goroutine from a handler or a usecase; the map is never read or written without the mutex; a send on a channel or a call to the sequence function never happens while the mutex is held (a sequence that calls `Stop` must not deadlock); `Start` waits for an old goroutine only outside the map's mutex.
- **No rule in the worker:** the scheduler does not read `Paused`, the check type, the status or the database; the only decision about which saved services start is in `usecase`.
- **Layering:** `worker/` imports neither `usecase/` nor `repository/` nor `adaptor/`; `main.go` holds no rule.
- **Order in `main.go`, by reading:** `StartChecks` before the server's goroutine; the scheduler is closed before `e.Shutdown` and, by `defer`, before the database is closed on every return path, including a failed `StartChecks`.
- **Nothing sensitive in the log:** the two log lines carry only `service_id`, `reason` and the error text; read the runner's and the state usecase's error messages (merged code) and confirm none can contain a URL, header or body (`CONVENTIONS.md`, Logging). Report any that can.
- **No literal timing:** the interval is `CheckIntervalSeconds`; no number of seconds appears in `worker/scheduler.go`.
- **Mutation checks to run:** schedule from the end of the sequence instead of its start; let a second sequence start while one runs; skip stopping the timer on cancel; drop the cancel of the old entry in `Start`; drop the wait for the old goroutine; start paused services in `StartChecks`; make `Close` return without waiting. Each must fail at least one named test.
- **Inputs to try:** interval 30 (the default minimum) and 86400 (the maximum); a sequence function that panics is not covered (a panic ends the app, by design); `Start`, `Stop` and `Close` called from several goroutines at once under `-race`; `Stop` called from inside a running sequence (must not deadlock).
- **By hand, in the report:** the builder's run of the app (see "Handing back"), seen in the report as evidence for FR-67 and FR-111.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- The runner's method does not have the signature under "Prerequisite", or one of the prerequisite names is missing.
- You think you need a change outside your paths, a dependency, a migration, or an edit to a spec file. In particular, if running the sequence needs a change to the runner or to `usecase.Scheduler`.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), that no integration test applies, and anything you were unsure about. Also list every judgment call this file did not settle.

The report also says what you saw when you ran the app by hand: start a local HTTP server that answers 200, start the app with the development `.env`, sign in, add an HTTP service for that address through the add form or the API, and say what the dashboard or `GET /api/services` showed (a state of `healthy` with a check time), then stop the local server and say what showed after the retries and the interval; then restart the app and say whether checks resumed at once. If you cannot run it (for example, no browser), say so and say what you ran instead.
