# Task: scheduler test flake

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

Three tests in `backend/internal/worker/scheduler_test.go` fail now and then for no change of code. One of them failed Backend CI on pull request 34 (the two assertions on the started and ended totals in `TestStart_ReplacesRunningService`, "expected 1, got 2"), and a second failed once for the `mailer-implicit-tls` builder. All three reproduce on the default branch under load (a test binary built with `-race`, eight copies running at once). Each fails because the test reads state at a moment when the code under test has not finished what the test assumes it has. This task changes the tests so that each reads only after the event it needs has happened. The scheduler does not change.

The causes, found while drafting by reading and by running a copy of the package; the builder confirms them (see "Acceptance criteria"):

1. `TestStart_ReplacesRunningService`: the test calls `Start` for an id that is running and, once `Start` returns, reads the totals of started and ended sequences and expects 1 and 1. `Start` returns right after it launches the new goroutine, and the new sequence (which returns at once) can already have run, so the totals are 2 and 2. The two assertions read the totals too late.
2. `TestScheduler_ContextWinsOverFiredTimer`: the test waits for the timer to be made, then calls `Close`. But the timer is signalled before the hook that fires it and calls `Stop("a")` has run. `Close` empties the entry map before it cancels the entries, so a `Stop` that runs in between finds nothing and cancels nothing, the fired timer is then the only thing the goroutine sees, and it runs a second sequence before `Close` cancels it. The test calls `Close` while its own hook is still running.
3. `TestStop_DuringWait`: `countingTimer.Stop` (the test's helper) sends its "stopped" signal before it stops the fake timer, and the test reads `Pending()` as soon as it gets the signal, so it can still see the timer. Found while drafting; it is not in the backlog line, and the user asked to include it.

Requirements covered: none. This is a test-reliability fix (`TESTING.md`). Its criteria prove the tests no longer read early.

Out of scope:

- `backend/internal/worker/scheduler.go` and every other file. The behavior that the second test touches (`Close` empties the map, then cancels, so a late `Stop` can miss) is harmless in the app: the entry is cancelled in the next step, and a sequence that starts in that instant sees a cancelled context. If the tests still fail after they wait correctly (see "Stop and ask when"), the cause is elsewhere and this task stops.
- Raising `guard`, any timeout or retry count, adding `time.Sleep` or any real-time wait, and loosening an assertion: those hide the cause (`TESTING.md`, "Time").
- Whether `Stop` followed by `Start` for one id can run two sequences at once (backlog line on `scheduler`). `update-service-api` decides that and adds its test, after this task merges.
- Other test files, and any test of the file that did not fail in the repeated runs described below. A test that fails below the rate those runs can see is not looked for here.

## Prerequisite

None. The builder checks first that `backend/internal/worker/scheduler_test.go` exists with the three tests named above, and stops to ask if not.

## Role and ownership

Role: Backend (test-only).

You may change `backend/internal/worker/scheduler_test.go` only. You may not change `backend/internal/worker/scheduler.go`, any other file under `backend/`, `frontend/**`, `e2e/**`, `docs/**` (except your own plan file, `docs/tasks/scheduler-test-flake.plan.md`), the `Makefile`, or the dependency manifests.

Shared files this task touches: `scheduler_test.go`, which it owns while it runs. This task must merge before `update-service-api`, which changes the same file. Tasks that may run at the same time: any task that does not change `scheduler_test.go` (the frontend group's tasks, `tcp-probe`, whose file says it leaves this file alone).

## Operations used

None.

## Behavior

Nothing in the app changes. The test file changes as follows; names of new variables are the builder's choice.

### What exists

- `countingClock` wraps `clock.Fake`. `NewTimer` makes the timer, counts it, sends on `created`, runs the optional `onTimer` hook, and returns a `countingTimer`. `countingTimer.Stop` sends on `stopped` and then calls the inner timer's `Stop`. `waitTimer` waits for `created`; `waitStopped` waits for `stopped`.
- `fakeSequence.run` counts a call as started before it runs `behave`, and as ended after `behave` returns. It sends each call on `signal` before `behave` runs. `totals()` reads the two counts under the fake's own lock.

### The changes

**`countingTimer.Stop`:** call the inner timer's `Stop` first, keep its result, then send on `stopped`, then return the result. After a test receives from `stopped`, the inner timer is already stopped, so `Pending()` no longer counts it. The result returned is the inner one, as now.

**`TestStart_ReplacesRunningService`:** the test must prove, without reading totals after `Start` returns, that the old sequence had returned before the new one began. Make the check inside the new sequence: when the second call (`c.n == 2`) starts, it reads `totals()` itself and hands the two numbers to the test over its own channel (buffered with room for one, and the send does not block, so a scheduler that misbehaves fails an assertion instead of hanging the goroutine and `Close`; only the second call sends); the test receives them and asserts started is 2 and ended is 1 (the second sequence is counted as started, the first as ended, and nothing else). The two assertions that read `totals()` right after `Start` returns are removed; the assertion that the old sequence saw its context cancelled by the time `Start` returned stays (it is written by the old goroutine and read after `Start`, which waits for that goroutine). Everything after it in the test (the wait for the second call, the timer count, the advances at 69 s and 1 s, the final count of 4 and the `maxRunning` of 1) stays as it is, and is not changed in meaning.

**`TestScheduler_ContextWinsOverFiredTimer`:** in each of the 50 rounds, the hook signals when it has finished (after `Advance` and `Stop`; a fresh channel for each round, buffered with room for one, sent to without blocking, because a misbehaving scheduler would run the hook a second time), and the test waits for that signal, with the `guard` bound, instead of for the timer made, before it calls `Close`. After the wait, the fired timer and the cancelled context are both certain to be ready when the goroutine decides, which is the case the test is about. `Close` is then called as now, and the assertion that the service has been called once stays. The 50 rounds stay; no sleep.

### Known gaps

- Other tests of the file call `Close` or read counts right after a `waitTimer`; they did not fail in the runs that found these three, and are not changed. If the verifier's repeated runs show another one failing, it is reported, not fixed here.
- The rate at which the tests fail depends on the machine. The "before" counts the builder records are evidence, and a low or zero count is possible (see the criteria).

## Structure

One test file. No new helper outside it, no new file.

## Design reference

None.

## Dependencies

None. `go.mod` and `go.sum` do not change.

## Acceptance criteria

All are about `scheduler_test.go` and are run, not integration tests. None applies to the integration-test command (`make test-integration` is not needed; say so in the report).

**Stress recipe**, used by the "before" and "after" runs below, from `backend/`: build the test binary once outside the repository with `go test -race -c -o <a file in the system temp directory> ./internal/worker/`, then run eight copies of it at the same time, each with `-test.count=300` and `-test.run` set to one test, or `-test.count=60` with no `-test.run` for the whole file, and count the lines `--- FAIL`. The binary holds the whole `worker` package: a failure of a test outside `scheduler_test.go` is reported with its name and not fixed here, and does not count against this task. (A single serial `go test -race -count=300` fails the first two tests rarely or not at all on a quiet machine.) Delete the binary afterwards.

- **Reproduce first**, on the default branch's version of the file: run the recipe for each of `TestStart_ReplacesRunningService`, `TestScheduler_ContextWinsOverFiredTimer` and `TestStop_DuringWait` (8 × 300 runs each) and for the whole file (8 × 60), and note in the plan how many runs failed and with which assertion. If one cannot be reproduced, say so; its change still applies, because the early read is there by reading (cause 1, 2 or 3 above), and the later criteria are checked the same way.
- **After the change**, the same four recipe runs have no failure. `make test-backend` is run three times and has no failure. The counts are in the plan and the report.
- **By reading**, each of the causes is gone:
  - `countingTimer.Stop` calls the inner `Stop` before it sends on `stopped`, and returns the inner result.
  - In `TestStart_ReplacesRunningService`, no assertion reads `totals()` after `Start` returns; the second sequence reads `totals()` itself when it starts, and the test asserts 2 started and 1 ended from that reading.
  - In `TestScheduler_ContextWinsOverFiredTimer`, `Close` is called only after the hook has finished.
- The assertions of every test are unchanged in meaning: the same expectations, none removed or weakened, no `time.Sleep`, no raised `guard`, no added retry, `scheduler.go` and every other file untouched.
- `make check` passes.
- Nothing outside the allowed path changed.

## Verifier checks

- **By reading:** the diff is in `scheduler_test.go` only; no `time.Sleep`, no change to `guard`, no new real-time wait, no deleted or weakened assertion; the three changes above are present and match the descriptions.
- **Run it:** the four stress runs of the recipe (the three tests and the whole file) and `make test-backend` three times, and report the failure counts. The verifier has no other evidence for a flaky test.
- **Mutation checks** (each on a scratch change, restored after; a flaky test cannot be shown to fail in every run, so report how many of the 8 × 300 runs failed, or 8 × 60 for the file; if none failed, say so: the check then proves nothing, the "by reading" check stands, and that is not a failure of the task):
  - In `TestStart_ReplacesRunningService`, read `totals()` right after `Start` returns again: the test should fail in some runs.
  - In `scheduler.go`, remove the `ctx.Err()` check at the top of the loop in `run` (the check before each sequence): `TestScheduler_ContextWinsOverFiredTimer` should fail in about half of the rounds (the `select` then picks the fired timer at random), so over the 50 rounds nearly every run fails. This shows the test discriminates; the hook-finished wait must not hide it.
  - In `scheduler.go`, make `Start` not wait for the old goroutine (remove the receive from `old.done`): `TestStart_ReplacesRunningService` should fail in some runs, by the cancelled-context assertion or by the reading taken in the second sequence.
  - In the test helper, put the `stopped` send before the inner `Stop` again: `TestStop_DuringWait` should fail in some runs.
- **Inputs to try:** the whole-file recipe on a machine with other work running; `-test.cpu 1,2,8` on the three tests.

## Stop and ask when

- A test still fails in the repeated runs after it waits for the event it needs, or the cause you find differs from the one written above: stop and report the failing runs, messages and what you found. Do not add sleeps, raise `guard` or change `scheduler.go`.
- You think you need a change outside `scheduler_test.go`, a dependency, or an edit to a spec file.
- A convention in `CONVENTIONS.md` or `TESTING.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, the failure counts before and after for each recipe run, dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
